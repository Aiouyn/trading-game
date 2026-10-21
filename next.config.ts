import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import pkg from "./package.json";

// Pin the project root: a stray package-lock.json in the home folder otherwise makes Next guess the wrong root.
const root = path.resolve(__dirname);

// `@/city` is the single seam with Spec 2 (City Dev owns src/city/**). Until src/city/index.ts lands,
// resolve it to the type-only stub so the shell builds; the real module wins as soon as it exists.
const cityEntry = existsSync(path.join(root, "src/city/index.ts")) ? "./src/city/index.ts" : "./tests/unit/shell/__mocks__/city.ts";

// About's version line (17B SET-08, Producer ruling): package.json version + short commit, injected at build.
// "dev" only when the build is not from a git checkout (the git command fails).
function buildSha(): string {
  try { return execSync("git rev-parse --short=7 HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "dev"; } catch { return "dev"; }
}

const nextConfig: NextConfig = {
  turbopack: { root, resolveAlias: { "@/city": cityEntry } },
  outputFileTracingRoot: root,
  // Mock URL overrides and test hooks (src/shell/hooks.ts) are ALWAYS defined as "1" or "0" so the bundler inlines a
  // literal and a no-flag production build drops them. On in `next dev`; in a production build only with
  // QUAY_HOOKS=1 (the e2e build, playwright.config webServer env).
  env: {
    NEXT_PUBLIC_RELEASE: pkg.version,
    NEXT_PUBLIC_BUILD_SHA: buildSha(),
    QUAY_HOOKS: process.env.NODE_ENV !== "production" || process.env.QUAY_HOOKS === "1" ? "1" : "0",
    NEXT_PUBLIC_QUAY_MOCK_PHASE: process.env.NEXT_PUBLIC_QUAY_MOCK_PHASE === "1" ? "1" : "0",
    NEXT_PUBLIC_QUAY_MOCK_CITY_FAIL: process.env.NEXT_PUBLIC_QUAY_MOCK_CITY_FAIL === "1" ? "1" : "0",
  },
};

export default nextConfig;
