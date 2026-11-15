import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { Invitation, Project, Team, TeamMember, User } from "../models/index.js";
import { requireVerified } from "../middleware/auth.js";
import { body, email as emailSchema, normalizeEmail, objectId, parse } from "../lib/validate.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { randomToken, sha256 } from "../lib/crypto.js";
import { sendEmail } from "../lib/mailer.js";
import { referralSummary } from "../services/referrals.js";
import { getPlan } from "../services/settings.js";
import { audit } from "../lib/audit.js";
import { limiter } from "../lib/rateLimit.js";

export const referralsRouter = Router();
referralsRouter.use(requireVerified);

referralsRouter.get("/", async (req, res) => {
  const summary = await referralSummary(req.user._id);
  res.json({ code: req.user.referralCode, link: `${env().APP_URL}/register?ref=${req.user.referralCode}`, ...summary });
});

export const teamsRouter = Router();

const inviteLimiter = limiter("team-invite", { windowMs: 60 * 60_000, limit: 20, keyGenerator: (req) => String((req as any).user?._id) });

async function teamView(team: any, viewerId: string) {
  const [members, invites, projects] = await Promise.all([
    TeamMember.find({ teamId: team._id }).populate("userId", "name email plan").lean<any[]>(),
    Invitation.find({ teamId: team._id, status: "pending", expiresAt: { $gt: new Date() } }).lean<any[]>(),
    Project.find({ teamId: team._id }).select("name status fileCount updatedAt userId").sort({ updatedAt: -1 }).lean<any[]>()
  ]);
  const isOwner = String(team.ownerId) === viewerId;
  return {
    id: String(team._id),
    name: team.name,
    isOwner,
    maxInvites: env().MAX_TEAM_INVITES,
    seatsUsed: members.filter((m) => m.role !== "owner").length + invites.length,
    members: members.map((m) => ({ id: String(m._id), userId: String(m.userId?._id), name: m.userId?.name, email: m.userId?.email, role: m.role, joinedAt: m.createdAt })),
    invitations: isOwner ? invites.map((i) => ({ id: String(i._id), email: i.email, role: i.role, expiresAt: i.expiresAt, createdAt: i.createdAt })) : [],
    projects: projects.map((p) => ({ id: String(p._id), name: p.name, status: p.status, fileCount: p.fileCount, updatedAt: p.updatedAt, ownedByYou: String(p.userId) === viewerId }))
  };
}

teamsRouter.get("/invitations/:token", async (req, res) => {
  const inv = await Invitation.findOne({ tokenHash: sha256(String(req.params.token)), status: "pending", expiresAt: { $gt: new Date() } }).lean<any>();
  if (!inv) throw notFound("invitation_not_found", "This invitation is invalid or has expired");
  const team = await Team.findById(inv.teamId).populate("ownerId", "name").lean<any>();
  res.json({ team: team?.name, inviter: team?.ownerId?.name, email: inv.email.replace(/^(.).*(@.*)$/, "$1•••$2"), role: inv.role, expiresAt: inv.expiresAt });
});

teamsRouter.use(requireVerified);

teamsRouter.get("/", async (req, res) => {
  const owned = await Team.findOne({ ownerId: req.user._id }).lean<any>();
  const memberships = await TeamMember.find({ userId: req.user._id, role: { $ne: "owner" } }).lean<any[]>();
  const others = await Team.find({ _id: { $in: memberships.map((m) => m.teamId) } }).lean<any[]>();
  const plan = await getPlan(req.user.plan);
  res.json({
    canCreate: plan.teams && !owned,
    owned: owned ? await teamView(owned, String(req.user._id)) : null,
    memberOf: await Promise.all(others.map((t) => teamView(t, String(req.user._id))))
  });
});

teamsRouter.post("/", async (req, res) => {
  const plan = await getPlan(req.user.plan);
  if (!plan.teams) throw forbidden("plan_upgrade_required", "Team workspaces require the Premium plan");
  const input = body(req, z.object({ name: z.string().trim().min(2).max(80) }));
  if (await Team.exists({ ownerId: req.user._id })) throw conflict("team_exists", "You already own a team");
  const team = await Team.create({ ownerId: req.user._id, name: input.name });
  await TeamMember.create({ teamId: team._id, userId: req.user._id, role: "owner" });
  await audit(req, "team.created", { targetType: "team", targetId: team._id });
  res.status(201).json({ team: await teamView(team, String(req.user._id)) });
});

async function ownedTeam(req: any) {
  const team = await Team.findOne({ ownerId: req.user._id });
  if (!team) throw notFound("team_not_found");
  return team;
}

