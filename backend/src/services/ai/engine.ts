import { AppError } from "../../lib/errors.js";
import { providerManager, type ChatMessage, type ChatResult } from "./providerManager.js";
import { estimateMessagesTokens, estimateTokens, releaseReservation, reserveTokens, settleReservation } from "../tokens.js";
import { getAiSettings } from "../settings.js";

export interface CompletionInput {
  userId: unknown;
  messages: ChatMessage[];
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  feature: string;
  via: "app" | "api";
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  refId?: string | null;
  responseFormat?: "json_object";
}

export interface CompletionOutput {
  result: ChatResult;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number; estimated: boolean };
  balance: Awaited<ReturnType<typeof settleReservation>>;
}

export async function resolveModel(requested?: string) {
  const settings = await getAiSettings();
  if (!requested) return { model: settings.model, settings };
  if (!settings.models.includes(requested)) throw new AppError(400, "model_not_available", `Model ${requested} is not available`);
  return { model: requested, settings };
}

export async function runCompletion(input: CompletionInput): Promise<CompletionOutput> {
  const { model, settings } = await resolveModel(input.model);
  const exempt = estimateTokens(`${settings.systemPrompt}\n${settings.personality}`);
  const rawPromptEstimate = estimateMessagesTokens(input.messages);
  const promptEstimate = Math.max(1, rawPromptEstimate - exempt);
  const desired = input.maxOutputTokens ?? settings.maxOutputTokens;
  const reservation = await reserveTokens(input.userId, promptEstimate, desired);
  let streamed = "";
  try {
    const result = await providerManager.chat({
      messages: input.messages,
      model,
      maxTokens: reservation.maxOutputTokens,
      temperature: input.temperature,
      signal: input.signal,
      responseFormat: input.responseFormat,
      onDelta: input.onDelta
        ? (t) => {
            streamed += t;
            input.onDelta!(t);
          }
        : undefined
    });
    const estimated = !result.usage;
    const usage = result.usage
      ? (() => {
          const promptTokens = Math.max(0, result.usage!.promptTokens - exempt);
          return { promptTokens, completionTokens: result.usage!.completionTokens, totalTokens: promptTokens + result.usage!.completionTokens, estimated: false };
        })()
      : (() => {
          const completionTokens = estimateTokens(result.content);
          return { promptTokens: promptEstimate, completionTokens, totalTokens: promptEstimate + completionTokens, estimated: true };
        })();
    const balance = await settleReservation(reservation, {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      estimated,
      feature: input.feature,
      via: input.via,
      refId: input.refId
    });
    return { result, usage, balance };
  } catch (err) {
    if (streamed) {
      const completionTokens = estimateTokens(streamed);
      await settleReservation(reservation, {
        promptTokens: promptEstimate,
        completionTokens,
        estimated: true,
        feature: input.feature,
        via: input.via,
        refId: input.refId
      });
      if (err instanceof AppError) err.details = { ...(err.details as object), partial: streamed };
    } else {
      await releaseReservation(reservation);
    }
    throw err;
  }
}
