#!/usr/bin/env node
/**
 * Test spawns of boot-register / next start must use a temp store.
 *
 * A file under tests/ fails when it spawns tools/ops/boot-register.ts or
 * `next start` without calling spawnBootRegister or setting QUAY_DATA_DIR.
 * Caller env applied before the pin is not enough: the pin has to be visible
 * as an assignment (or a call to a function that assigns it).
 *
 * Usage: node tools/ci/spawn-temp-store.mjs [--root <dir>]
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SPAWN_NAMES = new Set(["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]);
const CODE_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
const SKIP_DIR = new Set(["node_modules", ".git", ".next", "dist", "coverage", "test-results", "playwright-report"]);
const ASSIGN_RE = /\bQUAY_DATA_DIR\s*(?:=[^=]|:)/;

function isIdentStart(c) {
  return /[A-Za-z_$]/.test(c);
}

function isIdent(c) {
  return /[A-Za-z0-9_$]/.test(c);
}

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

/** @param {string} text @returns {("code" | "string" | "comment" | "regex")[]} */
function classify(text) {
  /** @type {("code" | "string" | "comment" | "regex")[]} */
  const kind = new Array(text.length);
  let i = 0;
  const mark = (from, to, k) => {
    for (let j = from; j < to && j < text.length; j++) kind[j] = k;
  };
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (c === "/" && n === "/") {
      const start = i;
      i += 2;
      while (i < text.length && text[i] !== "\n") i++;
      mark(start, i, "comment");
      continue;
    }
    if (c === "/" && n === "*") {
      const start = i;
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i = Math.min(text.length, i + 2);
      mark(start, i, "comment");
      continue;
    }
    if (c === "'" || c === '"') {
      const q = c;
      const start = i;
      i++;
      while (i < text.length && text[i] !== q && text[i] !== "\n") {
        if (text[i] === "\\") i += 2;
        else i++;
      }
      if (i < text.length && text[i] === q) i++;
      mark(start, i, "string");
      continue;
    }
    if (c === "`") {
      const start = i;
      i++;
      while (i < text.length && text[i] !== "`") {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        i++;
      }
      if (i < text.length && text[i] === "`") i++;
      mark(start, i, "string");
      continue;
    }
    if (c === "/" && isRegexStart(text, i)) {
      const start = i;
      i++;
      let cls = false;
      while (i < text.length && text[i] !== "\n") {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === "[") cls = true;
        else if (text[i] === "]") cls = false;
        else if (text[i] === "/" && !cls) {
          i++;
          break;
        }
        i++;
      }
      while (i < text.length && /[a-z]/i.test(text[i])) i++;
      mark(start, i, "regex");
      continue;
    }
    kind[i] = "code";
    i++;
  }
  for (let j = 0; j < text.length; j++) if (!kind[j]) kind[j] = "code";
  return kind;
}

function skipSpace(text, kind, i) {
  while (i < text.length && kind[i] === "code" && /\s/.test(text[i])) i++;
  return i;
}

