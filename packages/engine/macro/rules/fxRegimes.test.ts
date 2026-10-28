import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dmath, sessionState, TICKS_PER_GAME_DAY as D, type Tick } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from '../blocs';
import type { MacroPorts } from '../ports';
import { macroTables, type BlocId, type FxState, type NpcPoolOrder } from '../schema';
import { cbRow, M, stubPorts } from '../testkit/cbWorld';
import { fiscalWorld, putBloc } from '../testkit/fiscalWorld';
import { isTradingDay } from '@tycoon/engine-core';
import { tradingDaysOfPeriod } from './calendar';
import { sovSpread } from './sovCredit';
import { stepCapitalControls } from './capitalControls';
import { importsMonthFdl } from './fxReserves';
import { bandCenter, bandOrders, breakRuleCheck, coordinatedOrders, emp, executeBreak, fxPair, managedFloatOrders, pegBreakBack, pegOrders, pegPolicyRate, stepFxDay } from './fxRegimes';

const calls = vi.hoisted(() => ({ meet: [] as unknown[][], rr: [] as unknown[][] }));
vi.mock('./cb', () => ({ runMeeting: (_c: unknown, ...a: unknown[]) => { calls.meet.push(a); return {}; } }));
vi.mock('./reserves', () => ({ adjustRr: (_c: unknown, ...a: unknown[]) => { calls.rr.push(a); } }));
/** E-106 (2) bookCbkFdl runs for real except in fixtures that pin reserves at a set level for the EMP / break-back rules (mirror.on = false;
 *  the CA-absorption mirror is covered by AC-04-20-RESMIRROR and AC-04-18-CAPFLOW). */
const mirror = vi.hoisted(() => ({ on: true }));
vi.mock('./fxReserves', async (orig) => {
  const m = await orig<typeof import('./fxReserves')>();
  return { ...m, bookCbkFdl: (...a: Parameters<typeof m.bookCbkFdl>) => (mirror.on ? m.bookCbkFdl(...a) : undefined) };
});
beforeEach(() => { calls.meet.length = 0; calls.rr.length = 0; mirror.on = true; });

const GDP: Record<BlocId, number> = { FDL: 40e12, EUN: 25e12, PYN: 10e12, NKR: 10e12, SRL: 15e12 };
type X = 'EUN' | 'PYN' | 'NKR' | 'SRL';
const ADV = 1e9;
const fxRow = (c: BlocId, o: Partial<FxState> = {}): FxState => ({ ccy: c, fairValueLn: dmath.ln(BLOC_DEFAULTS[c].fx0), pppLn: dmath.ln(BLOC_DEFAULTS[c].fx0), realExchangeGap: 0,
  regime: 'FREE_FLOAT', reservesFdl: 0n, reservesTarget: 0n, reserveCoverMonths: 10, currentAccountGdp: 0, capitalFlowIndex: 0, exchangeMarketPressure: 0, capitalControls: 0,
  interventionToday: 0n, crisisFlag: false, ...o }) as FxState;
