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
  it('the real repo has no unknown keys or prefixes', () => {
    const r = scanStreamKeys(join(dirname(fileURLToPath(import.meta.url)), '../..'));
    expect(r).toEqual({ unknown: [], unregisteredPrefixes: [] });
  });
});
