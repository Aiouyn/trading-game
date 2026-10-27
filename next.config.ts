import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import path from "node:path";

// Pin the project root: a stray package-lock.json in the home folder otherwise makes Next guess the wrong root.
const root = path.resolve(__dirname);

// `@/city` is the single seam with Spec 2 (City Dev owns src/city/**). Until src/city/index.ts lands,
// resolve it to the type-only stub so the shell builds; the real module wins as soon as it exists.
const cityEntry = existsSync(path.join(root, "src/city/index.ts")) ? "./src/city/index.ts" : "./tests/unit/shell/__mocks__/city.ts";

// Dev-only design-system sheets: on in `next dev`, and in a production build only with QUAY_DS=1 (e2e).
// Off, the demo modules (/__ds primitives, /__ds/notices) are swapped for empty stubs at resolve time, so none of
// it reaches .next/static or .next/server (tools/check-hooks.mjs scans both).
const dsOn = process.env.NODE_ENV !== "production" || process.env.QUAY_DS === "1";
const dsNotices = dsOn ? "./src/app/%5F_ds/notices/NoticesSheet.tsx" : "./src/app/%5F_ds/notices/NoticesSheet.off.tsx";
const dsPrimitives = dsOn ? "./src/app/%5F_ds/DesignSystemSheet.tsx" : "./src/app/%5F_ds/DesignSystemSheet.off.tsx";

const nextConfig: NextConfig = {
  turbopack: { root, resolveAlias: { "@/city": cityEntry, "@ds/notices-sheet": dsNotices, "@ds/primitives-sheet": dsPrimitives } },
  outputFileTracingRoot: root,
  // Test-only gates and hook flags are ALWAYS defined (as "1" or "0") so the bundler inlines a literal and folds
  // the gate: an unset var would stay a runtime `process.env` read and the hook / dev-only /__ds code would ship.
  // Only the e2e build (playwright.config webServer env) sets them to "1".
  env: {
    QUAY_DS: process.env.QUAY_DS === "1" ? "1" : "0",
    NEXT_PUBLIC_CITY_E2E: process.env.NEXT_PUBLIC_CITY_E2E === "1" ? "1" : "0",
    // Mock URL overrides (?alerts=, ?world=): on in `next dev`, and in a production build only with QUAY_HOOKS=1 (e2e).
    QUAY_HOOKS: process.env.NODE_ENV !== "production" || process.env.QUAY_HOOKS === "1" ? "1" : "0",
    NEXT_PUBLIC_QUAY_MOCK_PHASE: process.env.NEXT_PUBLIC_QUAY_MOCK_PHASE === "1" ? "1" : "0",
    NEXT_PUBLIC_QUAY_MOCK_CITY_FAIL: process.env.NEXT_PUBLIC_QUAY_MOCK_CITY_FAIL === "1" ? "1" : "0",
    NEXT_PUBLIC_QUAY_MOCK_LOAD_FAIL: process.env.NEXT_PUBLIC_QUAY_MOCK_LOAD_FAIL === "1" ? "1" : "0",
  },
};

export default nextConfig;
