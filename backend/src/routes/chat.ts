import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { Conversation, Message, PinnedConversation, Project } from "../models/index.js";
import { body, escapeRegex, objectId, parse } from "../lib/validate.js";
import { AppError, notFound } from "../lib/errors.js";
import { requireVerified } from "../middleware/auth.js";
import { openSse } from "../lib/sse.js";
import { getAiSettings } from "../services/settings.js";
import { buildContext, resolveAttachments } from "../services/chat.js";
import { runCompletion } from "../services/ai/engine.js";
import { titleFrom } from "../services/ai/prompt.js";
import { limiter } from "../lib/rateLimit.js";

export const chatRouter = Router();
chatRouter.use(requireVerified);

const sendLimiter = limiter("chat-send", { windowMs: 60_000, limit: 30, keyGenerator: (req) => String((req as any).user?._id) });

async function ownConversation(req: Request, id: string) {
  const conv = await Conversation.findOne({ _id: parse(objectId, id), userId: req.user._id });
  if (!conv) throw notFound("conversation_not_found");
  return conv;
}

function presentConversation(c: any, pinned: Set<string>) {
  return {
    id: String(c._id),
    title: c.title,
    lastMessageAt: c.lastMessageAt,
    messageCount: c.messageCount,
    projectId: c.projectId ? String(c.projectId) : null,
    pinned: pinned.has(String(c._id)),
    createdAt: c.createdAt
  };
}

export function presentMessage(m: any) {
  return {
    id: String(m._id),
    conversationId: String(m.conversationId),
    role: m.role,
    content: m.content,
    attachments: (m.attachments || []).map((a: any) => ({ fileId: String(a.fileId), kind: a.kind, name: a.name, mime: a.mime, size: a.size })),
    status: m.status,
    error: m.error,
    model: m.model,
    usage: m.usage,
    feedback: m.feedback,
    projectId: m.projectId ? String(m.projectId) : null,
    createdAt: m.createdAt
  };
}

chatRouter.get("/conversations", async (req, res) => {
  const q = parse(z.object({ q: z.string().max(200).optional(), cursor: z.string().optional(), limit: z.coerce.number().min(1).max(100).default(50) }), req.query);
  const filter: Record<string, unknown> = { userId: req.user._id, archived: false };
  if (q.q) filter.title = { $regex: escapeRegex(q.q), $options: "i" };
  if (q.cursor) filter.lastMessageAt = { $lt: new Date(q.cursor) };
  const [list, pins] = await Promise.all([
    Conversation.find(filter).sort({ lastMessageAt: -1 }).limit(q.limit).lean<any[]>(),
    PinnedConversation.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean<any[]>()
  ]);
  const pinnedIds = new Set(pins.map((p) => String(p.conversationId)));
  const pinnedConvs = await Conversation.find({ _id: { $in: [...pinnedIds] }, userId: req.user._id }).lean<any[]>();
  res.json({
    pinned: pinnedConvs.sort((a, b) => +b.lastMessageAt - +a.lastMessageAt).map((c) => presentConversation(c, pinnedIds)),
    conversations: list.map((c) => presentConversation(c, pinnedIds)),
    nextCursor: list.length === q.limit ? list[list.length - 1].lastMessageAt : null
  });
});

chatRouter.get("/search", async (req, res) => {
  const { q } = parse(z.object({ q: z.string().trim().min(1).max(200) }), req.query);
  const rx = { $regex: escapeRegex(q), $options: "i" };
  const [byTitle, byMessage] = await Promise.all([
    Conversation.find({ userId: req.user._id, title: rx }).sort({ lastMessageAt: -1 }).limit(20).lean<any[]>(),
    Message.find({ userId: req.user._id, content: rx }).sort({ createdAt: -1 }).limit(40).select("conversationId content createdAt").lean<any[]>()
  ]);
  const convIds = [...new Set(byMessage.map((m) => String(m.conversationId)))];
  const convs = await Conversation.find({ _id: { $in: convIds }, userId: req.user._id }).lean<any[]>();
  const titles = new Map(convs.map((c) => [String(c._id), c.title]));
  const lower = q.toLowerCase();
  res.json({
    conversations: byTitle.map((c) => ({ id: String(c._id), title: c.title, lastMessageAt: c.lastMessageAt })),
    messages: byMessage
      .filter((m) => titles.has(String(m.conversationId)))
      .map((m) => {
        const idx = m.content.toLowerCase().indexOf(lower);
        const start = Math.max(0, idx - 60);
        return {
          conversationId: String(m.conversationId),
          title: titles.get(String(m.conversationId)),
          messageId: String(m._id),
          snippet: `${start > 0 ? "…" : ""}${m.content.slice(start, start + 180)}`,
          createdAt: m.createdAt
        };
      })
  });
});

