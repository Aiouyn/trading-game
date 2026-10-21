import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import path from "node:path";

// Pin the project root: a stray package-lock.json in the home folder otherwise makes Next guess the wrong root.
const root = path.resolve(__dirname);

// `@/city` is the single seam with Spec 2 (City Dev owns src/city/**). Until src/city/index.ts lands,
// resolve it to the type-only stub so the shell builds; the real module wins as soon as it exists.
const cityEntry = existsSync(path.join(root, "src/city/index.ts")) ? "./src/city/index.ts" : "./tests/unit/shell/__mocks__/city.ts";

const nextConfig: NextConfig = {
  turbopack: { root, resolveAlias: { "@/city": cityEntry } },
  outputFileTracingRoot: root,
  // Test-only hook flags are ALWAYS defined (as "1" or "0") so the bundler inlines a literal and folds the
  // gate: without this, an unset NEXT_PUBLIC_* var is left as a runtime `process.env` read and the hook code
  // ships. Only the e2e build (playwright.config webServer env) sets them to "1".
  env: {
    NEXT_PUBLIC_CITY_E2E: process.env.NEXT_PUBLIC_CITY_E2E === "1" ? "1" : "0",
    NEXT_PUBLIC_QUAY_MOCK_PHASE: process.env.NEXT_PUBLIC_QUAY_MOCK_PHASE === "1" ? "1" : "0",
    NEXT_PUBLIC_QUAY_MOCK_CITY_FAIL: process.env.NEXT_PUBLIC_QUAY_MOCK_CITY_FAIL === "1" ? "1" : "0",
  },
};

export default nextConfig;
