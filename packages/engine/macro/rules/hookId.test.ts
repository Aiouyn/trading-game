// AC-04-18-HOOKID (E-105) (3), (4) and the id grammar. (1) is asserted at each writer's own test (scheduler, auction, ycc,
// sovDefault, concord, sovCredit); (2) and (5) ride on 04#1's seeded run in core/determinism.test.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { IdFactory } from '@tycoon/engine-core';
import { describe, expect, it } from 'vitest';
import { macroTables, type HookCall } from '../schema';
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
/** A put/set of mac.hookCall rows: `.put<…>(macroTables.hookCall.name` or the literal table name. */
const HOOK_WRITE = /\.(put|set|upsert)\s*(<[^>()]*>)?\s*\(\s*(macroTables\.hookCall\.name|['"`]mac\.hookCall['"`])/;
const hookCallWriters = (files: readonly string[], read: (f: string) => string): string[] =>
  files.filter((f) => HOOK_WRITE.test(read(f).replace(/\s+/g, ' '))).map((f) => relative(ROOT, f)).sort();

describe('AC-04-18-HOOKID', () => {
  it('(3) writeHook with worldEventId \'\' throws MAC_STATE_MISSING and writes nothing', () => {
    const w = cbWorld([], 10 * D);
    expect(() => writeHook(w.ctx, '16', 'WIRE_ITEM', { key: 'k' }, '')).toThrow(expect.objectContaining({ code: 'MAC_STATE_MISSING' }));
    expect(w.rows(macroTables.hookCall.name)).toEqual([]);
    const r = writeHook(w.ctx, '16', 'WIRE_ITEM', { key: 'k' }, 'cwk_WORLD_3');
    expect(w.rows(macroTables.hookCall.name) as HookCall[]).toEqual([r]);
  });
  it('(4) static: no write of mac.hookCall in packages/engine/macro outside rules/hooks.ts', () => {
    expect(hookCallWriters(sources(), (f) => readFileSync(f, 'utf8'))).toEqual(['rules/hooks.ts']);
  });
  it('(4) the scan catches a direct put, multi-line and with a type argument', () => {
    const fake = { 'a.ts': "s.put<HookCall>(\n  macroTables.hookCall.name, { id })", 'b.ts': "ctx.store.put('mac.hookCall', r)", 'c.ts': 'store.index(macroTables.hookCall.name, "owner", o)' } as Record<string, string>;
    expect(hookCallWriters(Object.keys(fake).map((k) => join(ROOT, k)), (f) => fake[relative(ROOT, f)]!)).toEqual(['a.ts', 'b.ts']);
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
