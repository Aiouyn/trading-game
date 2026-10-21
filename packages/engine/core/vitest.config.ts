import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
// tools/ci tests run under core: resolve their bare imports from core's node_modules (CI installs only core's dependencies).
const nm = (m: string): string => fileURLToPath(new URL(`./node_modules/${m}`, import.meta.url));
export default defineConfig({
  resolve: { alias: { typescript: nm('typescript') } },
  test: { include: ['**/*.test.ts', '../../../tools/ci/*.test.ts'], exclude: ['node_modules/**'], environment: 'node', testTimeout: 120_000 },
});