type W = ReturnType<typeof fiscalWorld> & { spot: Record<string, number>; ports: MacroPorts };
function world(t0: Tick, o: { hazard?: number; core?: number; meetings?: Partial<Record<BlocId, Tick[]>>; fdlRes?: Partial<Record<BlocId, bigint>> } = {}): W {
  const w = fiscalWorld(t0) as W;
  w.spot = { EUN: 1.1, PYN: 0.15, NKR: 0.095, SRL: 0.2 };
  for (const b of Object.keys(GDP) as BlocId[]) {
    putBloc(w, b, { gdp: GDP[b] });
    const row = w.ctx.store.get<Record<string, unknown>>(macroTables.bloc.name, b)!;
    w.put(macroTables.bloc.name, { ...row, cpiLevel: 100, coreInflation: o.core ?? 0.02, sovereign: { spread10y: 0, hazard: b === 'SRL' ? o.hazard ?? 0.1 : 0.01 }, fx: fxRow(b) } as never);
    w.put(macroTables.publicView.name, { id: b, bloc: b, fx: { spotVsFdl: b === 'FDL' ? 1 : w.spot[b] } } as never);
    w.put(macroTables.cb.name, cbRow(b, { policyRate: b === 'SRL' ? 0.095 : 0.03, credibility: 0.8, meetings: { scheduledTicks: o.meetings?.[b] ?? [] },
      reserves: { fdl: o.fdlRes?.[b] ?? 0n, gold: 0n, otherFx: {} } } as never));
  }
  w.put(macroTables.curve.name, { id: 'FDL', nsOis: { L: 0.04, S: 0, C: 0, lambda: 1 } } as never);
  const d = stubPorts();
  w.ports = { ...d, markets: { ...d.markets, fxSpot: (_s, c) => (c === 'FDL' ? 1 : w.spot[c] ?? null), lineAdv: () => ADV, makerHalfSpread: () => 0 } };
  return w;
}
const fxOf = (w: W, b: BlocId) => w.ctx.store.get<{ fx: FxState }>(macroTables.bloc.name, b)!.fx;
const setFx = (w: W, b: BlocId, o: Partial<FxState>) => { const r = w.ctx.store.get<Record<string, unknown>>(macroTables.bloc.name, b)!; w.put(macroTables.bloc.name, { ...r, fx: { ...fxOf(w, b), ...o } } as never); };
const cont = (b: BlocId, day: number) => { for (let t = day * D; t < day * D + D; t++) if (sessionState('BLOC_LISTED', t, { bloc: b, holidayFxDepthMult: 1 }).state === 'CONTINUOUS') return t; return -1; };
const firstTradingDay = (b: BlocId, from: number) => tradingDaysOfPeriod(b, from, 30)[0]!;
const close = (w: W, day: number) => { w.setTick(day * D + 700); stepFxDay(w.ctx, w.ports); };
/** FDL per X at an order's limit. */
const fdlPerX = (o: NpcPoolOrder, c: X) => (fxPair(c).xBase ? Number(o.limitPrice) / 1e6 : 1e6 / Number(o.limitPrice));
const buysX = (o: NpcPoolOrder, c: X) => (o.side === 'BUY') === fxPair(c).xBase;

