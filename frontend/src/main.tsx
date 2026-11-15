import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "katex/dist/katex.min.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";
import { App } from "./App";
import { I18nProvider } from "./lib/i18n";
import { SessionProvider } from "./lib/session";
import { ToastProvider } from "./components/Toast";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <ToastProvider>
          <SessionProvider>
            <App />
          </SessionProvider>
        </ToastProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>
);