function readDelimited(text, kind, open, openChar, closeChar) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (kind[i] !== "code") continue;
    if (text[i] === openChar) depth++;
    else if (text[i] === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function matchKeyword(text, kind, i, word) {
  if (text.slice(i, i + word.length) !== word) return false;
  if (i > 0 && isIdent(text[i - 1])) return false;
  const end = i + word.length;
  if (end < text.length && isIdent(text[end])) return false;
  for (let j = i; j < end; j++) if (kind[j] !== "code") return false;
  return true;
}

function readName(text, kind, i) {
  if (i >= text.length || kind[i] !== "code" || !isIdentStart(text[i])) return { name: "", index: i };
  const start = i;
  i++;
  while (i < text.length && kind[i] === "code" && isIdent(text[i])) i++;
  return { name: text.slice(start, i), index: i };
}

/**
 * @param {string} text
 * @param {("code" | "string" | "comment" | "regex")[]} kind
 * @param {number} parenEnd index of the closing paren of the parameter list
 */
function bodyAfterParen(text, kind, parenEnd) {
  let i = skipSpace(text, kind, parenEnd + 1);
  if (i < text.length && kind[i] === "code" && text[i] === ":") {
    i++;
    while (i < text.length) {
      if (kind[i] !== "code") {
        i++;
        continue;
      }
      if (/\s/.test(text[i])) {
        i++;
        continue;
      }
      if (text[i] === "{") {
        const end = readDelimited(text, kind, i, "{", "}");
        if (end < 0) return null;
        const next = skipSpace(text, kind, end + 1);
        if (next < text.length && kind[next] === "code" && text[next] === "{") {
          i = end + 1;
          continue;
        }
        return { start: i + 1, end };
      }
      if (text[i] === "<" || text[i] === "(") {
        const close = text[i] === "<" ? ">" : ")";
        const end = readDelimited(text, kind, i, text[i], close);
        if (end < 0) return null;
        i = end + 1;
        continue;
      }
      i++;
    }
    return null;
  }
  if (i < text.length && kind[i] === "code" && text[i] === "{") {
    const end = readDelimited(text, kind, i, "{", "}");
    if (end < 0) return null;
    return { start: i + 1, end };
  }
  return null;
}

function arrowName(text, arrowIndex) {
  const slice = text.slice(Math.max(0, arrowIndex - 400), arrowIndex);
  const all = [...slice.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g)];
  return all.length > 0 ? all[all.length - 1][1] : "";
}

/**
 * @param {string} text
 * @param {("code" | "string" | "comment" | "regex")[]} kind
 */
function findFunctions(text, kind) {
  /** @type {{ name: string, bodyStart: number, bodyEnd: number }[]} */
  const fns = [];
  for (let i = 0; i < text.length; i++) {
    if (kind[i] !== "code") continue;
    if (matchKeyword(text, kind, i, "function")) {
      let j = skipSpace(text, kind, i + "function".length);
      const named = readName(text, kind, j);
      j = named.index;
      j = skipSpace(text, kind, j);
      if (j < text.length && text[j] === "<" && kind[j] === "code") {
        const end = readDelimited(text, kind, j, "<", ">");
        if (end < 0) continue;
        j = skipSpace(text, kind, end + 1);
      }
      if (j >= text.length || text[j] !== "(" || kind[j] !== "code") continue;
      const parenEnd = readDelimited(text, kind, j, "(", ")");
      if (parenEnd < 0) continue;
      const body = bodyAfterParen(text, kind, parenEnd);
      if (!body) continue;
      fns.push({ name: named.name, bodyStart: body.start, bodyEnd: body.end });
      continue;
    }
    if (text[i] === "=" && text[i + 1] === ">" && kind[i + 1] === "code") {
      const j = skipSpace(text, kind, i + 2);
      if (j < text.length && kind[j] === "code" && text[j] === "{") {
        const end = readDelimited(text, kind, j, "{", "}");
        if (end > j) fns.push({ name: arrowName(text, i), bodyStart: j + 1, bodyEnd: end });
      }
    }
  }
  return fns;
}

/**
 * @param {string} text
 * @param {("code" | "string" | "comment" | "regex")[]} kind
 */
function findCalls(text, kind) {
  /** @type {{ name: string, index: number, argsStart: number, argsEnd: number }[]} */
  const calls = [];
  let i = 0;
  while (i < text.length) {
    if (kind[i] !== "code" || !isIdentStart(text[i])) {
      i++;
      continue;
    }
    const start = i;
    i++;
    while (i < text.length && kind[i] === "code" && isIdent(text[i])) i++;
    const name = text.slice(start, i);
    const j = skipSpace(text, kind, i);
    if (j < text.length && kind[j] === "code" && text[j] === "(") {
      const end = readDelimited(text, kind, j, "(", ")");
      if (end > j) calls.push({ name, index: start, argsStart: j + 1, argsEnd: end });
    }
  }
  return calls;
}

