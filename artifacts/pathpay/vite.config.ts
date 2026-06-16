import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const API_PORT = Number(process.env.API_PORT ?? 3000);
const VITE_PORT = Number(process.env.VITE_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  define: {
    "import.meta.env.VITE_PRIVY_APP_ID": JSON.stringify(
      process.env.PRIVY_APP_ID ?? ""
    ),
  },

  server: {
    host: "0.0.0.0",
    port: VITE_PORT,

    proxy: {
      "/api": {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});