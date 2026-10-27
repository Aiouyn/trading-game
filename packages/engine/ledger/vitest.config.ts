import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { alias: { '@tycoon/engine-core': fileURLToPath(new URL('../core/index.ts', import.meta.url)) } },
  test: { include: ['test/**/*.test.ts'], environment: 'node', testTimeout: 120_000 },
});
