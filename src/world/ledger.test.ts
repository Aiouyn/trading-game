import { describe, expect, it } from 'vitest';
import { Rng, seedStream, type Side } from '@/engine';
import { delistAsset } from '@/engine/listings';
import { assetIndex } from '@/engine/trading';
import { applyCommand, createGame, stepGame } from './game';
import { credit } from './core';
import { refreshNetWorth } from './assets';
import { bookStock, expireOption, ledgerOf, ledgerTick, priceEquity, recordOptionTrade, reasonFor, settleHolders, tradesOf } from './ledger';
import { equityOf } from '@/engine';
import { applyRank } from './players';
import { FILL_REASONS } from './ledger-types';
import type { GameState, Command } from './types';
import type { RoundTrip } from './ledger-types';

function game(seed = 'ledger'): GameState {
  return createGame(seed, { warmupDays: 1, npcs: false });
}

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

/** Make a player rich enough for a rank in tests (real players earn it). */
function boost(g: GameState, pid: string, amount: number) {
  credit(g, pid, amount, 'test');
  const p = g.players[pid]!;
  refreshNetWorth(g, p);
  applyRank(g, p, null);
}

function join(g: GameState, pid: string, rich = 0) {
  const j = cmd(g, pid, { type: 'join', handle: 'trader_' + pid, country: 'AV' });
  if (!j.ok) throw new Error('join refused: ' + j.error);
  g.players[pid]!.onboarding.skipped = true;
  if (rich) boost(g, pid, rich);
}

function buy(g: GameState, pid: string, assetId: string, qty: number, type: 'market' = 'market') {
  const r = cmd(g, pid, { type: 'order.place', order: { assetId, side: 'buy', type, qty } });
  if (!r.ok) throw new Error(`buy refused: ${r.error}`);
}

function sell(g: GameState, pid: string, assetId: string, qty: number) {
  const r = cmd(g, pid, { type: 'order.place', order: { assetId, side: 'sell', type: 'market', qty } });
  if (!r.ok) throw new Error(`sell refused: ${r.error}`);
}

describe('engine average cost, replayed', () => {
  it('bookStock matches the engine for adds, reductions, closes and flips', () => {
    // long 10 at 100 with a $1 fee: effective 100.1 per unit
    let r = bookStock({ qty: 0, avgCost: 0 }, 'buy', 10, 100, 1);
    expect(r.realized).toBe(0);
    expect(r.pos.qty).toBe(10);
    expect(r.pos.avgCost).toBeCloseTo(100.1, 9);
    // sell 4 at 110, no fee: realized 4 * (110 - 100.1)
    r = bookStock(r.pos, 'sell', 4, 110, 0);
    expect(r.realized).toBeCloseTo(4 * (110 - 100.1), 9);
    expect(r.pos.qty).toBe(6);
    // flip: sell 9 at 90: closes 6 (realized 6 * (90 - 100.1)), opens short 3 at 90
    const f = bookStock(r.pos, 'sell', 9, 90, 0);
    expect(f.realized).toBeCloseTo(6 * (90 - 100.1), 9);
    expect(f.pos.qty).toBe(-3);
    expect(f.pos.avgCost).toBeCloseTo(90, 9);
  });
});

