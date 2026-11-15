import { useEffect, useState } from "react";

const KEY = "obs_intro_seen";

export function shouldPlay() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    return !sessionStorage.getItem(KEY);
  } catch {
    return true;
  }
}

export function Intro() {
  const [phase, setPhase] = useState<"on" | "leaving" | "off">(() => (shouldPlay() ? "on" : "off"));
  useEffect(() => {
    if (phase !== "on") return;
    document.documentElement.classList.add("intro-lock");
    const t1 = setTimeout(() => setPhase("leaving"), 1900);
    const t2 = setTimeout(() => {
      setPhase("off");
      document.documentElement.classList.remove("intro-lock");
      try {
        sessionStorage.setItem(KEY, "1");
      } catch {}
    }, 2700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      document.documentElement.classList.remove("intro-lock");
    };
  }, [phase]);
  if (phase === "off") return null;
  const word = "OBSYDIA";
  return (
    <div className={`intro ${phase === "leaving" ? "intro-leave" : ""}`} aria-hidden onClick={() => setPhase("leaving")}>
      <div className="intro-center">
        <div className="intro-mark">
          <img src="/obsydia-avatar.png" alt="" />
          <span className="intro-scan" />
        </div>
        <div className="intro-word">
          {word.split("").map((c, i) => (
            <span key={i} style={{ animationDelay: `${0.55 + i * 0.06}s` }}>{c}</span>
          ))}
        </div>
        <div className="intro-line" />
        <div className="intro-tag">THINK · CREATE · BUILD · DEPLOY</div>
      </div>
    </div>
  );
}

export function useReveal(deps: unknown[] = []) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not(.revealed)"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("revealed"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            en.target.classList.add("revealed");
            io.unobserve(en.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, deps);
}
