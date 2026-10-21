import { defineConfig } from "vitest/config";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Same seam rule as next.config.ts: real src/city once it exists, else the shell stub.
const cityEntry = fileURLToPath(new URL(existsSync(new URL("./src/city/index.ts", import.meta.url)) ? "./src/city/index.ts" : "./tests/unit/shell/__mocks__/city.ts", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@/city": cityEntry, "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts", "tests/unit/**/*.test.ts"],
    exclude: ["node_modules", ".next", "tests/e2e/**"],
    environment: "node",
    passWithNoTests: true,
  },
});