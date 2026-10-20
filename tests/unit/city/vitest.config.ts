import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The root vitest config only includes src/**; Spec 2 tests live under tests/unit/city (spec §1).
export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('../../../src', import.meta.url)) } },
  test: {
    include: ['tests/unit/city/**/*.test.ts'],
    environment: 'node',
  },
});
