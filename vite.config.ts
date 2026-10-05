import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";

// Served from GitHub Pages under /tyche-replay/.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/tyche-replay/" : "/",
  plugins: [react()],
  // Stoa is linked from a sibling repository during development and has
  // its own node_modules: without dedupe the app would run two copies of
  // React and fail with "Invalid hook call".
  resolve: { dedupe: ["react", "react-dom", "react-aria-components"] },
  worker: { format: "es" },
  server: {
    // What the dev server may serve beyond this project: the linked Stoa
    // packages and their dependencies, and the engine's build. Not the
    // whole parent folder, which would hand the other repositories' files
    // (ignored ones included) to anything that can reach the server.
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        "../stoa-system/packages",
        "../stoa-system/node_modules",
        "../tyche-market/pkg",
      ],
    },
  },
});
