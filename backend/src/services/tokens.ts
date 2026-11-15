import mongoose from "mongoose";
import { randomToken } from "../lib/crypto.js";
import { paymentRequired } from "../lib/errors.js";
import { TokenBalance, TokenTransaction, User } from "../models/index.js";
import { getPlan } from "./settings.js";

const RESERVATION_TTL_MS = 15 * 60_000;
const MIN_OUTPUT_TOKENS = 256;

export function estimateTokens(text: string) {
  if (!text) return 0;
  const cjk = (text.match(/[　-鿿가-힯]/g) || []).length;
  return Math.ceil((text.length - cjk) / 3.6 + cjk * 1.1);
}

export function estimateMessagesTokens(messages: { content: unknown }[]) {
  let total = 3;
  for (const m of messages) {
    total += 4;
    if (typeof m.content === "string") total += estimateTokens(m.content);
    else if (Array.isArray(m.content)) {
      for (const part of m.content as any[]) {
        if (part.type === "text") total += estimateTokens(part.text);
        else if (part.type === "image_url") total += 1100;
      }
    }
  }
  return total;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 3600_000);
}

function available(b: any) {
  const reserved = (b.reservations || []).reduce((s: number, r: any) => s + r.amount, 0);
  return Math.max(0, b.allowance + b.bonus - b.used - reserved);
}

export function presentBalance(b: any) {
  const reserved = (b.reservations || []).reduce((s: number, r: any) => s + r.amount, 0);
  return {
    plan: b.plan,
    allowance: b.allowance,
    used: b.used,
    bonus: b.bonus,
    reserved,
    total: b.allowance + b.bonus,
    remaining: available(b),
    periodStart: b.periodStart,
    resetAt: b.resetAt
  };
}

export async function ensureBalance(userId: unknown) {
  const user = await User.findById(userId).lean<any>();
  if (!user) throw new Error("user not found");
  const plan = await getPlan(user.plan);
  const now = new Date();
  let balance = await TokenBalance.findOne({ userId }).lean<any>();
  if (!balance) {
    try {
      balance = (
        await TokenBalance.create({
          userId,
          plan: plan.id,
          allowance: plan.tokenLimit,
          used: 0,
          bonus: 0,
          reservations: [],
          periodStart: now,
          resetAt: addHours(now, plan.resetHours)
        })
      ).toObject();
      await TokenTransaction.create({ userId, type: "reset", amount: plan.tokenLimit, source: "system", via: "system", note: `initial ${plan.id} allowance`, balanceAfter: plan.tokenLimit });
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
      balance = await TokenBalance.findOne({ userId }).lean<any>();
    }
  }
  if (balance.resetAt <= now) {
    const reset = await TokenBalance.findOneAndUpdate(
      { _id: balance._id, resetAt: { $lte: now } },
      { $set: { used: 0, plan: plan.id, allowance: plan.tokenLimit, periodStart: now, resetAt: addHours(now, plan.resetHours) } },
      { new: true }
    ).lean<any>();
    if (reset) {
      balance = reset;
      await TokenTransaction.create({ userId, type: "reset", amount: plan.tokenLimit, source: "system", via: "system", note: `${plan.id} allowance reset`, balanceAfter: available(reset) });
    } else {
      balance = await TokenBalance.findOne({ userId }).lean<any>();
    }
  }
  if (balance.plan !== plan.id || balance.allowance !== plan.tokenLimit) {
    balance = await applyPlanToBalance(userId, plan.id, false);
  }
  return balance;
}

export async function applyPlanToBalance(userId: unknown, planId: string, resetUsage = true) {
  const plan = await getPlan(planId);
  const now = new Date();
  const update: Record<string, unknown> = { plan: plan.id, allowance: plan.tokenLimit };
  if (resetUsage) Object.assign(update, { used: 0, periodStart: now, resetAt: addHours(now, plan.resetHours) });
  const before = await TokenBalance.findOne({ userId }).lean<any>();
  if (!before) return ensureBalance(userId);
  if (!resetUsage && before.plan !== plan.id) {
    const resetAt = addHours(new Date(before.periodStart), plan.resetHours);
    update.resetAt = resetAt;
  }
  const after = await TokenBalance.findOneAndUpdate({ userId }, { $set: update }, { new: true }).lean<any>();
  if (before.plan !== plan.id) {
    await TokenTransaction.create({
      userId,
      type: "plan_change",
      amount: plan.tokenLimit,
      source: "system",
      via: "system",
      note: `${before.plan} → ${plan.id}`,
      balanceAfter: available(after)
    });
  }
  return after;
}

