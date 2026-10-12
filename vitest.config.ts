import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts", "server/**/*.test.ts"],
    exclude: ["node_modules", ".next", "tests/e2e/**"],
    environment: "node",
    passWithNoTests: true,
    // the simulation suites run many seeded worlds per test; under the parallel file run the 5s default was exceeded (each
    // of these passes alone in a few seconds). A tighter bound per test is set where a hunt needs one.
    testTimeout: 60_000,
  },
});