import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import fr from './fr.json';
import { ENGINE_FR } from './engineFr';

// The French walker (UX stage 6, item 6). Every notify call the world makes carries a message key (msg), so the inbox line
// reads in the viewer's language. Every refusal sentence the world returns is either in the engine table (ENGINE_FR) or sent
// with a key (msg) beside it, and every message key the world names exists in both en.json and fr.json. A new English
// sentence that reaches a French player fails here.

const WORLD = fileURLToPath(new URL('../world', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

/** The index just past a quoted string that starts at i (a ' or " quote). */
function skipQuote(text: string, i: number): number {
  const q = text[i];
  let j = i + 1;
  while (j < text.length && text[j] !== q) j += text[j] === '\\' ? 2 : 1;
  return j + 1;
}

/** The index just past a template literal whose body starts at i (just after the opening backtick). */
function skipTemplate(text: string, i: number): number {
  let j = i;
  while (j < text.length) {
    const c = text[j];
    if (c === '\\') j += 2;
    else if (c === '`') return j + 1;
    else if (c === '$' && text[j + 1] === '{') j = skipExpr(text, j + 2);
    else j += 1;
  }
  return j;
}

/** The index just past the } that closes a template expression whose body starts at i. */
function skipExpr(text: string, i: number): number {
  let depth = 1;
  let j = i;
  while (j < text.length) {
    const c = text[j];
    if (c === "'" || c === '"') j = skipQuote(text, j);
    else if (c === '`') j = skipTemplate(text, j + 1);
    else {
      if (c === '{') depth += 1;
      else if (c === '}') {
        depth -= 1;
        if (depth === 0) return j + 1;
      }
      j += 1;
    }
  }
  return j;
}

/** The text of a call's argument list, from the ( at open to its matching ). */
function callArgs(text: string, open: number): string {
  let depth = 0;
  let j = open;
  while (j < text.length) {
    const c = text[j];
    if (c === "'" || c === '"') { j = skipQuote(text, j); continue; }
    if (c === '`') { j = skipTemplate(text, j + 1); continue; }
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(open, j + 1);
    }
    j += 1;
  }
  return text.slice(open);
}

/** A notice built by a helper that returns its own msg (players.ts fillNotice returns { text, msg }). */
const BUILDS_MSG = ['fillNotice('];

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function isComment(line: string): boolean {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

const files = sources(WORLD).map((f) => {
  const rel = f.replace(/\\/g, '/');
  return { path: rel.slice(rel.indexOf('src/world')), text: readFileSync(f, 'utf8') };
});
const dict = { ...(en as Record<string, string>) };
const frDict = fr as Record<string, string>;
const hasKey = (d: Record<string, string>, k: string) => k in d || Object.keys(d).some((x) => x.startsWith(`${k}_`));

describe('the French walker: every world message reaches a French player in French', () => {
  it('every notify call carries a message key (msg), so the inbox line can be translated', () => {
    const bare: string[] = [];
    for (const f of files) {
      for (const m of f.text.matchAll(/\bnotify\(/g)) {
        const at = m.index!;
        const line = f.text.slice(f.text.lastIndexOf('\n', at) + 1, f.text.indexOf('\n', at));
        if (isComment(line) || /function\s+notify\(/.test(line)) continue;
        const args = callArgs(f.text, at + 'notify'.length);
        if (!/\bmsg\b/.test(args) && !BUILDS_MSG.some((b) => args.includes(b))) bare.push(`${f.path}:${lineOf(f.text, at)}`);
      }
    }
    expect(bare).toEqual([]);
  });

  it('every refusal sentence is in the engine table or carries a key (msg) on its line', () => {
    const bad: string[] = [];
    for (const f of files) {
      f.text.split('\n').forEach((line, i) => {
        if (isComment(line)) return;
        // a refusal sent with a key: `{ key: '...' }` beside the English, or a msg field
        const hasMsg = /\bmsg\b|\bkey:/.test(line);
        for (const m of line.matchAll(/(?:\berror:\s*|\bfail\(\s*)(['"])((?:(?!\1).)*)\1/g)) {
          const s = m[2]!;
          if (!s.includes(' ')) continue; // a code (fundBreaker, unknown), not a sentence
          if (!(s in ENGINE_FR) && !hasMsg) bad.push(`${f.path}:${i + 1} "${s}"`);
        }
        for (const m of line.matchAll(/(?:\berror:\s*|\bfail\(\s*)`([^`]*)`/g)) {
          if (!hasMsg) bad.push(`${f.path}:${i + 1} \`${m[1]}\``);
        }
      });
    }
    expect(bad).toEqual([]);
  });

  it('every message key the world names exists in English and French', () => {
    const missing: string[] = [];
    const ns = /^(court|security|lab|alert|social|deal|order|charity|biz|prop|desk|plans|work)\./;
    for (const f of files) {
      // the lines that name a message: a msg or key field, or a *_KEY map of keys (command types and refusal codes are not keys)
      let inKeyMap = false;
      f.text.split('\n').forEach((line) => {
        if (/_KEY\b[^=]*=\s*\{/.test(line)) inKeyMap = true;
        const names = inKeyMap || /\bmsg\b|\bkey\b|KEY/.test(line);
        if (/^\s*\};/.test(line)) inKeyMap = false;
        if (!names) return;
        for (const m of line.matchAll(/(['"`])([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)\1/g)) {
          const k = m[2]!;
          if (!ns.test(k) || /fail\(\s*$/.test(line.slice(0, m.index!))) continue; // a refusal code is not a key
          if (!hasKey(dict, k) || !hasKey(frDict, k)) missing.push(`${f.path}: ${k}`);
        }
      });
      for (const m of f.text.matchAll(/'@([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)'/g)) {
        const k = m[1]!;
        if (!hasKey(dict, k) || !hasKey(frDict, k)) missing.push(`${f.path}: @${k}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
