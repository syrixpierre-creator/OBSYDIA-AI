import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1280px" } },
    extend: {
      colors: {
        background: "#08090D",
        surface: { DEFAULT: "#0E1016", 2: "#13151D", 3: "#1A1D27" },
        border: "rgba(255,255,255,0.07)",
        muted: "#8A8FA3",
        foreground: "#ECEDF3",
        violet: { DEFAULT: "#7C3AED", 400: "#A78BFA", 500: "#8B5CF6", 600: "#7C3AED" },
        electric: { DEFAULT: "#3B82F6", 400: "#60A5FA", 500: "#3B82F6" },
        success: "#22C55E",
        warning: "#F59E0B",
        danger: "#EF4444",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: { xl: "14px", "2xl": "18px" },
      boxShadow: {
        glow: "0 0 0 1px rgba(139,92,246,0.25), 0 8px 40px -8px rgba(124,58,237,0.45)",
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 20px 40px -24px rgba(0,0,0,0.8)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)",
      },
      keyframes: {
        "fade-up": { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "pulse-dot": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
      },
      animation: {
        "fade-up": "fade-up .5s ease-out both",
        shimmer: "shimmer 1.6s infinite",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
