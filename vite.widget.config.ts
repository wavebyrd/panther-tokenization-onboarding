// Builds the portfolio builder as a standalone static app for embedding: no
// server, everything runs in the visitor's browser and reads Panther
// Terminal's public API plus the swap aggregators. Panther Terminal serves the
// output as plain files and frames it on /tokenization/onboarding.
//
//   npm run build:widget                      -> dist-widget/
//   PTO_WIDGET_BASE=/onboarding/ npm run build:widget   (when served from a sub-path)

import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./widget", import.meta.url)),
  base: process.env.PTO_WIDGET_BASE ?? "./",
  plugins: [react()],
  resolve: { alias: { "@": src } },
  build: {
    outDir: fileURLToPath(new URL("./dist-widget", import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: { port: 3401 },
});
