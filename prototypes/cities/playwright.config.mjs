import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  fullyParallel: false,
  timeout: 90000,
  expect: { timeout: 10000 },
  outputDir: './evidence/test-results',
  use: {
    baseURL: 'http://127.0.0.1:3650',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'node serve.mjs 3650',
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    url: 'http://127.0.0.1:3650',
    reuseExistingServer: false,
    timeout: 15000,
  },
});
