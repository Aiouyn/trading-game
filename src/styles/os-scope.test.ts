import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Removes /* comments and @keyframes blocks (their from/to steps are not selectors). */
function selectorsOf(css: string): string[] {
  let s = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (let at = s.indexOf('@keyframes'); at >= 0; at = s.indexOf('@keyframes')) {
    const open = s.indexOf('{', at);
    let depth = 0;
    let end = open;
    for (let i = open; i < s.length; i++) {
      if (s[i] === '{') depth++;
      if (s[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    s = s.slice(0, at) + s.slice(end + 1);
  }
  const out: string[] = [];
  for (const m of s.matchAll(/([^{}]+)\{/g)) {
    const prelude = m[1]!.trim();
    if (!prelude || prelude.startsWith('@')) continue; // @layer, @media, @supports wrappers
    out.push(...splitTopLevel(prelude));
  }
  return out;
}

/** Splits a selector list on commas that are not inside parentheses (so :is(a, b) stays whole). */
function splitTopLevel(prelude: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of prelude) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

const FILES = ['os.css', 'os-phone.css'] as const;

describe('shell CSS is namespaced under .os-root (no generic names leak into the game)', () => {
  for (const file of FILES) {
    it(`${file}: every selector starts with .os-root`, () => {
      const css = readFileSync(new URL(file, import.meta.url), 'utf8');
      const selectors = selectorsOf(css);
      expect(selectors.length).toBeGreaterThan(40);
      const bad = selectors.filter((sel) => !sel.startsWith('.os-root'));
      expect(bad).toEqual([]);
    });
  }

  it('never sets a global reset, body style or bare element selector', () => {
    for (const file of FILES) {
      const css = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(css).not.toMatch(/(^|\n)\s*(\*|html|body|table|th|td|kbd|:root)\s*[,{]/);
    }
  });
});
