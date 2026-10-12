import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";
import { CLOSE_CHAIN, isCloseProject, slotPort } from "./tests/e2e/worlds";

type TestProject = NonNullable<PlaywrightTestConfig["projects"]>[number];
type TestConfigWebServer = Extract<NonNullable<PlaywrightTestConfig["webServer"]>, { command: string }>;

const PORT = Number(process.env.E2E_PORT ?? 3200);
const WORLD_PORT = Number(process.env.E2E_WORLD_PORT ?? 8797);
/** Where the run writes its test output, the world data and the proof shots. A sharded run gives each run its own folder. */
const OUT = process.env.E2E_OUT_DIR ?? "test-results";
/** "all" (the default), "main" (the shared-world projects only) or "close" (the close projects only, one world each). */
const SCOPE = process.env.E2E_SCOPE ?? "all";
/** A comma list of project names: only those projects are defined (and only their servers start). Empty: every project in the scope. */
const ONLY = (process.env.E2E_PROJECTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
export const E2E_ADMIN = "e2e-admin";

/** The shell specs (tests/e2e/shell) run on every desktop viewport; the older specs stay on desktop and phone. */
const SHELL_SPECS = /[\/]shell[\/].*\.spec\.ts$/;
/**
 * The time-advancing specs (a game day's advance, or a fund's waiting periods): they run in the close projects below, each with
 * its own world (worlds.ts). The shop levers settle on the next game day (shops.spec.ts), and the fund flow (exchangeFunds.spec.ts)
 * advances the world past the account-age rules (7 real days), and the IPO spec (exchangeIpo.spec.ts) lists a company
 * a game day on.
 */
const CLOSE_SPECS = new RegExp(`(${CLOSE_CHAIN.map((c) => c.spec).join("|")})\\.spec\\.ts$`);
const chromium = { browserName: "chromium" as const };

/**
 * E2E runs against fresh worlds: each world server starts with 1-second ticks, 3 days of history and an admin token (so specs
 * can grant money), and the web app reads its world's port when it starts (TG_WORLD_PORT, layout.tsx). The web app is built
 * once, with no world baked in, so every server of a run can point at its own world.
 *
 * Projects (tape-desktop-shell.md section 0, T:5):
 *   desktop      1440x900   every spec except the close specs
 *   desktop-1920 1920x1080  shell specs only: thirds layouts, the full window rules
 *   desktop-1000 1000x800   shell specs only: halves mode
 *   desktop-900   900x800   shell specs only: single mode, compact chrome
 *   phone        390x844    every spec except the close specs (the phone-only checks skip on desktop)
 *   close-<name>, close-<name>-phone   one close spec each, with its own web app and world (worlds.ts), all in parallel
 */
const MAIN_PROJECTS: TestProject[] = [
  { name: "desktop", testIgnore: CLOSE_SPECS, use: { ...chromium, viewport: { width: 1440, height: 900 } } },
  { name: "desktop-1920", testMatch: SHELL_SPECS, use: { ...chromium, viewport: { width: 1920, height: 1080 } } },
  { name: "desktop-1000", testMatch: SHELL_SPECS, use: { ...chromium, viewport: { width: 1000, height: 800 } } },
  { name: "desktop-900", testMatch: SHELL_SPECS, use: { ...chromium, viewport: { width: 900, height: 800 } } },
  { name: "phone", testIgnore: CLOSE_SPECS, use: { ...chromium, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
];

/** One close project per spec and device: the desktop chain first, then the phone chain (the same order as CLOSE_CHAIN). */
const CLOSE_PROJECTS: TestProject[] = [
  ...CLOSE_CHAIN.map(({ spec, name }) => ({
    name: `close-${name}`,
    testMatch: new RegExp(`${spec}\\.spec\\.ts$`),
    use: { ...chromium, viewport: { width: 1440, height: 900 } },
  })),
  ...CLOSE_CHAIN.map(({ spec, name }) => ({
    name: `close-${name}-phone`,
    testMatch: new RegExp(`${spec}\\.spec\\.ts$`),
    use: { ...chromium, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  })),
];

const isMainName = (name: string) => !isCloseProject(name);
const inScope = (name: string) => (SCOPE === "main" ? isMainName(name) : SCOPE === "close" ? isCloseProject(name) : true);

const projectsAll = [...MAIN_PROJECTS, ...CLOSE_PROJECTS]
  .filter((p) => inScope(p.name ?? ""))
  .filter((p) => ONLY.length === 0 || ONLY.includes(p.name ?? ""));

// The world port is chosen when the web app starts (TG_WORLD_PORT, layout.tsx), so the build must not bake one in.
delete process.env.NEXT_PUBLIC_WORLD_URL;

/** The build the first web server to start runs (E2E_BUILD_CMD=true when the build is already done, as in scripts/cloud/e2e-shards.sh). */
const BUILD = process.env.E2E_BUILD_CMD ?? "npm run build";

/** A world server: the fresh world of one run (its data folder is reset at start). */
function worldServer(port: number, dataDir: string): TestConfigWebServer {
  return {
    command: `node -e "require('fs').rmSync('${dataDir}',{recursive:true,force:true})" && npx tsx server/index.ts`,
    url: `http://localhost:${port}/health`,
    // SEED: the e2e world's own seed (the live world draws a random one at first boot)
    // REGISTER_LIMIT: accounts per IP per hour. The full suite registers more than 500 from localhost in one run, so the e2e world allows 2,000.
    env: { PORT: String(port), DATA_DIR: dataDir, SEED: "avalon", TICK_MS: "1000", WARMUP_DAYS: "3", ADMIN_TOKEN: E2E_ADMIN, REGISTER_LIMIT: "2000" },
    reuseExistingServer: false,
    timeout: 120_000,
  };
}

/**
 * A web app. The builder (the first web server of the run: the main one, or the first close one when no main project runs) builds,
 * then starts; every other web app waits for the builder to answer and then starts, so the build runs once.
 */
function webServer(port: number, worldPort: number, build: boolean, waitForPort?: number): TestConfigWebServer {
  const wait = waitForPort === undefined ? "" : `node tests/e2e/awaitUrl.mjs http://localhost:${waitForPort}/ && `;
  return {
    command: `${wait}${build ? `${BUILD} && ` : ""}npx next start -p ${port}`,
    url: `http://localhost:${port}`,
    env: { TG_WORLD_PORT: String(worldPort) },
    reuseExistingServer: false,
    timeout: 600_000,
  };
}

const closeNames = projectsAll.map((p) => p.name ?? "").filter(isCloseProject);
const usesMain = projectsAll.some((p) => isMainName(p.name ?? ""));
const builderPort = usesMain ? PORT : closeNames.length ? slotPort(PORT, closeNames[0]) : PORT;

const webServers: TestConfigWebServer[] = [];
if (usesMain) {
  webServers.push(worldServer(WORLD_PORT, `${OUT}/world-e2e`), webServer(PORT, WORLD_PORT, true));
}
for (const name of closeNames) {
  const worldPort = slotPort(WORLD_PORT, name);
  const webPort = slotPort(PORT, name);
  const builds = !usesMain && name === closeNames[0];
  webServers.push(worldServer(worldPort, `${OUT}/world-e2e-${name}`), webServer(webPort, worldPort, builds, builds ? undefined : builderPort));
}

// Each close project's own web app (its baseURL) and world; the main projects use PORT.
const projects: TestProject[] = projectsAll.map((p) => {
  const name = p.name ?? "";
  return isCloseProject(name) ? { ...p, use: { ...p.use, baseURL: `http://localhost:${slotPort(PORT, name)}` } } : p;
});

/**
 * E2E runs against fresh worlds (see the header above). The reporter list, and the HTML report unless a run asks for another reporter.
 */
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: `${OUT}`,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  // The browser locale is pinned so the English assertions never depend on the machine; the French smoke test switches the game's language itself.
  use: { baseURL: `http://localhost:${PORT}`, locale: "en-US", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects,
  webServer: webServers,
});
