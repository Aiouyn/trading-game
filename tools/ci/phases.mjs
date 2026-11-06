/**
 * Canonical local/CI phase list for trading-game.
 * Keep in lockstep with .github/workflows/ci.yml — parity is asserted by tests/unit/ci/preflight.test.ts.
 * Do not invent a second ad-hoc checklist in docs or agent chat.
 */
/** @typedef {{ id: string, argv: string[], cwd?: string, env?: Record<string, string> }} Phase */

/** Matches the `checks` job (+ ledger-no-dup job) required commands. */
/** @type {Phase[]} */
export const CORE_PHASES = [
  { id: "lint", argv: ["npm", "run", "lint"] },
  // Whole-repo scan; CI runs this in packages/engine/ledger after its own npm ci.
  { id: "ledger-no-dup", argv: ["npx", "vitest", "run", "test/map-no-dup.test.ts"], cwd: "packages/engine/ledger" },
  { id: "typecheck", argv: ["npm", "run", "typecheck"] },
  { id: "build", argv: ["npm", "run", "build"] },
  { id: "check-hooks", argv: ["node", "tools/check-hooks.mjs", ".next/static", ".next/server"] },
  { id: "test", argv: ["npm", "test"] },
  { id: "pw-install", argv: ["npx", "playwright", "install", "--with-deps", "chromium"] },
  { id: "route-budget", argv: ["node", "tools/ci/route-budget.mjs", "/broker"] },
];

/** Matches the `e2e` job. Local runs only with --browser; omitted ≠ pass. */
/** @type {Phase[]} */
export const BROWSER_PHASES = [
  {
    id: "e2e",
    argv: ["npx", "playwright", "test", "tests/e2e/shell", "tests/e2e/17b", "tests/e2e/settings"],
    env: { CI: "1", SHOTS: "1" },
  },
];

export const REQUIRED_CORE_IDS = CORE_PHASES.map((p) => p.id);
export const REQUIRED_BROWSER_IDS = BROWSER_PHASES.map((p) => p.id);

/** Flatten argv to the form that appears after `run:` in ci.yml (shell words). */
export function phaseShellLine(phase) {
  return phase.argv.join(" ");
}
