// Run against the already-running prototype without restarting its server.
import config from '../playwright.config.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export default {
  ...config,
  use: { ...config.use, baseURL: process.env.CITY_BASE_URL ?? config.use.baseURL },
  testDir: fileURLToPath(new URL('../tests/browser', import.meta.url)),
  outputDir: process.env.CITY_EVIDENCE ? resolve(process.env.CITY_EVIDENCE) : fileURLToPath(new URL('../evidence/roads-revised/browser-tests', import.meta.url)),
  webServer: undefined,
};
