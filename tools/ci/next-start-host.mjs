#!/usr/bin/env node
/**
 * Lesson 31: `next start` must name a bind host.
 *
 * A shell string or spawn/execFile argv that runs `next start` without
 * `-H` or `--hostname` exits 1 once boot refuses a non-loopback bind.
 * Comments and Markdown prose are not commands.
 *
 * Usage: node tools/ci/next-start-host.mjs [--root <dir>]
 *
 * Scans tools/, tests/, scripts/, package.json scripts, playwright.config.ts,
 * and .github/workflows.
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const CODE_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
const SHELL_EXT = new Set([".sh", ".bash"]);
const YAML_EXT = new Set([".yml", ".yaml"]);
const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
  "out",
  "test-results",
  "playwright-report",
  ".preflight",
  "blob-report",
]);
const SPAWN_FNS = new Set(["spawn", "spawnSync", "execFile", "execFileSync"]);
const LEAD = new Set([
  "npx",
  "bunx",
  "npm",
  "pnpm",
  "yarn",
  "node",
  "nodejs",
  "exec",
  "x",
  "dlx",
  "sudo",
  "command",
  "nohup",
  "env",
]);
const TAKES_VALUE = new Set(["-p", "--port", "-H", "--hostname", "--keepAliveTimeout"]);
const FENCE_SHELL = new Set(["bash", "sh", "shell", "zsh"]);
const FENCE_JS = new Set(["js", "javascript", "ts", "typescript", "mjs", "cjs"]);

function lineOf(text, index) {
  let line = 1;
  const end = Math.min(Math.max(index, 0), text.length);
  for (let i = 0; i < end; i++) if (text[i] === "\n") line++;
  return line;
}

function isNextBin(token) {
  return token === "next" || token === "next.cmd" || /[/\\]next(?:\.cmd)?$/.test(token);
}

function isHostFlag(token) {
  return token === "-H" || token === "--hostname" || token.startsWith("--hostname=") || /^-H(?![A-Za-z])/.test(token);
}

function takesSeparateValue(token) {
  if (token.includes("=")) return false;
  if (/^-(?:p|H)\S/.test(token)) return false;
  return TAKES_VALUE.has(token);
}

function isEnvAssign(token) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

/** Previous non-flag token is a runner, or `next` itself is the command. */
function invoked(words, index) {
  let j = index - 1;
  while (j >= 0 && ((words[j].startsWith("-") && words[j] !== "-") || isEnvAssign(words[j]))) j--;
  if (j < 0) return true;
  return LEAD.has(words[j]);
}

