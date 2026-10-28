import { describe, expect, it } from 'vitest';
import { assertNoHiddenFields } from '../events';
import { BLOC_ORDER, macroTables, type PublicMacroView } from '../schema';
import { seed03, setNow, viewer, viewWorld } from '../testkit/viewWorld';
import { refreshPublicView } from './publicView';
import { MACRO_SCREEN_VIEWS } from './screens';
import { mirrorStabilizer, publishMsi, weeklyStabReport, NULL_STAB_REPORT } from './stabReport';

const D = 720;
const argsFor = (id: string, b: string): unknown[] => ({
  'macro.calendar': [{ fromDay: 0, toDay: 400 }], 'macro.dashboard': [{ bloc: b }, { bloc: 'ALL' }], 'macro.cb': [{ bloc: b }], 'macro.rates': [{ bloc: b }, { bloc: 'ALL' }],
  'macro.sovereigns': [{ bloc: b }, { bloc: 'ALL' }], 'macro.system': [{}], 'macro.stabilizer': [{}], 'macro.auctionTicket': [{ auctionId: `auc_${b}` }],
  'macro.bankConsole': [{ bankId: 'bank_1', tab: 'CENTRAL_BANK' }], 'macro.dealerLeague': [{ bloc: b, quarter: 0 }] } as Record<string, unknown[]>)[id]!;

describe('T04-19 public view', () => {
  it('04#15: no hidden field in any public_view row, PUBLIC stab event or view output over a game year of weekly calls; negative control', () => {
    const w = viewWorld(0);
    w.put(macroTables.bid.name, { id: 'b1', bidId: 'b1', auctionId: 'auc_FDL', bidderId: 'bank_1', kind: 'COMPETITIVE', yieldBp: 300, face: 10n, cashHoldId: 'h', submittedTick: 1, primaryDealer: false } as never);
    w.put(macroTables.auction.name, { id: 'auc_FDL', govId: 'gov_FDL', assetId: 'a', tenor: 'N10Y', reopening: false, announceTick: 0, bidOpenTick: 0, auctionTick: 50 * D,
      offeredFace: 100n, whenIssuedYield: 0.03, bids: [{ bidderId: 'x' }] } as never);
    let checked = 0;
    for (let wk = 0; wk < 52; wk++) {
      const t = wk * 7 * D + 45;
      seed03(w, Math.max(wk * 7 - 1, 0)); setNow(w, t);
      mirrorStabilizer(w.ctx); publishMsi(w.ctx); weeklyStabReport(w.ctx, NULL_STAB_REPORT);
      for (const b of BLOC_ORDER) {
        expect(assertNoHiddenFields(refreshPublicView(w.ctx, b))).toEqual([]);
        for (const v of MACRO_SCREEN_VIEWS) for (const a of argsFor(v.id, b)) {
          for (const who of [viewer('bank_1'), viewer('other')]) { expect(assertNoHiddenFields(v.run(w.ctx.store, v.schema.parse(a), who))).toEqual([]); checked++; }
        }
      }
    }
    for (const e of w.events.filter((x) => x.vis === 'PUBLIC')) expect(assertNoHiddenFields(e.payload)).toEqual([]);
    expect(checked).toBeGreaterThan(52 * 5 * 10);
    expect(w.events.filter((x) => x.kind === 'macro.stab.report').length).toBe(51);
    const p = { ...(w.events.find((x) => x.kind === 'macro.stab.report')!.payload as object), hHat: 0.4 };
    expect(assertNoHiddenFields(p)).toEqual(['hHat']);
  });
  it('refresh leaves prints, curve, ois, breakeven10y, termPremium10y and the cycle label unchanged; copies the public fields', () => {
    const w = viewWorld(100);
    const prev = { ...w.ctx.store.get<PublicMacroView>(macroTables.publicView.name, 'EUN')!, prints: { CPI: { kind: 'CPI', tick: 5, actual: 0.02, consensus: 0.02, prior: 0.01, surprise: 0, extra: {} } } };
    w.put(macroTables.publicView.name, prev as never);
    w.put(macroTables.schedule.name, { id: 'EUN:CB_DECISION:900', bloc: 'EUN', kind: 'CB_DECISION' } as never);
    w.put(macroTables.schedule.name, { id: 'EUN:CB_DECISION:50', bloc: 'EUN', kind: 'CB_DECISION' } as never);
    w.put(macroTables.schedule.name, { id: 'EUN:CB_GUIDANCE:800', bloc: 'EUN', kind: 'CB_GUIDANCE' } as never);
    w.put(macroTables.schedule.name, { id: 'FDL:CB_DECISION:200', bloc: 'FDL', kind: 'CB_DECISION' } as never);
    const r = refreshPublicView(w.ctx, 'EUN');
    for (const k of ['prints', 'curve', 'ois', 'breakeven10y', 'termPremium10y', 'cycleLabel', 'cycleLabelSinceDay'] as const) expect(r[k]).toEqual(prev[k]);
    expect(r.asOfTick).toBe(100);
    expect(r.nextMeeting).toEqual({ tick: 900, guidanceTick: 800 });
    expect([r.policyRate, r.depositRate, r.lendingRate, r.reserveRequirement]).toEqual([0.03, 0.0275, 0.0325, 0.01]);
    expect([r.sovereignSpread10y, r.sovereignPd1y, r.credibilityPublic, r.ccyb]).toEqual([0.004, 0.01, 0.8, 0.01]);
    expect(r.marketImpliedPath).toEqual([{ horizonQuarters: 4, rate: 0.031 }]);
    expect(r.fx).toEqual({ spotVsFdl: r.fx.spotVsFdl, regime: 'FLOAT', reservesFdl: '5000000000000000', reserveCoverMonths: 6, capitalControls: 0 });
    expect(r.fiscalPrints).toEqual(prev.fiscalPrints);   // no FISCAL print: previous row kept
    expect(w.ctx.store.get(macroTables.publicView.name, 'EUN')).toEqual(r);
  });
  it('fiscalPrints come from the FISCAL print, guidance only once published', () => {
    const w = viewWorld(100 * D);
    const v = w.ctx.store.get<PublicMacroView>(macroTables.publicView.name, 'SRL')!;
    w.put(macroTables.publicView.name, { ...v, prints: { ...v.prints, FISCAL: { kind: 'FISCAL', tick: 95 * D, actual: 0.04, consensus: 0, prior: 0, surprise: 0, extra: { debtGdp: 0.9, primaryBalanceGdp: -0.01 } } } } as never);
    const cb = w.ctx.store.get<object>(macroTables.cb.name, 'cbk_SRL')!;
    w.put(macroTables.cb.name, { ...cb, guidance: { meetingId: 'm', tick: 100 * D + 1, score: 0.5, impliedMove: 1, textKey: 'k' } } as never);
    const r = refreshPublicView(w.ctx, 'SRL');
    expect(r.fiscalPrints).toEqual({ deficitGdp: 0.04, debtGdp: 0.9, primaryBalanceGdp: -0.01, asOfQuarter: 1 });
    expect(r.guidance).toBeNull();
    setNow(w, 100 * D + 1);
    expect(refreshPublicView(w.ctx, 'SRL').guidance).toEqual({ tick: 100 * D + 1, score: 0.5, text: 'k' });
  });
});
