import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import { useI18n } from "./i18n";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  status: string;
  emailVerified: boolean;
  pendingEmail: string | null;
  locale: "en" | "fr";
  plan: "free" | "pro" | "premium" | "custom";
  planExpiresAt: string | null;
  referralCode: string;
  hasPassword: boolean;
  googleLinked: boolean;
  preferences: { aiLanguage: "auto" | "en" | "fr" };
  createdAt: string;
}

export interface PlanInfo {
  id: string;
  priceUsd: number;
  tokenLimit: number;
  resetHours: number;
  apiAccess: boolean;
  zipUploads: boolean;
  voiceInput: boolean;
  advancedProjects: boolean;
  priority: boolean;
  promoEligible: boolean;
  teams: boolean;
  maxTeamInvites: number;
  apiRequestsPerMinute: number;
  maxUploadMb: number;
}

export interface PublicConfig {
  app: { name: string; creator: string; email: string; url: string };
  ai: { displayName: string; welcomeMessage: string; welcomeMessageFr: string; welcomeSubtitle: { en: string; fr: string }; suggestions: { en: string[]; fr: string[] }; model: string; models: string[]; capabilities: { vision: boolean; audio: boolean; tools: boolean } };
  auth: { google: boolean; emailDelivery: boolean };
  payments: { stripe: boolean; paypal: boolean; stripePublishableKey: string | null };
  voice: { transcription: boolean };
  referral: { required: number; rewardTokens: number };
  plans: PlanInfo[];
  limits: { maxUploadMb: number };
}

export interface Balance {
  plan: string;
  allowance: number;
  used: number;
  bonus: number;
  reserved: number;
  total: number;
  remaining: number;
  periodStart: string;
  resetAt: string;
}

interface Ctx {
  user: User | null;
  config: PublicConfig | null;
  balance: Balance | null;
  ready: boolean;
  refreshUser: () => Promise<User | null>;
  refreshBalance: () => Promise<void>;
  setBalance: (b: Balance | null) => void;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
  plan: PlanInfo | null;
}

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { setLocale } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [ready, setReady] = useState(false);

  const refreshUser = useCallback(async () => {
    const r = await api.get<{ user: User | null }>("/api/auth/me");
    setUser(r.user);
    return r.user;
  }, []);

  const refreshBalance = useCallback(async () => {
    try {
      const r = await api.get<{ balance: Balance }>("/api/tokens");
      setBalance(r.balance);
    } catch {
      setBalance(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [u, c] = await Promise.all([refreshUser(), api.get<PublicConfig>("/api/public/config")]);
        setConfig(c);
        if (u) {
          try {
            if (!localStorage.getItem("obs_locale")) setLocale(u.locale);
          } catch {}
        }
      } catch {
      } finally {
        setReady(true);
      }
    })();
  }, [refreshUser, setLocale]);

  useEffect(() => {
    if (user?.emailVerified) void refreshBalance();
  }, [user?.id, user?.emailVerified, user?.plan, refreshBalance]);

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout");
    setUser(null);
    setBalance(null);
  }, []);

  const plan = useMemo(() => config?.plans.find((p) => p.id === user?.plan) || null, [config, user?.plan]);

  const value = useMemo(
    () => ({ user, config, balance, ready, refreshUser, refreshBalance, setBalance, setUser, logout, plan }),
    [user, config, balance, ready, refreshUser, refreshBalance, logout, plan]
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("SessionProvider missing");
  return ctx;
}
