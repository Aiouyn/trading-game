import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const dir = fileURLToPath(new URL('.', import.meta.url));
const eslint = new ESLint({ overrideConfigFile: `${dir}eslint.config.mjs`, cwd: dir });
async function errors(fixture: string): Promise<{ rule: string | null; msg: string }[]> {
  const text = readFileSync(`${dir}__lint_fixtures__/${fixture}.ts.txt`, 'utf8');
  const [r] = await eslint.lintText(text, { filePath: `${dir}__virtual__/${fixture}.ts` });
  return r!.messages.filter((m) => m.severity === 2).map((m) => ({ rule: m.ruleId, msg: m.message }));
}
const G8 = ['no-restricted-globals', 'no-restricted-properties', 'no-restricted-syntax'];

describe('02#13 Lint rejects any engine file that references Date, Math.random, Math.exp or iterates a plain object', () => {
  for (const f of ['bad-date', 'bad-random', 'bad-exp']) it(`${f} fails the determinism rules`, async () => {
    const e = await errors(f);
    expect(e.some((x) => G8.includes(x.rule ?? ''))).toBe(true);
  });
  it('bad-forin fails for both for…in and Object.keys(o).forEach', async () => {
    const e = await errors('bad-forin');
    expect(e.some((x) => /for…in/.test(x.msg))).toBe(true);
    expect(e.some((x) => /Object\.keys/.test(x.msg))).toBe(true);
  });
  it('good.ts.txt (cmpStr, sortBy, SortedMap) has zero errors', async () => {
    expect(await errors('good')).toEqual([]);
  });
});
