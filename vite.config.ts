import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Steve chat host app — served on :3001.
// CRITICAL: explicit aliases force the library to use THIS directory's copies of
// React and friends. Without this, scoot-chat/node_modules/react is loaded as a
// second React instance, useChatContext() can't see the ChatProvider context, and
// the room list renders blank with no error boundary to catch it.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3001,
    proxy: {
      "/api": { target: "http://localhost:3002", changeOrigin: true },
      "/ws": { target: "http://localhost:3002", ws: true, changeOrigin: true },
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
