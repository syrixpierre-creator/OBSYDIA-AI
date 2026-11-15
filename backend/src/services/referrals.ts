import { env } from "../config/env.js";
import { Referral, ReferralReward, User } from "../models/index.js";
import { sendEmail } from "../lib/mailer.js";
import { logger } from "../lib/logger.js";
import { grantBonus } from "./tokens.js";
import { normalizeEmail } from "../lib/validate.js";

export async function recordReferral(referee: any, refCode: string | undefined) {
  if (!refCode) return null;
  const referrer = await User.findOne({ referralCode: refCode.trim().toUpperCase() }).lean<any>();
  if (!referrer) return null;
  let rejectReason: string | null = null;
  if (String(referrer._id) === String(referee._id)) rejectReason = "self_referral";
  else if (normalizeEmail(referrer.email) === referee.normalizedEmail) rejectReason = "self_referral";
  else if (referrer.signupIpHash && referee.signupIpHash && referrer.signupIpHash === referee.signupIpHash) rejectReason = "same_network_as_referrer";
  else {
    const sameIp = await User.countDocuments({ referredBy: referrer._id, signupIpHash: referee.signupIpHash, _id: { $ne: referee._id } });
    if (referee.signupIpHash && sameIp >= 1) rejectReason = "duplicate_network";
  }
  await User.updateOne({ _id: referee._id }, { $set: { referredBy: referrer._id } });
  try {
    return await Referral.create({
      referrerId: referrer._id,
      refereeId: referee._id,
      status: rejectReason ? "rejected" : "pending",
      rejectReason
    });
  } catch (err: any) {
    if (err?.code === 11000) return null;
    throw err;
  }
}

export async function qualifyReferral(refereeId: unknown) {
  const referral = await Referral.findOneAndUpdate(
    { refereeId, status: "pending" },
    { $set: { status: "qualified", qualifiedAt: new Date() } },
    { new: true }
  ).lean<any>();
  if (!referral) return null;
  return processRewards(referral.referrerId);
}

export async function processRewards(referrerId: unknown) {
  const e = env();
  const required = Math.max(1, e.REFERRAL_REQUIRED);
  const qualified = await Referral.find({ referrerId, status: "qualified" }).sort({ qualifiedAt: 1 }).select("_id").lean<any[]>();
  const milestones = Math.floor(qualified.length / required);
  const granted: number[] = [];
  for (let m = 1; m <= milestones; m++) {
    const ids = qualified.slice((m - 1) * required, m * required).map((r) => r._id);
    try {
      const reward = await ReferralReward.create({ userId: referrerId, milestone: m, tokens: e.REFERRAL_REWARD_TOKENS, referralIds: ids });
      await Referral.updateMany({ _id: { $in: ids } }, { $set: { rewardId: reward._id } });
      await grantBonus(referrerId, e.REFERRAL_REWARD_TOKENS, "referral_bonus", `Referral milestone ${m} (${m * required} qualified referrals)`);
      granted.push(m);
      const user = await User.findById(referrerId).lean<any>();
      if (user) {
        void sendEmail(user.email, "referral_reward", user.locale, {
          tokens: e.REFERRAL_REWARD_TOKENS.toLocaleString("en-US"),
          count: String(m * required),
          url: `${e.APP_URL}/app/referrals`
        });
      }
    } catch (err: any) {
      if (err?.code !== 11000) logger.error({ err: err.message }, "referral reward failed");
    }
  }
  return granted;
}

export async function referralSummary(userId: unknown) {
  const e = env();
  const [pending, qualified, rejected, rewards, list] = await Promise.all([
    Referral.countDocuments({ referrerId: userId, status: "pending" }),
    Referral.countDocuments({ referrerId: userId, status: "qualified" }),
    Referral.countDocuments({ referrerId: userId, status: "rejected" }),
    ReferralReward.find({ userId }).sort({ milestone: -1 }).lean<any[]>(),
    Referral.find({ referrerId: userId }).sort({ createdAt: -1 }).limit(50).populate("refereeId", "name email emailVerified").lean<any[]>()
  ]);
  const required = Math.max(1, e.REFERRAL_REQUIRED);
  return {
    required,
    rewardTokens: e.REFERRAL_REWARD_TOKENS,
    pending,
    qualified,
    rejected,
    progress: qualified % required,
    earnedTokens: rewards.reduce((s, r) => s + r.tokens, 0),
    rewards: rewards.map((r) => ({ milestone: r.milestone, tokens: r.tokens, createdAt: r.createdAt })),
    referrals: list.map((r) => ({
      id: String(r._id),
      name: r.refereeId?.name ? `${String(r.refereeId.name).slice(0, 1)}•••` : "—",
      email: r.refereeId?.email ? String(r.refereeId.email).replace(/^(.).*(@.*)$/, "$1•••$2") : "—",
      status: r.status,
      rejectReason: r.rejectReason,
      createdAt: r.createdAt,
      qualifiedAt: r.qualifiedAt
    }))
  };
}
