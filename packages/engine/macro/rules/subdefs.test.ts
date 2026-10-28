// T04-18 E-35 sub-defs: AC-04-18-SUBDEF-RATE over 1,000 seeded GY (271 chapters), and BANK_RUN_LOCAL on the weakest NPC bank.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_CHAPTER, TICKS_PER_GAME_DAY } from '@tycoon/engine-core';
import { macroTables, type HookCall, type WorldEvent } from '../schema';
import { defaultMacroPorts, type MacroPorts } from '../ports';
import { runChapters, schedWorld, V1 } from '../testkit/schedWorld';
import { SUB_DEFS, subDefOf } from './crisisCatalog';
import { RIPPLE_COMMODITIES, storyShocks } from './shocks';

const D = TICKS_PER_GAME_DAY, CHAPTERS = 271, GD = CHAPTERS * (TICKS_PER_CHAPTER / D)   // 271 × 1,344 GD ≥ 1,000 GY (364,000 GD)
, RATE = 0.1505, RATE_TOL = 0.00165;   // E-104 (2): 1/7 + 1/91 less the cap, cooldown and calendar
interface Rec { tier: string; kind: string; day: number; sub: string; sign: number | null; target: string | null }
function run(subDefs: boolean): Rec[] {
  const w = schedWorld('subdef'), out: Rec[] = [];
  runChapters(w, CHAPTERS, V1, 14, { subDefs, onStart: (ev) => {
    if (ev.tier === 'MAJOR') return;
    let sign: number | null = null, target: string | null = null;
    const v = ev.shocks[0]?.value;
    if (v !== undefined) sign = Math.sign(v);
    for (const h of w.store.iter<HookCall>(macroTables.hookCall.name)) {
      if (h.worldEventId !== ev.id) continue;
      if (h.hook === 'commoditySupplyShock') { sign = Math.sign(h.args['pct'] as number); target = h.args['commodityId'] as string; }
      w.store.del(macroTables.hookCall.name, h.id);
    }
    out.push({ tier: ev.tier, kind: ev.kind, day: Math.floor(ev.precursorStartTick / D), sub: ev.subDef?.key ?? 'generic', sign, target });
  } });
  return out;
}
const on = run(true), off = run(false);
const within3s = (n: number, p: number, k: number): boolean => Math.abs(k - n * p) <= 3 * Math.sqrt(n * p * (1 - p));

describe('AC-04-18-SUBDEF-RATE (1,000 seeded GY)', () => {
  it('onset rate 0.1505 ± 0.00165 per GD (E-104 (2)); onsets (tier, kind, day) identical with and without sub-defs over ≥ 1,000 GY; no sub-def when disabled', () => {
    expect(GD).toBeGreaterThanOrEqual(364_000);
    expect(on.length).toBe(off.length);
    expect(on.map((r) => `${r.tier}:${r.kind}:${r.day}`)).toEqual(off.map((r) => `${r.tier}:${r.kind}:${r.day}`));
    expect(off.every((r) => r.sub === 'generic')).toBe(true);
    expect(Math.abs(on.length / GD - RATE)).toBeLessThanOrEqual(RATE_TOL);
  });
  it('each sub-def share within its kind matches its weight within 3σ', () => {
    for (const kind of ['COMMODITY_SUPPLY', 'SECTOR_SHOCK', 'CREDIT_WOBBLE'] as const) {
      const ofKind = on.filter((r) => r.kind === kind);
      expect(ofKind.length).toBeGreaterThan(100);
      for (const s of SUB_DEFS[kind]!) expect(within3s(ofKind.length, s.w, ofKind.filter((r) => r.sub === s.key).length), `${kind} ${s.key}`).toBe(true);
      const gen = 1 - SUB_DEFS[kind]!.reduce((a, s) => a + s.w, 0);
      expect(within3s(ofKind.length, gen, ofKind.filter((r) => r.sub === 'generic').length), `${kind} generic`).toBe(true);
    }
  });
  it('fixed-sign sub-defs never draw the opposite sign; DROUGHT and CROP_DISEASE hit an agricultural commodity', () => {
    const neg = ['DROUGHT', 'CROP_DISEASE', 'CHIP_FAB', 'RECALL', 'SCANDAL', 'CYBER'];   // supply cut (pct < 0) or negative sector value
    const fixed = on.filter((r) => neg.includes(r.sub));
    expect(fixed.length).toBeGreaterThan(100);
    for (const r of fixed) expect(r.sign, r.sub).toBe(-1);
    for (const r of on.filter((x) => x.sub === 'DROUGHT' || x.sub === 'CROP_DISEASE')) expect(['WHEAT', 'CORN', 'COFFEE', 'COCOA']).toContain(r.target);
    expect(RIPPLE_COMMODITIES.slice(3, 7)).toEqual(['WHEAT', 'CORN', 'COFFEE', 'COCOA']);
    expect(on.filter((r) => r.sub === 'generic' && (r.kind === 'COMMODITY_SUPPLY' || r.kind === 'SECTOR_SHOCK')).some((r) => r.sign === 1)).toBe(true);
  });
});

