import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  // City e2e runs only with its own config/harness (tests/e2e/city/playwright.config.ts), never against the Next app.
  testIgnore: ["city/**"],
  outputDir: "test-results",
  // Compared baselines (toHaveScreenshot) live next to the spec: tests/e2e/<dir>/__screenshots__/<name>.png (17B BR-5-12, BR-6-11).
  expect: { toHaveScreenshot: { pathTemplate: "{testDir}/{testFileDir}/__screenshots__/{arg}{ext}", maxDiffPixelRatio: 0.002, animations: "disabled", caret: "hide" } },
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    // QUAY_DS=1 serves the dev-only /__ds primitives sheet in the production build (17A T1).
    env: { QUAY_DS: "1", QUAY_HOOKS: "1", NEXT_PUBLIC_CITY_E2E: "1", NEXT_PUBLIC_QUAY_MOCK_PHASE: "1", NEXT_PUBLIC_QUAY_MOCK_CITY_FAIL: "1", NEXT_PUBLIC_QUAY_MOCK_LOAD_FAIL: "1" },
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});