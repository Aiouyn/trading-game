import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from '../game';
import { cashOf, netWorthBreakdown, TPD } from '../core';
import { bookedNet, netWorldMoney } from '../company/exploits/sequences';
import { LP, NPC, npcAccountId } from './constants';
import { quoteSell, spotAt } from './curve';
import { buzzOf } from './demand';
import { lpTick } from './flow';
import { buyCurve } from './trade';
import { curveHoldingsValue } from './value';
import { CREATOR, HOLDER, TRADER, jumpDays, launch, lpWorld, run } from './fixture';

/**
 * The v1.1 amendments of lead-launchpad.md (L6.1 fast pump and slow bleed, L6.2 post-graduation unwind), the liquidation valuation
 * (L8.1), and the ratified cancel rule and game-world NPC launches.
 */

const grad = (g: ReturnType<typeof lpWorld>, ticker: string) => applyCommand(g, 'admin', { type: 'admin.lpFill', ticker });

/** the token with no sniper and no buzz, so the test drives the cohort alone */
function quiet(g: ReturnType<typeof lpWorld>, ticker: string) {
  const t = g.launchpad!.tokens[ticker]!;
  t.sniperDone = true;
  t.buzz = { base: 0, board: 0, wire: 0 };
  t.npcPending = 0;
  t.npcPeak = 0;
  return t;
}

describe('L6.1 demand comes from the arrivals, not the buzz stock', () => {
  it('a launch, a buzz item and a copycat buy each add pending NPC demand; a sell adds none', () => {
    const g = lpWorld('arrivals');
    launch(g, CREATOR, 'ARRV');
    const t = g.launchpad!.tokens.ARRV!;
    expect(t.npcPending).toBeCloseTo(t.buzz.base * NPC.DEMAND_PER_BUZZ, 9);
    const p0 = t.npcPending!;
    expect(run(g, TRADER, { type: 'lp.buzz', ticker: 'ARRV', kind: 'board' }).ok).toBe(true);
    expect(t.npcPending! - p0).toBeCloseTo(LP.BOARD_ADD * NPC.DEMAND_PER_BUZZ, 6);
    const p1 = t.npcPending!;
    // a $100 buy adds copycat buzz of 0.02 (LP.BUY_BUZZ_PER_100), which is an arrival of 0.02 units of demand
    expect(run(g, TRADER, { type: 'lp.buy', ticker: 'ARRV', spendCents: 10_000, maxSlip: 0.5 }).ok).toBe(true);
    expect(t.npcPending! - p1).toBeCloseTo(LP.BUY_BUZZ_PER_100 * (100 / 100) * NPC.DEMAND_PER_BUZZ, 6);
    const p2 = t.npcPending!;
    const have = t.bal[TRADER] ?? 0;
    expect(run(g, TRADER, { type: 'lp.sell', ticker: 'ARRV', tokens: Math.floor(have / 2), maxSlip: 0.5 }).ok).toBe(true);
    expect(t.npcPending).toBe(p2);
  });

  it('the pending demand is bought with the buy half-life: after BUY_HALF_TICKS ticks half of it is still waiting', () => {
    const g = lpWorld('half');
    launch(g, CREATOR, 'HALF');
    const t = quiet(g, 'HALF');
    t.npcPending = 10_000;
    for (let k = 0; k < NPC.BUY_HALF_TICKS; k++) lpTick(g, null);
    expect(t.npcPending).toBeCloseTo(5_000, 2);
    expect(t.npcBal).toBeGreaterThan(0);
  });

  it('the cohort sells into the fade at any price: a buzz below its peak is sold even under the cohort\'s cost', () => {
    const g = lpWorld('fade');
    launch(g, CREATOR, 'FADE');
    const t = quiet(g, 'FADE');
    buyCurve(g, null, 'FADE', 100_000, 1, null, true);
    expect(t.npcBal).toBeGreaterThan(0);
    // the cohort's cost basis is far above the price (a loss), and the buzz fell from its peak: the fade sells, profit taking does not
    t.npcCost = t.npcCost * 3;
    t.npcPeak = 1;
    const before = t.npcBal;
    lpTick(g, null);
    expect(t.npcBal).toBe(before - Math.floor(before * (NPC.CAPIT_PER_TICK + NPC.TIME_SELL_PER_TICK)));
  });

  it('the cohort never sells tokens it does not hold', () => {
    const g = lpWorld('never');
    launch(g, CREATOR, 'NEVR');
    const t = quiet(g, 'NEVR');
    t.npcPeak = 1;
    lpTick(g, null);
    expect(t.npcBal).toBe(0);
    expect(t.y).toBe(LP.Y0);
  });

  it('an old snapshot without the demand fields loads and runs (the fields read as zero, the peak as the buzz)', () => {
    const g = lpWorld('old');
    launch(g, CREATOR, 'OLDS');
    const t = g.launchpad!.tokens.OLDS!;
    delete t.npcPending;
    delete t.npcPeak;
    lpTick(g, null);
    expect(Number.isFinite(t.npcPending ?? 0)).toBe(true);
    expect(buzzOf(t)).toBeGreaterThanOrEqual(0);
  });
});

