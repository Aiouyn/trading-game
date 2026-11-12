// The formal money check only. `npm test` does not include tests/formal, so this config is the run.
// Aliases match vitest.config.ts. Keep them together if that file's aliases change.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const cityEntry = fileURLToPath(new URL(existsSync(new URL("./src/city/index.ts", import.meta.url)) ? "./src/city/index.ts" : "./tests/unit/shell/__mocks__/city.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/city$/, replacement: cityEntry },
      { find: /^@city-e2e-seam$/, replacement: fileURLToPath(new URL("./src/apps/city/e2eRendererSeam.off.ts", import.meta.url)) },
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
    ],
  },
  test: {
    include: ["tests/formal/**/*.test.ts"],
    environment: "node",
    env: { QUAY_HOOKS: "1" },
  },
});
