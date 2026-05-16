import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: "terser",
    terserOptions: { compress: { drop_console: true, drop_debugger: true } },
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react":   ["react", "react-dom"],
          "vendor-tauri":   ["@tauri-apps/api", "@tauri-apps/plugin-dialog", "@tauri-apps/plugin-fs", "@tauri-apps/plugin-shell", "@tauri-apps/plugin-notification"],
          "vendor-ui":      ["lucide-react", "zustand"],
          "vendor-content": ["marked", "dompurify", "date-fns"],
        },
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
