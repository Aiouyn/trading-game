import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { alias: {
    '@tycoon/params': fileURLToPath(new URL('../../params/src/index.ts', import.meta.url)),
    '@tycoon/engine-core': fileURLToPath(new URL('../core/index.ts', import.meta.url)),
    '@tycoon/engine-ledger': fileURLToPath(new URL('../ledger/src/index.ts', import.meta.url)),
    '@tycoon/engine-macro': fileURLToPath(new URL('../macro/schema.ts', import.meta.url)),
    // ledger/src imports zod; resolve it from city's own install (the city CI job installs only city)
    zod: fileURLToPath(new URL('./node_modules/zod', import.meta.url)),
  } },
  test: { include: ['**/*.test.ts'], exclude: ['node_modules/**'], environment: 'node', testTimeout: 120_000 },
});
