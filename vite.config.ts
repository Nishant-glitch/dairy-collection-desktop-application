import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// NOTE: vite-plugin-singlefile was removed. It inlines all JS/CSS into one
// index.html, which is fundamentally incompatible with a PWA (which needs a
// separate service worker, manifest and icon files served over HTTP). The
// build now emits a normal multi-file dist/ folder so the PWA works.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate", // auto-update on new deploy, no user prompt
      includeAssets: ["pwa-192x192.png", "pwa-512x512.png"],
      manifest: {
        name: "DCS Pro - Dairy Collection System",
        short_name: "DCS Pro",
        description: "Dairy Collection & Management Software",
        theme_color: "#0a1f0f", // matches body background in src/index.css
        background_color: "#0a1f0f",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the built app shell (HTML/CSS/JS) for fast, offline-ish load.
        // Firebase Auth/Database and other API calls are NOT precached — they
        // always hit the network for live/fresh data.
        navigateFallbackDenylist: [/^\/api/],
        // index.html can be large; allow the app-shell bundle to be precached.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