chatRouter.post("/conversations", async (req, res) => {
  const input = body(req, z.object({ title: z.string().trim().max(200).optional() }));
  const conv = await Conversation.create({ userId: req.user._id, title: input.title || "New conversation" });
  res.status(201).json({ conversation: presentConversation(conv, new Set()) });
});

chatRouter.get("/conversations/:id", async (req, res) => {
  const conv = await ownConversation(req, String(req.params.id));
  const [messages, pinned] = await Promise.all([
    Message.find({ conversationId: conv._id }).sort({ createdAt: 1 }).limit(500).lean<any[]>(),
    PinnedConversation.exists({ userId: req.user._id, conversationId: conv._id })
  ]);
  const projectIds = [...new Set(messages.filter((m) => m.projectId).map((m) => String(m.projectId)))];
  const projects = await Project.find({ _id: { $in: projectIds }, userId: req.user._id }).select("name status currentVersion fileCount previewable progress").lean<any[]>();
  res.json({
    conversation: presentConversation(conv, new Set(pinned ? [String(conv._id)] : [])),
    messages: messages.map(presentMessage),
    projects: projects.map((p) => ({ id: String(p._id), name: p.name, status: p.status, version: p.currentVersion, fileCount: p.fileCount, previewable: p.previewable, progress: p.progress }))
  });
});

chatRouter.patch("/conversations/:id", async (req, res) => {
  const conv = await ownConversation(req, String(req.params.id));
  const input = body(req, z.object({ title: z.string().trim().min(1).max(200) }));
  conv.title = input.title;
  await conv.save();
  res.json({ ok: true });
});

chatRouter.delete("/conversations/:id", async (req, res) => {
  const conv = await ownConversation(req, String(req.params.id));
  await Promise.all([
    Message.deleteMany({ conversationId: conv._id }),
    PinnedConversation.deleteMany({ conversationId: conv._id }),
    Conversation.deleteOne({ _id: conv._id })
  ]);
  res.json({ ok: true });
});

chatRouter.post("/conversations/:id/pin", async (req, res) => {
  const conv = await ownConversation(req, String(req.params.id));
  await PinnedConversation.updateOne({ userId: req.user._id, conversationId: conv._id }, { $setOnInsert: { userId: req.user._id, conversationId: conv._id } }, { upsert: true });
  res.json({ pinned: true });
});

chatRouter.delete("/conversations/:id/pin", async (req, res) => {
  const conv = await ownConversation(req, String(req.params.id));
  await PinnedConversation.deleteOne({ userId: req.user._id, conversationId: conv._id });
  res.json({ pinned: false });
});

async function streamAssistant(req: Request, res: Response, conv: any, assistant: any, beforeDate: Date, model?: string) {
  const settings = await getAiSettings();
  const messages = await buildContext({ conversationId: conv._id, userId: req.user._id, beforeDate, excludeId: assistant._id, settings, user: req.user });
  const sse = openSse(res);
  const controller = new AbortController();
  let finished = false;
  res.on("close", () => {
    if (!finished) controller.abort();
  });
  sse.send("start", { messageId: String(assistant._id), conversationId: String(conv._id) });
  let content = "";
  let lastSave = Date.now();
  try {
    const out = await runCompletion({
      userId: req.user._id,
      messages,
      model,
      feature: "chat",
      via: "app",
      signal: controller.signal,
      refId: String(assistant._id),
      onDelta: (t) => {
        content += t;
        sse.send("delta", { text: t });
        if (Date.now() - lastSave > 2000) {
          lastSave = Date.now();
          void Message.updateOne({ _id: assistant._id }, { $set: { content } }).exec();
        }
      }
    });
    await Message.updateOne(
      { _id: assistant._id },
      {
        $set: {
          content: out.result.content,
          status: "complete",
          model: out.result.model,
          usage: { promptTokens: out.usage.promptTokens, completionTokens: out.usage.completionTokens, totalTokens: out.usage.totalTokens, estimated: out.usage.estimated }
        }
      }
    );
    finished = true;
    sse.send("done", { messageId: String(assistant._id), usage: out.usage, model: out.result.model, balance: out.balance });
  } catch (err) {
    const e = err as AppError;
    const stopped = e.code === "aborted";
    const partial = (e.details as any)?.partial ?? content;
    await Message.updateOne(
      { _id: assistant._id },
      { $set: { content: partial, status: stopped ? "stopped" : "error", error: stopped ? null : e.code || "error" } }
    );
    finished = true;
    if (!stopped) sse.send("error", { code: e.code || "internal_error", message: e.message, details: e.status === 402 ? e.details : undefined });
  } finally {
    await Conversation.updateOne({ _id: conv._id }, { $set: { lastMessageAt: new Date() } });
    sse.close();
  }
}

