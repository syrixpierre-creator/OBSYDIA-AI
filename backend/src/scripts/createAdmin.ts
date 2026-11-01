import { connectDb, disconnectDb } from "../lib/db.js";
import { User } from "../models/index.js";
import { normalizeEmail } from "../lib/validate.js";
import { hashPassword, uniqueReferralCode } from "../services/users.js";
import { ensureBalance } from "../services/tokens.js";

async function main() {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password || password.length < 12) {
    console.error("Usage: node dist/scripts/createAdmin.js <email> <password (12+ chars)> [name]");
    process.exit(1);
  }
  await connectDb();
  const address = email.toLowerCase();
  const existing = await User.findOne({ email: address });
  if (existing) {
    existing.role = "admin";
    existing.emailVerified = true;
    existing.passwordHash = await hashPassword(password);
    existing.sessionVersion += 1;
    await existing.save();
    console.log(`Updated ${address}: role=admin, password reset`);
  } else {
    const user = await User.create({
      email: address,
      normalizedEmail: normalizeEmail(address),
      name: name || "Administrator",
      passwordHash: await hashPassword(password),
      role: "admin",
      emailVerified: true,
      emailVerifiedAt: new Date(),
      plan: "custom",
      referralCode: await uniqueReferralCode()
    });
    await ensureBalance(user._id);
    console.log(`Created administrator ${address}`);
  }
  await disconnectDb();
}

void main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
