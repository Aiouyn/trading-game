#!/usr/bin/env node
/**
 * Lesson 17: a skipped or empty required check is not a pass.
 *
 *   node tools/ci/skipped-checks.mjs [root]
 *
 * Prints allowlisted skips as SKIP with their reason. Never prints them as PASS.
 * Exits 1 when the tree (or a reported run) can turn a skip into a green result.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/**
 * Root-suite skips that are still a real check.
 * A skip not listed here fails the scan.
 */
export const SKIP_ALLOWLIST = [
  {
    file: "tests/unit/city/paths.test.ts",
    title: "touches no path outside Spec 2 ownership",
    // C-16 applies only on a City Dev branch. Every other branch runs the companion
    // test that asserts the skip verdict, so this case is not an unrun gate.
    reason: "C-16 path ownership runs only on City Dev branches; other branches assert the skip verdict.",
  },
  {
    file: "tests/contract/17b-channels.swap.test.ts",
    title: "CH-06 swap to packages/protocol",
    // Protocol types cannot be asserted until packages/protocol exists. The body is
    // expect.fail, so the day the package lands the suite fails closed instead of passing empty.
    reason: "CH-06 waits for packages/protocol; the body is expect.fail once that package exists.",
  },
];

const SKIP_DIR = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "coverage",
  "out",
  "test-results",
  "playwright-report",
  ".preflight",
  "blob-report",
]);

/** Required gate commands. An `if:` on one of these can skip the check and still look green. */
const REQUIRED_GATE = [
  /^npm run lint(?:\s|$)/,
  /^npm run typecheck(?:\s|$)/,
  /^npm run build(?:\s|$)/,
  /^npm test(?:\s|$)/,
  /^npm run core:check(?:\s|$)/,
  /^npm run core:typecheck(?:\s|$)/,
  /^npm run core:lint(?:\s|$)/,
  /^npm run core:test(?:\s|$)/,
  /^node tools\/check-hooks\.mjs(?:\s|$)/,
  /^node tools\/ci\/route-budget\.mjs(?:\s|$)/,
  /^node tools\/ci\/skipped-checks\.mjs(?:\s|$)/,
  /^npx playwright test(?:\s|$)/,
  /^npx vitest run(?:\s|$)/,
  /^node scripts\/engine-check\.mjs(?:\s|$)/,
];

