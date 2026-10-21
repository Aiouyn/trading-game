// City e2e (Spec 2). Run: npx playwright test -c tests/e2e/city/playwright.config.ts
// Builds the harness (vite) and serves it; no Next server needed.
import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.CITY_E2E_PORT ?? 3210);
const OUT = process.env.CITY_HARNESS_OUT ?? join(tmpdir(), 'city-harness');
const GL_ARGS = (process.env.CITY_GL_ARGS ?? '--enable-unsafe-swiftshader --use-angle=swiftshader --ignore-gpu-blocklist').split(' ').filter(Boolean);

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  outputDir: join(tmpdir(), 'city-e2e-results'),
  timeout: 180_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, launchOptions: { args: GL_ARGS } },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
    { name: 'phone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `npx vite build -c tests/e2e/city/harness/vite.config.ts && node tests/e2e/city/serve.mjs ${OUT} ${PORT}`,
    cwd: join(__dirname, '../../..'),
    url: `http://localhost:${PORT}/city.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