/** Args after `start` are flags and their values. A bare word is prose, not a command. */
function flagTail(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith("-") && token !== "-") {
      if (takesSeparateValue(token) && i + 1 < tokens.length && !tokens[i + 1].startsWith("-")) i++;
      continue;
    }
    return false;
  }
  return true;
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
    if (c === "\n" || c === ";" || c === "|" || c === "&") {
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

function shellHitsIn(text, origin, absStart, depth) {
  if (depth > 20) return [];
  const hits = [];
  for (const statement of splitStatements(text)) {
    const words = lexWords(statement.text);
    const tokens = words.map((word) => word.text);
    for (let i = 0; i < tokens.length - 1; i++) {
      if (!isNextBin(tokens[i]) || tokens[i + 1] !== "start") continue;
      if (!invoked(tokens, i)) continue;
      const rest = tokens.slice(i + 2);
      if (!flagTail(rest) || rest.some(isHostFlag)) continue;
      hits.push({ index: absStart + statement.start + words[i].start });
    }
    for (const word of words) {
      if (!word.quoted || word.text.length === 0) continue;
      hits.push(...shellHitsIn(word.text, origin, absStart + statement.start + word.contentStart, depth + 1));
    }
  }
  return hits;
}

/** @param {string} text @returns {{ index: number, line: number }[]} */
function shellHits(text) {
  const masked = maskHashComments(text);
  if (masked.length !== text.length) throw new Error("shell comment mask changed length");
  return shellHitsIn(masked, masked, 0, 0).map((hit) => ({ index: hit.index, line: lineOf(masked, hit.index) }));
}

function lineInSpan(text, start, end) {
  const slice = text.slice(start, end);
  const match = /next(?:\.cmd)?(?:\s+|\s*['"]\s*,\s*['"]\s*)start\b/.exec(slice);
  return lineOf(text, start + (match ? match.index : 0));
}

function stringHits(text, file, start, end, decoded) {
  const found = shellHits(decoded);
  if (found.length === 0) return [];
  const slice = text.slice(start, end);
  const re = /next(?:\.cmd)?(?:\s+|\s*['"]\s*,\s*['"]\s*)start\b/g;
  const lines = [];
  for (const match of slice.matchAll(re)) lines.push(lineOf(text, start + (match.index ?? 0)));
  while (lines.length < found.length) lines.push(lineOf(text, start));
  return lines.slice(0, found.length).map((line) => ({ file, line }));
}

function readQuoted(text, i) {
  const quote = text[i];
  let value = "";
  i++;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      const escaped = text[i + 1] ?? "";
      const map = { n: "\n", r: "\r", t: "\t" };
      value += Object.prototype.hasOwnProperty.call(map, escaped) ? map[escaped] : escaped;
      i += 2;
      continue;
    }
    if (c === quote) return { value, end: i + 1 };
    value += c;
    i++;
  }
  return { value, end: i };
}

function skipBalanced(text, openIndex) {
  const open = text[openIndex];
  const close = open === "{" ? "}" : open === "(" ? ")" : open === "[" ? "]" : "";
  if (!close) return openIndex + 1;
  let depth = 1;
  let i = openIndex + 1;
  while (i < text.length && depth > 0) {
    const c = text[i];
    const n = text[i + 1];
    if (c === "/" && n === "/") {
      i += 2;
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && n === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i = Math.min(text.length, i + 2);
      continue;
    }
    if (c === "'" || c === "\"") {
      i = readQuoted(text, i).end;
      continue;
    }
    if (c === "`") {
      i = readTemplate(text, i).end;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) depth--;
    i++;
  }
  return i;
}

function readTemplate(text, i) {
  let shell = "";
  i++;
  while (i < text.length) {
    if (text[i] === "\\") {
      const escaped = text[i + 1] ?? "";
      shell += escaped === "n" ? "\n" : escaped === "r" ? "\r" : escaped === "t" ? "\t" : escaped;
      i += 2;
      continue;
    }
    if (text[i] === "`") return { shell, end: i + 1 };
    if (text[i] === "$" && text[i + 1] === "{") {
      shell += "__SUBST__";
      i = skipBalanced(text, i + 1);
      continue;
    }
    shell += text[i];
    i++;
  }
  return { shell, end: i };
}

function skipRegex(text, i) {
  i++;
  let klass = false;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "[") klass = true;
    else if (c === "]") klass = false;
    else if (c === "/" && !klass) {
      i++;
      while (i < text.length && /[a-z]/i.test(text[i])) i++;
      return i;
    } else if (c === "\n") return i;
    i++;
  }
  return i;
}

function elementIsNext(element) {
  if (element.value != null) return isNextBin(element.value);
  return /nextBin\s*\(/.test(element.raw)
    || /['"]next(?:\.cmd)?['"]\s*\)*\s*$/.test(element.raw)
    || /[/\\]next(?:\.cmd)?['"]?\s*\)*\s*$/.test(element.raw);
}

function elementIsHost(element) {
  if (element.value != null) return isHostFlag(element.value);
  return /--hostname|(^|[^\w-])-H(?![A-Za-z])/.test(element.raw);
}

function arrayTail(rest) {
  for (let i = 0; i < rest.length; i++) {
    const element = rest[i];
    if (element.value == null) continue;
    const token = element.value;
    if (token.startsWith("-") && token !== "-") {
      const next = rest[i + 1];
      if (takesSeparateValue(token) && next && !(next.value != null && next.value.startsWith("-"))) i++;
      continue;
    }
    return false;
  }
  return true;
}

function arrayIsBareNextStart(elements) {
  const nextAt = elements.findIndex(elementIsNext);
  if (nextAt < 0) return false;
  let startAt = -1;
  for (let i = nextAt + 1; i < elements.length; i++) {
    if (elements[i].value === "start") {
      startAt = i;
      break;
    }
    if (elements[i].value != null) return false;
  }
  if (startAt < 0) return false;
  const rest = elements.slice(startAt + 1);
  if (rest.some(elementIsHost)) return false;
  return arrayTail(rest);
}

function classifyElement(raw, absStart) {
  const trimmed = raw.trim();
  const offset = raw.indexOf(trimmed);
  const start = absStart + Math.max(offset, 0);
  if (!trimmed) return { value: null, raw: trimmed, span: { start, end: start } };
  if (trimmed.startsWith("'") || trimmed.startsWith("\"")) {
    const parsed = readQuoted(trimmed, 0);
    if (parsed.end === trimmed.length) {
      return { value: parsed.value, raw: trimmed, span: { start, end: start + trimmed.length } };
    }
  }
  if (trimmed.startsWith("`") && !trimmed.includes("${")) {
    const parsed = readTemplate(trimmed, 0);
    if (parsed.end === trimmed.length) {
      return { value: parsed.shell, raw: trimmed, span: { start, end: start + trimmed.length } };
    }
  }
  return { value: null, raw: trimmed, span: { start, end: start + trimmed.length } };
}

function splitDelimited(text, openIndex) {
  const open = text[openIndex];
  const close = open === "(" ? ")" : open === "[" ? "]" : open === "{" ? "}" : "";
  const parts = [];
  let i = openIndex + 1;
  let partStart = i;
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let exprStart = true;
  const push = (end) => {
    parts.push({ raw: text.slice(partStart, end), start: partStart, end });
  };
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (c === "/" && n === "/") {
      i += 2;
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && n === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i = Math.min(text.length, i + 2);
      continue;
    }
    if (c === "'" || c === "\"") {
      i = readQuoted(text, i).end;
      exprStart = false;
      continue;
    }
    if (c === "`") {
      i = readTemplate(text, i).end;
      exprStart = false;
      continue;
    }
    if (c === "/" && exprStart) {
      i = skipRegex(text, i);
      exprStart = false;
      continue;
    }
    if (c === "(") {
      paren++;
      exprStart = true;
      i++;
      continue;
    }
    if (c === "[") {
      bracket++;
      exprStart = true;
      i++;
      continue;
    }
    if (c === "{") {
      brace++;
      exprStart = true;
      i++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      const top = paren === 0 && bracket === 0 && brace === 0;
      if (top && c === close) {
        push(i);
        return { parts, end: i + 1 };
      }
      if (c === ")") paren = Math.max(0, paren - 1);
      else if (c === "]") bracket = Math.max(0, bracket - 1);
      else brace = Math.max(0, brace - 1);
      exprStart = false;
      i++;
      continue;
    }
    if (c === "," && paren === 0 && bracket === 0 && brace === 0) {
      push(i);
      i++;
      partStart = i;
      exprStart = true;
      continue;
    }
    if (/[A-Za-z0-9_$]/.test(c)) exprStart = false;
    else if ("=?:|&!+-*%^~<>".includes(c)) exprStart = true;
    i++;
  }
  push(text.length);
  return { parts, end: text.length };
}

function readElements(text, bracketIndex) {
  const split = splitDelimited(text, bracketIndex);
  return {
    elements: split.parts
      .filter((part) => part.raw.trim().length > 0)
      .map((part) => classifyElement(part.raw, part.start)),
    end: split.end,
  };
}

function skipSpaceComments(text, i) {
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      i += 2;
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i = Math.min(n, i + 2);
      continue;
    }
    break;
  }
  return i;
}

function callIsBare(args) {
  const arrayArg = args.find((arg) => arg.kind === "array");
  if (!arrayArg) return false;
  if (arrayIsBareNextStart(arrayArg.elements)) return true;
  const command = args[0];
  if (!command || command.kind !== "string" || !isNextBin(command.value)) return false;
  const elements = arrayArg.elements;
  if (elements.length === 0 || elements[0].value !== "start") return false;
  const rest = elements.slice(1);
  if (rest.some(elementIsHost)) return false;
  return arrayTail(rest);
}

function stringsInArgs(text, file, args) {
  const hits = [];
  for (const arg of args) {
    if (arg.kind === "string") hits.push(...stringHits(text, file, arg.span.start, arg.span.end, arg.value));
    if (arg.kind === "array") {
      for (const element of arg.elements) {
        if (element.value != null) hits.push(...stringHits(text, file, element.span.start, element.span.end, element.value));
      }
    }
  }
  return hits;
}

function classifyArg(text, part) {
  const trimmed = part.raw.trim();
  const offset = part.raw.indexOf(trimmed);
  const start = part.start + Math.max(offset, 0);
  const end = start + trimmed.length;
  if (trimmed.startsWith("[")) {
    const array = readElements(text, start);
    return { kind: "array", elements: array.elements, span: { start, end: array.end } };
  }
  if (trimmed.startsWith("'") || trimmed.startsWith("\"")) {
    const parsed = readQuoted(trimmed, 0);
    if (parsed.end === trimmed.length) return { kind: "string", value: parsed.value, span: { start, end } };
  }
  if (trimmed.startsWith("`")) {
    const parsed = readTemplate(trimmed, 0);
    if (parsed.end === trimmed.length) return { kind: "string", value: parsed.shell, span: { start, end } };
  }
  return { kind: "other", span: { start, end } };
}

/**
 * @param {string} text
 * @param {string} file
 * @returns {{ file: string, line: number }[]}
 */
function scanJs(text, file) {
  const hits = [];
  const n = text.length;
  let i = 0;
  let exprStart = true;
  while (i < n) {
    const c = text[i];
    const next = text[i + 1];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "/" && next === "/") {
      i += 2;
      while (i < n && text[i] !== "\n") i++;
      exprStart = true;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i = Math.min(n, i + 2);
      exprStart = true;
      continue;
    }
    if (c === "'" || c === "\"") {
      const start = i;
      const parsed = readQuoted(text, i);
      hits.push(...stringHits(text, file, start, parsed.end, parsed.value));
      i = parsed.end;
      exprStart = false;
      continue;
    }
    if (c === "`") {
      const start = i;
      const parsed = readTemplate(text, i);
      hits.push(...stringHits(text, file, start, parsed.end, parsed.shell));
      i = parsed.end;
      exprStart = false;
      continue;
    }
    if (c === "/" && exprStart) {
      i = skipRegex(text, i);
      exprStart = false;
      continue;
    }
    if (c === "[") {
      const start = i;
      const array = readElements(text, i);
      if (arrayIsBareNextStart(array.elements)) hits.push({ file, line: lineInSpan(text, start, array.end) });
      for (const element of array.elements) {
        if (element.value != null) hits.push(...stringHits(text, file, element.span.start, element.span.end, element.value));
      }
      i = array.end;
      exprStart = false;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const start = i;
      i++;
      while (i < n && /[A-Za-z0-9_$]/.test(text[i])) i++;
      const name = text.slice(start, i);
      const after = skipSpaceComments(text, i);
      if (SPAWN_FNS.has(name) && text[after] === "(") {
        const call = splitDelimited(text, after);
        const args = call.parts.filter((part) => part.raw.trim()).map((part) => classifyArg(text, part));
        if (callIsBare(args)) hits.push({ file, line: lineInSpan(text, start, call.end) });
        hits.push(...stringsInArgs(text, file, args));
        i = call.end;
        exprStart = false;
        continue;
      }
      exprStart = false;
      continue;
    }
    if (/[0-9]/.test(c)) {
      i++;
      while (i < n && /[0-9A-Za-z_.]/.test(text[i])) i++;
      exprStart = false;
      continue;
    }
    if ("=?:|&!+-*%^~<>(,{".includes(c)) exprStart = true;
    else if (c === ")" || c === "]" || c === "}") exprStart = false;
    i++;
  }
  return hits;
}

