import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Relative base so the built site works from any folder (Vercel root, or embedded under a sub-path).
export default defineConfig({
  base: "./",
  // Several dev servers may run at once (one per feature test page); give each its own cache folder.
  cacheDir: process.env.VITE_CACHE_DIR ?? "node_modules/.vite",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { host: "127.0.0.1" },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 6000,
    // TEACHX_BUILD_INPUT=dev/slice.html builds a single developer page instead of the app (build smoke tests).
    rollupOptions: { input: { main: path.resolve(__dirname, process.env.TEACHX_BUILD_INPUT ?? "index.html") } },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 120000,
  },
});
