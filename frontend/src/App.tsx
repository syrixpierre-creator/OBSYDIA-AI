import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useSession } from "./lib/session";
import { Landing } from "./pages/Landing";
import { Login, Register, ForgotPassword, ResetPassword, VerifyEmail } from "./pages/Auth";
import { PricingPublic } from "./pages/Pricing";
import { AppShell } from "./components/AppShell";
import { ChatPage } from "./pages/app/Chat";
import { InviteAccept } from "./pages/Invite";

const Docs = lazy(() => import("./pages/Docs").then((m) => ({ default: m.Docs })));
const Projects = lazy(() => import("./pages/app/Projects").then((m) => ({ default: m.Projects })));
const Workspace = lazy(() => import("./pages/app/Workspace").then((m) => ({ default: m.Workspace })));
const Billing = lazy(() => import("./pages/app/Billing").then((m) => ({ default: m.Billing })));
const Developer = lazy(() => import("./pages/app/Developer").then((m) => ({ default: m.Developer })));
const Referrals = lazy(() => import("./pages/app/Referrals").then((m) => ({ default: m.Referrals })));
const Team = lazy(() => import("./pages/app/Team").then((m) => ({ default: m.Team })));
const Settings = lazy(() => import("./pages/app/Settings").then((m) => ({ default: m.Settings })));
const PricingApp = lazy(() => import("./pages/Pricing").then((m) => ({ default: m.PricingApp })));
const Admin = lazy(() => import("./pages/admin/Admin").then((m) => ({ default: m.Admin })));

export function Spinner() {
  return (
    <div className="center-screen" style={{ minHeight: 240 }}>
      <Loader2 className="spin" size={20} color="var(--text-tertiary)" />
    </div>
  );
}

function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, ready } = useSession();
  const loc = useLocation();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export function App() {
  const { ready } = useSession();
  if (!ready) return <Spinner />;
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/pricing" element={<PricingPublic />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/signup" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/invite/:token" element={<InviteAccept />} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<ChatPage />} />
          <Route path="c/:id" element={<ChatPage />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<Workspace />} />
          <Route path="billing" element={<Billing />} />
          <Route path="pricing" element={<PricingApp />} />
          <Route path="developer" element={<Developer />} />
          <Route path="referrals" element={<Referrals />} />
          <Route path="team" element={<Team />} />
          <Route path="settings" element={<Settings />} />
          <Route
            path="admin"
            element={
              <RequireAuth admin>
                <Admin />
              </RequireAuth>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
