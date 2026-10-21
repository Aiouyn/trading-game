import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['**/*.test.ts', '../../../tools/ci/*.test.ts'], exclude: ['node_modules/**'], environment: 'node', testTimeout: 120_000 } });
