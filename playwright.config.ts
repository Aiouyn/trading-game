import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);
const WORLD_PORT = Number(process.env.E2E_WORLD_PORT ?? 8797);
export const E2E_ADMIN = "e2e-admin";

/** The shell specs (tests/e2e/shell) run on every desktop viewport; the older specs stay on desktop and phone. */
const SHELL_SPECS = /[\/]shell[\/].*\.spec\.ts$/;
const chromium = { browserName: "chromium" as const };

/**
 * E2E runs against a fresh world: the world server starts with 1-second ticks, 3 days of
 * history and an admin token (so specs can grant money), and the web app is built to talk to it.
 *
 * Projects (tape-desktop-shell.md section 0, T:5):
 *   desktop      1440x900   every spec
 *   desktop-1920 1920x1080  shell specs only: thirds layouts, the full window rules
 *   desktop-1000 1000x800   shell specs only: halves mode
 *   desktop-900   900x800   shell specs only: single mode, compact chrome
 *   phone        390x844    every spec (the phone-only checks skip on desktop)
 */
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...chromium, viewport: { width: 1440, height: 900 } } },
    { name: "desktop-1920", testMatch: SHELL_SPECS, use: { ...chromium, viewport: { width: 1920, height: 1080 } } },
    { name: "desktop-1000", testMatch: SHELL_SPECS, use: { ...chromium, viewport: { width: 1000, height: 800 } } },
    { name: "desktop-900", testMatch: SHELL_SPECS, use: { ...chromium, viewport: { width: 900, height: 800 } } },
    { name: "phone", use: { ...chromium, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    {
      command: `node -e "require('fs').rmSync('test-results/world-e2e',{recursive:true,force:true})" && npx tsx server/index.ts`,
      url: `http://localhost:${WORLD_PORT}/health`,
      env: { PORT: String(WORLD_PORT), DATA_DIR: "test-results/world-e2e", TICK_MS: "1000", WARMUP_DAYS: "3", ADMIN_TOKEN: E2E_ADMIN, REGISTER_LIMIT: "500" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // E2E_BUILD_CMD swaps the build (e.g. "npx next build --webpack" where Turbopack cannot run); the default is unchanged.
      command: `${process.env.E2E_BUILD_CMD ?? "npm run build"} && npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      env: { NEXT_PUBLIC_WORLD_URL: `http://localhost:${WORLD_PORT}` },
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