describe('L6.1 the cohort is flat in tokens over a token\'s life', () => {
  it('when a token dies on the cash rule, the cohort sells what it holds back to the curve, and the money closes', () => {
    const g = lpWorld('flat');
    // a small buy, so the curve's cash stays under the death line (about $879) and the cash clock runs
    launch(g, CREATOR, 'FLAT');
    const t = quiet(g, 'FLAT');
    buyCurve(g, null, 'FLAT', 30_000, 1, null, true);
    expect(t.npcBal).toBeGreaterThan(0);
    const m0 = netWorldMoney(g) - bookedNet(g);
    jumpDays(g, 8);
    lpTick(g, null);
    expect(t.status).toBe('dead');
    expect(t.deadReason).toBe('cash');
    expect(t.npcBal).toBe(0);
    expect(netWorldMoney(g) - bookedNet(g) - m0).toBeCloseTo(0, 2);
  });

  it('a cancel after the NPC sniper has bought flattens the cohort\'s tokens back to the curve (the cohort is not an account)', () => {
    const g = lpWorld('cancel-npc');
    launch(g, CREATOR, 'CNPC');
    const t = g.launchpad!.tokens.CNPC!;
    // the sniper buys two ticks after launch, so after three steps the cohort holds tokens
    for (let k = 0; k < 3; k++) stepGame(g);
    expect(t.sniperDone).toBe(true);
    expect(t.npcBal).toBeGreaterThan(0);
    const r = run(g, CREATOR, { type: 'lp.cancel', ticker: 'CNPC' });
    expect(r.ok).toBe(true);
    expect(t.npcBal).toBe(0);
    expect(t.deadReason).toBe('cancelled');
  });

  it('a graduated token keeps its cohort position in the engine, and a cancel on it is refused', () => {
    const g = lpWorld('grad-npc');
    launch(g, CREATOR, 'GNPC', { allocation: 0 });
    expect(grad(g, 'GNPC').ok).toBe(true);
    const pos = g.market.accounts[npcAccountId('GNPC')]?.positions.GNPC?.qty ?? 0;
    expect(pos).toBeGreaterThan(0);
    const r = run(g, CREATOR, { type: 'lp.cancel', ticker: 'GNPC' });
    expect(r.ok).toBe(false);
    expect(g.launchpad!.tokens.GNPC!.status).toBe('graduated');
  });

  it('a pending demand that the curve refuses stays pending (it is not silently dropped)', () => {
    const g = lpWorld('refused');
    launch(g, CREATOR, 'REFU');
    const t = quiet(g, 'REFU');
    // a sold-out curve refuses every buy, so the cohort's demand must wait rather than vanish
    t.y = 1;
    t.npcPending = 10_000;
    lpTick(g, null);
    expect(t.npcPending).toBe(10_000);
    expect(t.npcBal).toBe(0);
  });
});

describe('L6.2 post-graduation unwind through the order path', () => {
  it('the cohort position sells into the book a share per tick (one-day half-life), and the proceeds are swept to the npcRetail sink', () => {
    const g = lpWorld('unwind');
    launch(g, CREATOR, 'UNWD', { allocation: 0 });
    expect(grad(g, 'UNWD').ok).toBe(true);
    const id = npcAccountId('UNWD');
    const pos0 = g.market.accounts[id]?.positions.UNWD?.qty ?? 0;
    expect(pos0).toBeGreaterThan(0);
    const sink0 = g.economy.sinks.npcRetail ?? 0;
    stepGame(g);
    const share = 1 - Math.pow(0.5, 1 / TPD);
    const placed = g.market.orders.filter((o) => o.playerId === id && o.side === 'sell');
    expect(placed.length).toBe(1);
    expect(placed[0]!.qty).toBe(Math.max(1, Math.floor(pos0 * share)));
    for (let k = 0; k < 40; k++) stepGame(g);
    const pos1 = g.market.accounts[id]?.positions.UNWD?.qty ?? 0;
    expect(pos1).toBeLessThan(pos0);
    expect(g.economy.sinks.npcRetail ?? 0).toBeGreaterThan(sink0);
    // holders are not the cohort: no FIFO lots for the NPC account (rug.ts lpFills)
    expect(g.launchpad!.tokens.UNWD!.lots[id]).toBeUndefined();
  });

  it('a second tick does not sell the same shares twice while the first order is still open (openSellQty)', () => {
    const g = lpWorld('unwindt');
    launch(g, CREATOR, 'UNWT', { allocation: 0 });
    expect(grad(g, 'UNWT').ok).toBe(true);
    const id = npcAccountId('UNWT');
    lpTick(g, null);
    const open1 = g.market.orders.filter((o) => o.playerId === id && o.status === 'open').reduce((a, o) => a + (o.qty - o.filledQty), 0);
    lpTick(g, null);
    const open2 = g.market.orders.filter((o) => o.playerId === id && o.status === 'open').reduce((a, o) => a + (o.qty - o.filledQty), 0);
    expect(open2).toBe(open1);
  });
});

