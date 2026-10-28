// AC-04-18-HOOKID (E-105) (3), (4) and the id grammar. (1) is asserted at each writer's own test (scheduler, auction, ycc,
// sovDefault, concord, sovCredit); (2) and (5) ride on 04#1's seeded run in core/determinism.test.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { IdFactory } from '@tycoon/engine-core';
import { describe, expect, it } from 'vitest';
import { ALL_MACRO_TABLES, HOOK_CALL_TABLE, macroTables, type HookCall } from '../schema';
import { cbWorld } from '../testkit/cbWorld';
import { crisisWeekSourceId, igExclusionSourceId, RESERVED_ID_KINDS, trancheSourceId, writeHook, yccPressureSourceId } from './hooks';

const ROOT = new URL('..', import.meta.url).pathname;
const D = 720;
/** Non-test .ts sources under packages/engine/macro (no node_modules). */
function sources(dir = ROOT): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (n === 'node_modules') continue;
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (n.endsWith('.ts') && !n.endsWith('.test.ts')) out.push(p);
  }
  return out;
}
/** The registered table name (schema.ts: HOOK_CALL_TABLE = T('hook_call') → 'mac.hook_call'). */
const HOOK_TABLE = HOOK_CALL_TABLE.name;
/** Structural (4): the table is not in `macroTables`; its only handles are the `HOOK_CALL_TABLE` export and its name. A non-test
 *  source outside schema.ts (definition, registration) and rules/hooks.ts (writeHook, readers) that names either, or a
 *  `hookCall` table key, can reach the table: put through a const alias of the name or of the table object included. */
const REACH = /hook_call|HOOK_CALL_TABLE|\bhookCall\b/;
const OWNERS = ['rules/hooks.ts', 'schema.ts'];
const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const hookTableReachers = (files: readonly string[], read: (f: string) => string): string[] =>
  files.filter((f) => REACH.test(code(read(f)))).map((f) => relative(ROOT, f)).sort();

describe('AC-04-18-HOOKID', () => {
  it('(3) writeHook with worldEventId \'\' throws MAC_STATE_MISSING and writes nothing', () => {
    const w = cbWorld([], 10 * D);
    expect(() => writeHook(w.ctx, '16', 'WIRE_ITEM', { key: 'k' }, '')).toThrow(expect.objectContaining({ code: 'MAC_STATE_MISSING' }));
    expect(w.rows(HOOK_CALL_TABLE.name)).toEqual([]);
    const r = writeHook(w.ctx, '16', 'WIRE_ITEM', { key: 'k' }, 'cwk_WORLD_3');
    expect(w.rows(HOOK_CALL_TABLE.name) as HookCall[]).toEqual([r]);
  });
  it('(4) structural: mac.hook_call is not in macroTables; ALL_MACRO_TABLES registers it once', () => {
    expect(HOOK_TABLE).toBe('mac.hook_call');
    expect(Object.keys(macroTables)).not.toContain('hookCall');
    expect(Object.values(macroTables).map((d) => d.name)).not.toContain(HOOK_TABLE);
    expect(ALL_MACRO_TABLES.filter((d) => d.name === HOOK_TABLE)).toEqual([HOOK_CALL_TABLE]);
  });
  it('(4) static: only rules/hooks.ts and schema.ts name the hook-call table in packages/engine/macro', () => {
    expect(hookTableReachers(sources(), (f) => readFileSync(f, 'utf8'))).toEqual(OWNERS);
  });
  it('(4) the scan catches direct, multi-line, literal and aliased writes (QA P1–P5), not comments', () => {
    const fake = {
      'a.ts': "s.put<HookCall>(\n  HOOK_CALL_TABLE.name, { id })", 'b.ts': "ctx.store.put('mac.hook_call', r)", 'c.ts': 'store.set(\n  `mac.hook_call`,\n  r)',
      'd.ts': "const QA_HC = 'mac.hook_call';\nexport function f(ctx) { ctx.store.put(QA_HC, r); }",   // P3aliasConst
      'e.ts': 'const QA_HT = macroTables.hookCall;\nexport function f(ctx) { ctx.store.put(QA_HT.name, r); }',   // P4aliasTable
      'f.ts': "const T = macroTables['hookCall'];", 'g.ts': '// writes go through writeHook, never mac.hook_call directly\n/* HOOK_CALL_TABLE */ const x = 1;',
      'h.ts': 'hookCallsFor(store, "05", t);', 'i.ts': "const u = 'a//b'; ctx.store.put('mac.hook_call', r);",
    } as Record<string, string>;
    expect(hookTableReachers(Object.keys(fake).map((k) => join(ROOT, k)), (f) => fake[relative(ROOT, f)]!)).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'i.ts']);
  });
  it('source-id grammar per writer (E-105 table) and the CSF guard', () => {
    expect(crisisWeekSourceId(42 * 168 * D)).toBe(`cwk_WORLD_${42 * 168}`);
    expect(yccPressureSourceId('PYN', 77 * D + 719)).toBe('ycp_PYN_77');
    expect(igExclusionSourceId('SRL', 5 * D)).toBe('igx_SRL_5');
    expect(trancheSourceId('csf_SRL_7200', 2)).toBe('csf_SRL_7200_t2');
    expect(() => trancheSourceId(undefined, 1)).toThrow(expect.objectContaining({ code: 'MAC_STATE_MISSING' }));
    expect(() => trancheSourceId('', 1)).toThrow(expect.objectContaining({ code: 'MAC_STATE_MISSING' }));
    expect(() => trancheSourceId('csf_SRL_7200', 0)).toThrow(expect.objectContaining({ code: 'MAC_STATE_MISSING' }));
  });
  it('newId kinds cwk, ycp, igx are reserved: no newId call uses them; composite ids never take the digest form', () => {
    expect(RESERVED_ID_KINDS).toEqual(['cwk', 'ycp', 'igx']);
    const use = new RegExp(`newId\\(\\s*['"\`](${RESERVED_ID_KINDS.join('|')})['"\`]`);
    expect(sources().filter((f) => use.test(readFileSync(f, 'utf8'))).map((f) => relative(ROOT, f))).toEqual([]);
    const f = new IdFactory(new Uint8Array(32), 'p', 3 * D), digest = /^[a-z]{2,5}_[0-9A-HJKMNP-TV-Z]{26}$/;
    for (const k of ['sdc', 'wev', ...RESERVED_ID_KINDS]) expect(f.newId(k)).toMatch(digest);
    expect(f.newId('sdc')).toMatch(/^sdc_[0-9A-HJKMNP-TV-Z]{26}$/);
    for (const id of [crisisWeekSourceId(0), yccPressureSourceId('PYN', 0), igExclusionSourceId('FDL', 0), trancheSourceId('csf_SRL_0', 1), 'auc_FDL_N10Y_100']) {
      expect(id).not.toMatch(digest);
      expect(id.split('_').length).toBeGreaterThanOrEqual(3);
    }
  });
});
