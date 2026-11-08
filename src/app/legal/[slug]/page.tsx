import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";

const pages: Record<string, { title: string; sections: [string, string][] }> = {
  terms: {
    title: "Terms of Service",
    sections: [
      ["Service", "INCONNU SMS provides temporary virtual phone numbers sourced from third-party suppliers to receive SMS messages. Availability depends on suppliers and is never guaranteed until a number is confirmed."],
      ["Account", "You are responsible for your account credentials and API keys. One person or legal entity per account. We may suspend accounts that breach these terms or the Acceptable Use Policy."],
      ["Wallet & payments", "Funds added through Stripe are credited after payment confirmation. Wallet funds are used to buy numbers. Orders without received SMS are refunded to the wallet automatically. Card refunds are at our discretion and limited to unused wallet funds."],
      ["Liability", "The service is provided “as is”. We are not liable for the policies or decisions of destination platforms, nor for indirect damages. Our total liability is limited to the amounts paid during the last 3 months."],
      ["Changes", "We may update these terms. Continued use after changes constitutes acceptance."],
    ],
  },
  "acceptable-use": {
    title: "Acceptable Use Policy",
    sections: [
      ["Lawful use only", "Numbers may only be used for lawful, authorized purposes such as privacy protection, testing your own applications or receiving codes for accounts you are entitled to create."],
      ["Respect destination platforms", "You must comply with the terms of service of every platform you use a number with. INCONNU SMS must not be used to circumvent bans, verification limits, KYC requirements, or other restrictions set by those platforms."],
      ["Prohibited", "Fraud, scams, phishing, spam, harassment, impersonation, account takeover, creation of fake accounts at scale, financial-service abuse, or any illegal activity are strictly prohibited."],
      ["Enforcement", "We apply rate limits and abuse monitoring. Violations lead to immediate suspension without refund and may be reported to the competent authorities."],
    ],
  },
  privacy: {
    title: "Privacy Policy",
    sections: [
      ["Data we collect", "Account data (name, email), order and payment history, technical logs (IP address, user agent) used for security and abuse prevention. Card data is handled exclusively by Stripe and never touches our servers."],
      ["Purpose", "Providing the service, preventing fraud, accounting obligations and customer support."],
      ["Retention", "API request logs are kept 90 days. Financial records are kept as required by law."],
      ["Your rights", "You can request access, rectification or deletion of your personal data by contacting support, subject to legal retention obligations."],
    ],
  },
};

export const dynamic = "force-dynamic";

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = pages[slug];
  if (!page) notFound();
  const user = await getCurrentUser();
  return (
    <div>
      <Navbar loggedIn={Boolean(user)} />
      <article className="container max-w-3xl py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Legal</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{page.title}</h1>
        <div className="mt-10 space-y-8">
          {page.sections.map(([t, d]) => (
            <section key={t}>
              <h2 className="text-lg font-semibold">{t}</h2>
              <p className="mt-2 leading-relaxed text-muted">{d}</p>
            </section>
          ))}
        </div>
      </article>
      <Footer />
    </div>
  );
}