const CALL_RE = /\b(?:(it|test|describe|test\.describe)\.(only|skipIf|skip)|(fit|fdescribe|ftest)|(xit|xtest|xdescribe))\s*\(/g;

/** A `/` here starts a regex literal. Binary `/` (division) does not. */
function isRegexStart(text, index) {
  let j = index - 1;
  while (j >= 0 && (text[j] === " " || text[j] === "\t" || text[j] === "\n" || text[j] === "\r")) j--;
  if (j < 0) return true;
  const c = text[j];
  if ("([{,;!&|?:~=".includes(c)) return true;
  const keywords = ["return", "throw", "case", "else", "do", "typeof", "void", "delete", "instanceof", "await", "yield", "new", "in", "of"];
  for (const word of keywords) {
    if (j + 1 < word.length) continue;
    const start = j + 1 - word.length;
    if (text.slice(start, j + 1) !== word) continue;
    const prev = text[start - 1];
    if (prev === undefined || !/[\w$]/.test(prev)) return true;
  }
  return false;
}

/**
 * Same length as text. Comments, string contents, template contents outside ${},
 * and regex literals are blanked, so a skip written in those places is not a call.
 * Quotes and backticks stay, so a real call's string title is still visible.
 * @param {string} text
 */
function maskNonCode(text) {
  const out = text.split("");
  const blank = (i) => {
    if (out[i] !== "\n") out[i] = " ";
  };
  const region = (start, end, stopBrace) => {
    let i = start;
    let brace = 0;
    while (i < end) {
      const c = text[i];
      const next = text[i + 1];
      if (c === "/" && next === "/" && text[i - 1] !== ":") {
        while (i < end && text[i] !== "\n") {
          blank(i);
          i++;
        }
        continue;
      }
      if (c === "/" && next === "*") {
        blank(i);
        if (i + 1 < end) blank(i + 1);
        i += 2;
        while (i < end && !(text[i] === "*" && text[i + 1] === "/")) {
          blank(i);
          i++;
        }
        if (i < end) {
          blank(i);
          if (i + 1 < end) blank(i + 1);
          i += 2;
        }
        continue;
      }
      if (c === "'" || c === '"') {
        const q = c;
        i++;
        while (i < end && text[i] !== q) {
          if (text[i] === "\\") {
            blank(i);
            i++;
            if (i < end) {
              blank(i);
              i++;
            }
            continue;
          }
          if (text[i] === "\n") break;
          blank(i);
          i++;
        }
        if (i < end && text[i] === q) i++;
        continue;
      }
      if (c === "`") {
        i++;
        while (i < end && text[i] !== "`") {
          if (text[i] === "\\") {
            blank(i);
            i++;
            if (i < end) {
              blank(i);
              i++;
            }
            continue;
          }
          if (text[i] === "$" && text[i + 1] === "{") {
            i += 2;
            i = region(i, end, true);
            if (i < end && text[i] === "}") i++;
            continue;
          }
          blank(i);
          i++;
        }
        if (i < end && text[i] === "`") i++;
        continue;
      }
      if (c === "/" && isRegexStart(text, i)) {
        i++;
        while (i < end && text[i] !== "/" && text[i] !== "\n") {
          if (text[i] === "\\") {
            blank(i);
            i++;
            if (i < end) {
              blank(i);
              i++;
            }
            continue;
          }
          if (text[i] === "[") {
            blank(i);
            i++;
            while (i < end && text[i] !== "]" && text[i] !== "\n") {
              if (text[i] === "\\") {
                blank(i);
                i++;
                if (i < end) {
                  blank(i);
                  i++;
                }
                continue;
              }
              blank(i);
              i++;
            }
            if (i < end && text[i] === "]") {
              blank(i);
              i++;
            }
            continue;
          }
          blank(i);
          i++;
        }
        if (i < end && text[i] === "/") i++;
        continue;
      }
      if (stopBrace && c === "}" && brace === 0) return i;
      if (c === "{") brace++;
      else if (c === "}") brace--;
      i++;
    }
    return i;
  };
  region(0, text.length, false);
  return out.join("");
}

/** `fit("title", fn)` is a focused test. `fit()` is the shell's viewport helper. */
function opensWithString(text, parenIndex) {
  let i = parenIndex + 1;
  while (i < text.length && /\s/.test(text[i])) i++;
  const c = text[i];
  return c === "'" || c === '"' || c === "`";
}

/**
 * @typedef {{ kind: string, file: string, line: number, message: string }} Finding
 * @typedef {{ file: string, title: string, reason: string, line: number }} AllowedSkip
 * @typedef {{ total: number, skipped?: { file?: string, title: string }[] }} RunReport
 */

function posix(file) {
  return file.split(sep).join("/");
}

/** npm test's include set. skipIf outside this set (macro nightly, Playwright filters) is not this gate. */
export function isRootSuiteTest(file) {
  const p = posix(file);
  if (p.includes("/node_modules/")) return false;
  if (/^src\/.*\.test\.tsx?$/.test(p)) return true;
  if (/^scripts\/.*\.test\.ts$/.test(p)) return true;
  if (/^tests\/unit\/.*\.test\.tsx?$/.test(p)) return true;
  if (/^tests\/contract\/.*\.test\.ts$/.test(p)) return true;
  return false;
}

function isVitestConfig(file) {
  return /(?:^|\/)vitest\.config\.(?:ts|mts|js|mjs|cts|cjs)$/.test(posix(file));
}

function isTestFile(file) {
  return /\.(?:test|spec)\.tsx?$/.test(posix(file));
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === "\n") line++;
  return line;
}

