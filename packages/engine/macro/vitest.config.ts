import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { alias: {
    '@tycoon/engine-core': fileURLToPath(new URL('../core/index.ts', import.meta.url)),
    '@tycoon/engine-ledger': fileURLToPath(new URL('../ledger/src/index.ts', import.meta.url)),
    // ledger/src imports zod; resolve it from macro's own install (the macro CI job installs only macro)
    zod: fileURLToPath(new URL('./node_modules/zod', import.meta.url)),
  } },
  test: { include: ['**/*.test.ts'], exclude: ['node_modules/**'], environment: 'node', testTimeout: 120_000 },
});