describe('the cancel rule (ratified deviation)', () => {
  it('a creator\'s own dev buy does not block a cancel; the refund is half the fee, and the dev buy stays sellable on the dead curve', () => {
    const g = lpWorld('cancel-dev');
    launch(g, CREATOR, 'DEVB', { devBuyCents: 5_000 });
    expect((g.launchpad!.tokens.DEVB!.bal[CREATOR] ?? 0)).toBeGreaterThan(0);
    const cash0 = cashOf(g, CREATOR);
    expect(run(g, CREATOR, { type: 'lp.cancel', ticker: 'DEVB' }).ok).toBe(true);
    expect(cashOf(g, CREATOR)).toBeCloseTo(cash0 + LP.LAUNCH_FEE / 2, 6);
    const have = g.launchpad!.tokens.DEVB!.bal[CREATOR] ?? 0;
    expect(run(g, CREATOR, { type: 'lp.sell', ticker: 'DEVB', tokens: Math.floor(have / 2), maxSlip: 0.5 }).ok).toBe(true);
  });

  it('a cancel is refused once another player has traded, and it stays refused after that player has sold back to zero', () => {
    const g = lpWorld('cancel-other');
    launch(g, CREATOR, 'OTHR');
    run(g, HOLDER, { type: 'lp.buy', ticker: 'OTHR', spendCents: 1_000 });
    const have = g.launchpad!.tokens.OTHR!.bal[HOLDER] ?? 0;
    expect(have).toBeGreaterThan(0);
    // the holder sells everything: the balance is gone, but the trade happened, so the cancel stays refused
    expect(run(g, HOLDER, { type: 'lp.sell', ticker: 'OTHR', tokens: have, maxSlip: 0.5 }).ok).toBe(true);
    expect(g.launchpad!.tokens.OTHR!.bal[HOLDER]).toBeUndefined();
    const r = run(g, CREATOR, { type: 'lp.cancel', ticker: 'OTHR' });
    expect(r.ok).toBe(false);
    expect((r.data as { refusal?: string } | undefined)?.refusal).toBe('traded');
  });

  it('an old token without the playerTraded flag is still refused once another player has traded (read from its record)', () => {
    const g = lpWorld('cancel-old');
    launch(g, CREATOR, 'OLDC');
    run(g, HOLDER, { type: 'lp.buy', ticker: 'OLDC', spendCents: 1_000 });
    const t = g.launchpad!.tokens.OLDC!;
    delete t.playerTraded;
    const r = run(g, CREATOR, { type: 'lp.cancel', ticker: 'OLDC' });
    expect(r.ok).toBe(false);
    expect((r.data as { refusal?: string } | undefined)?.refusal).toBe('traded');
  });

  it('an old token with only the creator\'s own trades (no flag) can still be cancelled', () => {
    const g = lpWorld('cancel-old-creator');
    launch(g, CREATOR, 'OLDK', { devBuyCents: 2_000 });
    const t = g.launchpad!.tokens.OLDK!;
    delete t.playerTraded;
    expect(run(g, CREATOR, { type: 'lp.cancel', ticker: 'OLDK' }).ok).toBe(true);
  });
});

describe('L8.1 liquidation valuation of curve holdings', () => {
  it('a holder\'s curve tokens count in net worth at the liquidation quote (the sell\'s net, fee and slippage included), not at spot', () => {
    const g = lpWorld('liq');
    launch(g, CREATOR, 'LIQV');
    run(g, TRADER, { type: 'lp.buy', ticker: 'LIQV', spendCents: 50_000 });
    const t = g.launchpad!.tokens.LIQV!;
    const have = t.bal[TRADER] ?? 0;
    const expected = quoteSell(t.y, have);
    expect(expected.ok).toBe(true);
    const net = expected.ok ? expected.netCents / 100 : NaN;
    expect(curveHoldingsValue(g, TRADER)).toBeCloseTo(net, 6);
    expect(netWorthBreakdown(g, TRADER).tokens).toBeCloseTo(net, 6);
    // the liquidation sits below the spot value of the same tokens (the curve's slippage and the 1% fee)
    expect(net).toBeLessThan(have * spotAt(t.y) + 1e-9);
  });
});

describe('NPC launches in the game world (ratified)', () => {
  it('the game world (createGame with launchpadNpc) turns the world launches on; a bare world does not', () => {
    const on = createGame('gw-on', { warmupDays: 0, npcs: false, launchpadNpc: true });
    expect(on.launchpad?.npcLaunches).toBe(true);
    const off = createGame('gw-off', { warmupDays: 0, npcs: false });
    expect('launchpad' in off).toBe(false);
  });
});
