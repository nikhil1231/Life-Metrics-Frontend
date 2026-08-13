import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Life Metrics",
        short_name: "Life Metrics",
        description: "A private daily check-in for Life Metrics.",
        theme_color: "#f4f0e8",
        background_color: "#f4f0e8",
        display: "standalone",
      },
      workbox: {
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/__/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "life-metrics-assets" },
          },
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
