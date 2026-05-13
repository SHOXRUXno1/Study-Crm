import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
const devBackendTarget = process.env.VITE_DEV_BACKEND_PROXY ?? "http://127.0.0.1:8000";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    // 8080 часто занят EDB Postgres / другими сервисами — стандартный порт Vite
    port: 5173,
    hmr: {
      overlay: false,
    },
    // Same-origin `/api/*` → FastAPI on this machine. Works from phone on LAN (`http://<pc-ip>:5173`)
    // without embedding `127.0.0.1` in the bundle (that would resolve to the phone itself).
    proxy: {
      "/api": {
        target: devBackendTarget,
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Excalidraw probes `process.env.IS_PREACT` at runtime. Without this define
  // Vite leaves the reference dangling and the bundle throws on first import.
  define: {
    "process.env.IS_PREACT": JSON.stringify("false"),
  },
}));
