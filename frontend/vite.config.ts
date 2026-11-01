import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: false },
      "/preview": { target: "http://localhost:8080", changeOrigin: false },
      "/health": { target: "http://localhost:8080" }
    }
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          markdown: ["react-markdown", "remark-gfm", "remark-math", "rehype-katex", "rehype-highlight", "katex"],
          editor: ["@uiw/react-codemirror", "@codemirror/lang-javascript", "@codemirror/lang-html", "@codemirror/lang-css", "@codemirror/lang-json", "@codemirror/lang-markdown", "@codemirror/lang-python"]
        }
      }
    }
  }
});