function blankRange(text, kind, start, end) {
  let out = "";
  for (let i = start; i < end; i++) {
    if (text[i] === "\n") out += "\n";
    else if (kind[i] === "code") out += text[i];
    else out += " ";
  }
  return out;
}

function callsNamed(code, names) {
  for (const name of names) {
    if (new RegExp(`\\b${name}\\s*\\(`).test(code)) return true;
  }
  return false;
}

function lineOf(text, index) {
  let line = 1;
  const end = Math.min(Math.max(index, 0), text.length);
  for (let i = 0; i < end; i++) if (text[i] === "\n") line++;
  return line;
}

function stringBindings(text, kind) {
  /** @type {{ name: string, value: string, index: number }[]} */
  const out = [];
  const re = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'`])/g;
  let m;
  while ((m = re.exec(text))) {
    if (kind[m.index] !== "code") continue;
    const q = m[2];
    let i = m.index + m[0].length;
    let value = "";
    while (i < text.length && kind[i] === "string" && text[i] !== q) {
      value += text[i];
      i++;
    }
    out.push({ name: m[1], value, index: m.index });
  }
  return out;
}

function bindingsFor(all, fns, index) {
  const enclosers = fns.filter((fn) => index >= fn.bodyStart && index < fn.bodyEnd);
  /** @type {Map<string, string>} */
  const map = new Map();
  const visible = all.filter((b) => {
    const inside = fns.filter((fn) => b.index >= fn.bodyStart && b.index < fn.bodyEnd);
    return inside.every((fn) => enclosers.includes(fn));
  });
  visible.sort((a, b) => a.index - b.index);
  for (const b of visible) map.set(b.name, b.value);
  return map;
}

function expandArgs(text, kind, argsStart, argsEnd, map) {
  let out = "";
  let i = argsStart;
  while (i < argsEnd) {
    if (kind[i] === "code" && isIdentStart(text[i])) {
      const start = i;
      i++;
      while (i < argsEnd && isIdent(text[i])) i++;
      const name = text.slice(start, i);
      out += map.has(name) ? JSON.stringify(map.get(name)) : name;
      continue;
    }
    out += text[i];
    i++;
  }
  return out;
}

