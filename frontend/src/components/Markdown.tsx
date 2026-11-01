import { memo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { useToast } from "./Toast";

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in (node as any)) return textOf((node as any).props.children);
  return "";
}

function CodeBlock({ children, lang }: { children: ReactNode; lang: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(textOf(children).replace(/\n$/, ""));
    setCopied(true);
    toast(t("common.copied"));
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span className="mono">{lang || "text"}</span>
        <button className="codeblock-copy" onClick={copy}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? t("common.copied") : t("chat.copyCode")}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }], [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => {
            const child: any = Array.isArray(children) ? children[0] : children;
            const cls: string = child?.props?.className || "";
            const lang = cls.match(/language-([\w+-]+)/)?.[1] || "";
            return <CodeBlock lang={lang}>{children}</CodeBlock>;
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="md-table">
              <table>{children}</table>
            </div>
          )
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