function relocate(hits, baseLine) {
  return hits.map((hit) => ({ file: hit.file, line: baseLine + hit.line - 1 }));
}

function shellFileHits(text, file) {
  return shellHits(text).map((hit) => ({ file, line: hit.line }));
}

function scanYaml(text, file) {
  const hits = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const codeOf = (line) => {
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === "'" && !inDouble) inSingle = !inSingle;
      else if (c === "\"" && !inSingle) inDouble = !inDouble;
      else if (c === "#" && !inSingle && !inDouble && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
    }
    return line;
  };
  for (let i = 0; i < lines.length; i++) {
    const code = codeOf(lines[i]);
    const match = code.match(/^(\s*)(?:-\s*)?run:\s*(.*)$/);
    if (!match) continue;
    const rest = match[2].trim();
    if (rest === "|" || rest === "|-" || rest === ">" || rest === ">-") {
      const indent = match[1].length;
      const body = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const line = lines[j];
        if (!line.trim()) {
          body.push("");
          continue;
        }
        const lead = (line.match(/^(\s*)/)?.[1] ?? "").length;
        if (lead <= indent) break;
        body.push(codeOf(line).trim());
      }
      const script = body.join("\n");
      const base = i + 2;
      hits.push(...relocate(shellFileHits(script, file), base));
      hits.push(...relocate(scanJs(script, file), base));
      i = j - 1;
      continue;
    }
    const script = rest.replace(/^['"]|['"]$/g, "");
    hits.push(...relocate(shellFileHits(script, file), i + 1));
    hits.push(...relocate(scanJs(script, file), i + 1));
  }
  return hits;
}