/** @param {string} args @returns {"boot-register" | "next-start" | null} */
function riskyKind(args) {
  if (args.includes("boot-register")) return "boot-register";
  if (/\bnext\s+start\b/.test(args)) return "next-start";
  const hasNext = /["'`]next["'`]/.test(args) || /\bnextBin\s*\(/.test(args);
  const hasStart = /["'`]start["'`]/.test(args);
  if (hasNext && hasStart) return "next-start";
  return null;
}

function dedupe(hits) {
  const seen = new Set();
  const out = [];
  for (const h of hits) {
    const key = `${h.file}:${h.line}:${h.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

/**
 * @param {string} text
 * @param {string} file
 * @returns {{ file: string, line: number, kind: "boot-register" | "next-start" }[]}
 */
export function scanSource(text, file) {
  if (!text.includes("boot-register") && !(text.includes("next") && text.includes("start"))) return [];
  const kind = classify(text);
  const fns = findFunctions(text, kind);
  const calls = findCalls(text, kind);
  const setters = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const fn of fns) {
      if (!fn.name || setters.has(fn.name)) continue;
      const code = blankRange(text, kind, fn.bodyStart, fn.bodyEnd);
      if (ASSIGN_RE.test(code) || callsNamed(code, setters)) {
        setters.add(fn.name);
        changed = true;
      }
    }
  }
  const spawners = new Set();
  for (const fn of fns) {
    if (!fn.name) continue;
    if (calls.some((c) => SPAWN_NAMES.has(c.name) && c.index >= fn.bodyStart && c.index < fn.bodyEnd)) spawners.add(fn.name);
  }
  changed = true;
  while (changed) {
    changed = false;
    for (const fn of fns) {
      if (!fn.name || spawners.has(fn.name)) continue;
      const code = blankRange(text, kind, fn.bodyStart, fn.bodyEnd);
      if (callsNamed(code, spawners)) {
        spawners.add(fn.name);
        changed = true;
      }
    }
  }
  const bound = stringBindings(text, kind);
  const covered = (index) => {
    let inside = false;
    for (const fn of fns) {
      if (index < fn.bodyStart || index >= fn.bodyEnd) continue;
      inside = true;
      if (fn.name && setters.has(fn.name)) return true;
      const code = blankRange(text, kind, fn.bodyStart, fn.bodyEnd);
      if (ASSIGN_RE.test(code) || callsNamed(code, setters)) return true;
    }
    if (inside) return false;
    let top = "";
    for (let i = 0; i < text.length; i++) {
      const inFn = fns.some((fn) => i >= fn.bodyStart && i < fn.bodyEnd);
      if (inFn) {
        if (text[i] === "\n") top += "\n";
        continue;
      }
      top += kind[i] === "code" ? text[i] : text[i] === "\n" ? "\n" : " ";
    }
    return ASSIGN_RE.test(top);
  };
  /** @type {{ file: string, line: number, kind: "boot-register" | "next-start" }[]} */
  const hits = [];
  for (const call of calls) {
    const expanded = expandArgs(text, kind, call.argsStart, call.argsEnd, bindingsFor(bound, fns, call.index));
    const risk = riskyKind(expanded);
    if (!risk) continue;
    if (SPAWN_NAMES.has(call.name)) {
      if (!covered(call.index)) hits.push({ file, line: lineOf(text, call.index), kind: risk });
      continue;
    }
    if (!spawners.has(call.name)) continue;
    const homonyms = fns.filter((fn) => fn.name === call.name);
    const wrapperOk = homonyms.length > 0 && homonyms.every((fn) => covered(fn.bodyStart));
    if (!wrapperOk && !covered(call.index)) hits.push({ file, line: lineOf(text, call.index), kind: risk });
  }
  return dedupe(hits);
}

function relOf(root, abs) {
  return relative(root, abs).split(sep).join("/");
}

function walk(dir, onFile) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const abs = join(dir, name);
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      walk(abs, onFile);
      continue;
    }
    if (st.isFile()) onFile(abs);
  }
}

/** @param {string} root @returns {{ file: string, line: number, kind: "boot-register" | "next-start" }[]} */
export function scanRepo(root) {
  /** @type {{ file: string, line: number, kind: "boot-register" | "next-start" }[]} */
  const hits = [];
  walk(join(root, "tests"), (abs) => {
    if (!CODE_EXT.has(extname(abs).toLowerCase())) return;
    const text = readFileSync(abs, "utf8");
    if (text.includes("\0")) return;
    hits.push(...scanSource(text, relOf(root, abs)));
  });
  hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind));
  return dedupe(hits);
}

function label(kind) {
  if (kind === "boot-register") return "boot-register";
  if (kind === "next-start") return "next" + " start";
  throw new Error(`unknown kind: ${String(kind)}`);
}

/**
 * @param {string[]} [argv]
 * @param {(s: string) => void} [log]
 * @param {(s: string) => void} [err]
 */
export function main(argv = process.argv.slice(2), log = console.log, err = console.error) {
  const i = argv.indexOf("--root");
  const root = i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : resolve(import.meta.dirname, "../..");
  const hits = scanRepo(root);
  if (hits.length === 0) {
    log("spawn-temp-store: clean");
    return 0;
  }
  for (const h of hits) {
    err(`${h.file}:${h.line}: spawn of ${label(h.kind)} without a temp store; call spawnBootRegister or set QUAY_DATA_DIR`);
  }
  return 1;
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) process.exit(main());