teamsRouter.post("/invitations", inviteLimiter, async (req, res) => {
  const plan = await getPlan(req.user.plan);
  if (!plan.teams) throw forbidden("plan_upgrade_required", "Team workspaces require the Premium plan");
  const team = await ownedTeam(req);
  const input = body(req, z.object({ email: emailSchema, role: z.enum(["editor", "viewer"]).default("editor") }));
  if (normalizeEmail(input.email) === req.user.normalizedEmail) throw badRequest("cannot_invite_self");
  const [members, pending] = await Promise.all([
    TeamMember.countDocuments({ teamId: team._id, role: { $ne: "owner" } }),
    Invitation.countDocuments({ teamId: team._id, status: "pending", expiresAt: { $gt: new Date() } })
  ]);
  if (members + pending >= plan.maxTeamInvites) throw forbidden("team_limit_reached", `You can invite up to ${plan.maxTeamInvites} members`);
  const existingUser = await User.findOne({ email: input.email }).lean<any>();
  if (existingUser && (await TeamMember.exists({ teamId: team._id, userId: existingUser._id }))) throw conflict("already_member");
  if (await Invitation.exists({ teamId: team._id, email: input.email, status: "pending", expiresAt: { $gt: new Date() } })) throw conflict("already_invited");
  const token = randomToken(32);
  const inv = await Invitation.create({
    teamId: team._id,
    email: input.email,
    role: input.role,
    tokenHash: sha256(token),
    invitedBy: req.user._id,
    expiresAt: new Date(Date.now() + 7 * 86400_000)
  });
  await sendEmail(input.email, "team_invitation", existingUser?.locale || req.user.locale, {
    inviter: req.user.name,
    team: team.name,
    url: `${env().APP_URL}/invite/${token}`
  });
  await audit(req, "team.invited", { targetType: "invitation", targetId: inv._id });
  res.status(201).json({ ok: true, id: String(inv._id) });
});

teamsRouter.delete("/invitations/:id", async (req, res) => {
  const team = await ownedTeam(req);
  const r = await Invitation.updateOne({ _id: parse(objectId, String(req.params.id)), teamId: team._id, status: "pending" }, { $set: { status: "revoked" } });
  if (!r.matchedCount) throw notFound("invitation_not_found");
  res.json({ ok: true });
});

teamsRouter.post("/invitations/:token/accept", async (req, res) => {
  const inv = await Invitation.findOne({ tokenHash: sha256(String(req.params.token)), status: "pending", expiresAt: { $gt: new Date() } });
  if (!inv) throw notFound("invitation_not_found", "This invitation is invalid or has expired");
  if (normalizeEmail(inv.email) !== req.user.normalizedEmail) throw forbidden("invitation_email_mismatch", "This invitation was sent to a different email address");
  const team = await Team.findById(inv.teamId).lean<any>();
  if (!team) throw notFound("team_not_found");
  const owner = await User.findById(team.ownerId).lean<any>();
  const ownerPlan = await getPlan(owner?.plan || "free");
  if (!ownerPlan.teams) throw forbidden("team_inactive", "The team owner's plan no longer includes teams");
  const members = await TeamMember.countDocuments({ teamId: team._id, role: { $ne: "owner" } });
  if (members >= ownerPlan.maxTeamInvites) throw forbidden("team_limit_reached");
  const claimed = await Invitation.findOneAndUpdate({ _id: inv._id, status: "pending" }, { $set: { status: "accepted" } });
  if (!claimed) throw conflict("invitation_already_used");
  try {
    await TeamMember.create({ teamId: team._id, userId: req.user._id, role: inv.role });
  } catch (err: any) {
    if (err?.code !== 11000) throw err;
  }
  await audit(req, "team.joined", { targetType: "team", targetId: team._id });
  res.json({ ok: true, teamId: String(team._id) });
});

teamsRouter.patch("/members/:id", async (req, res) => {
  const team = await ownedTeam(req);
  const input = body(req, z.object({ role: z.enum(["editor", "viewer"]) }));
  const r = await TeamMember.updateOne({ _id: parse(objectId, String(req.params.id)), teamId: team._id, role: { $ne: "owner" } }, { $set: { role: input.role } });
  if (!r.matchedCount) throw notFound("member_not_found");
  res.json({ ok: true });
});

teamsRouter.delete("/members/:id", async (req, res) => {
  const team = await ownedTeam(req);
  const r = await TeamMember.deleteOne({ _id: parse(objectId, String(req.params.id)), teamId: team._id, role: { $ne: "owner" } });
  if (!r.deletedCount) throw notFound("member_not_found");
  await audit(req, "team.member_removed", { targetType: "team", targetId: team._id });
  res.json({ ok: true });
});

teamsRouter.post("/:id/leave", async (req, res) => {
  const r = await TeamMember.deleteOne({ teamId: parse(objectId, String(req.params.id)), userId: req.user._id, role: { $ne: "owner" } });
  if (!r.deletedCount) throw notFound("member_not_found");
  res.json({ ok: true });
});

teamsRouter.delete("/", async (req, res) => {
  const team = await ownedTeam(req);
  await Promise.all([
    TeamMember.deleteMany({ teamId: team._id }),
    Invitation.updateMany({ teamId: team._id, status: "pending" }, { $set: { status: "revoked" } }),
    Project.updateMany({ teamId: team._id }, { $set: { teamId: null } }),
    Team.deleteOne({ _id: team._id })
  ]);
  res.json({ ok: true });
});