function contextAt(text, index) {
  const start = text.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  let end = start;
  for (let n = 0; n < 4; n++) {
    const nl = text.indexOf("\n", end);
    if (nl < 0) return text.slice(start);
    end = nl + 1;
  }
  return text.slice(start, end);
}

function allowHit(file, context) {
  return SKIP_ALLOWLIST.find((entry) => entry.file === posix(file) && context.includes(entry.title));
}

/** @returns {"unconditional" | "conditional"} */
function skipMode(text, parenIndex) {
  let i = parenIndex + 1;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (i >= text.length || text[i] === ")") return "unconditional";
  const c = text[i];
  if (c === "'" || c === '"' || c === "`") return "unconditional";
  const rest = text.slice(i, i + 160);
  if (/^true\b/.test(rest)) return "unconditional";
  if (/^(?:async\s+)?function\b/.test(rest)) return "unconditional";
  if (/^async\s*\(/.test(rest)) return "unconditional";
  if (/^\([^)]*\)\s*=>/.test(rest)) return "unconditional";
  return "conditional";
}

/**
 * @param {string} text
 * @param {string} file
 * @returns {{ findings: Finding[], allowed: AllowedSkip[] }}
 */
function scanSource(text, file) {
  const findings = /** @type {Finding[]} */ ([]);
  const allowed = /** @type {AllowedSkip[]} */ ([]);
  const src = text.replace(/\r\n/g, "\n");
  const masked = maskNonCode(src);
  if (isVitestConfig(file)) {
    const re = /passWithNoTests\s*:\s*true\b/g;
    for (const match of masked.matchAll(re)) {
      findings.push({
        kind: "pass-with-no-tests",
        file: posix(file),
        line: lineOf(src, match.index ?? 0),
        message: "passWithNoTests: true treats zero tests as a pass",
      });
    }
  }
  if (!isTestFile(file)) return { findings, allowed };
  const rootSuite = isRootSuiteTest(file);
  for (const match of masked.matchAll(CALL_RE)) {
    const index = match.index ?? 0;
    if (masked[index - 1] === ".") continue;
    const paren = index + match[0].length - 1;
    const method = match[2];
    const focused = method === "only" || Boolean(match[3]);
    const xSkip = Boolean(match[4]);
    // `fit(` is also the viewport helper in QuayShell. A focused `fit` takes a string title.
    if (match[3] === "fit" && !opensWithString(masked, paren)) continue;
    const where = { file: posix(file), line: lineOf(src, index) };
    if (focused) {
      findings.push({ ...where, kind: "focused", message: "focused test skips the rest of the file; that is not a pass" });
      continue;
    }
    if (xSkip) {
      findings.push({ ...where, kind: "unconditional-skip", message: "unconditional skip is not a pass" });
      continue;
    }
    if (method !== "skip" && method !== "skipIf") continue;
    const mode = method === "skipIf" ? "conditional" : skipMode(masked, paren);
    if (method === "skipIf" && !rootSuite) continue;
    if (method === "skip" && mode === "conditional" && !rootSuite) continue;
    const hit = allowHit(file, contextAt(src, index));
    if (hit) {
      allowed.push({ file: hit.file, title: hit.title, reason: hit.reason, line: where.line });
      continue;
    }
    const kind = method === "skip" && mode === "unconditional" ? "unconditional-skip" : "unexpected-skip";
    const message = kind === "unconditional-skip" ? "unconditional skip is not a pass" : "skipped check is not a pass";
    findings.push({ ...where, kind, message });
  }
  return { findings, allowed };
}

/** @param {string} text @param {string} file @returns {Finding[]} */
export function auditSource(text, file) {
  return scanSource(text, file).findings;
}

