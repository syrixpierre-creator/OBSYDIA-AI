import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Check, AlertTriangle, Info } from "lucide-react";

type Kind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: Kind;
  text: string;
}

const ToastContext = createContext<(text: string, kind?: Kind) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, kind: Kind = "success") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-3), { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), kind === "error" ? 5000 : 2200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={`toast ${i.kind}`}>
            {i.kind === "success" ? <Check size={15} /> : i.kind === "error" ? <AlertTriangle size={15} /> : <Info size={15} />}
            <span>{i.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
