// T04-11 issuance tests (04 §3.10.1–§3.10.2) and AC-04-11-MIXSTUB.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fromMoney, MICRO_N, type Qty } from '@tycoon/engine-core';
import { describe, expect, it } from 'vitest';
import { BLOC_DEFAULTS } from '../blocs';
import { defaultMacroPorts } from '../ports';
import { macroTables, type BlocId, type SovAuction } from '../schema';
import { cbRow, cbWorld, M, type CbWorld } from '../testkit/cbWorld';
import { fiscalState, putBloc } from '../testkit/fiscalWorld';
import { auctionsInQuarter, quarterStartDay, tradingDaysOfPeriod } from './calendar';
import { announceDue, auctionSize, grossFinancingNeed, isBill, ISSUE_MIX, mixOf, newLineCoupon, planQuarter, sovereignAssetId, tenorDays, whenIssuedYield } from './issuance';

const D = 720, QS = 91, F = (x: number): Qty => BigInt(x) * MICRO_N, P = { macro_auction_tick: 330, macro_auction_announce_tick: 420 };
const ports = defaultMacroPorts();
function world(b: BlocId, o: { carry?: Qty } = {}): CbWorld {
  const w = cbWorld([cbRow(b)], QS * D + 10);
  w.nums(P);
  putBloc(w, b, { gdp: 32e12, fiscal: { deficitGdp: 1.4 / 32, spendingGdp: 11 / 32, ...(o.carry ? { shortfallCarry: o.carry } : {}) } });
  w.put(macroTables.issue.name, { id: `ast_SOV_${b}_N2Y_120`, assetId: `ast_SOV_${b}_N2Y_120`, govId: `gov_${b}`, tenor: 'N2Y', ccy: b, couponRate: 0.025, issueTick: 0,
    maturityTick: 120 * D + 330, faceOutstanding: F(500e9), inflationLinked: false, fxDenominated: false, cac: { threshold: 0.75, aggregated: true }, onTheRun: true } as never);
  w.cash[`gov_${b}:${b}`] = M(600e9);
  return w;
}
const auctions = (w: CbWorld): SovAuction[] => w.rows(macroTables.auction.name) as SovAuction[];
const blocRow = (w: CbWorld, b: BlocId) => w.rows(macroTables.bloc.name).find((e) => (e as { id: string }).id === b) as { fiscal: { grossFinancingNeedQuarter: bigint; shortfallCarry?: Qty } };

