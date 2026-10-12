import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);
const WORLD_PORT = Number(process.env.E2E_WORLD_PORT ?? 8797);
export const E2E_ADMIN = "e2e-admin";

/** The shell specs (tests/e2e/shell) run on every desktop viewport; the older specs stay on desktop and phone. */
const SHELL_SPECS = /[\/]shell[\/].*\.spec\.ts$/;
/**
 * The time-advancing specs (a game day's advance, or a fund's waiting periods, in the shared world): see the close-card
 * projects below. The shop levers settle on the next game day (shops.spec.ts), and the fund flow (exchangeFunds.spec.ts)
 * advances the world past the account-age rules (7 real days), and the IPO spec (exchangeIpo.spec.ts) lists a company
 * a game day on.
 */
const CLOSE_SPECS = /(closeCard|shops|exchangeFunds|exchangeIpo|comeback|worldEvents|sixdAuctionBid|phase7Text)\.spec\.ts$/;
const chromium = { browserName: "chromium" as const };

/** The time-advancing specs, in run order. The desktop project is named close-card (the day-close spec), then close-shops, ... */
const CLOSE_CHAIN: { spec: string; name: string }[] = [
  { spec: "closeCard", name: "card" },
  { spec: "shops", name: "shops" },
  { spec: "exchangeFunds", name: "funds" },
  { spec: "exchangeIpo", name: "ipo" },
  { spec: "comeback", name: "comeback" },
  { spec: "worldEvents", name: "events" },
  { spec: "sixdAuctionBid", name: "auction" },
  { spec: "phase7Text", name: "text" },
];

/** One device's chain of close projects: each runs after `after` and after the close project before it. */
function closeChain(device: "desktop" | "phone", use: { viewport: { width: number; height: number }; isMobile?: boolean; hasTouch?: boolean }, after: string[]) {
  let prev = after;
  return CLOSE_CHAIN.map(({ spec, name }) => {
    const projectName = device === "desktop" ? `close-${name}` : `close-${name}-phone`;
    const project = { name: projectName, testMatch: new RegExp(`${spec}\\.spec\\.ts$`), dependencies: prev, use: { ...chromium, ...use } };
    prev = [projectName];
    return project;
  });
}

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
  // The browser locale is pinned so the English assertions never depend on the machine; the French smoke test switches the game's language itself.
  use: { baseURL: `http://localhost:${PORT}`, locale: "en-US", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", testIgnore: CLOSE_SPECS, use: { ...chromium, viewport: { width: 1440, height: 900 } } },
    { name: "desktop-1920", testMatch: SHELL_SPECS, use: { ...chromium, viewport: { width: 1920, height: 1080 } } },
    { name: "desktop-1000", testMatch: SHELL_SPECS, use: { ...chromium, viewport: { width: 1000, height: 800 } } },
    { name: "desktop-900", testMatch: SHELL_SPECS, use: { ...chromium, viewport: { width: 900, height: 800 } } },
    { name: "phone", testIgnore: CLOSE_SPECS, use: { ...chromium, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    // The time-advancing specs run after every other project, and one at a time: each close project depends on the one
    // before it, so no two of them advance the shared e2e world at once (with --workers=2 a single project would run two
    // of them in parallel). The desktop chain runs first; the phone chain follows it.
    ...closeChain("desktop", { viewport: { width: 1440, height: 900 } }, ["desktop", "desktop-1920", "desktop-1000", "desktop-900", "phone"]),
    ...closeChain("phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, ["close-events"]),
  ],
  webServer: [
    {
      command: `node -e "require('fs').rmSync('test-results/world-e2e',{recursive:true,force:true})" && npx tsx server/index.ts`,
      url: `http://localhost:${WORLD_PORT}/health`,
      // SEED: the e2e world's own seed (the live world draws a random one at first boot)
      // REGISTER_LIMIT: accounts per IP per hour. The full suite registers more than 500 from localhost in one run (the close-card
      // projects then do not run, since they depend on the desktop projects), so the e2e world allows 2,000.
      env: { PORT: String(WORLD_PORT), DATA_DIR: "test-results/world-e2e", SEED: "avalon", TICK_MS: "1000", WARMUP_DAYS: "3", ADMIN_TOKEN: E2E_ADMIN, REGISTER_LIMIT: "2000" },
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
