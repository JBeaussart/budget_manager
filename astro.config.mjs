// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import netlify from "@astrojs/netlify";

export default defineConfig({
  server: {
    host: true, // optional, but useful if you hit the site from another device
    port: 4321,
  },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ["@supabase/supabase-js"],
    },
    server: {
      hmr: {
        host: "localhost",
        protocol: "ws",
        clientPort: 4321, // make the browser connect back on the HTTP port
      },
    },
  },

  adapter: netlify(),
});