export interface Reservation {
  id: string;
  userId: string;
  amount: number;
  promptTokens: number;
  maxOutputTokens: number;
}

export async function reserveTokens(userId: unknown, promptTokens: number, desiredOutput: number): Promise<Reservation> {
  const balance = await ensureBalance(userId);
  const now = new Date();
  await TokenBalance.updateOne({ _id: balance._id }, { $pull: { reservations: { expiresAt: { $lte: now } } } } as any);
  const fresh = await TokenBalance.findById(balance._id).lean<any>();
  const free = available(fresh);
  const minimum = promptTokens + MIN_OUTPUT_TOKENS;
  if (free < minimum) {
    throw paymentRequired("insufficient_tokens", "Not enough tokens for this request", {
      remaining: free,
      required: minimum,
      resetAt: fresh.resetAt
    });
  }
  const maxOutputTokens = Math.max(MIN_OUTPUT_TOKENS, Math.min(desiredOutput, free - promptTokens));
  const amount = promptTokens + maxOutputTokens;
  const id = randomToken(12);
  const updated = await TokenBalance.findOneAndUpdate(
    {
      _id: balance._id,
      $expr: {
        $gte: [
          { $subtract: [{ $add: ["$allowance", "$bonus"] }, { $add: ["$used", { $sum: "$reservations.amount" }] }] },
          amount
        ]
      }
    },
    { $push: { reservations: { rid: id, amount, expiresAt: new Date(Date.now() + RESERVATION_TTL_MS) } } },
    { new: true }
  ).lean<any>();
  if (!updated) {
    throw paymentRequired("insufficient_tokens", "Not enough tokens for this request", { remaining: available(fresh), required: amount });
  }
  return { id, userId: String(userId), amount, promptTokens, maxOutputTokens };
}

export async function releaseReservation(r: Reservation) {
  await TokenBalance.updateOne({ userId: r.userId }, { $pull: { reservations: { rid: r.id } } } as any);
}

export interface SettleInput {
  promptTokens: number;
  completionTokens: number;
  estimated: boolean;
  feature: string;
  via: "app" | "api";
  refId?: string | null;
}

export async function settleReservation(r: Reservation, usage: SettleInput) {
  const spend = Math.max(0, Math.round(usage.promptTokens + usage.completionTokens));
  const updated = await TokenBalance.findOneAndUpdate(
    { userId: r.userId },
    [
      {
        $set: {
          reservations: { $filter: { input: "$reservations", as: "r", cond: { $ne: ["$$r.rid", r.id] } } },
          _newUsed: { $add: ["$used", spend] }
        }
      },
      {
        $set: {
          bonus: { $max: [0, { $subtract: ["$bonus", { $max: [0, { $subtract: ["$_newUsed", "$allowance"] }] }] }] },
          used: { $min: ["$_newUsed", "$allowance"] }
        }
      },
      { $unset: "_newUsed" }
    ] as any,
    { new: true }
  ).lean<any>();
  const source = updated && updated.used >= updated.allowance ? "mixed" : "allowance";
  await TokenTransaction.create({
    userId: r.userId,
    type: "usage",
    amount: -spend,
    source,
    promptTokens: Math.round(usage.promptTokens),
    completionTokens: Math.round(usage.completionTokens),
    estimated: usage.estimated,
    feature: usage.feature,
    via: usage.via,
    refId: usage.refId ?? null,
    balanceAfter: updated ? available(updated) : null
  });
  return updated ? presentBalance(updated) : null;
}

export async function grantBonus(userId: unknown, tokens: number, type: "referral_bonus" | "admin_adjustment" | "refund", note: string, session?: mongoose.ClientSession) {
  await ensureBalance(userId);
  const updated = await TokenBalance.findOneAndUpdate({ userId }, [{ $set: { bonus: { $max: [0, { $add: ["$bonus", tokens] }] } } }] as any, {
    new: true,
    session
  }).lean<any>();
  await TokenTransaction.create([{ userId, type, amount: tokens, source: "bonus", via: "system", note, balanceAfter: updated ? available(updated) : null }], { session });
  return updated ? presentBalance(updated) : null;
}

export async function getBalanceView(userId: unknown) {
  return presentBalance(await ensureBalance(userId));
}
