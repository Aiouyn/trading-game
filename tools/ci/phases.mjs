/**
 * Local app-preflight phase list (mirrors .github/workflows/ci.yml run steps only).
 * Not a full remote CI substitute — see NOT_COVERED / REMOTE_REQUIRED.
 */
/** @typedef {{ id: string, argv: string[], cwd?: string, env?: Record<string, string> }} Phase */

/** Matches the unconditional `checks` job steps + the `ledger-no-dup` job. */
/** @type {Phase[]} */
export const CORE_PHASES = [
  { id: "lint", argv: ["npm", "run", "lint"] },
  { id: "lesson13", argv: ["npm", "run", "ci:lesson13"] },
  { id: "next-start-host", argv: ["npm", "run", "ci:next-start-host"] },
  { id: "ledger-no-dup", argv: ["npx", "vitest", "run", "test/map-no-dup.test.ts"], cwd: "packages/engine/ledger" },
  { id: "typecheck", argv: ["npm", "run", "typecheck"] },
  { id: "build", argv: ["npm", "run", "build"] },
  { id: "check-hooks", argv: ["node", "tools/check-hooks.mjs", ".next/static", ".next/server"] },
  { id: "test", argv: ["npm", "test"] },
  { id: "formal-money", argv: ["npm", "run", "test:formal-money"] },
  { id: "skipped-checks", argv: ["node", "tools/ci/skipped-checks.mjs"] },
  { id: "pw-install", argv: ["npx", "playwright", "install", "--with-deps", "chromium"] },
  { id: "route-budget", argv: ["node", "tools/ci/route-budget.mjs", "/broker"] },
];

/** Matches the `e2e` job. Local only with --browser. */
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

/** Workflows / suites this tool does not run. Remote CI (or dedicated workflows) required. */
export const NOT_COVERED = [
  ".github/workflows/engine.yml (package matrix / engine suites; tools/ci/** is on its path filter)",
  ".github/workflows/engine-core.yml",
  ".github/workflows/city.yml (city unit/e2e)",
  ".github/workflows/macro-calibration.yml (scheduled)",
  "Gatekeeper played browser judgment / product review",
];

/** CI setup-node pin from ci.yml — disclose when local runtime differs. */
export const CI_NODE_MAJOR = 22;

export function phaseShellLine(phase) {
  return phase.argv.join(" ");
}

/**
 * Unconditional `run:` commands in a workflow YAML (skips steps with `if:`, and `npm ci` setup).
 * Used for bidirectional parity: every required CI run must map to a local phase (or be documented).
 */
export function unconditionalCiRunCommands(ymlText) {
  const lines = ymlText.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)- run:\s*(.+?)\s*$/);
    if (!m) continue;
    const indent = m[1].length;
    const cmd = m[2];
    let conditional = false;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim()) continue;
      const lead = line.match(/^(\s*)/)[1].length;
      if (lead <= indent && /^\s*-\s/.test(line)) break;
      if (/^\s+if:/.test(line)) {
        conditional = true;
        break;
      }
    }
    if (conditional) continue;
    if (cmd === "npm ci") continue;
    out.push(cmd);
  }
  return out;
}

/** Local phase shell lines that cover CI (ledger cwd phases still match by argv string). */
export function localPhaseCommands(core = CORE_PHASES, browser = BROWSER_PHASES) {
  return [...core, ...browser].map(phaseShellLine);
}
