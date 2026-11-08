import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "INCONNU SMS — Your Numbers. Your World.", template: "%s · INCONNU SMS" },
  description: "Global virtual number platform: receive SMS verification codes, manage orders and automate through a powerful REST API.",
  applicationName: "INCONNU SMS",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#08090D", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`} style={{ ["--font-sans" as string]: "var(--font-geist-sans)", ["--font-mono" as string]: "var(--font-geist-mono)" }}>
      <body className="min-h-screen font-sans">
        {children}
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{ classNames: { toast: "!bg-surface-2 !border !border-white/10 !text-foreground !rounded-xl", description: "!text-muted" } }}
        />
      </body>
    </html>
  );
}
