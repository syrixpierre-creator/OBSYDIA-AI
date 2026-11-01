import { describe, expect, it } from "vitest";
import { renderEmail } from "../src/lib/emailTemplates.js";

describe("transactional emails", () => {
  it("renders bilingual templates with escaping", () => {
    const en = renderEmail("verify_email", "en", { code: "123456", url: "http://x/verify" });
    expect(en.subject).toContain("123456");
    expect(en.html).toContain("http://x/verify");
    const fr = renderEmail("team_invitation", "fr", { inviter: "<script>", team: "Équipe", url: "http://x" });
    expect(fr.subject).toContain("vous invite");
    expect(fr.html).not.toContain("<script>");
    expect(fr.html).toContain("&lt;script&gt;");
  });

  it("covers every required notification", () => {
    for (const kind of ["welcome", "verify_email", "reset_password", "subscription_activated", "payment_succeeded", "payment_failed", "subscription_canceled", "referral_reward", "team_invitation"] as const) {
      for (const l of ["en", "fr"] as const) expect(renderEmail(kind, l, {}).subject.length).toBeGreaterThan(5);
    }
  });
});
