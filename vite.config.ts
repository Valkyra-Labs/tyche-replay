import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from GitHub Pages under /tyche-replay/.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/tyche-replay/" : "/",
  plugins: [react()],
  worker: { format: "es" },
  server: { fs: { allow: [".."] } },
});