function yamlCode(line) {
  if (line.trim().startsWith("#")) return "";
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === "#" && !inSingle && !inDouble && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function stripEnv(cmd) {
  let s = cmd.trim();
  while (/^[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|\S+)\s+/.test(s)) {
    s = s.replace(/^[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|\S+)\s+/, "");
  }
  return s;
}

function isRequiredGate(cmd) {
  const bare = stripEnv(cmd);
  return REQUIRED_GATE.some((re) => re.test(bare));
}

/** `always()` / `failure()` still run the step. Any other `if:` can skip it. */
function ifCanSkip(expr) {
  const inner = expr.replace(/^\$\{\{\s*/, "").replace(/\s*\}\}$/, "").trim();
  return !/^(?:always|failure|cancelled|success)\(\s*\)$/.test(inner);
}

/**
 * @param {string} text
 * @param {string} file
 * @returns {Finding[]}
 */
export function auditWorkflow(text, file) {
  const findings = /** @type {Finding[]} */ ([]);
  const src = text.replace(/\r\n/g, "\n");
  const lines = src.split("\n");
  const rel = posix(file);
  for (let i = 0; i < lines.length; i++) {
    const code = yamlCode(lines[i]);
    if (/\|\|\s*true\b/.test(code)) {
      findings.push({
        kind: "or-true",
        file: rel,
        line: i + 1,
        message: "|| true swallows a failure; that is not a pass",
      });
    }
    const cont = code.match(/continue-on-error:\s*(\S+)/);
    if (cont && cont[1] !== "false") {
      findings.push({
        kind: "continue-on-error",
        file: rel,
        line: i + 1,
        message: "continue-on-error lets a failed step pass",
      });
    }
  }

  /** @type {{ line: number, rows: { n: number, text: string }[] }[]} */
  const steps = [];
  let inSteps = false;
  let stepsIndent = 0;
  let dashIndent = -1;
  /** @type {{ line: number, rows: { n: number, text: string }[] } | null} */
  let block = null;
  const close = () => {
    if (block) steps.push(block);
    block = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stepsMatch = line.match(/^(\s*)steps:\s*(?:#.*)?$/);
    if (stepsMatch) {
      close();
      inSteps = true;
      stepsIndent = stepsMatch[1].length;
      dashIndent = -1;
      continue;
    }
    if (!inSteps) continue;
    const indent = (line.match(/^(\s*)/)?.[1] ?? "").length;
    if (line.trim() && !line.trim().startsWith("#") && indent <= stepsIndent) {
      close();
      inSteps = false;
      dashIndent = -1;
      continue;
    }
    const dash = line.match(/^(\s*)-\s/);
    if (dash && dash[1].length > stepsIndent) {
      if (dashIndent < 0) dashIndent = dash[1].length;
      if (dash[1].length === dashIndent) {
        close();
        block = { line: i + 1, rows: [{ n: i + 1, text: line }] };
        continue;
      }
    }
    if (block) block.rows.push({ n: i + 1, text: line });
  }
  close();

  for (const step of steps) {
    const rows = step.rows.map((row) => ({ n: row.n, text: yamlCode(row.text) }));
    const ifRow = rows.find((row) => /^\s*(?:-\s*)?if:\s+\S/.test(row.text));
    if (!ifRow) continue;
    const expr = ifRow.text.replace(/^\s*(?:-\s*)?if:\s+/, "").trim();
    if (!ifCanSkip(expr)) continue;
    const script = runScript(rows.map((row) => row.text));
    if (!script.split("\n").some((line) => isRequiredGate(line))) continue;
    findings.push({
      kind: "conditional-gate",
      file: rel,
      line: ifRow.n,
      message: `required gate can be skipped by if: ${expr}; that is not a pass`,
    });
  }
  return findings;
}

/** @param {string[]} rows */
function runScript(rows) {
  const parts = [];
  let literal = false;
  for (const raw of rows) {
    const line = raw.trim();
    const named = line.match(/^(?:-\s*)?run:\s*(.*)$/);
    if (named && !literal) {
      const rest = named[1].trim();
      if (rest === "|" || rest === "|-" || rest === ">" || rest === ">-") {
        literal = true;
        continue;
      }
      parts.push(rest);
      continue;
    }
    if (literal && line && !line.startsWith("#")) parts.push(line);
  }
  return parts.join("\n");
}

/**
 * A vitest / jest / Playwright count. total 0 is not a pass.
 * Each skipped title must be on the allowlist.
 * @param {RunReport} run
 * @param {typeof SKIP_ALLOWLIST} [allowlist]
 * @returns {Finding[]}
 */
export function auditRun(run, allowlist = SKIP_ALLOWLIST) {
  const findings = /** @type {Finding[]} */ ([]);
  if (!run || run.total === 0) {
    findings.push({
      kind: "zero-tests",
      file: "<run>",
      line: 1,
      message: "test run reported 0 tests; an empty run is not a pass",
    });
  }
  for (const skipped of run?.skipped ?? []) {
    const hit = allowlist.find((entry) => (!skipped.file || skipped.file === entry.file) && skipped.title.includes(entry.title));
    if (hit) continue;
    findings.push({
      kind: "unexpected-skip",
      file: skipped.file ?? "<run>",
      line: 1,
      message: `skipped test is not a pass: ${skipped.title}`,
    });
  }
  return findings;
}

/** @param {string} text @param {string} file @returns {Finding[]} */
export function auditPackageJson(text, file) {
  const findings = /** @type {Finding[]} */ ([]);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/\|\|\s*true\b/.test(lines[i])) {
      findings.push({
        kind: "or-true",
        file: posix(file),
        line: i + 1,
        message: "|| true swallows a failure; that is not a pass",
      });
    }
  }
  return findings;
}

function walk(dir, acc, pred) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink() || SKIP_DIR.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, acc, pred);
    else if (entry.isFile() && pred(entry.name)) acc.push(path);
  }
}

