import { Project, ProjectFile, Message, Conversation } from "../../models/index.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { env } from "../../config/env.js";
import { runCompletion } from "../ai/engine.js";
import { buildSystemPrompt } from "../ai/prompt.js";
import { getAiSettings, getPlan } from "../settings.js";
import { buildArtifact, refreshProjectStats } from "../artifacts.js";
import { FILE_FORMAT_INSTRUCTIONS, extractJson, parseFileBlocks } from "./fileFormat.js";
import { validateProjectFiles } from "./validate.js";

interface PlanFile {
  path: string;
  purpose: string;
}

interface ProjectPlan {
  name: string;
  summary: string;
  stack: string[];
  entry: string;
  files: PlanFile[];
}

const running = new Map<string, AbortController>();

export function isRunning(projectId: string) {
  return running.has(projectId);
}

export function cancelJob(projectId: string) {
  running.get(projectId)?.abort();
}

async function progress(projectId: unknown, stage: string, percent: number, message: string, status?: string) {
  await Project.updateOne(
    { _id: projectId },
    { $set: { progress: { stage, percent: Math.round(percent), message }, ...(status ? { status } : {}) } }
  );
}

const PROJECT_RULES = `You are the OBSYDIA AI project engineer. You produce complete, working, production-quality source code.
Engineering rules:
- Every file must be complete and runnable. No placeholders, no "TODO", no truncated code.
- Prefer clear structure, accessible semantic HTML, responsive CSS, and secure defaults.
- Always include README.md explaining setup, scripts and deployment.
- When the project needs configuration or secrets, include .env.example with placeholder values. Never include real secrets.
- For frontend projects, the root index.html must open and work directly in a browser without a build step (use plain JS or ES modules from https://esm.sh when a framework is required).
- If the requested stack needs a build step or a server (Next.js, Vite, Express, Python, etc.), ALSO include preview/index.html: a self-contained no-build version of the main user interface so it can be previewed in a sandboxed iframe, with sample data clearly labelled as demo content.
- Use relative asset paths.`;

async function userContext(userId: unknown) {
  const { User } = await import("../../models/index.js");
  const user = await User.findById(userId).lean<any>();
  const settings = await getAiSettings();
  const plan = await getPlan(user?.plan || "free");
  return { user, settings, plan };
}

function systemFor(settings: Awaited<ReturnType<typeof getAiSettings>>, lang: "auto" | "en" | "fr") {
  return buildSystemPrompt(settings, { userLanguage: lang, mode: "project", extra: PROJECT_RULES });
}

