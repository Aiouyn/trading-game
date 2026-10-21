import { defineConfig } from "vitest/config";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Same seam rule as next.config.ts: real src/city once it exists, else the shell stub.
const cityEntry = fileURLToPath(new URL(existsSync(new URL("./src/city/index.ts", import.meta.url)) ? "./src/city/index.ts" : "./tests/unit/shell/__mocks__/city.ts", import.meta.url));

export default defineConfig({
  // Array form: the regex matches the bare `@/city` specifier only, so `@/city/renderer/light` etc. still
  // resolve through `@` to src/city/** (City Dev's suites).
  resolve: {
    alias: [
      { find: /^@\/city$/, replacement: cityEntry },
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
    ],
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts", "tests/unit/**/*.test.ts", "tests/contract/**/*.test.ts"],
    exclude: ["node_modules", ".next", "tests/e2e/**"],
    environment: "node",
    passWithNoTests: true,
    // Mock URL overrides are build-gated (src/shell/hooks.ts); unit tests exercise them.
    env: { QUAY_HOOKS: "1" },
  },
});