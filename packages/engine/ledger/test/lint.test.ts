// Spec test 7: the G8 lint rejects Date, Math.random and Map iteration in packages/engine/ledger/**; the real sources pass.
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const lint = async (code: string): Promise<string[]> => {
  const [r] = await new ESLint({ cwd: root }).lintText(code, { filePath: `${root}src/__fixture__.ts` });
  return r.messages.map((m) => m.message.replace(/^.*?(G8:)/, '$1'));
};

describe('G8 determinism lint', () => {
  it('rejects wall clock, randomness, Map/Set, for…in, Object.keys, JSON.stringify, localeCompare and async', async () => {
    expect(await lint('export const t = Date.now();\n')).toContain('G8: time is Tick only');
    expect(await lint('export const r = Math.random();\n')).toContain('G8: no Math.random');
    expect(await lint('const m = new Map<string, number>();\nexport const k = [...m.keys()];\n')).toContain('G8: use SortedMap (det.ts)');
    expect(await lint('export function f(o: object) { for (const k in o) return k; return ""; }\n')).toContain('G8: no for…in');
    expect(await lint('export const k = Object.keys({});\n')).toContain('G8: no Object.keys/values/entries order dependence');
    expect(await lint('export const s = JSON.stringify({});\n')).toContain('G8: hash and persist with canonEncode');
    expect(await lint('export const c = "a".localeCompare("b");\n')).toContain('G8: byte order only (cmpStr)');
    expect(await lint('export async function f() { return 1; }\n')).toContain('G8: no async');
    expect(await lint('export const ok = [1n, 2n].map((x) => x + 1n);\n')).toEqual([]);
  });
  it('the ledger sources have no findings', async () => {
    const results = await new ESLint({ cwd: root }).lintFiles(['src/**/*.ts']);
    expect(results.flatMap((r) => r.messages.map((m) => `${r.filePath}: ${m.message}`))).toEqual([]);
  });
  it('INV-LED-009 static write-set: only applyPosting assigns an account balance', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const hits: string[] = [];
    for (const f of readdirSync(`${root}src`)) {
      const src = readFileSync(`${root}src/${f}`, 'utf8');
      for (const [i, line] of src.split('\n').entries()) if (/\.set\([^;]*\{ balance:/.test(line)) hits.push(`${f}:${i + 1}`);
    }
    expect(hits.every((h) => h.startsWith('world.ts'))).toBe(true);
    expect(hits.length).toBe(2);
  });
});
