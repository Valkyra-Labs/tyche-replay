import { defineConfig, devices } from "@playwright/test";

// By default the tests drive the dev server on 5174, reusing one that is
// already running. E2E_PORT moves them to another port, and E2E_PREVIEW=1
// serves the production build (`pnpm build` first) with vite preview
// instead. In CI a server is never reused.
//
// Most tests replay a real day and need its capture in public/data/, which
// is not in git (see the README). The tests tagged @no-capture need none;
// CI runs only those: `pnpm e2e --grep @no-capture`.
const PORT = Number(process.env.E2E_PORT ?? 5174);
const PREVIEW = !!process.env.E2E_PREVIEW;
const URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  use: { baseURL: URL, viewport: { width: 1440, height: 900 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `pnpm ${PREVIEW ? "preview" : "dev"} --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: URL,
    reuseExistingServer: !process.env.CI,
  },
});
