#!/usr/bin/env node
/**
 * Lesson 13 (docs/v1/units/ci-lesson13.md): kill a server by the pid in its pid file.
 * Rejects the two name-kill binaries named in that lesson. Their spellings are assembled
 * below so this file, which lives inside the scan, does not contain them.
 *
 * Usage: node tools/ci/lesson13-pid-kills.mjs [--root <dir>]
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo-relative paths to ignore. Empty: the tree has no hits.
 *  Add a key only when a hit is not a trivial fix, and put the reason in a comment on that line.
 *  @type {Record<string, string>}
 */
export const ALLOWLIST = {};

const NAME_KILL = new Set(["pk" + "ill", "kill" + "all"]);
const WRAPPERS = new Set(["sudo", "command", "nohup", "nice", "time", "xargs", "eval", "exec"]);
const FLAG_TAKES_ARG = new Set(["-u", "-g", "-n", "-p", "-c", "-P", "-a", "-I", "-L", "-s", "-E", "-v", "--user", "--group"]);
const CODE_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".sh", ".bash", ".py"]);
const SHELL_EXT = new Set([".sh", ".bash", ".py"]);
const FENCE_LANG = new Set(["bash", "sh", "shell", "zsh"]);
const SKIP_DIR = new Set(["node_modules", ".git", ".next"]);

function isNameKill(word) {
  return NAME_KILL.has(word);
}

function maskHashComments(text) {
  let out = "";
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      out += c;
      if (c === "\\" && quote !== "'" && i + 1 < text.length) out += text[++i];
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === "\"") {
      quote = c;
      out += c;
      continue;
    }
    if (c === "#") {
      while (i < text.length && text[i] !== "\n") {
        out += " ";
        i++;
      }
      i--;
      continue;
    }
    out += c;
  }
  return out;
}