describe('the trade ledger', () => {
  it('sums to the account realized P&L to the cent over a random run, and the mirror matches the account', () => {
    const g = game('ledger-sum');
    join(g, 'u1', 300_000); // Owner: shorts allowed
    const rng = new Rng(seedStream('ledger-sum', 'trades'));
    const ids = ['HLCN', 'NRON', 'AVBK', 'AUC'];
    for (let k = 0; k < 1500; k++) {
      if (rng.uniform() < 0.3) {
        const id = ids[Math.floor(rng.uniform() * ids.length)]!;
        const side: Side = rng.uniform() < 0.5 ? 'buy' : 'sell';
        const qty = 1 + Math.floor(rng.uniform() * 4);
        cmd(g, 'u1', { type: 'order.place', order: { assetId: id, side, type: 'market', qty } });
      }
      stepGame(g);
    }
    const L = ledgerOf(g, 'u1')!;
    const acct = g.market.accounts.u1!;
    const realized = L.fills.reduce((s, f) => s + f.realizedPnl, 0);
    expect(L.fills.length).toBeGreaterThan(20);
    expect(Math.abs(realized - acct.realizedPnl)).toBeLessThan(0.005);
    for (const [id, pos] of Object.entries(acct.positions)) {
      expect(L.pos[id]?.qty).toBeCloseTo(pos.qty, 9);
      expect(L.pos[id]?.avgCost).toBeCloseTo(pos.avgCost, 9);
    }
    expect(Object.keys(L.pos).length).toBe(Object.keys(acct.positions).length);
  });

  it('a round trip closes at zero, with average entry and exit; a flip closes one trip and opens the next', () => {
    const g = game('trips');
    join(g, 'u1', 300_000);
    buy(g, 'u1', 'HLCN', 10);
    stepGame(g);
    sell(g, 'u1', 'HLCN', 15); // closes the 10 long and opens a 5 short
    stepGame(g);
    const { trips } = tradesOf(g, 'u1');
    expect(trips.length).toBe(1);
    const rt = trips[0] as RoundTrip;
    expect(rt.side).toBe('long');
    expect(rt.qty).toBe(10);
    expect(rt.fills).toBe(2);
    expect(rt.closeReason).toBe('order');
    const fills = tradesOf(g, 'u1').fills;
    expect(rt.realizedPnl).toBeCloseTo(fills[1]!.realizedPnl, 9);
    expect(rt.avgEntry).toBeGreaterThan(0);
    expect(rt.avgExit).toBeGreaterThan(0);
    const open = ledgerOf(g, 'u1')!.open.HLCN!;
    expect(open.side).toBe('short');
    expect(open.openQty).toBe(5);
    // closing the short returns the position to zero: a second trip closes
    buy(g, 'u1', 'HLCN', 5);
    stepGame(g);
    expect(tradesOf(g, 'u1').trips.length).toBe(2);
    expect(tradesOf(g, 'u1').trips[1]!.side).toBe('short');
    expect(ledgerOf(g, 'u1')!.open.HLCN).toBeUndefined();
  });

  it('codes a triggered stop as a stop, and a plain market order as an order', () => {
    const g = game('reasons');
    join(g, 'u1', 0);
    buy(g, 'u1', 'HLCN', 2);
    stepGame(g);
    const px = Math.exp(g.market.assets[assetIndex(g.market, 'HLCN')]!.lnP);
    const r = cmd(g, 'u1', { type: 'order.place', order: { assetId: 'HLCN', side: 'sell', type: 'stop', qty: 2, stopPrice: px * 0.97 } });
    expect(r.ok).toBe(true);
    applyCommand(g, 'admin', { type: 'admin.shock', assetId: 'HLCN', pct: -0.05 });
    stepGame(g);
    stepGame(g);
    const fills = tradesOf(g, 'u1').fills;
    expect(fills.at(-1)?.reason).toBe('stop');
    expect(fills[0]?.reason).toBe('order');
    expect(FILL_REASONS).toContain('stop');
  });

  it('settles a delisted holding the way the engine does, with the same realized P&L', () => {
    const g = game('settle');
    join(g, 'u1', 0);
    buy(g, 'u1', 'HLCN', 3);
    stepGame(g);
    const i = assetIndex(g.market, 'HLCN');
    const price = 42;
    const before = g.market.accounts.u1!.realizedPnl;
    const L = ledgerOf(g, 'u1')!;
    const pos = L.pos.HLCN!;
    const next = delistAsset(g.market, i, price, g.market.tick).state;
    const engineDelta = next.accounts.u1!.realizedPnl - before;
    settleHolders(g, 'HLCN', price, g.market.tick);
    const row = tradesOf(g, 'u1').fills.at(-1)!;
    expect(row.reason).toBe('settlement');
    expect(row.orderId).toBeNull();
    expect(row.qty).toBe(3);
    expect(row.price).toBe(price);
    expect(row.fee).toBe(0);
    expect(row.realizedPnl).toBeCloseTo(engineDelta, 9);
    expect(pos.qty).toBe(3);
    expect(L.pos.HLCN).toBeUndefined();
    const rt = tradesOf(g, 'u1').trips.at(-1)!;
    expect(rt.closeReason).toBe('settlement');
  });

  it('books an option expiry with the engine formula and closes the trip', () => {
    const g = game('expiry');
    join(g, 'u1', 5_000_000);
    const led = ledgerOf(g, 'u1')!;
    const cid = 'AVBK|40|call|100';
    led.opt[cid] = { qty: 2, avgCost: 5 };
    led.open[`opt:${cid}`] = { id: 't1', assetId: cid, kind: 'option', side: 'long', openedTick: 1, openQty: 2, entryNotional: 10, exitQty: 0, exitNotional: 0, realizedPnl: 0, midPnl: 0, slippagePnl: 0, feesPaid: 0, fills: 1, explainable: false };
    expireOption(g, 'u1', cid, 2, 1200, g.market.tick, 100);
    const row = tradesOf(g, 'u1').fills.at(-1)!;
    expect(row.reason).toBe('option_expiry');
    expect(row.kind).toBe('option');
    expect(row.realizedPnl).toBeCloseTo(1200 - 5 * 100 * 2, 9);
    expect(led.opt[cid]).toBeUndefined();
    expect(tradesOf(g, 'u1').trips.at(-1)!.closeReason).toBe('option_expiry');
  });

  it('records an option trade with the realized amount the engine booked', () => {
    const g = game('optrade');
    join(g, 'u1', 0);
    recordOptionTrade(g, 'u1', 'AVBK|40|call|100', 'buy', 1, 3, 0.5, 0, g.market.tick);
    const row = tradesOf(g, 'u1').fills.at(-1)!;
    expect(row.kind).toBe('option');
    expect(row.reason).toBe('order');
    expect(row.qty).toBe(1);
  });

  it('keeps 1000 fills and 500 round trips, and the ledger survives a snapshot', () => {
    const g = game('retention');
    join(g, 'u1', 300_000);
    for (let k = 0; k < 1100; k++) {
      buy(g, 'u1', 'HLCN', 1);
      stepGame(g);
      sell(g, 'u1', 'HLCN', 1);
      stepGame(g);
    }
    const L = ledgerOf(g, 'u1')!;
    expect(L.fills.length).toBe(1000);
    expect(L.trips.length).toBe(500);
    const copy = JSON.parse(JSON.stringify(g)) as GameState;
    expect(tradesOf(copy, 'u1').fills.length).toBe(1000);
    expect(tradesOf(copy, 'u1').trips.at(-1)!.id).toBe(L.trips.at(-1)!.id);
    // the copy keeps running on the same numbers
    stepGame(g);
    stepGame(copy);
    expect(ledgerOf(copy, 'u1')!.fills.at(-1)).toEqual(ledgerOf(g, 'u1')!.fills.at(-1));
  });

  it('a non-human (NPC) account has no ledger', () => {
    const g = createGame('npc-led', { warmupDays: 1, npcs: true });
    const npc = Object.values(g.players).find((p) => p.npc)!;
    stepGame(g);
    expect(g.ledgers?.[npc.id]).toBeUndefined();
  });

  it('reasonFor reads a world tag before anything else', () => {
    const g = game('tag');
    join(g, 'u1', 0);
    ledgerOf(g, 'u1')!.plans.tags['o1'] = 'recurring_buy';
    expect(reasonFor(g, 'u1', 'o1', true)).toBe('recurring_buy');
    expect(reasonFor(g, 'u1', 'o2', true)).toBe('liquidation');
    expect(reasonFor(g, 'u1', 'o3', false)).toBe('order');
  });
});

