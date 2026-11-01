import { Link } from "react-router-dom";

export function Mark({ size = 28 }: { size?: number }) {
  return <img src="/obsydia-avatar.png" alt="" width={size} height={size} className="mark" style={{ width: size, height: size }} />;
}

export function Logo({ to = "/", compact = false }: { to?: string; compact?: boolean }) {
  return (
    <Link to={to} className="logo" aria-label="OBSYDIA AI">
      <Mark size={compact ? 26 : 30} />
      <span className="logo-word">
        OBSYDIA<span className="logo-ai">AI</span>
      </span>
    </Link>
  );
}
