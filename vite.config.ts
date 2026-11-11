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