function scanMd(text, file) {
  const hits = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let lang = null;
  let buf = [];
  let contentLine = 1;
  const flush = () => {
    if (lang === null) return;
    const body = buf.join("\n");
    const kind = lang.toLowerCase();
    if (FENCE_SHELL.has(kind)) hits.push(...relocate(shellFileHits(body, file), contentLine));
    else if (FENCE_JS.has(kind)) hits.push(...relocate(scanJs(body, file), contentLine));
    lang = null;
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (lang === null) {
      const open = /^```([A-Za-z0-9_-]*)\s*$/.exec(line.trim());
      if (open) {
        lang = open[1] ?? "";
        contentLine = i + 2;
        buf = [];
      }
      continue;
    }
    if (line.trim().startsWith("```")) {
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();
  return hits;
}

function packageScriptHits(text, file) {
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch {
    return [];
  }
  const scripts = pkg && typeof pkg === "object" ? pkg.scripts : null;
  if (!scripts || typeof scripts !== "object") return [];
  const lines = text.split("\n");
  const hits = [];
  for (const [name, cmd] of Object.entries(scripts)) {
    if (typeof name !== "string" || typeof cmd !== "string") continue;
    const found = shellFileHits(cmd, file);
    if (found.length === 0) continue;
    const keyRe = new RegExp(`"${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:`);
    let lineNo = 1;
    for (let i = 0; i < lines.length; i++) {
      if (keyRe.test(lines[i])) {
        lineNo = i + 1;
        break;
      }
    }
    for (const hit of found) hits.push({ file, line: lineNo + hit.line - 1 });
  }
  return hits;
}

function dedupe(hits) {
  const seen = new Set();
  const out = [];
  for (const hit of hits) {
    const key = `${hit.file}:${hit.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ file: hit.file, line: hit.line });
  }
  return out;
}

/**
 * @param {string} text
 * @param {string} file
 * @returns {{ file: string, line: number }[]}
 */
export function findMissingHost(text, file) {
  const base = file.slice(Math.max(file.lastIndexOf("/"), file.lastIndexOf(sep)) + 1);
  const ext = extname(base).toLowerCase();
  if (base === "package.json") return dedupe(packageScriptHits(text, file));
  if (ext === ".md" || ext === ".mdx") return dedupe(scanMd(text, file));
  if (SHELL_EXT.has(ext)) return dedupe(shellFileHits(text, file));
  if (YAML_EXT.has(ext)) return dedupe(scanYaml(text, file));
  if (CODE_EXT.has(ext) || base.startsWith("playwright.config.")) return dedupe(scanJs(text, file));
  return [];
}

function relOf(root, abs) {
  return relative(root, abs).split(sep).join("/");
}

function readText(abs) {
  const text = readFileSync(abs, "utf8");
  return text.includes("\0") ? null : text;
}

function walk(root, dir, hits) {
  if (!existsSync(dir)) return;
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
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
      walk(root, abs, hits);
      continue;
    }
    if (!st.isFile()) continue;
    const ext = extname(name).toLowerCase();
    if (!CODE_EXT.has(ext) && !SHELL_EXT.has(ext) && !YAML_EXT.has(ext) && ext !== ".md" && ext !== ".mdx") continue;
    const text = readText(abs);
    if (text === null) continue;
    hits.push(...findMissingHost(text, relOf(root, abs)));
  }
}

/** @param {string} root @returns {{ file: string, line: number }[]} */
export function scanRepo(root) {
  const hits = [];
  walk(root, join(root, "tools"), hits);
  walk(root, join(root, "tests"), hits);
  walk(root, join(root, "scripts"), hits);
  const pkg = join(root, "package.json");
  if (existsSync(pkg)) hits.push(...findMissingHost(readFileSync(pkg, "utf8"), "package.json"));
  const playwright = join(root, "playwright.config.ts");
  if (existsSync(playwright)) hits.push(...findMissingHost(readFileSync(playwright, "utf8"), "playwright.config.ts"));
  walk(root, join(root, ".github", "workflows"), hits);
  hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return dedupe(hits);
}

/**
 * @param {string[]} [argv]
 * @param {(s: string) => void} [log]
 * @param {(s: string) => void} [err]
 */
export function main(argv = process.argv.slice(2), log = console.log, err = console.error) {
  const flag = argv.indexOf("--root");
  const root = flag >= 0 && argv[flag + 1] ? resolve(argv[flag + 1]) : resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const hits = scanRepo(root);
  if (hits.length === 0) {
    log("next-start-host: clean");
    return 0;
  }
  for (const hit of hits) err(`${hit.file}:${hit.line}: next start without -H/--hostname`);
  return 1;
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) process.exit(main());