function maskJsComments(text) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (quote) {
      out += c;
      if (c === "\\" && quote !== "'" && i + 1 < text.length) {
        out += text[i + 1];
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === "'" || c === "\"" || c === "`") {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < text.length && text[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (c === "/" && n === "*") {
      out += "  ";
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        out += text[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < text.length) {
        out += "  ";
        i += 2;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function lineOf(origin, index) {
  let line = 1;
  const end = Math.min(Math.max(index, 0), origin.length);
  for (let i = 0; i < end; i++) if (origin[i] === "\n") line++;
  return line;
}

function splitStatements(text) {
  const parts = [];
  let start = 0;
  let i = 0;
  let quote = null;
  const push = (end) => {
    if (end > start) parts.push({ text: text.slice(start, end), start });
  };
  while (i < text.length) {
    const c = text[i];
    if (quote) {
      if (c === "\\" && quote !== "'" && i + 1 < text.length) {
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === "'" || c === "\"") {
      quote = c;
      i++;
      continue;
    }
    if (c === "\n" || c === ";" || c === "(" || c === ")" || c === "`" || c === "|" || c === "&") {
      push(i);
      if ((c === "&" || c === "|") && text[i + 1] === c) i += 2;
      else i += 1;
      start = i;
      continue;
    }
    i++;
  }
  push(text.length);
  return parts;
}

function lexWords(text) {
  const words = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    if (c === "'" || c === "\"") {
      const q = c;
      const contentStart = i + 1;
      i++;
      let body = "";
      while (i < text.length) {
        if (text[i] === "\\" && q !== "'") {
          i++;
          if (i < text.length) body += text[i++];
          continue;
        }
        if (text[i] === q) {
          i++;
          break;
        }
        body += text[i++];
      }
      words.push({ text: body, quoted: true, start: contentStart - 1, contentStart });
      continue;
    }
    const start = i;
    while (i < text.length && !" \t\r'\"".includes(text[i])) i++;
    words.push({ text: text.slice(start, i), quoted: false, start, contentStart: start });
  }
  return words;
}

function isEnvAssign(word) {
  return !word.quoted && /^[A-Za-z_][A-Za-z0-9_]*=/.test(word.text);
}

function commandWord(words) {
  let i = 0;
  while (i < words.length && isEnvAssign(words[i])) i++;
  while (i < words.length && !words[i].quoted && WRAPPERS.has(words[i].text)) {
    i++;
    while (i < words.length && !words[i].quoted && words[i].text.startsWith("-")) {
      const flag = words[i].text;
      i++;
      if (FLAG_TAKES_ARG.has(flag) && i < words.length && (words[i].quoted || !words[i].text.startsWith("-"))) i++;
    }
  }
  return words[i] ?? null;
}

function findInShell(text, origin, absStart, depth) {
  if (depth > 20) return [];
  const hits = [];
  for (const st of splitStatements(text)) {
    const words = lexWords(st.text);
    const cmd = commandWord(words);
    if (cmd && !cmd.quoted && isNameKill(cmd.text)) {
      hits.push({ line: lineOf(origin, absStart + st.start + cmd.start), command: cmd.text });
    }
    for (const w of words) {
      if (!w.quoted || w.text.length === 0) continue;
      hits.push(...findInShell(w.text, origin, absStart + st.start + w.contentStart, depth + 1));
    }
  }
  return hits;
}

function dedupe(hits) {
  const seen = new Set();
  const out = [];
  for (const h of hits) {
    const key = `${h.file}:${h.line}:${h.command}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

function shellHits(text) {
  const masked = maskHashComments(text);
  return findInShell(masked, masked, 0, 0);
}

function scanFences(text, file) {
  const lines = text.split("\n");
  const hits = [];
  let lang = null;
  let buf = [];
  let contentStart = 0;
  const flush = () => {
    if (lang !== null && FENCE_LANG.has(lang)) {
      for (const h of shellHits(buf.join("\n"))) {
        hits.push({ file, line: contentStart + h.line, command: h.command });
      }
    }
    lang = null;
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    if (lang === null) {
      const open = /^```([A-Za-z0-9_-]*)\s*$/.exec(line);
      if (open) {
        lang = open[1] ?? "";
        contentStart = i + 1;
        buf = [];
      }
      continue;
    }
    if (line.startsWith("```")) {
      flush();
      continue;
    }
    buf.push(lines[i].replace(/\r$/, ""));
  }
  flush();
  return hits;
}

/**
 * @param {string} text
 * @param {string} file
 * @param {"js" | "shell" | "runbook"} kind
 * @returns {{ file: string, line: number, command: string }[]}
 */
export function findNameKills(text, file, kind) {
  if (kind === "runbook") return dedupe(scanFences(text, file));
  if (kind === "js") {
    const masked = maskJsComments(text);
    if (masked.length !== text.length) throw new Error(`comment mask changed length in ${file}`);
    return dedupe(findInShell(masked, masked, 0, 0).map((h) => ({ file, line: h.line, command: h.command })));
  }
  if (kind === "shell") {
    const masked = maskHashComments(text);
    if (masked.length !== text.length) throw new Error(`comment mask changed length in ${file}`);
    return dedupe(shellHits(text).map((h) => ({ file, line: h.line, command: h.command })));
  }
  throw new Error(`unknown kind: ${String(kind)}`);
}

function relOf(root, abs) {
  return relative(root, abs).split(sep).join("/");
}

function allowed(rel) {
  return Object.prototype.hasOwnProperty.call(ALLOWLIST, rel);
}

function scanCode(text, rel) {
  const ext = extname(rel).toLowerCase();
  return findNameKills(text, rel, SHELL_EXT.has(ext) ? "shell" : "js");
}

function walk(root, dir, onFile) {
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
      walk(root, abs, onFile);
      continue;
    }
    if (!st.isFile()) continue;
    onFile(abs);
  }
}

function readText(abs) {
  const text = readFileSync(abs, "utf8");
  return text.includes("\0") ? null : text;
}

function scanTree(root, dir, hits) {
  walk(root, dir, (abs) => {
    const ext = extname(abs).toLowerCase();
    if (!CODE_EXT.has(ext)) return;
    const rel = relOf(root, abs);
    if (allowed(rel)) return;
    const text = readText(abs);
    if (text === null) return;
    hits.push(...scanCode(text, rel));
  });
}

function scanPackageScripts(root, hits) {
  const abs = join(root, "package.json");
  if (!existsSync(abs)) return;
  const rel = "package.json";
  if (allowed(rel)) return;
  const text = readFileSync(abs, "utf8");
  const pkg = JSON.parse(text);
  const scripts = pkg && typeof pkg === "object" ? pkg.scripts : null;
  if (!scripts || typeof scripts !== "object") return;
  const lines = text.split("\n");
  for (const [name, cmd] of Object.entries(scripts)) {
    if (typeof cmd !== "string" || typeof name !== "string") continue;
    const found = findNameKills(cmd, rel, "shell");
    if (found.length === 0) continue;
    const keyRe = new RegExp(`"${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:`);
    let lineNo = 1;
    for (let i = 0; i < lines.length; i++) {
      if (keyRe.test(lines[i])) {
        lineNo = i + 1;
        break;
      }
    }
    for (const h of found) hits.push({ file: rel, line: lineNo + h.line - 1, command: h.command });
  }
}

function scanPlaywright(root, hits) {
  const consider = (abs) => {
    const base = abs.slice(abs.lastIndexOf(sep) + 1);
    if (!base.startsWith("playwright.config.")) return;
    const rel = relOf(root, abs);
    if (allowed(rel)) return;
    const text = readText(abs);
    if (text === null) return;
    hits.push(...findNameKills(text, rel, "js"));
  };
  if (!existsSync(root)) return;
  for (const name of readdirSync(root)) {
    const abs = join(root, name);
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      continue;
    }
    if (st.isFile() && name.startsWith("playwright.config.")) consider(abs);
  }
  walk(root, join(root, "tests"), consider);
}

function scanRunbooks(root, hits) {
  walk(root, join(root, "docs"), (abs) => {
    const rel = relOf(root, abs);
    if (!rel.toLowerCase().includes("runbook")) return;
    if (allowed(rel)) return;
    const text = readText(abs);
    if (text === null) return;
    const ext = extname(rel).toLowerCase();
    if (ext === ".md" || ext === ".mdx") hits.push(...findNameKills(text, rel, "runbook"));
    else if (CODE_EXT.has(ext)) hits.push(...scanCode(text, rel));
  });
}

/** @param {string} root @returns {{ file: string, line: number, command: string }[]} */
export function scanRepo(root) {
  const hits = [];
  scanTree(root, join(root, "scripts"), hits);
  scanTree(root, join(root, "tools"), hits);
  scanPackageScripts(root, hits);
  scanPlaywright(root, hits);
  scanRunbooks(root, hits);
  hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.command.localeCompare(b.command));
  return dedupe(hits);
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
    log("lesson13: clean");
    return 0;
  }
  for (const h of hits) err(`${h.file}:${h.line}: name-kill ${h.command}; kill the server by its pid file only`);
  return 1;
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) process.exit(main());
