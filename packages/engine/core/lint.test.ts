import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const dir = fileURLToPath(new URL('.', import.meta.url));
const eslint = new ESLint({ overrideConfigFile: `${dir}eslint.config.mjs`, cwd: dir });
async function errors(fixture: string, filePath = `${dir}__virtual__/${fixture}.ts`): Promise<{ rule: string | null; msg: string }[]> {
  const text = readFileSync(`${dir}__lint_fixtures__/${fixture}.ts.txt`, 'utf8');
  const [r] = await eslint.lintText(text, { filePath });
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
  // QA M61-M64: each G8 rule is pinned by its own fixture and message
  for (const [f, re] of [['bad-sort', /sort needs a total comparator/], ['bad-map', /G8: Map is forbidden/], ['bad-json', /canonEncode/], ['bad-async', /G8: no async/]] as const)
    it(`${f} fails with its G8 message`, async () => { expect((await errors(f)).some((x) => re.test(x.msg))).toBe(true); });
  it('canon.ts may use Object.keys only: Object.values, for…in and bare sort still fail there', async () => {
    const canon = `${dir}canon.ts`;
    expect((await errors('bad-canon-values', canon)).some((x) => /Object\.keys\/values\/entries/.test(x.msg))).toBe(true);
    expect((await errors('bad-forin', canon)).some((x) => /for…in/.test(x.msg))).toBe(true);
    expect((await errors('bad-forin', canon)).some((x) => /Object\.keys/.test(x.msg))).toBe(false);
    expect((await errors('bad-sort', canon)).some((x) => /total comparator/.test(x.msg))).toBe(true);
  });
});
