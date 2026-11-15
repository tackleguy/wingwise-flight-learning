import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Relative base so the built site works from any folder (Vercel root, or embedded under a sub-path).
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { host: "127.0.0.1" },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 6000,
    rollupOptions: { input: { main: path.resolve(__dirname, "index.html") } },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 120000,
  },
});
