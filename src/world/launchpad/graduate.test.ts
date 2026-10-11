import { describe, expect, it } from 'vitest';
import { applyCommand, stepGame } from '../game';
import { cashOf } from '../core';
import { bookedNet, netWorldMoney } from '../company/exploits/sequences';
import { publicDefs } from '../view';
import { LP, bookAccountId, curveAccountId } from './constants';
import { lockedEngineSell } from './graduate';
import { CREATOR, TRADER, launch, lpWorld, run, jumpDays } from './fixture';

const grad = (g: ReturnType<typeof lpWorld>, ticker: string) => applyCommand(g, 'admin', { type: 'admin.lpFill', ticker });

describe('graduation (L4)', () => {
  it('the chart ends at the graduation price, so a token that graduated between two samples still has a line to draw (review item 6)', () => {
    const g = lpWorld('grad-chart');
    launch(g, CREATOR, 'CHRT');
    expect(grad(g, 'CHRT').ok).toBe(true);
    const t = g.launchpad!.tokens.CHRT!;
    expect(t.chart.length).toBeGreaterThanOrEqual(2);
    expect(t.chart[t.chart.length - 1]![1]).toBeCloseTo(t.gradPrice!, 9);
  });

  it('the curve graduates at its last token: an engine crypto asset with the book as its supply account, and the list version bumps', () => {
    const g = lpWorld('grad-list');
    launch(g, CREATOR, 'GRAD', { allocation: 20_000_000 });
    const seq0 = g.market.listings?.seq ?? 0;
    const r = grad(g, 'GRAD');
    expect(r.ok).toBe(true);
    const t = g.launchpad!.tokens.GRAD!;
    expect(t.status).toBe('graduated');
    expect(t.gradPrice).toBeCloseTo(0.000216, 6);
    const def = g.market.config.assets.find((a) => a.id === 'GRAD')!;
    expect(def.assetClass).toBe('crypto');
    expect(def.supplyAccount).toBe(bookAccountId('GRAD'));
    expect(def.sharesOutstanding).toBe(LP.SUPPLY);
    expect(def.initialPrice).toBeCloseTo(t.gradPrice!, 9);
    expect(g.market.listings?.seq ?? 0).toBeGreaterThan(seq0);
    // the client mirror: the def travels with the list, and the insider link stays server-side
    expect(publicDefs(g.market.config.assets).some((a) => a.id === 'GRAD')).toBe(true);
  });

  it('the supply closes: every GRAD token is a position (holders, the creator, the NPC cohort and the book), and the total is one billion', () => {
    const g = lpWorld('grad-supply');
    launch(g, CREATOR, 'SUPL', { allocation: 20_000_000 });
    run(g, TRADER, { type: 'lp.buy', ticker: 'SUPL', spendCents: 10_000 });
    expect(grad(g, 'SUPL').ok).toBe(true);
    let total = 0;
    for (const a of Object.values(g.market.accounts)) total += a.positions.SUPL?.qty ?? 0;
    expect(total).toBe(LP.SUPPLY);
    expect(g.market.accounts[bookAccountId('SUPL')]!.positions.SUPL!.qty).toBe(LP.SUPPLY - LP.CURVE_SUPPLY - 20_000_000);
    expect(g.market.accounts[CREATOR]!.positions.SUPL!.qty).toBe(20_000_000);
  });

  it('the fee is a sink of 1.5% of the raise, the book keeps the rest, and the money closes to the cent through the graduation', () => {
    const g = lpWorld('grad-money');
    launch(g, CREATOR, 'MONE');
    const m0 = netWorldMoney(g);
    const b0 = bookedNet(g);
    expect(grad(g, 'MONE').ok).toBe(true);
    const raised = g.launchpad!.tokens.MONE!.gradRaise!;
    expect(raised).toBeGreaterThan(43_900);
    expect(g.economy.sinks.lpGradFee).toBeCloseTo(raised * LP.GRAD_FEE_RATE, 1);
    expect(g.market.accounts[bookAccountId('MONE')]!.cash).toBeCloseTo(raised * (1 - LP.GRAD_FEE_RATE), 1);
    expect(g.market.accounts[curveAccountId('MONE')]!.cash).toBeCloseTo(0, 6);
    expect(Math.abs((netWorldMoney(g) - m0) - (bookedNet(g) - b0))).toBeLessThan(0.005);
  });

  it('after graduation the curve refuses, and the creator’s allocation is locked in the engine until it vests', () => {
    const g = lpWorld('grad-lock');
    launch(g, CREATOR, 'LOCK', { allocation: 10_000_000 });
    grad(g, 'LOCK');
    expect(lockedEngineSell(g, CREATOR, 'LOCK', 10_000_000)).toBe(true);
    expect(lockedEngineSell(g, CREATOR, 'LOCK', 0)).toBe(false);
    expect(lockedEngineSell(g, TRADER, 'LOCK', 1)).toBe(false);
    const r = run(g, TRADER, { type: 'lp.buy', ticker: 'LOCK', spendCents: 100 });
    expect((r.data as { refusal?: string } | undefined)?.refusal).toBe('graduated');
    jumpDays(g, 14);
    expect(lockedEngineSell(g, CREATOR, 'LOCK', 10_000_000)).toBe(false);
  });

  it('a buy on the engine takes only what the book holds: a fill the book cannot cover is partial, never minted', () => {
    const g = lpWorld('grad-partial');
    launch(g, CREATOR, 'PART');
    grad(g, 'PART');
    const bookQty = g.market.accounts[bookAccountId('PART')]!.positions.PART!.qty;
    const total0 = Object.values(g.market.accounts).reduce((s, a) => s + (a.positions.PART?.qty ?? 0), 0);
    const r = applyCommand(g, TRADER, { type: 'order.place', order: { assetId: 'PART', side: 'buy', type: 'market', qty: 300_000_000 } });
    expect(r.ok).toBe(true);
    stepGame(g);
    const traderQty = g.market.accounts[TRADER]!.positions.PART?.qty ?? 0;
    expect(traderQty).toBeLessThanOrEqual(bookQty);
    const book1 = g.market.accounts[bookAccountId('PART')]!.positions.PART?.qty ?? 0;
    expect(book1).toBeGreaterThanOrEqual(0);
    const total1 = Object.values(g.market.accounts).reduce((s, a) => s + (a.positions.PART?.qty ?? 0), 0);
    expect(total1).toBe(total0);
    expect(cashOf(g, TRADER)).toBeGreaterThan(0);
  });
});
