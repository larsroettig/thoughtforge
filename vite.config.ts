import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
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
          "vendor-ui":      ["lucide-react", "zustand"],
          "vendor-content": ["marked", "dompurify", "date-fns"],
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      "/api": "http://127.0.0.1:7432",
    },
  },
});