describe('T04-14 FX regimes', () => {
  it('band centre: EUN unchanged, NKR 0.095 → 0.09 → c − c0 = −0.010813', () => {
    expect(bandCenter(0.5, 1.1, 1.1, 0.09, 0.095) - 0.5).toBeCloseTo(-0.010813, 6);
    expect(bandCenter(0, 1.21, 1.1, 0.095, 0.095)).toBeCloseTo(0.3 * Math.log(1.1), 12);
  });
  it('edge orders are 2 × ADV; the outer-zone lean at 90% of the half-width is 0.05 × ADV × 0.5; the BUY edge is bounded by FDL reserves', () => {
    const day = firstTradingDay('PYN', 100), w = world(cont('PYN', day), { fdlRes: { PYN: M(1e12) } }), c = Math.log(0.15);
    setFx(w, 'PYN', { regime: 'MANAGED_BAND', band: { centerLn: c, halfWidth: 0.03, basket: {} } });
    w.spot.PYN = Math.exp(c - 0.9 * 0.03);
    const os = bandOrders(w.ctx.store, w.ports, w.ctx.tick);
    expect(os.map((o) => [o.purpose, o.tif, buysX(o, 'PYN'), o.qty])).toEqual([['FX_BAND', 'RESTING', false, BigInt(2 * ADV)], ['FX_BAND', 'RESTING', true, BigInt(2 * ADV)],
      ['FX_LEAN', 'TICK', true, BigInt(0.05 * ADV * 0.5)]]);
    expect(fdlPerX(os[0]!, 'PYN')).toBeCloseTo(Math.exp(c + 0.03), 7);
    expect(fdlPerX(os[1]!, 'PYN')).toBeCloseTo(Math.exp(c - 0.03), 7);
    expect(os.every((o) => o.poolId === 'CB:PYN' && o.assetId === 'ast_FX_FDLPYN')).toBe(true);
    w.spot.PYN = Math.exp(c + 0.95 * 0.03);
    expect(bandOrders(w.ctx.store, w.ports, w.ctx.tick).map((o) => [o.purpose, buysX(o, 'PYN'), o.qty])[2]).toEqual(['FX_LEAN', false, BigInt(0.05 * ADV * 0.75)]);
    w.spot.PYN = Math.exp(c + 0.79 * 0.03);
    expect(bandOrders(w.ctx.store, w.ports, w.ctx.tick)).toHaveLength(2);
    w.put(macroTables.cb.name, { ...cbRow('PYN'), reserves: { fdl: 5n, gold: 0n, otherFx: {} }, meetings: { scheduledTicks: [] } } as never);
    expect(bandOrders(w.ctx.store, w.ports, w.ctx.tick).filter((o) => buysX(o, 'PYN')).map((o) => o.qty)).toEqual([5n]);
    w.setTick(day * D + 700);
    expect(bandOrders(w.ctx.store, w.ports, w.ctx.tick)).toEqual([]);
  });
  it('04#29 the PYN band holds within ±3% under 1.5 × ADV selling per tick; realignment waits for the next PYN meeting, then c0 moves by ln 0.97 once', () => {
    const d0 = 100, meet = firstTradingDay('PYN', d0 + 91), c0 = Math.log(0.15);
    const w = world(d0 * D, { meetings: { PYN: [meet * D + 30, (meet + 91) * D + 30] } });
    w.put(macroTables.cb.name, { ...w.ctx.store.get<object>(macroTables.cb.name, cbkId('PYN'))!, reserves: { fdl: importsMonthFdl(w.ctx.store, 'PYN') * 9n / 2n, gold: 0n, otherFx: {} } } as never);
    setFx(w, 'PYN', { regime: 'MANAGED_BAND', band: { centerLn: c0, halfWidth: 0.03, basket: {} }, bandC0: c0 });
    const k = 0.0004;
    let worst = 0, c0AtMeetMinus1 = NaN;
    const realigned: number[] = [];
    for (let day = d0; day < d0 + 120; day++) {
      for (let t = day * D; t <= day * D + 539; t++) {
        w.setTick(t);
        const os = bandOrders(w.ctx.store, w.ports, t);
        if (os.length === 0) continue;
        const floor = Math.log(fdlPerX(os.find((o) => buysX(o, 'PYN'))!, 'PYN'));
        const lnS = Math.max(Math.log(w.spot.PYN!) - k * 1.5, floor);   // the 2 × ADV resting bid absorbs the 1.5 × ADV flow at the edge
        w.spot.PYN = Math.exp(lnS);
        worst = Math.max(worst, Math.abs(lnS - fxOf(w, 'PYN').band!.centerLn));
      }
      const before = fxOf(w, 'PYN').bandC0!;
      close(w, day);
      if (fxOf(w, 'PYN').bandC0! !== before) realigned.push(day);
      if (day === meet - 1) c0AtMeetMinus1 = fxOf(w, 'PYN').bandC0!;
    }
    expect(worst).toBeLessThanOrEqual(0.03 + 1e-7);
    expect(c0AtMeetMinus1).toBe(c0);
    expect(realigned).toEqual([meet]);
    expect(fxOf(w, 'PYN').bandC0! - c0).toBeCloseTo(Math.log(0.97), 12);
    expect(fxOf(w, 'PYN').reserveCoverMonths).toBeGreaterThanOrEqual(3);
    expect(w.events.filter((e) => e.kind === 'macro.fx.regime')).toHaveLength(1);
    expect(w.events.some((e) => e.kind === 'macro.fx.intervention.daily')).toBe(true);
  });
  it('EMP sums the three standardised 5-day terms; σ 0 or reserves 0 drop a term', () => {
    expect(emp(-0.02, 0.01, -5, 100, 0.005)).toBeCloseTo(3.5, 12);
    expect(emp(-0.02, 0, -5, 0, 0.005)).toBeCloseTo(0.5, 12);
  });

  function attack(hazard: number, u = 0.5) {
    mirror.on = false;   // reserves held at R (fixture), see the mirror note above
    const d0 = firstTradingDay('SRL', 100), w = world(d0 * D, { hazard });
    Object.assign(w.ctx, { rng: () => ({ uOpen: () => u, normal: () => 0 }) });
    const imp = importsMonthFdl(w.ctx.store, 'SRL'), R = imp * 29n / 10n, R5 = R * 9n / 8n;
    w.put(macroTables.cb.name, { ...w.ctx.store.get<object>(macroTables.cb.name, cbkId('SRL'))!, reserves: { fdl: R, gold: 0n, otherFx: {} } } as never);
    setFx(w, 'SRL', { regime: 'MANAGED_FLOAT', hist: Array.from({ length: 10 }, () => ({ lnS: Math.log(0.2), res: R5, i: 0.095 })) });
    const days = tradingDaysOfPeriod('SRL', d0, 30);
    for (let k = 0; k < 4; k++) close(w, days[k]!);
    expect(fxOf(w, 'SRL').breakArmed).toBe(false);
    close(w, days[4]!);
    const fx = fxOf(w, 'SRL');
    expect([fx.reserveCoverMonths, fx.exchangeMarketPressure, fx.empDays, fx.breakArmed]).toEqual([2.9, 2.5, 5, true]);
    w.setTick(days[5]! * D + 44);
    expect(breakRuleCheck(w.ctx, 'SRL', w.ports)).toBeNull();
    w.setTick(days[5]! * D + 45);
    return { w, f0: fx.fairValueLn, out: breakRuleCheck(w.ctx, 'SRL', w.ports) };
  }
  it('04#30 (a) λ 0.20: a Concord program at the next t = 45, no break', () => {
    const { w, out } = attack(0.2);
    expect(out).toBe('CONCORD');
    expect(fxOf(w, 'SRL').regime).toBe('MANAGED_FLOAT');
    expect(fxOf(w, 'SRL').breakArmed).toBe(false);
    expect(w.events.filter((e) => e.kind === 'macro.csf.program')).toHaveLength(1);
    expect(w.events.some((e) => e.kind === 'macro.fx.regime')).toBe(false);
  });
  it('04#30 (b) λ 0.30: break to FREE_FLOAT, drop in [0.2592, 0.3935], controls 2 for 2,160 ticks then 1 for 20,160, emergency meeting', () => {
    const { w, f0, out } = attack(0.3);
    expect(out).toBe('BREAK');
    const fx = fxOf(w, 'SRL'), drop = 1 - Math.exp(fx.fairValueLn - f0);
    expect(fx.regime).toBe('FREE_FLOAT');
    expect(drop).toBeGreaterThanOrEqual(0.2592); expect(drop).toBeLessThanOrEqual(0.3935);
    expect(1 - Math.exp(-(0.15 + 0.25 * 1.0))).toBeCloseTo(drop, 12);
    expect(calls.meet).toEqual([['SRL', true, ['CURRENCY']]]);
    expect(calls.rr).toEqual([['SRL', 'DEFENCE']]);
    const ev = w.events.find((e) => e.kind === 'macro.fx.regime')!.payload as { old: string; new: string };
    expect([ev.old, ev.new]).toEqual(['MANAGED_FLOAT', 'FREE_FLOAT']);
    const t0 = w.ctx.tick, seen: [number, number][] = [];
    for (let t = t0 + 1; t <= t0 + 1 + 31 * D + 5; t++) {
      w.setTick(t); stepCapitalControls(w.ctx);
      const l = fxOf(w, 'SRL').capitalControls;
      if (seen.length === 0 || seen[seen.length - 1]![1] !== l) seen.push([t - t0 - 1, l]);
    }
    expect(seen).toEqual([[0, 2], [2160, 1], [2160 + 20160, 0]]);
  });
  it('break severity spans 0.6 → 25.92% to 1.4 → 39.35%; band and peg breaks cost PEG_BREAK credibility', () => {
    for (const [u, p] of [[0, 0.2592], [1, 0.3935]] as const) {
      const w = world(100 * D);
      Object.assign(w.ctx, { rng: () => ({ uOpen: () => u, normal: () => 0 }) });
      setFx(w, 'PYN', { regime: 'MANAGED_BAND', band: { centerLn: 0, halfWidth: 0.03, basket: {} } });
      const f0 = fxOf(w, 'PYN').fairValueLn;
      executeBreak(w.ctx, 'PYN');
      expect(1 - Math.exp(fxOf(w, 'PYN').fairValueLn - f0)).toBeCloseTo(p, 4);
      expect(fxOf(w, 'PYN').band).toBeUndefined();
      expect(w.ctx.store.get<{ credibility: number }>(macroTables.cb.name, cbkId('PYN'))!.credibility).toBeCloseTo(0.7, 12);
      expect(calls.rr).toEqual([]);
    }
  });
  it('peg break-back: FDL reserves < 0.8 × M0 × spot breaks a hard peg to FREE_FLOAT; equality holds the peg; a float is untouched', () => {
    expect(pegBreakBack(M(1e9), M(6.25e9), 0.2)).toBe(false);
    expect(pegBreakBack(M(1e9), M(6.25e9) + 10n, 0.2)).toBe(true);
    mirror.on = false;   // reserves held at 1e9 at the read (fixture)
    for (const [m0, regime, want] of [[6.25e9, 'HARD_PEG', 'HARD_PEG'], [6.3e9, 'HARD_PEG', 'FREE_FLOAT'], [6.3e9, 'FREE_FLOAT', 'FREE_FLOAT']] as const) {
      const w = world(100 * D, { fdlRes: { SRL: M(1e9) } });
      w.m0.SRL = M(m0); Object.assign(w.ctx, { rng: () => ({ uOpen: () => 0.5, normal: () => 0 }) });
      setFx(w, 'SRL', regime === 'HARD_PEG' ? { regime, pegLn: Math.log(0.2) } : { regime });
      close(w, 100);
      expect(fxOf(w, 'SRL').regime).toBe(want);
      expect(fxOf(w, 'SRL').breakTick).toBe(want !== regime ? w.ctx.tick : undefined);
    }
  });
  it('hard peg: π_core 0.26 for 91 days after a break → peg at the next meeting at the then-spot; peg orders ±0.001, SELL 10 × ADV', () => {
    const d0 = 100, early = firstTradingDay('SRL', d0 + 60), late = firstTradingDay('SRL', d0 + 92);
    const w = world(d0 * D, { core: 0.26, meetings: { SRL: [early * D + 30, late * D + 30] }, fdlRes: { SRL: M(1e9) } });
    setFx(w, 'SRL', { breakTick: d0 * D - 1 });
    for (let d = d0; d <= late; d++) { close(w, d); if (d === early) expect(fxOf(w, 'SRL').regime).toBe('FREE_FLOAT'); }
    const fx = fxOf(w, 'SRL');
    expect(fx.regime).toBe('HARD_PEG');
    expect(fx.pegLn).toBeCloseTo(Math.log(0.2), 12);
    expect(w.events.filter((e) => e.kind === 'macro.fx.regime').map((e) => (e.payload as { new: string }).new)).toEqual(['HARD_PEG']);
    w.setTick(cont('SRL', late + 1));
    const os = pegOrders(w.ctx.store, w.ports, w.ctx.tick);
    expect(os.map((o) => [o.purpose, buysX(o, 'SRL')])).toEqual([['FX_PEG', true], ['FX_PEG', false]]);
    expect(fdlPerX(os[0]!, 'SRL')).toBeCloseTo(0.2 * 0.999, 6);
    expect(fdlPerX(os[1]!, 'SRL')).toBeCloseTo(0.2 * 1.001, 6);
    expect(os[1]!.qty).toBe(BigInt(10 * ADV));
    expect(os[0]!.qty).toBe(M(1e9));
  });
  it('no peg when core inflation dips before 91 days; the peg rate is i_FDL + s_sov(0.25)', () => {
    const d0 = 100, late = firstTradingDay('SRL', d0 + 92), w = world(d0 * D, { core: 0.26, meetings: { SRL: [late * D + 30] } });
    setFx(w, 'SRL', { breakTick: d0 * D - 1 });
    for (let d = d0; d <= late; d++) {
      if (d === d0 + 50) { const r = w.ctx.store.get<Record<string, unknown>>(macroTables.bloc.name, 'SRL')!; w.put(macroTables.bloc.name, { ...r, coreInflation: 0.25 } as never); }
      if (d === d0 + 51) { const r = w.ctx.store.get<Record<string, unknown>>(macroTables.bloc.name, 'SRL')!; w.put(macroTables.bloc.name, { ...r, coreInflation: 0.26 } as never); }
      close(w, d);
    }
    expect(fxOf(w, 'SRL').regime).toBe('FREE_FLOAT');
    expect(pegPolicyRate(w.ctx.store, 'SRL')).toBeCloseTo(0.03 + sovSpread(0.25, 0.1, 0.6), 12);
  });
  it('managed float leans against a 5-day move above 4% with 2% of reserves per trading day; coordination needs a major event and a 25% gap', () => {
    const day = firstTradingDay('SRL', 100), w = world(cont('SRL', day));
    setFx(w, 'SRL', { regime: 'MANAGED_FLOAT', reservesFdl: M(1e9), reserveCoverMonths: 5, hist: Array.from({ length: 5 }, () => ({ lnS: Math.log(0.2), res: 0n, i: 0 })) });
    w.spot.SRL = 0.2 * Math.exp(-0.041);
    const os = managedFloatOrders(w.ctx.store, w.ports, w.ctx.tick);
    expect(os.map((o) => [o.purpose, o.tif, buysX(o, 'SRL')])).toEqual([['FX_LEAN', 'TICK', true]]);
    let n = 0;
    for (let t = day * D; t <= day * D + 539; t++) if (sessionState('BLOC_LISTED', t, { bloc: 'SRL', holidayFxDepthMult: 1 }).state === 'CONTINUOUS') n++;
    expect(Number(os[0]!.qty)).toBeCloseTo(0.02 * 1e15 / n, -1);
    w.spot.SRL = 0.2 * Math.exp(-0.039);
    expect(managedFloatOrders(w.ctx.store, w.ports, w.ctx.tick)).toEqual([]);
    w.spot.SRL = 0.2 * Math.exp(0.041);
    expect(managedFloatOrders(w.ctx.store, w.ports, w.ctx.tick).map((o) => buysX(o, 'SRL'))).toEqual([false]);
    setFx(w, 'SRL', { reserveCoverMonths: 2.9 });
    expect(managedFloatOrders(w.ctx.store, w.ports, w.ctx.tick)).toEqual([]);

    setFx(w, 'EUN', { reservesFdl: M(1e9) });
    w.spot.EUN = 1.1 * 0.74;
    expect(coordinatedOrders(w.ctx.store, w.ports, w.ctx.tick)).toEqual([]);
    w.put(macroTables.global.name, { id: 'GLOBAL', riskAppetite: 0, energyIndex: 100, scheduler: { activeMajorId: null } } as never);
    expect(coordinatedOrders(w.ctx.store, w.ports, w.ctx.tick)).toEqual([]);
    w.put(macroTables.global.name, { id: 'GLOBAL', riskAppetite: 0, energyIndex: 100, scheduler: { activeMajorId: 'wev_1' } } as never);
    const co = coordinatedOrders(w.ctx.store, w.ports, w.ctx.tick);
    expect(co.map((o) => [o.purpose, o.assetId, o.side])).toEqual([['FX_COORD', 'ast_FX_EUNFDL', 'BUY']]);
    w.spot.EUN = 1.1 * 0.76;
    expect(coordinatedOrders(w.ctx.store, w.ports, w.ctx.tick)).toEqual([]);
  });
  it('day close: CA absorbed through the ledger only for managed regimes; weak-edge days count within 0.005; PYN cover < 3 widens the band to ±6%', () => {
    const day = firstTradingDay('PYN', 100), w = world(day * D), c = Math.log(0.15);
    setFx(w, 'PYN', { regime: 'MANAGED_BAND', band: { centerLn: c, halfWidth: 0.03, basket: {} }, bandC0: c });
    setFx(w, 'SRL', { regime: 'MANAGED_FLOAT' });
    w.put(macroTables.cb.name, { ...w.ctx.store.get<object>(macroTables.cb.name, cbkId('PYN'))!, reserves: { fdl: importsMonthFdl(w.ctx.store, 'PYN') * 4n, gold: 0n, otherFx: {} } } as never);
    w.spot.PYN = Math.exp(c - 0.03 + 0.004);
    close(w, day);
    expect(fxOf(w, 'PYN').weakEdgeDays).toBe(1);
    const abs = w.posts.filter((p) => p.code === 'MAC_FX_CA_ABSORB');
    expect([...new Set(abs.map((p) => p.from))].sort()).toEqual([cbkId('PYN'), cbkId('SRL'), 'row'].sort());
    for (const b of ['PYN', 'SRL'] as const) {
      const ca = fxOf(w, b).currentAccountGdp, first = abs.find((p) => p.from === cbkId(b))!;
      expect(first.ccy).toBe(ca > 0 ? b : 'FDL');
      if (ca < 0) expect(Number(first.amt)).toBeCloseTo(-GDP[b] * BLOC_DEFAULTS[b].fx0 * 1e6 * ca / 364 * (w.spot[b]! / BLOC_DEFAULTS[b].fx0), -3);
    }
    const next = tradingDaysOfPeriod('PYN', day + 1, 30)[0]!;
    w.spot.PYN = Math.exp(c - 0.03 + 0.006);
    w.put(macroTables.cb.name, { ...w.ctx.store.get<object>(macroTables.cb.name, cbkId('PYN'))!, reserves: { fdl: importsMonthFdl(w.ctx.store, 'PYN') * 2n, gold: 0n, otherFx: {} } } as never);
    close(w, next);
    expect(fxOf(w, 'PYN').weakEdgeDays).toBe(0);
    expect(fxOf(w, 'PYN').band!.halfWidth).toBe(0.06);
    expect(calls.meet).toEqual([['PYN', true, ['CURRENCY']]]);
    expect(w.events.filter((e) => e.kind === 'macro.fx.regime')).toHaveLength(1);
  });
});