describe('debt management', () => {
  it('GFN: 350e9 + 500e9 + (846.153846e9 − 600e9) = 1,096.153846e9; N10Y 0.22 over 3 auctions → 80,384,000,000 per auction', () => {
    const g = grossFinancingNeed(fiscalState({ cashBuffer: M(600e9) }), 1.4e12, 11e12, 500e9);
    expect(g).toBeCloseTo(1_096_153_846_153.846, 2);
    expect(auctionSize(g, 0.22, 3)).toBe(F(80_384_000_000));
    expect(auctionSize(g, 0.22, 0)).toBe(0n);
    expect(grossFinancingNeed(fiscalState({ cashBuffer: M(5e12) }), 0, 11e12, 0)).toBe(0);
  });
  it('newLineCoupon floors to the 0.125% grid; asset ids; tenors', () => {
    expect(newLineCoupon(0.03017)).toBe(0.03);
    expect(newLineCoupon(0.03125)).toBe(0.03125);
    expect(newLineCoupon(0.0312499)).toBe(0.03);
    expect(sovereignAssetId('PYN', 'N5Y', 812)).toBe('ast_SOV_PYN_N5Y_812');
    expect([tenorDays('B3M'), tenorDays('B1Y'), tenorDays('N5Y'), tenorDays('N10Y_FDL')]).toEqual([91, 364, 1820, 3640]);
    expect([isBill('B6M'), isBill('N2Y')]).toEqual([true, false]);
  });
  it('mix rows sum to 1; SRL has no N30Y/L10Y and routes 20% to the FX N10Y line', () => {
    for (const m of Object.values(ISSUE_MIX)) expect(Object.values(m).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    expect(mixOf('SRL')).toBe(ISSUE_MIX.SRL); expect(mixOf('PYN')).toBe(ISSUE_MIX.DEFAULT);
  });
  it('planQuarter: rows per schedule, GFN stored, sizes by share/count, bills new lines, notes reopen the on-the-run line; idempotent', () => {
    const w = world('FDL');
    w.put(macroTables.issue.name, { id: 'ast_SOV_FDL_N5Y_300', assetId: 'ast_SOV_FDL_N5Y_300', govId: 'gov_FDL', tenor: 'N5Y', ccy: 'FDL', couponRate: 0.02, issueTick: 0,
      maturityTick: 300 * D + 330, faceOutstanding: F(900e9), inflationLinked: false, fxDenominated: false, cac: { threshold: 0.75, aggregated: true }, onTheRun: false } as never);
    w.put(macroTables.issue.name, { id: 'ast_SOV_FDL_B3M_95', assetId: 'ast_SOV_FDL_B3M_95', govId: 'gov_FDL', tenor: 'B3M', ccy: 'FDL', couponRate: 0, issueTick: 0,
      maturityTick: 50 * D + 330, faceOutstanding: 0n, inflationLinked: false, fxDenominated: false, cac: { threshold: 0.75, aggregated: true }, onTheRun: true } as never);
    const rows = planQuarter(w.ctx, 'FDL', ports);
    expect(auctions(w)).toHaveLength(rows.length);
    expect(rows.filter((a) => isBill(a.tenor)).every((a) => a.assetId !== 'ast_SOV_FDL_B3M_95')).toBe(true);
    const gfn = fromMoney(blocRow(w, 'FDL').fiscal.grossFinancingNeedQuarter);
    expect(gfn).toBeCloseTo(1_096_153_846_153.846, 0);
    const n10 = rows.filter((a) => a.tenor === 'N10Y');
    expect(n10.length).toBe(3);
    expect(n10.every((a) => a.offeredFace === F(80_384_000_000))).toBe(true);
    for (const a of rows) {
      expect(a.id).toBe(`auc_FDL_${a.tenor}_${Math.floor(a.auctionTick / D)}`);
      expect(a.whenIssuedYield).toBeNull();
      if (isBill(a.tenor)) expect(a.reopening).toBe(false);
    }
    const n2 = rows.filter((a) => a.tenor === 'N2Y');
    expect(n2.some((a) => a.reopening && a.assetId === 'ast_SOV_FDL_N2Y_120')).toBe(true);
    const bills = rows.filter((a) => isBill(a.tenor)).map((a) => a.assetId);
    expect(new Set(bills).size).toBe(bills.length);
    const again = planQuarter(w.ctx, 'FDL', ports);
    expect(again).toEqual(rows);
    expect(auctions(w)).toHaveLength(rows.length);
  });
  it('a new note line is reopened by the later auctions of the quarter', () => {
    const rows = planQuarter(world('PYN').ctx, 'PYN', ports);
    for (const t of ['N5Y', 'N10Y', 'N30Y'] as const) {
      const xs = rows.filter((a) => a.tenor === t).sort((x, y) => x.auctionTick - y.auctionTick);
      for (let i = 1; i < xs.length; i++) if (xs[i]!.reopening) expect(xs.slice(0, i).map((a) => a.assetId)).toContain(xs[i]!.assetId);
      if (t === 'N10Y') expect(xs.length > 1 && xs.slice(1).every((a) => a.reopening && a.assetId === xs[0]!.assetId)).toBe(true);
      if (xs.length && !xs[0]!.reopening) expect(xs[0]!.assetId).toBe(sovereignAssetId('PYN', t, Math.floor(xs[0]!.auctionTick / D) + tenorDays(t)));
    }
  });
  it('SRL: zero-share tenors and the syndicated FX N10Y get no auction rows', () => {
    const rows = planQuarter(world('SRL').ctx, 'SRL', ports);
    expect(rows.length).toBeGreaterThan(0);
    const synd = auctionsInQuarter('SRL', quarterStartDay(QS), world('SRL').ctx.params).filter((x) => x.syndicated);
    expect(synd.length).toBeGreaterThan(0);
    expect(rows.filter((a) => synd.some((x) => x.auctionTick === a.auctionTick && x.tenor === a.tenor))).toEqual([]);
    expect(rows.filter((a) => ['N30Y', 'L10Y', 'N10Y_FDL'].includes(a.tenor) || a.assetId.includes('FDL'))).toEqual([]);
  });
  it('shortfallCarry goes onto the first B3M and is cleared', () => {
    const w0 = world('FDL'), base = planQuarter(w0.ctx, 'FDL', ports);
    const w = world('FDL', { carry: F(3e9) }), rows = planQuarter(w.ctx, 'FDL', ports);
    const b3 = (xs: SovAuction[]) => xs.filter((a) => a.tenor === 'B3M').sort((x, y) => x.auctionTick - y.auctionTick);
    expect(b3(rows)[0]!.offeredFace - b3(base)[0]!.offeredFace).toBe(F(3e9));
    expect(b3(rows)[1]!.offeredFace).toBe(b3(base)[1]!.offeredFace);
    expect(blocRow(w, 'FDL').fiscal.shortfallCarry).toBeUndefined();
  });
  it('announcement: exactly 3 trading days before at t = 420 (holidays skipped); y_WI, new-line coupon and issue row, PUBLIC event', () => {
    for (const b of ['FDL', 'EUN', 'PYN', 'NKR', 'SRL'] as BlocId[]) {
      for (const a of planQuarter(world(b).ctx, b, ports)) {
        const ad = Math.floor(a.announceTick / D), au = Math.floor(a.auctionTick / D);
        expect(a.announceTick % D).toBe(420);
        expect(tradingDaysOfPeriod(b, ad + 1, au - ad)).toHaveLength(3);
      }
    }
    const w = world('FDL'), rows = planQuarter(w.ctx, 'FDL', ports), a = rows.filter((x) => !x.reopening).sort((x, y) => x.announceTick - y.announceTick)[0]!;
    w.setTick(a.announceTick);
    announceDue(w.ctx, ports);
    const got = auctions(w).find((x) => x.id === a.id)!;
    expect(got.whenIssuedYield).toBe(BLOC_DEFAULTS.FDL.initialPolicyRate);
    const iss = w.rows(macroTables.issue.name).find((x) => (x as { id: string }).id === a.assetId) as Record<string, unknown>;
    expect(iss).toMatchObject({ couponRate: newLineCoupon(BLOC_DEFAULTS.FDL.initialPolicyRate), maturityTick: (Math.floor(a.auctionTick / D) + tenorDays(a.tenor)) * D + 330,
      faceOutstanding: 0n, onTheRun: false, cac: { threshold: 0.75, aggregated: true }, ccy: 'FDL' });
    const ev = w.events.filter((e) => e.kind === 'macro.sov.auction.announced');
    expect(ev.length).toBe(auctions(w).filter((x) => x.announceTick === a.announceTick).length);
    expect(ev.every((e) => e.vis === 'PUBLIC')).toBe(true);
    const n = w.events.length;
    announceDue(w.ctx, ports);
    expect(w.events.length).toBe(n);
  });
  it('a reopening keeps the line coupon and writes no issue row', () => {
    const w = world('FDL'), a = planQuarter(w.ctx, 'FDL', ports).find((x) => x.reopening && x.assetId === 'ast_SOV_FDL_N2Y_120')!;
    w.setTick(a.announceTick);
    announceDue(w.ctx, ports);
    expect(w.events.find((e) => (e.payload as { auctionId: string }).auctionId === a.id)!.payload).toMatchObject({ couponRate: 0.025, reopening: true, maturityTick: 120 * D + 330 });
    expect(w.rows(macroTables.issue.name).filter((x) => (x as { assetId: string }).assetId === a.assetId)).toEqual([expect.objectContaining({ couponRate: 0.025, faceOutstanding: F(500e9) })]);
  });
  it('y_WI: 05 line yield, else the NS zero, else the genesis policy rate', () => {
    const w = world('FDL'), s = w.ctx.store;
    expect(whenIssuedYield(s, 'FDL', null, 5, ports)).toBe(BLOC_DEFAULTS.FDL.initialPolicyRate);
    w.put(macroTables.curve.name, { id: 'FDL', ns: { L: 0.04, S: 0, C: 0, lambda: 1 } } as never);
    expect(whenIssuedYield(s, 'FDL', null, 5, ports)).toBeCloseTo(0.04, 12);
    expect(whenIssuedYield(s, 'FDL', 'x', 5, { ...ports, markets: { ...ports.markets, lineYield: () => 0.051 } })).toBe(0.051);
  });
});

describe('AC-04-11-MIXSTUB (E-51)', () => {
  it('T04-11 ISSUE_MIX is the single source of zero-share tenors: no stub constant remains in the rules', () => {
    const dir = join(__dirname), src = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    expect(src).not.toMatch(/ZERO_SHARE/);
    expect(readFileSync(join(dir, 'calendar.ts'), 'utf8')).toMatch(/import \{ mixOf \} from '\.\/issuance'/);
    expect(Object.entries(ISSUE_MIX.SRL).filter(([, v]) => v === 0).map(([k]) => k).sort()).toEqual(['L10Y', 'N30Y']);
  });
});
