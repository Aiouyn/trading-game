// T02-06: 02#42 (CI scan) on a fixture repo and on the real repo.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanStreamKeys } from './scan-stream-keys';

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'scan-streams-'));
  for (const [p, body] of Object.entries(files)) { const f = join(root, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, body); }
  return root;
}

describe('02#42 every stream key used by any module appears in the 02 §3.10.4 registry (CI scan)', () => {
  it('fixture: one registered key and one ctx.rng(\'mkt.foo:x\') -> only the latter is reported unknown', () => {
    const root = fixture({ 'packages/engine/markets/p.ts': [
      "export function f(ctx: any, id: string) {",
      "  ctx.rng('mkt.idio:ast_A').normal();",
      "  ctx.rng('mkt.foo:x').normal();",
      "}",
    ].join('\n') });
    const r = scanStreamKeys(root);
    expect(r.unknown).toEqual([{ file: 'packages/engine/markets/p.ts', line: 3, key: 'mkt.foo:x' }]);
    expect(r.unregisteredPrefixes).toEqual([]);
  });
  it('fixture: template heads, harness key, ModuleDef streams prefixes, tests ignored', () => {
    const root = fixture({
      'packages/engine/markets/q.ts': [
        "export const def = { id: '05', streams: ['mkt.idio', 'mkt.bogus'] };",
        "export function g(ctx: any, id: string) { ctx.rng(`mkt.idio:${id}`); ctx.rng(`mkt.nope:${id}`); ctx.rng('sim.bot:b1'); ctx.rng('macro.global_regime'); }",
      ].join('\n'),
      'packages/engine/markets/q.test.ts': "ctx.rng('totally.unknown');",
    });
    const r = scanStreamKeys(root);
    expect(r.unknown.map((u) => u.key)).toEqual(['mkt.nope:${…}', 'sim.bot:b1']);
    expect(r.unregisteredPrefixes).toEqual([{ module: '05', prefix: 'mkt.bogus' }]);
  });
  it('the real repo has no unknown keys, prefixes, call-site keys or unregistered helpers', () => {
    const r = scanStreamKeys(join(dirname(fileURLToPath(import.meta.url)), '../..'));
    expect(r).toEqual({ unknown: [], unregisteredPrefixes: [], callSiteKeys: [], unregisteredHelpers: [] });
  });
});

describe('AC-02-06-REGISTRY-HELPERS: stream keys come only from registered template helpers, never concatenated at call sites', () => {
  const STREAMS = [
    "export const S = Object.freeze({",
    "  idio: (a: string): string => `mkt.idio:${a}`,",
    "  fx: (b: string): string => `macro.fx:${b}:FDL`,",
    "  bad: (a: string): string => `mkt.foo:${a}`,",
    "  slash: (b: string): string => `macro.fx:${b}/FDL`,",
    "});",
  ].join('\n');
  it('helper calls pass; literals, templates, concatenation and variables at call sites are reported', () => {
    const root = fixture({
      'packages/engine/markets/streams.ts': STREAMS,
      'packages/engine/markets/use.ts': [
        "import { S } from './streams';",
        "export function g(ctx: any, id: string, k: string) {",
        "  ctx.rng(S.idio(id)); ctx.rng(S.fx('EUN'));",
        "  ctx.rng(`mkt.idio:${id}`); ctx.rng('mkt.idio:' + id); ctx.rng('mkt.idio:ast_A'); ctx.rng(k); ctx.rng(T.idio(id)); ctx.rng(S.nothere(id));",
        "}",
      ].join('\n'),
    });
    const r = scanStreamKeys(root);
    expect(r.callSiteKeys.map((c) => c.text)).toEqual(['`mkt.idio:${id}`', "'mkt.idio:' + id", "'mkt.idio:ast_A'", 'k', 'T.idio(id)', 'S.nothere(id)']);
    expect(r.callSiteKeys.every((c) => c.file === 'packages/engine/markets/use.ts' && c.line === 4)).toBe(true);
  });
  it('helpers whose template does not match a registry row are reported (E-63 macro.fx:<base>:<quote>)', () => {
    const r = scanStreamKeys(fixture({ 'packages/engine/markets/streams.ts': STREAMS }));
    expect(r.unregisteredHelpers.map((h) => [h.helper, h.key, h.line])).toEqual([['S.bad', 'mkt.foo:x0', 4], ['S.slash', 'macro.fx:x0/FDL', 5]]);
  });
  it('helper objects outside a streams.ts are not registered helpers', () => {
    const r = scanStreamKeys(fixture({
      'packages/engine/markets/keys.ts': "export const S = Object.freeze({ idio: (a: string): string => `mkt.idio:${a}` });",
      'packages/engine/markets/use.ts': "export function g(ctx: any, id: string) { ctx.rng(S.idio(id)); }",
    }));
    expect(r.callSiteKeys.map((c) => c.text)).toEqual(['`mkt.idio:${a}`', 'S.idio(id)']);   // E-68: a template outside streams.ts is a built key
  });
});

