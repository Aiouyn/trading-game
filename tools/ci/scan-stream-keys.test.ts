// T02-06: 02#42 (CI scan) on a fixture repo and on the real repo.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { ALLOWLIST_FILE, formatAllowlist, isExcludedTestFile, loadAllowlist, runCli, scanStreamKeys } from './scan-stream-keys';

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
  it('(d) literals in allowlisted test files are not reported; fixture-named directories are NOT excluded (E-69): macro/fixtures/prod.ts is caught', () => {
    const lit = "export function f(ctx: any) { ctx.rng('macro.fx:EUN:FDL'); }";
    const r = run('export const ok = 1;', { 'packages/engine/macro/x.test.ts': lit, 'packages/engine/macro/fixtures/prod.ts': lit, 'packages/engine/macro/__fixtures__/a.ts': lit });
    expect(r.callSiteKeys.map((c) => [c.file, c.hint])).toEqual([['packages/engine/macro/__fixtures__/a.ts', 'use S.fx(base, quote)'], ['packages/engine/macro/fixtures/prod.ts', 'use S.fx(base, quote)']]);
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

describe('AC-02-06-REGISTRY-SCOPE (E-69): roots packages/engine/ and src/, .ts/.tsx/.mts/.js, exact-path allowlist printed on every run', () => {
  const lit = "export function f(ctx: any) { return ctx.rng('macro.fx:EUN:FDL'); }";
  const STREAMS = "export const S = Object.freeze({ fx: (base: string, quote: string): string => `macro.fx:${base}:${quote}` });";
  it('(a) a literal key in a .tsx, .mts or .js file under packages/engine/ or src/ is reported (exit 1)', () => {
    const r = scanStreamKeys(fixture({ 'packages/engine/macro/streams.ts': STREAMS, 'packages/engine/macro/v.tsx': lit, 'packages/engine/macro/m.mts': lit,
      'packages/engine/macro/j.js': lit, 'src/components/w.tsx': lit, 'src/lib/k.ts': lit, 'other/z.ts': lit }));
    expect(r.callSiteKeys.map((c) => c.file)).toEqual(['packages/engine/macro/j.js', 'packages/engine/macro/m.mts', 'packages/engine/macro/v.tsx', 'src/components/w.tsx', 'src/lib/k.ts']);
  });
  it('(b) the same literal in an allowlisted test file (*.test.ts/.tsx/.mts/.js) or allowlisted path is not reported', () => {
    const r = scanStreamKeys(fixture({ 'packages/engine/macro/streams.ts': STREAMS, 'packages/engine/macro/a.test.ts': lit, 'packages/engine/macro/b.test.tsx': lit,
      'src/c.test.mts': lit, 'src/d.test.js': lit, 'packages/engine/core/__lint_fixtures__/e.ts': lit, 'packages/engine/core/node_modules/x/f.js': lit }));
    expect(r.callSiteKeys).toEqual([]);
  });
  it('(c) a non-test file in ledger/test is scanned (only its *.test.ts files are excluded); so is any other test/ directory', () => {
    const r = scanStreamKeys(fixture({ 'packages/engine/macro/streams.ts': STREAMS, 'packages/engine/ledger/test/driver.ts': lit,
      'packages/engine/ledger/test/x.test.ts': lit, 'packages/engine/macro/test/h.ts': lit }));
    expect(r.callSiteKeys.map((c) => c.file)).toEqual(['packages/engine/ledger/test/driver.ts', 'packages/engine/macro/test/h.ts']);
  });
  it('(e) over-match (QA #36): test suffixes match a FILE basename only; directories named *.test.ts, near-miss names and *.spec.ts are scanned', () => {
    const r = scanStreamKeys(fixture({ 'packages/engine/macro/streams.ts': STREAMS,
      'packages/engine/macro/evil.test.ts/prod.ts': lit,        // a directory ending in .test.ts: its files are scanned
      'src/x.test.js/deep/k.ts': lit,
      'packages/engine/macro/a.test.helper.ts': lit,            // contains '.test.' but does not end in a test suffix
      'packages/engine/macro/b.spec.ts': lit,                   // .spec.ts is not on the E-69 list
      'packages/engine/macro/c.test.ts': lit }));               // control: excluded
    expect(r.callSiteKeys.map((c) => c.file)).toEqual(['packages/engine/macro/a.test.helper.ts', 'packages/engine/macro/b.spec.ts',
      'packages/engine/macro/evil.test.ts/prod.ts', 'src/x.test.js/deep/k.ts']);
  });
  it('(e2) isExcludedTestFile: exactly the four suffixes, on the basename', () => {
    const a = loadAllowlist();
    for (const n of ['a.test.ts', 'a.test.tsx', 'a.test.mts', 'a.test.js']) expect(isExcludedTestFile(n, a)).toBe(true);
    for (const n of ['a.spec.ts', 'a.test.helper.ts', 'test.ts', 'a.tests.ts', 'a.test.cjs']) expect(isExcludedTestFile(n, a)).toBe(false);
  });
  it('(e3) CLI exits 1 for a literal under a directory named evil.test.ts', () => {
    expect(runCli(fixture({ 'packages/engine/macro/evil.test.ts/prod.ts': lit }), () => undefined, () => undefined)).toBe(1);
  });
  it('(d) the printed allowlist matches the allowlist file, and the CLI prints it on every run', () => {
    const raw = JSON.parse(readFileSync(ALLOWLIST_FILE, 'utf8')) as Record<string, string[]>, a = loadAllowlist();
    expect(a).toEqual({ roots: raw.roots, extensions: raw.extensions, paths: raw.paths, testFileSuffixes: raw.testFileSuffixes });
    expect(a.paths).toEqual(expect.arrayContaining(['tools/ci/fixtures/', 'packages/engine/core/__lint_fixtures__/']));
    expect(a.testFileSuffixes).toEqual(['.test.ts', '.test.tsx', '.test.mts', '.test.js']);
    expect(a.extensions).toEqual(['.ts', '.tsx', '.mts', '.js']); expect(a.roots).toEqual(['packages/engine/', 'src/']);
    const lines = formatAllowlist(a).split('\n');
    expect(lines).toEqual([...raw.roots!.map((r) => `scan root: ${r}`), `scan extensions: ${raw.extensions!.join(' ')}`,
      ...raw.paths!.map((p) => `excluded path: ${p}`), ...raw.testFileSuffixes!.map((x) => `excluded test files: *${x}`)]);
    const err: string[] = [];
    runCli(fixture({ 'packages/engine/macro/ok.ts': 'export const ok = 1;' }), () => undefined, (s) => err.push(s));
    expect(err[0]!.split('\n').slice(1)).toEqual(lines);
  });
});

describe('ci:streams CLI exit code (subprocess)', () => {
  const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const cli = (root: string) => spawnSync(process.execPath, [join(REPO, 'packages/engine/core/node_modules/vite-node/vite-node.mjs'), '--config', join(REPO, 'packages/engine/core/vitest.config.ts'), join(REPO, 'tools/ci/scan-stream-keys-cli.ts'), '--', '--root', root], { encoding: 'utf8' });
  it('exits 1 on a literal key, 0 on a clean tree, and prints the allowlist both times', () => {
    const bad = cli(fixture({ 'packages/engine/macro/fixtures/prod.ts': "export function f(ctx: any) { return ctx.rng('macro.fx:EUN:FDL'); }" }));
    expect(bad.status).toBe(1); expect(bad.stderr).toContain('excluded path: packages/engine/core/__lint_fixtures__/');
    expect(bad.stderr).toContain("packages/engine/macro/fixtures/prod.ts:1: stream key 'macro.fx:EUN:FDL' not built by a registered helper");
    const ok = cli(fixture({ 'packages/engine/macro/ok.ts': 'export const ok = 1;' }));
    expect(ok.status).toBe(0); expect(ok.stderr).toContain('scan root: src/');
  }, 120000);
});
