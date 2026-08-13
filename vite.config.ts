import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import ssrPlugin from "vite-ssr-components/plugin";

export default defineConfig({
  plugins: [cloudflare(), ssrPlugin()],
  define: {
    // Rolls all edge-cache keys on every deploy — template changes must not
    // wait for a content edit to reach cached pages.
    __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },
});