describe('AC-02-06-REGISTRY-HELPERS (amended by E-68) and QA #36: literal keys rejected with a helper hint; dynamic names caught at any call', () => {
  const STREAMS = "export const S = Object.freeze({ fx: (base: string, quote: string): string => `macro.fx:${base}:${quote}`, gapest: (b: string): string => `macro.gapest:${b}` });";
  const run = (use: string, extra: Record<string, string> = {}) => scanStreamKeys(fixture({ 'packages/engine/macro/streams.ts': STREAMS, 'packages/engine/macro/use.ts': use, ...extra }));
  const clean = (r: ReturnType<typeof scanStreamKeys>): boolean => r.unknown.length + r.unregisteredPrefixes.length + r.callSiteKeys.length + r.unregisteredHelpers.length === 0;
  it('(a) a literal key matching a registered template in src fails, and the finding names the helper to use', () => {
    const r = run("export function f(ctx: any) { return ctx.rng('macro.fx:EUN:FDL').normal(); }");
    expect(clean(r)).toBe(false);
    expect(r.callSiteKeys).toEqual([{ file: 'packages/engine/macro/use.ts', line: 1, text: "'macro.fx:EUN:FDL'", hint: 'use S.fx(base, quote)' }]);
    expect(r.unknown).toEqual([]);
  });
  it('(b) the same key built by the helper passes', () => {
    expect(clean(run("import { S } from './streams';\nexport function f(ctx: any) { return ctx.rng(S.fx('EUN', 'FDL')).normal(); }"))).toBe(true);
  });
  it('(c) an unregistered template fails (helper template and call-site template)', () => {
    const r = scanStreamKeys(fixture({ 'packages/engine/macro/streams.ts': "export const S = Object.freeze({ fx: (b: string): string => `macro.fxx:${b}` });" }));
    expect(r.unregisteredHelpers.map((h) => h.key)).toEqual(['macro.fxx:x0']);
    const r2 = run('export function f(ctx: any, b: string) { return ctx.rng(`mkt.nope:${b}`); }');
    expect(r2.unknown.map((u) => u.key)).toEqual(['mkt.nope:${…}']);
    expect(clean(r2)).toBe(false);
  });
  it('(d) literals in excluded test paths are not reported (*.test.ts and fixture directories, excluded by path)', () => {
    const lit = "export function f(ctx: any, m: any, b: string) { ctx.rng('macro.fx:EUN:FDL'); m.stream('04', ['macro.fx'], 'macro.fx:' + b); }";
    const r = run("export const ok = 1;", { 'packages/engine/macro/x.test.ts': lit, 'packages/engine/macro/__fixtures__/a.ts': lit, 'packages/engine/macro/fixtures/b.ts': lit });
    expect(clean(r)).toBe(true);
  });
  it("QA's injection: m.stream('04', ['macro.fx'], 'macro.fx:' + b) is reported (dynamic name beyond ctx.rng)", () => {
    const r = run("export function f(m: any, b: string) { return m.stream('04', ['macro.fx'], 'macro.fx:' + b).normal(); }");
    expect(r.callSiteKeys.map((c) => [c.text, c.hint])).toEqual([["'macro.fx:' + b", 'use S.fx(base, quote)']]);
  });
  it('templates, parenthesised / nested concatenations, literals at any call, and built keys stored in variables are reported', () => {
    const r = run([
      'export function f(m: any, b: string, q: string) {',
      '  m.stream(\'04\', [], `macro.gapest:${b}`);',
      "  m.stream('04', [], b + ('macro.fx:' + b) + q);",
      "  m.other('macro.gapest:EUN');",
      "  const k = 'macro.gapest:' + b; m.stream('04', [], k);",
      "  m.stream('04', ['macro.fx', 'macro.gapest'], S.gapest(b));",
      '}',
    ].join('\n'));
    expect(r.callSiteKeys.map((c) => [c.line, c.text])).toEqual([[2, '`macro.gapest:${b}`'], [3, "b + ('macro.fx:' + b) + q"], [4, "'macro.gapest:EUN'"], [5, "'macro.gapest:' + b"]]);
  });
  it('a registered row with no helper gets a hint to add one', () => {
    const r = run("export function f(m: any) { m.stream('05', [], 'mkt.idio:ast_A'); }");
    expect(r.callSiteKeys.map((c) => c.hint)).toEqual(['no registered helper builds mkt.idio:<assetId>: add one to a streams.ts']);
  });
});
