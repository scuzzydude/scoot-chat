import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Steve chat host app — served on :3001.
// CRITICAL: explicit aliases force the library to use THIS directory's copies of
// React and friends. Without this, scoot-chat/node_modules/react is loaded as a
// second React instance, useChatContext() can't see the ChatProvider context, and
// the room list renders blank with no error boundary to catch it.
// Backend target is env-gated: DEV points at its own steve-server (:3003) so
// backend code/prompt changes are isolated from PROD, which defaults to :3002.
const apiTarget = process.env.STEVE_API_TARGET || "http://localhost:3002";

// Open Terminal containers — same ones used by Open WebUI (:80).
// API keys injected server-side so they never appear in browser network traffic.
const TERM_KEY_BRANDON = "7c68f72f73395c478336487c382eda16a92cc7ed1cefa8e32449f217c25471bd";
const TERM_KEY_HENRY   = "94065cae08143719333b87567b51b9105134876fc5d33b441153413e854f24be";

function terminalProxy(target: string, key: string) {
  return {
    target,
    changeOrigin: true,
    ws: true,
    rewrite: (p: string) => p.replace(/^\/terminal-brandon|^\/terminal-henry/, ""),
    configure: (proxy: import("http-proxy").Server) => {
      proxy.on("proxyReq", (req: import("http").ClientRequest) => {
        req.setHeader("Authorization", `Bearer ${key}`);
      });
    },
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3001,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/ws": { target: apiTarget, ws: true, changeOrigin: true },
      "/media": { target: apiTarget, changeOrigin: true },
      "/terminal-brandon": terminalProxy("http://localhost:8001", TERM_KEY_BRANDON),
      "/terminal-henry":   terminalProxy("http://localhost:8002", TERM_KEY_HENRY),
    },
  },
  resolve: {
    alias: {
      "scoot-chat": path.resolve(__dirname, "./src/index.ts"),
      "react": path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      "@tanstack/react-query": path.resolve(__dirname, "node_modules/@tanstack/react-query"),
      "lucide-react": path.resolve(__dirname, "node_modules/lucide-react"),
    },
    dedupe: ["react", "react-dom", "@tanstack/react-query", "lucide-react", "wouter"],
  },
});