async function planProject(userId: unknown, request: string, sys: string, maxFiles: number, signal: AbortSignal, projectId: string) {
  const out = await runCompletion({
    userId,
    feature: "project_plan",
    via: "app",
    signal,
    refId: projectId,
    maxOutputTokens: 2000,
    temperature: 0.2,
    messages: [
      { role: "system", content: sys },
      {
        role: "user",
        content: `Plan the architecture for this project request:\n\n"""${request}"""\n\nReply ONLY with JSON of the shape {"name": string, "summary": string, "stack": string[], "entry": string, "files": [{"path": string, "purpose": string}]}. List every file needed (maximum ${maxFiles} files), including README.md. "entry" is the HTML file used for the live preview.`
      }
    ]
  });
  const plan = extractJson<ProjectPlan>(out.result.content);
  if (!plan || !Array.isArray(plan.files) || !plan.files.length) return null;
  plan.files = plan.files
    .filter((f) => f && typeof f.path === "string")
    .slice(0, maxFiles)
    .map((f) => ({ path: f.path.replace(/^\.?\//, ""), purpose: String(f.purpose || "") }));
  if (!plan.files.some((f) => f.path.toLowerCase() === "readme.md")) plan.files.push({ path: "README.md", purpose: "Setup and usage documentation" });
  plan.name = String(plan.name || "Untitled project").slice(0, 100);
  plan.stack = Array.isArray(plan.stack) ? plan.stack.map(String).slice(0, 12) : [];
  return plan;
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function contextOf(files: Map<string, string>, limit: number) {
  let out = "";
  for (const [p, c] of files) {
    const block = `<<<FILE: ${p}>>>\n${c}\n<<<END FILE>>>\n`;
    if (out.length + block.length > limit) {
      out += `[${p} omitted for length]\n`;
      continue;
    }
    out += block;
  }
  return out;
}

async function saveFiles(projectId: unknown, files: { path: string; content: string }[], deletes: string[], by: "ai" | "user") {
  for (const f of files) {
    await ProjectFile.updateOne(
      { projectId, path: f.path },
      { $set: { content: f.content, encoding: "utf8", size: Buffer.byteLength(f.content), updatedBy: by } },
      { upsert: true }
    );
  }
  if (deletes.length) await ProjectFile.deleteMany({ projectId, path: { $in: deletes } });
  await refreshProjectStats(projectId);
}

async function validateAndFix(projectId: string, userId: unknown, sys: string, signal: AbortSignal, allowFix: boolean) {
  const files = await ProjectFile.find({ projectId }).lean<any[]>();
  let result = validateProjectFiles(files);
  if (!result.ok && allowFix) {
    await progress(projectId, "fixing", 90, `Fixing ${result.issues.length} issue(s)`);
    const affected = new Set(result.issues.map((i) => i.split(":")[0]!));
    const map = new Map(files.filter((f) => affected.has(f.path) || f.path.endsWith(".html")).map((f) => [f.path, f.content]));
    try {
      const out = await runCompletion({
        userId,
        feature: "project_fix",
        via: "app",
        signal,
        refId: projectId,
        maxOutputTokens: env().AI_PROJECT_MAX_OUTPUT_TOKENS,
        temperature: 0.1,
        messages: [
          { role: "system", content: `${sys}\n\n${FILE_FORMAT_INSTRUCTIONS}` },
          {
            role: "user",
            content: `Automated validation found these problems:\n${result.issues.map((i) => `- ${i}`).join("\n")}\n\nAll project paths:\n${files.map((f) => f.path).join("\n")}\n\nRelevant files:\n${contextOf(map, 60_000)}\n\nFix the problems. Output only the files you change (or create missing files).`
          }
        ]
      });
      const parsed = parseFileBlocks(out.result.content);
      if (parsed.files.length) await saveFiles(projectId, parsed.files, [], "ai");
      result = validateProjectFiles(await ProjectFile.find({ projectId }).lean<any[]>());
    } catch (err) {
      logger.warn({ projectId, err: (err as Error).message }, "auto-fix pass failed");
    }
  }
  await Project.updateOne({ _id: projectId }, { $set: { validation: { ok: result.ok, issues: result.issues, checkedAt: new Date() } } });
  return result;
}

async function postToConversation(conversationId: unknown, userId: unknown, projectId: string, content: string) {
  if (!conversationId) return;
  await Message.create({ conversationId, userId, role: "assistant", content, projectId, status: "complete" });
  await Conversation.updateOne({ _id: conversationId }, { $set: { lastMessageAt: new Date() }, $inc: { messageCount: 1 } });
}

export async function startGeneration(projectId: string, userId: unknown, request: string, lang: "auto" | "en" | "fr") {
  if (running.has(projectId)) throw new AppError(409, "project_busy", "A job is already running for this project");
  const controller = new AbortController();
  running.set(projectId, controller);
  void (async () => {
    const signal = controller.signal;
    try {
      const { settings, plan: userPlan } = await userContext(userId);
      const sys = systemFor(settings, lang);
      const maxFiles = userPlan.advancedProjects ? 40 : 14;
      await progress(projectId, "planning", 5, "Analyzing the request and planning the architecture", "planning");
      const plan = await planProject(userId, request, sys, maxFiles, signal, projectId);
      const generated = new Map<string, string>();
      if (plan) {
        await Project.updateOne(
          { _id: projectId },
          { $set: { name: plan.name, description: plan.summary || request.slice(0, 400), stack: plan.stack, entry: plan.entry || "index.html", plan: JSON.stringify(plan) } }
        );
        const batches = chunk(plan.files, 5);
        let done = 0;
        for (const batch of batches) {
          if (signal.aborted) throw new AppError(499, "aborted", "Generation cancelled");
          await progress(projectId, "generating", 10 + (done / plan.files.length) * 75, `Writing ${batch.map((b) => b.path).join(", ")}`, "generating");
          const out = await runCompletion({
            userId,
            feature: "project_generate",
            via: "app",
            signal,
            refId: projectId,
            maxOutputTokens: env().AI_PROJECT_MAX_OUTPUT_TOKENS,
            temperature: 0.2,
            messages: [
              { role: "system", content: `${sys}\n\n${FILE_FORMAT_INSTRUCTIONS}` },
              {
                role: "user",
                content: `Project request:\n"""${request}"""\n\nArchitecture plan:\n${JSON.stringify(plan, null, 2)}\n\nFiles already written:\n${contextOf(generated, 40_000) || "(none yet)"}\n\nNow write exactly these files, fully and consistently with the plan and the files already written:\n${batch.map((b) => `- ${b.path}: ${b.purpose}`).join("\n")}`
              }
            ]
          });
          const parsed = parseFileBlocks(out.result.content);
          if (!parsed.files.length) throw new AppError(502, "generation_unparseable", "The model did not return files in the expected format");
          for (const f of parsed.files) generated.set(f.path, f.content);
          await saveFiles(projectId, parsed.files, [], "ai");
          done += batch.length;
        }
      } else {
        await progress(projectId, "generating", 20, "Generating project files", "generating");
        const out = await runCompletion({
          userId,
          feature: "project_generate",
          via: "app",
          signal,
          refId: projectId,
          maxOutputTokens: env().AI_PROJECT_MAX_OUTPUT_TOKENS,
          temperature: 0.2,
          messages: [
            { role: "system", content: `${sys}\n\n${FILE_FORMAT_INSTRUCTIONS}` },
            { role: "user", content: `Build this project with all of its files:\n"""${request}"""` }
          ]
        });
        const parsed = parseFileBlocks(out.result.content);
        if (!parsed.files.length) throw new AppError(502, "generation_unparseable", "The model did not return files in the expected format");
        await saveFiles(projectId, parsed.files, [], "ai");
      }
      await progress(projectId, "validating", 88, "Validating generated files");
      const validation = await validateAndFix(projectId, userId, sys, signal, true);
      await progress(projectId, "packaging", 95, "Packaging ZIP artifact");
      const artifact = await buildArtifact(projectId, "Initial generation");
      await Project.updateOne({ _id: projectId }, { $set: { status: "ready", lastError: null, progress: { stage: "done", percent: 100, message: "Project ready" } } });
      const project = await Project.findById(projectId).lean<any>();
      await postToConversation(
        project?.conversationId,
        userId,
        projectId,
        `**${project?.name}** is ready — ${artifact.fileCount} files, version ${artifact.version}.${validation.ok ? "" : `\n\nValidation notes:\n${validation.issues.map((i) => `- ${i}`).join("\n")}`}`
      );
    } catch (err) {
      const e = err as AppError;
      logger.warn({ projectId, code: e.code, err: e.message }, "project generation failed");
      const files = await ProjectFile.countDocuments({ projectId });
      await Project.updateOne(
        { _id: projectId },
        { $set: { status: files ? "ready" : "error", lastError: e.code === "aborted" ? "Generation cancelled" : e.message, progress: { stage: "error", percent: 100, message: e.message } } }
      );
    } finally {
      running.delete(projectId);
    }
  })();
}

export async function startEdit(projectId: string, userId: unknown, instruction: string, lang: "auto" | "en" | "fr") {
  if (running.has(projectId)) throw new AppError(409, "project_busy", "A job is already running for this project");
  const controller = new AbortController();
  running.set(projectId, controller);
  await Project.updateOne({ _id: projectId }, { $set: { status: "generating", progress: { stage: "inspecting", percent: 5, message: "Inspecting the existing project" } } });
  void (async () => {
    const signal = controller.signal;
    try {
      const { settings } = await userContext(userId);
      const sys = systemFor(settings, lang);
      const files = await ProjectFile.find({ projectId, encoding: "utf8" }).lean<any[]>();
      const all = await ProjectFile.find({ projectId }).select("path size").lean<any[]>();
      const tree = all.map((f) => `${f.path} (${f.size} B)`).join("\n");
      const totalChars = files.reduce((s, f) => s + f.content.length, 0);
      let selected = files;
      if (totalChars > 70_000) {
        await progress(projectId, "inspecting", 15, "Selecting relevant files");
        const pick = await runCompletion({
          userId,
          feature: "project_edit",
          via: "app",
          signal,
          refId: projectId,
          maxOutputTokens: 800,
          temperature: 0,
          messages: [
            { role: "system", content: sys },
            { role: "user", content: `Project files:\n${tree}\n\nChange request: "${instruction}"\n\nReply ONLY with JSON {"files": string[]} listing up to 15 existing files that must be read to make this change.` }
          ]
        });
        const wanted = new Set(extractJson<{ files: string[] }>(pick.result.content)?.files || []);
        selected = files.filter((f) => wanted.has(f.path));
        if (!selected.length) selected = files.slice(0, 15);
      }
      const ctx = new Map(selected.map((f) => [f.path, f.content]));
      await progress(projectId, "editing", 35, "Applying targeted changes");
      const out = await runCompletion({
        userId,
        feature: "project_edit",
        via: "app",
        signal,
        refId: projectId,
        maxOutputTokens: env().AI_PROJECT_MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        messages: [
          { role: "system", content: `${sys}\n\n${FILE_FORMAT_INSTRUCTIONS}` },
          {
            role: "user",
            content: `You are modifying an existing project. Preserve all existing working functionality and make targeted changes only. Output only the files you create, change or delete.\n\nProject file tree:\n${tree}\n\nCurrent content of relevant files:\n${contextOf(ctx, 80_000)}\n\nChange request:\n"""${instruction}"""`
          }
        ]
      });
      const parsed = parseFileBlocks(out.result.content);
      if (!parsed.files.length && !parsed.deletes.length) throw new AppError(502, "edit_unparseable", "The model did not return any file changes");
      await saveFiles(projectId, parsed.files, parsed.deletes, "ai");
      await progress(projectId, "validating", 85, "Validating changes");
      await validateAndFix(projectId, userId, sys, signal, true);
      await progress(projectId, "packaging", 95, "Packaging new version");
      const artifact = await buildArtifact(projectId, instruction.slice(0, 200));
      await Project.updateOne({ _id: projectId }, { $set: { status: "ready", lastError: null, progress: { stage: "done", percent: 100, message: `Updated ${parsed.files.length} file(s), deleted ${parsed.deletes.length}` } } });
      const project = await Project.findById(projectId).lean<any>();
      await postToConversation(
        project?.conversationId,
        userId,
        projectId,
        `Updated **${project?.name}** → version ${artifact.version}.\n\n${parsed.files.map((f) => `- \`${f.path}\``).join("\n")}${parsed.deletes.map((d) => `\n- ~~\`${d}\`~~ deleted`).join("")}`
      );
    } catch (err) {
      const e = err as AppError;
      await Project.updateOne(
        { _id: projectId },
        { $set: { status: "ready", lastError: e.code === "aborted" ? "Edit cancelled" : e.message, progress: { stage: "error", percent: 100, message: e.message } } }
      );
    } finally {
      running.delete(projectId);
    }
  })();
}

export { saveFiles };
