import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/default/icon-192.png",
        "icons/default/icon-512.png",
        "icons/default/apple-touch-icon.png",
        "manifest-default.webmanifest",
        "manifest-hard-rock.webmanifest",
        "manifest-barcelo.webmanifest",
        "manifest-melia.webmanifest"
      ],
      manifest: false
    }),
  ],
});