/**
 * @param {string} root
 * @returns {{ findings: Finding[], allowed: AllowedSkip[] }}
 */
export function auditTree(root) {
  const findings = /** @type {Finding[]} */ ([]);
  const allowed = /** @type {AllowedSkip[]} */ ([]);
  const files = [];
  for (const dir of ["src", "scripts", "tests", "packages", ".github"]) {
    walk(join(root, dir), files, (name) => {
      return /\.(?:test|spec)\.tsx?$/.test(name)
        || /^vitest\.config\.(?:ts|mts|js|mjs|cts|cjs)$/.test(name)
        || name === "package.json"
        || name.endsWith(".yml")
        || name.endsWith(".yaml");
    });
  }
  for (const name of ["vitest.config.ts", "vitest.config.mts", "vitest.config.js", "vitest.config.mjs", "package.json"]) {
    const path = join(root, name);
    if (existsSync(path)) files.push(path);
  }
  const seen = new Set();
  for (const path of files) {
    const rel = relative(root, path).split(sep).join("/");
    if (seen.has(rel)) continue;
    seen.add(rel);
    const text = readFileSync(path, "utf8");
    if (rel.startsWith(".github/workflows/") && /\.ya?ml$/.test(rel)) {
      findings.push(...auditWorkflow(text, rel));
    } else if (rel === "package.json" || (rel.startsWith("packages/") && rel.endsWith("/package.json"))) {
      findings.push(...auditPackageJson(text, rel));
    } else if (isTestFile(rel) || isVitestConfig(rel)) {
      const got = scanSource(text, rel);
      findings.push(...got.findings);
      allowed.push(...got.allowed);
    }
  }
  return { findings, allowed };
}

/**
 * @param {string[]} [argv]
 * @param {{ log?: (line: string) => void, error?: (line: string) => void }} [io]
 */
export function main(argv = process.argv.slice(2), io = {}) {
  const log = io.log ?? ((line) => console.log(line));
  const error = io.error ?? ((line) => console.error(line));
  const root = argv[0] ? resolve(argv[0]) : DEFAULT_ROOT;
  const { findings, allowed } = auditTree(root);
  for (const skip of allowed) {
    log(`SKIP ${skip.file}:${skip.line} ${skip.title}`);
    log(`  reason: ${skip.reason}`);
  }
  if (findings.length === 0) {
    log("skipped-checks: pass");
    return 0;
  }
  for (const finding of findings) error(`FAIL ${finding.file}:${finding.line} ${finding.message}`);
  error(`skipped-checks: fail (${findings.length})`);
  return 1;
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) process.exit(main());
