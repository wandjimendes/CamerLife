import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Dev-only same-origin proxies. Point the client at them with
 *   VITE_SUPABASE_URL=/supabase   VITE_COLYSEUS_URL=/colyseus
 * so no CORS is involved - handy behind tunnels / cloud previews that inject
 * their own CORS headers. Targets can be overridden with DEV_SUPABASE_TARGET /
 * DEV_COLYSEUS_TARGET.
 */
const supabaseTarget = process.env.DEV_SUPABASE_TARGET ?? "http://localhost:54321";
const colyseusTarget = process.env.DEV_COLYSEUS_TARGET ?? "http://localhost:2567";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/supabase": { target: supabaseTarget, changeOrigin: true, rewrite: (p) => p.replace(/^\/supabase/, "") },
      "/colyseus": { target: colyseusTarget, changeOrigin: true, ws: true, rewrite: (p) => p.replace(/^\/colyseus/, "") },
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: { phaser: ["phaser"] },
      },
    },
  },
});
