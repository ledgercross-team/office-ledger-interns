// @ts-check
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import "dotenv/config";

const site = process.env.PUBLIC_SITE_URL ?? "http://localhost:4321";
const PUBLIC_PAGES = ["/", "/features/", "/privacy/", "/terms/", "/contact/", "/changelog/"];

export default defineConfig({
  site,
  output: "server",
  adapter: node({ mode: "middleware" }),
  integrations: [
    react(),
    sitemap({
      filter: (page) => PUBLIC_PAGES.includes(new URL(page).pathname),
    }),
  ],
  security: { checkOrigin: true },
  devToolbar: { enabled: false },
  trailingSlash: "ignore",
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
  vite: {
    plugins: [tailwindcss()],
    // Keep every script external so the CSP never needs inline hashes on static pages.
    build: { assetsInlineLimit: 0 },
    ssr: { external: ["@node-rs/argon2", "embedded-postgres", "sharp", "jsdom"] },
  },
});
