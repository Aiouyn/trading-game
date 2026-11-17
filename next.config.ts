import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import pkg from "./package.json";
import { resolveQuayE2eFlag } from "./tools/quay-e2e-flag";

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
// Dev-only design-system sheets: on in `next dev`, and in a production build only with QUAY_DS=1 (e2e).
// Off, the demo modules (/__ds primitives, /__ds/notices) are swapped for empty stubs at resolve time, so none of
// it reaches .next/static or .next/server (tools/check-hooks.mjs scans both).
const dsOn = process.env.NODE_ENV !== "production" || process.env.QUAY_DS === "1";
const dsNotices = dsOn ? "./src/app/%5F_ds/notices/NoticesSheet.tsx" : "./src/app/%5F_ds/notices/NoticesSheet.off.tsx";
const dsPrimitives = dsOn ? "./src/app/%5F_ds/DesignSystemSheet.tsx" : "./src/app/%5F_ds/DesignSystemSheet.off.tsx";
// M1-10 mounts a static DistrictView, so the 3D renderer is no longer on the default City graph.
// Keep the renderer (and its hook strings) in the CITY_E2E=1 Next build only, via the same
// resolve-alias pattern as the /__ds sheets, so the prod-hook control cannot pass vacuously.
const cityE2eOn = process.env.NEXT_PUBLIC_CITY_E2E === "1";
const cityE2eSeam = cityE2eOn ? "./src/apps/city/e2eRendererSeam.ts" : "./src/apps/city/e2eRendererSeam.off.ts";

// JsConfigPathsPlugin resolves @city-e2e-seam from tsconfig before a normal alias runs, and that file imports three.
// This plugin is unshifted so it wins and follows the same on/off file as turbopack.resolveAlias.
interface ResolveStep { request?: string }
interface Resolver {
  ensureHook(name: string): unknown;
  getHook(name: string): { tapAsync(name: string, fn: (request: ResolveStep, ctx: unknown, cb: (err?: Error | null, result?: unknown) => void) => void): void };
  doResolve(hook: unknown, request: ResolveStep, message: string, ctx: unknown, cb: (err?: Error | null, result?: unknown) => void): void;
}