describe('BANK_RUN_LOCAL', () => {
  const ev = (u: number | null): WorldEvent => ({ id: 'wev_1', tier: 'STORM', kind: 'CREDIT_WOBBLE', blocs: [], sectors: [], assetsHint: [], phase: 'TRIGGER', phaseSinceTick: 0,
    precursorStartTick: 0, triggerTick: 0, plannedEndTick: 30 * D, origin: 'SCHEDULED', severity: 1, shocks: [], publicTitleKey: null, causeChain: [],
    ...(u === null ? {} : { subDef: { key: 'BANK_RUN_LOCAL' as const, u } }) });
  const d = defaultMacroPorts(), ports = { ...d, credit: { ...(d.credit ?? {}), weakestNpcBanks: (_s: unknown, n: number) => ['bk_weak', 'bk_2', 'bk_3'].slice(0, n) } } as MacroPorts;
  const store = schedWorld('br').store;
  it('hits exactly the weakest NPC bank with delta in [−0.20, −0.10]; generic CREDIT_WOBBLE keeps PD ×1.4', () => {
    for (const u of [0, 0.37, 0.999999]) {
      const [h] = storyShocks(ev(u), store, 'TRIGGER', ports);
      expect(h).toMatchObject({ kind: 'HOOK', owner: '07', hook: 'depositConfidenceShock', args: { bankIds: ['bk_weak'] } });
      const delta = (h as unknown as { args: { delta: number } }).args.delta;
      expect(delta).toBeGreaterThanOrEqual(-0.20); expect(delta).toBeLessThanOrEqual(-0.10);
      expect(delta).toBeCloseTo(-(0.10 + 0.10 * u), 12);
    }
    expect(storyShocks(ev(null), store, 'TRIGGER', ports)).toEqual([{ kind: 'HOOK', owner: '07', hook: 'corporatePdMultiplier', args: { bloc: 'WORLD', mult: 1.4, days: 30 } }]);
    expect(storyShocks(ev(0.5), store, 'TRIGGER', { ...d, credit: undefined } as unknown as MacroPorts)[0]).toMatchObject({ hook: 'corporatePdMultiplier' });   // no 07 → generic
  });
  it('subDefOf: buckets and rescaled u', () => {
    expect(subDefOf('CREDIT_WOBBLE', 0.25)).toEqual({ key: 'BANK_RUN_LOCAL', u: 0.5 });
    expect(subDefOf('CREDIT_WOBBLE', 0.5)).toBeNull();
    expect(subDefOf('COMMODITY_SUPPLY', 0.3)?.key).toBe('CROP_DISEASE');
    expect(subDefOf('SECTOR_SHOCK', 0.59)?.key).toBe('DATA_CENTER');
    expect(subDefOf('SECTOR_SHOCK', 0.6)).toBeNull();
    expect(subDefOf('LOCAL_BOOM', 0.1)).toBeNull();
  });
});

describe('sub-def weights (T04-18 card, E-35 §5)', () => {
  it('match the card table exactly, generic = remainder', () => {
    expect(SUB_DEFS.COMMODITY_SUPPLY).toEqual([{ key: 'DROUGHT', w: 0.25 }, { key: 'CROP_DISEASE', w: 0.15 }, { key: 'CHIP_FAB', w: 0.15 }, { key: 'SHIPPING_LANE', w: 0.15 }]);
    expect(SUB_DEFS.SECTOR_SHOCK).toEqual([{ key: 'RECALL', w: 0.2 }, { key: 'SCANDAL', w: 0.15 }, { key: 'CYBER', w: 0.15 }, { key: 'DATA_CENTER', w: 0.1 }]);
    expect(SUB_DEFS.CREDIT_WOBBLE).toEqual([{ key: 'BANK_RUN_LOCAL', w: 0.5 }]);
    expect(subDefOf('COMMODITY_SUPPLY', 0.2499)?.key).toBe('DROUGHT');
    expect(subDefOf('COMMODITY_SUPPLY', 0.25)?.key).toBe('CROP_DISEASE');
    expect(subDefOf('COMMODITY_SUPPLY', 0.71)).toBeNull();
  });
});
