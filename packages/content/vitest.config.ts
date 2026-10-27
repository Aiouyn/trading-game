import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { alias: { '@tycoon/params': fileURLToPath(new URL('../params/src/index.ts', import.meta.url)), '@tycoon/engine-core': fileURLToPath(new URL('../engine/core/index.ts', import.meta.url)) } },
  test: { include: ['src/**/*.test.ts'], exclude: ['node_modules/**'], environment: 'node' },
});