const sendSchema = z.object({
  content: z.string().max(100_000).default(""),
  attachments: z.array(objectId).max(10).default([]),
  model: z.string().max(200).optional()
});

chatRouter.post("/conversations/:id/messages", sendLimiter, async (req, res) => {
  const conv = await ownConversation(req, String(req.params.id));
  const input = body(req, sendSchema);
  if (!input.content.trim() && !input.attachments.length) throw new AppError(400, "empty_message", "Message is empty");
  const attachments = await resolveAttachments(req.user._id, input.attachments);
  const userMsg = await Message.create({ conversationId: conv._id, userId: req.user._id, role: "user", content: input.content, attachments });
  const assistant = await Message.create({ conversationId: conv._id, userId: req.user._id, role: "assistant", content: "", status: "streaming", parentId: userMsg._id });
  const update: Record<string, unknown> = { $inc: { messageCount: 2 }, $set: { lastMessageAt: new Date() } };
  if (conv.messageCount === 0 && conv.title === "New conversation") (update.$set as any).title = titleFrom(input.content || attachments[0]?.name || "");
  await Conversation.updateOne({ _id: conv._id }, update);
  res.setHeader("X-User-Message-Id", String(userMsg._id));
  await streamAssistant(req, res, conv, assistant, assistant.createdAt, input.model);
});

chatRouter.post("/messages/:id/regenerate", sendLimiter, async (req, res) => {
  const msg = await Message.findOne({ _id: parse(objectId, String(req.params.id)), userId: req.user._id, role: "assistant" });
  if (!msg) throw notFound("message_not_found");
  const conv = await ownConversation(req, String(msg.conversationId));
  const input = body(req, z.object({ model: z.string().max(200).optional() }));
  await Message.deleteMany({ conversationId: conv._id, createdAt: { $gte: msg.createdAt } });
  const assistant = await Message.create({ conversationId: conv._id, userId: req.user._id, role: "assistant", content: "", status: "streaming", parentId: msg.parentId });
  await streamAssistant(req, res, conv, assistant, assistant.createdAt, input.model);
});

chatRouter.post("/messages/:id/edit", sendLimiter, async (req, res) => {
  const msg = await Message.findOne({ _id: parse(objectId, String(req.params.id)), userId: req.user._id, role: "user" });
  if (!msg) throw notFound("message_not_found");
  const conv = await ownConversation(req, String(msg.conversationId));
  const input = body(req, z.object({ content: z.string().trim().min(1).max(100_000), model: z.string().max(200).optional() }));
  await Message.deleteMany({ conversationId: conv._id, createdAt: { $gt: msg.createdAt } });
  msg.content = input.content;
  await msg.save();
  const count = await Message.countDocuments({ conversationId: conv._id });
  const assistant = await Message.create({ conversationId: conv._id, userId: req.user._id, role: "assistant", content: "", status: "streaming", parentId: msg._id });
  await Conversation.updateOne({ _id: conv._id }, { $set: { messageCount: count + 1 } });
  await streamAssistant(req, res, conv, assistant, assistant.createdAt, input.model);
});

chatRouter.post("/messages/:id/feedback", async (req, res) => {
  const input = body(req, z.object({ value: z.enum(["up", "down"]).nullable() }));
  const r = await Message.updateOne({ _id: parse(objectId, String(req.params.id)), userId: req.user._id, role: "assistant" }, { $set: { feedback: input.value } });
  if (!r.matchedCount) throw notFound("message_not_found");
  res.json({ ok: true });
});