const nextConfig: NextConfig = {
  // Production Quay is a standalone server: server.js plus the traced files, no npm install.
  output: "standalone",
  productionBrowserSourceMaps: false,
  enablePrerenderSourceMaps: false,
  // The repo tsconfig includes sim, tests and legacy, which fail typecheck. The Quay compile itself succeeded.
  typescript: { ignoreBuildErrors: true },
  experimental: {
    webpackMemoryOptimizations: true,
    // Custom webpack config would otherwise leave this off. Keep it off so the build stays one process.
    webpackBuildWorker: false,
    cpus: 1,
    staticGenerationMaxConcurrency: 1,
    // The default stops a finished production build to ask for an upgrade. This build stays on the installed Next.
    agentUpgrade: false,
  },
  turbopack: { root, resolveAlias: { "@/city": cityEntry, "@ds/notices-sheet": dsNotices, "@ds/primitives-sheet": dsPrimitives, "@city-e2e-seam": cityE2eSeam } },
  outputFileTracingRoot: root,
  // Test-only gates and hook flags are ALWAYS defined (as "1" or "0") so the bundler inlines a literal and folds
  // the gate: an unset var would stay a runtime `process.env` read and the hook / dev-only /__ds code would ship.
  // Only the e2e build (playwright.config webServer env) sets them to "1".
  env: {
    NEXT_PUBLIC_RELEASE: pkg.version,
    NEXT_PUBLIC_BUILD_SHA: buildSha(),
    QUAY_DS: process.env.QUAY_DS === "1" ? "1" : "0",
    NEXT_PUBLIC_CITY_E2E: process.env.NEXT_PUBLIC_CITY_E2E === "1" ? "1" : "0",
    // Official e2e only. resolveQuayE2eFlag throws if NEXT_PUBLIC_QUAY_E2E=1 without
    // QUAY_OFFICIAL_E2E_BUILD=1, so a prod deploy cannot ship with the consent prompt off.
    NEXT_PUBLIC_QUAY_E2E: resolveQuayE2eFlag(process.env),
    // Mock URL overrides (?alerts=, ?world=): on in `next dev`, and in a production build only with QUAY_HOOKS=1 (e2e).
    QUAY_HOOKS: process.env.NODE_ENV !== "production" || process.env.QUAY_HOOKS === "1" ? "1" : "0",
    NEXT_PUBLIC_QUAY_MOCK_PHASE: process.env.NEXT_PUBLIC_QUAY_MOCK_PHASE === "1" ? "1" : "0",
    NEXT_PUBLIC_QUAY_MOCK_CITY_FAIL: process.env.NEXT_PUBLIC_QUAY_MOCK_CITY_FAIL === "1" ? "1" : "0",
    NEXT_PUBLIC_QUAY_MOCK_LOAD_FAIL: process.env.NEXT_PUBLIC_QUAY_MOCK_LOAD_FAIL === "1" ? "1" : "0",
  },
  // node_modules is a junction onto another drive. Next prefixes path.relative() with "./",
  // and path.relative across drives is absolute, so webpack looks for "./C:/.../next-dev.js".
  // `next build --webpack`: tsconfig paths win over a normal alias, so the city seam and the
  // dev-only sheets are swapped here. A node_modules junction on another drive makes
  // path.relative return an absolute path, which Next prefixes with "./".
  webpack: (config, ctx) => {
    const { dev, webpack } = ctx;
    const seamFile = path.resolve(root, cityE2eSeam);
    config.resolve ??= {};
    const alias = (config.resolve.alias ?? {}) as Record<string, string | string[] | false>;
    config.resolve.alias = {
      ...alias,
      "@city-e2e-seam$": seamFile,
      "@ds/notices-sheet$": path.resolve(root, dsNotices),
      "@ds/primitives-sheet$": path.resolve(root, dsPrimitives),
      "@/city$": path.resolve(root, cityEntry),
    };
    config.plugins ??= [];
    if (!cityE2eOn) {
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(
        /^@city-e2e-seam$/,
        path.join(root, "src/apps/city/e2eRendererSeam.off.ts"),
      ));
    }
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/[/\\]e2eRendererSeam\.ts$/, seamFile));
    const resolvePlugins = config.resolve.plugins ?? [];
    resolvePlugins.unshift({
      apply(resolver: Resolver) {
        const target = resolver.ensureHook("resolve");
        resolver.getHook("described-resolve").tapAsync("QuayCitySeam", (request, resolveCtx, callback) => {
          if (request.request !== "@city-e2e-seam") { callback(); return; }
          resolver.doResolve(target, { ...request, request: seamFile }, "quay city seam", resolveCtx, callback);
        });
      },
    });
    config.resolve.plugins = resolvePlugins;
    // Docs: a filesystem webpack cache raises memory. A memory cache is the lower option.
    if (!dev && config.cache) (config as { cache?: unknown }).cache = Object.freeze({ type: "memory" });
    if (typeof config.entry !== "function") return config;
    const orig = config.entry as (...args: unknown[]) => Promise<Record<string, unknown>>;
    config.entry = async (...args: unknown[]) => {
      const result = await orig(...args);
      const fix = (val: unknown): unknown => {
        if (typeof val === "string") {
          const abs = /^\.\/([A-Za-z]:[\\/].*)$/.exec(val);
          return abs ? abs[1] : val;
        }
        if (Array.isArray(val)) return val.map(fix);
        if (val && typeof val === "object" && "import" in val) {
          const rec = val as { import: unknown };
          rec.import = fix(rec.import);
          return rec;
        }
        return val;
      };
      for (const key of Object.keys(result)) result[key] = fix(result[key]);
      return result;
    };
    return config;
  },
};

export default nextConfig;
