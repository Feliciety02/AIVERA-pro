import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // API mode: the browser talks to the backend through same-origin /api,
    // so the httpOnly session cookie works without CORS.
    // AIVERA_API_URL points a second copy of the web app at a second API (for example a test server).
    proxy: { "/api": { target: process.env.AIVERA_API_URL ?? "http://localhost:4000", changeOrigin: false } },
  },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Only group always-needed vendor code. Recharts and jsPDF stay in
        // lazily-loaded chunks so they are not downloaded on first paint.
        manualChunks: {
          react: ["react", "react-dom", "react-router"],
          ui: ["radix-ui", "lucide-react", "sonner"],
        },
      },
    },
  },
});