describe('AC-04-18-CAPFLOW (E-104 (1), E-106 (5)): capital_flow drains a managed regime\'s FDL reserves', () => {
  const K = 0.15;
  const step = (id: string, value: number, a: number, b: number) => ({ id, target: 'capital_flow', value, startTick: a, endTick: b, shape: 'STEP' as const });
  const setShocks = (w: W, b: BlocId, shocks: unknown[]) => { const r = w.ctx.store.get<Record<string, unknown>>(macroTables.bloc.name, b)!; w.put(macroTables.bloc.name, { ...r, shocks } as never); };
  const resOf = (w: W, b: BlocId) => w.ctx.store.get<{ reserves: { fdl: bigint } }>(macroTables.cb.name, cbkId(b))!.reserves.fdl;
  const setRes = (w: W, b: BlocId, fdl: bigint) => w.put(macroTables.cb.name, { ...w.ctx.store.get<object>(macroTables.cb.name, cbkId(b))!, reserves: { fdl, gold: 0n, otherFx: {} } } as never);
  const cf = (w: W) => w.posts.filter((p) => p.code === 'MAC_FX_CAPITAL_FLOW');
  /** Net FDL into cbk_SRL from MAC_FX_CA_ABSORB posts from index k0 (absorption runs before capital_flow on the same close, E-106 (2)). */
  const caIn = (w: W, k0: number) => w.posts.slice(k0).filter((p) => p.code === 'MAC_FX_CA_ABSORB' && p.ccy === 'FDL')
    .reduce((a, p) => a + (p.to === cbkId('SRL') ? p.amt : p.from === cbkId('SRL') ? -p.amt : 0n), 0n);
  /** round half-even of R × rate, the rate carried at 1e-12 */
  const expected = (R: bigint, rate: number) => { const q = R * BigInt(Math.round(rate * 1e12)), d = 1_000_000_000_000n, f = q / d, r = q - f * d; return 2n * r > d || (2n * r === d && f % 2n === 1n) ? f + 1n : f; };
  /** Precursor −0.2 for 8 days, trigger −0.8 for 30, SRL MANAGED_FLOAT at cover 11 with λ 0.30 (no Concord). The balance stub applies the
   *  MAC_FX_CAPITAL_FLOW / MAC_FX_CA_ABSORB FDL legs to cb.reserves as they post (E-106 (2) bookCbkFdl, no test stub). Dispatch's t = 45 call is
   *  breakRuleCheck at t = 45 of every day. */
  function attack(d0: number) {
    const w = world(d0 * D, { hazard: 0.3 }), trig = d0 + 8, imp = importsMonthFdl(w.ctx.store, 'SRL');
    Object.assign(w.ctx, { rng: () => ({ uOpen: () => 0.5, normal: () => 0 }) });
    setFx(w, 'SRL', { regime: 'MANAGED_FLOAT' });
    setRes(w, 'SRL', imp * 11n);
    setShocks(w, 'SRL', [step('p', -0.2, d0 * D, trig * D), step('t', -0.8, trig * D, (trig + 30) * D)]);
    const log: { day: number; trading: boolean; R: bigint; n: number; amt: bigint | null; cover: number; emp: number; armed: boolean }[] = [];
    let breakDay: number | null = null;
    for (let d = d0; d < trig + 30 && breakDay === null; d++) {
      w.setTick(d * D + 45);
      if (breakRuleCheck(w.ctx, 'SRL', w.ports) === 'BREAK') { breakDay = d - trig; break; }
      const R0 = resOf(w, 'SRL'), k0 = cf(w).length, p0 = w.posts.length;
      close(w, d);
      const R = R0 + caIn(w, p0);
      const legs = cf(w).slice(k0), out = legs.filter((p) => p.from === cbkId('SRL') && p.ccy === 'FDL');
      const fx = fxOf(w, 'SRL');
      log.push({ day: d, trading: isTradingDay('SRL', d), R, n: legs.length / 2, amt: out[0]?.amt ?? null, cover: fx.reserveCoverMonths, emp: fx.exchangeMarketPressure, armed: !!fx.breakArmed });
    }
    return { w, trig, log, breakDay, imp };
  }
  it('each SRL trading-day close posts one sale of 0.15 × 0.8 × reserves (0.03× in the precursor); none on non-trading days', () => {
    const { log, trig } = attack(firstTradingDay('SRL', 100));
    expect(log.length).toBeGreaterThan(10);
    for (const l of log) {
      if (!l.trading) { expect([l.n, l.amt]).toEqual([0, null]); continue; }
      expect(l.n).toBe(1);
      expect(l.amt).toBe(expected(l.R, K * (l.day < trig ? 0.2 : 0.8)));
    }
    expect(log.some((l) => l.trading && l.day < trig)).toBe(true);
    expect(Number(log.find((l) => l.trading && l.day >= trig)!.amt) / 1e6).toBeCloseTo(0.12 * Number(log.find((l) => l.trading && l.day >= trig)!.R) / 1e6, 0);
  });
  it('cover first < 3, then 5 closes with EMP > 2 arm the break; the t = 45 call breaks 16 to 22 game days after trigger over the 7 start weekdays', () => {
    const first = firstTradingDay('SRL', 100), breaks: number[] = [];
    for (let k = 0; k < 7; k++) {
      const { log, breakDay } = attack(first + k), t = log.filter((l) => l.trading);
      const i = t.findIndex((l) => l.cover < 3), j = t.findIndex((l) => l.armed);
      expect(i).toBeGreaterThan(0);
      expect(j).toBe(i + 4);
      for (const l of t.slice(i, j + 1)) expect(l.emp).toBeGreaterThan(2);
      expect(t.slice(0, i).every((l) => !l.armed)).toBe(true);
      breaks.push(breakDay!);
    }
    expect(Math.min(...breaks)).toBeGreaterThanOrEqual(16);
    expect(Math.max(...breaks)).toBeLessThanOrEqual(22);
    expect(new Set(breaks).size).toBeGreaterThan(1);
  });
  it('Σ > 0 buys at the same rate; FREE_FLOAT → no posting; Σ = 0 → no posting', () => {
    const d = firstTradingDay('SRL', 100), w = world(d * D), R = M(1e9);
    setFx(w, 'SRL', { regime: 'MANAGED_FLOAT' }); setRes(w, 'SRL', R);
    setShocks(w, 'SRL', [step('a', 0.5, d * D, (d + 5) * D), step('b', 0.3, d * D, (d + 5) * D)]);
    close(w, d);
    const buy = cf(w);
    expect(buy.map((p) => [p.from, p.ccy])).toEqual([[cbkId('SRL'), 'SRL'], ['row', 'FDL']]);
    const ca = caIn(w, 0);
    expect(ca).not.toBe(0n);
    expect(buy[1]!.amt).toBe(expected(R + ca, K * 0.8));
    expect(buy[0]!.amt).toBe(buy[1]!.amt * 5n);   // X leg at spot 0.2
    expect(resOf(w, 'SRL')).toBe(R + ca + buy[1]!.amt);   // E-106 (2): both FDL legs mirrored into cb.reserves.fdl
    w.posts.length = 0;
    setShocks(w, 'SRL', [step('a', 0.5, d * D, (d + 5) * D), step('b', -0.5, d * D, (d + 5) * D)]);
    close(w, d);
    expect(cf(w)).toEqual([]);
    setShocks(w, 'SRL', [step('a', -0.8, d * D, (d + 5) * D)]);
    setFx(w, 'SRL', { regime: 'FREE_FLOAT' });
    close(w, d);
    expect(cf(w)).toEqual([]);
  });
});

