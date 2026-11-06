/**
 * Canonical local/CI phase list for trading-game.
 * Keep in lockstep with .github/workflows/ci.yml — parity is asserted by tests/unit/ci/preflight.test.ts.
 */
/** @typedef {{ id: string, argv: string[], cwd?: string, env?: Record<string, string> }} Phase */

/** Matches the unconditional `checks` job steps + the `ledger-no-dup` job. */
/** @type {Phase[]} */
export const CORE_PHASES = [
  { id: "lint", argv: ["npm", "run", "lint"] },
  { id: "ledger-no-dup", argv: ["npx", "vitest", "run", "test/map-no-dup.test.ts"], cwd: "packages/engine/ledger" },
  { id: "typecheck", argv: ["npm", "run", "typecheck"] },
  { id: "build", argv: ["npm", "run", "build"] },
  { id: "check-hooks", argv: ["node", "tools/check-hooks.mjs", ".next/static", ".next/server"] },
  { id: "test", argv: ["npm", "test"] },
  { id: "pw-install", argv: ["npx", "playwright", "install", "--with-deps", "chromium"] },
  { id: "route-budget", argv: ["node", "tools/ci/route-budget.mjs", "/broker"] },
];

/** Matches the `e2e` job. Local only with --browser; omitted ≠ certified full CI. */
/** @type {Phase[]} */
export const BROWSER_PHASES = [
  {
    id: "e2e",
    argv: ["npx", "playwright", "test", "tests/e2e/shell", "tests/e2e/17b", "tests/e2e/settings"],
    env: { CI: "1", SHOTS: "1" },
  },
];

/**
 * CI `check:paths` runs only on PRs whose head starts with v3/quay-shell.
 * Not part of local preflight; listed so agents do not invent a second unconditional check.
 */
export const CI_CONDITIONAL_NOTE =
  "npm run check:paths -- origin/<base> is CI-conditional (pull_request + head_ref v3/quay-shell*); not required in local preflight.";

export function phaseShellLine(phase) {
  return phase.argv.join(" ");
}
