import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";

// The browser only ever talks to this origin; /api/<service> is proxied to the five backend services.
const target = (port: number) => ({ target: `http://127.0.0.1:${port}`, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api\/[a-z]+/, "") });
const proxy = { "/api/auth": target(8001), "/api/issuer": target(8002), "/api/trust": target(8003), "/api/audit": target(8004) };

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Phones need HTTPS for the camera and Web Crypto: `npm run phone` serves a self-signed certificate on the LAN.
    ...(mode === "phone" ? [basicSsl()] : []),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "QR Identity Wallet", short_name: "QR Wallet", description: "Offline identity checks for subsidised fertiliser collection",
        theme_color: "#1D6A4C", background_color: "#F3F6F4", display: "standalone", start_url: "/",
        icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }, { src: "icon-512.png", sizes: "512x512", type: "image/png" }],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg,png}"], navigateFallbackDenylist: [/^\/api\//] },
      devOptions: { enabled: false },
    }),
  ],
  server: { proxy },
  preview: { proxy },
}));
