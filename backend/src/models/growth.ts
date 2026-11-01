import mongoose, { Schema } from "mongoose";

const referralSchema = new Schema(
  {
    referrerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    refereeId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    status: { type: String, enum: ["pending", "qualified", "rejected"], default: "pending", index: true },
    rejectReason: { type: String, default: null },
    qualifiedAt: { type: Date, default: null },
    rewardId: { type: Schema.Types.ObjectId, ref: "ReferralReward", default: null }
  },
  { timestamps: true, collection: "referrals" }
);

export const Referral = mongoose.models.Referral || mongoose.model("Referral", referralSchema);

const rewardSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    milestone: { type: Number, required: true },
    tokens: { type: Number, required: true },
    referralIds: { type: [Schema.Types.ObjectId], default: [] }
  },
  { timestamps: true, collection: "referral_rewards" }
);
rewardSchema.index({ userId: 1, milestone: 1 }, { unique: true });

export const ReferralReward = mongoose.models.ReferralReward || mongoose.model("ReferralReward", rewardSchema);

const teamSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    name: { type: String, required: true, maxlength: 80 }
  },
  { timestamps: true, collection: "teams" }
);

export const Team = mongoose.models.Team || mongoose.model("Team", teamSchema);

const teamMemberSchema = new Schema(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["owner", "editor", "viewer"], default: "editor" }
  },
  { timestamps: true, collection: "team_members" }
);
teamMemberSchema.index({ teamId: 1, userId: 1 }, { unique: true });

export const TeamMember = mongoose.models.TeamMember || mongoose.model("TeamMember", teamMemberSchema);

const invitationSchema = new Schema(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    email: { type: String, required: true, lowercase: true },
    role: { type: String, enum: ["editor", "viewer"], default: "editor" },
    tokenHash: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "accepted", "revoked", "expired"], default: "pending" },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true, collection: "invitations" }
);
invitationSchema.index({ teamId: 1, email: 1, status: 1 });

export const Invitation = mongoose.models.Invitation || mongoose.model("Invitation", invitationSchema);