describe('ledger hygiene and the benchmark basis', () => {
  it('a world tag is dropped once its order is no longer open, even when the order never fills', () => {
    const g = game('tag-prune');
    join(g, 'u1', 0);
    const L = ledgerOf(g, 'u1')!;
    L.plans.tags['open-order'] = 'recurring_buy';
    L.plans.tags['cancelled-order'] = 'block_slice';
    g.market.orders.push({
      id: 'open-order', playerId: 'u1', assetId: 'HLCN', side: 'buy', type: 'limit', qty: 1, limitPrice: 1, tif: 'gtc',
      status: 'open', placedTick: g.market.tick, triggered: false, filledQty: 0, avgFillPrice: 0, feesPaid: 0,
    } as never);
    g.market.orders.push({
      id: 'cancelled-order', playerId: 'u1', assetId: 'HLCN', side: 'buy', type: 'market', qty: 1, tif: 'gtc',
      status: 'cancelled', placedTick: g.market.tick, closedTick: g.market.tick, triggered: false, filledQty: 0, avgFillPrice: 0, feesPaid: 0,
    } as never);
    ledgerTick(g, [], []);
    expect(L.plans.tags).toEqual({ 'open-order': 'recurring_buy' });
  });

  it('the benchmark equity leaves out dividends, cash interest and borrow fees made after join, and keeps trading fees', () => {
    const g = game('price-equity');
    join(g, 'u1', 0);
    const L = ledgerOf(g, 'u1')!;
    const acct = g.market.accounts.u1!;
    const plain = equityOf(g.market, acct);
    expect(priceEquity(g, 'u1', L)).toBeCloseTo(plain, 9);
    acct.dividends = (acct.dividends ?? 0) + 120;
    acct.interestEarned = (acct.interestEarned ?? 0) + 30;
    acct.interestPaid = (acct.interestPaid ?? 0) + 10;
    acct.borrowPaid = (acct.borrowPaid ?? 0) + 5;
    expect(priceEquity(g, 'u1', L)).toBeCloseTo(plain - 120 - 30 + 10 + 5, 9);
    acct.feesPaid += 7; // trading fees stay in: a cost of the trade, as the ghosts' costless design implies
    expect(priceEquity(g, 'u1', L)).toBeCloseTo(plain - 120 - 30 + 10 + 5, 9);
  });

  it('a non-trading cash move moves the ledger start cash with the baseline, as adjustCash does', () => {
    const g = game('start-cash');
    join(g, 'u1', 0);
    const L = ledgerOf(g, 'u1')!;
    const before = L.startCash;
    credit(g, 'u1', 1000, 'test');
    expect(L.startCash).toBeCloseTo(before + 1000, 9);
    expect(g.market.accounts.u1!.startingCash).toBeCloseTo(before + 1000, 9);
  });
});

