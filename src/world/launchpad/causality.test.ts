import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cashOf } from '../core';
import { LP, NPC } from './constants';
import { spotAt } from './curve';
import { anonOf } from './anon';
import { cohortsOf } from './cohorts';
import { crowdTick } from './crowd';
import { buyBuzz, lpTick } from './flow';
import { CREATOR, TRADER, launch, lpWorld } from './fixture';
import { MICROFLOW, SNIPER_ID, microTick, spendableCents } from './microflow';
import { replyToken } from './reply';
import { buyCurve, sellCurve } from './trade';

/**
 * Pull 2: launchpad arrivals spend cash a funded account already holds. The isolated cohort harness (MICROFLOW off)
 * stays in v11. These cases run with the funded crowd on.
 */
describe('funded launchpad causality', () => {
  const npc = NPC as unknown as Record<string, number>;
  let viral = 0;
  let micro = true;
  beforeEach(() => { viral = npc.VIRAL_PER_DAY!; npc.VIRAL_PER_DAY = 0; micro = MICROFLOW.enabled; MICROFLOW.enabled = true; });
  afterEach(() => { npc.VIRAL_PER_DAY = viral; MICROFLOW.enabled = micro; });

  function world(seed: string, ticker: string) {
    const g = lpWorld(seed);
    expect(launch(g, CREATOR, ticker).ok).toBe(true);
    return { g, t: g.launchpad!.tokens[ticker]! };
  }

  it('a board promo debits the payer, spends wallet cash, and does not mint retail', () => {
    const { g, t } = world('board-pay', 'BOAR');
    const payer = cashOf(g, TRADER);
    const faucet = g.economy.faucets.npcRetail ?? 0;
    const buzz = g.economy.sinks.lpBuzz ?? 0;
    const cash0 = t.micro!.traders.reduce((s, w) => s + (g.market.accounts[w.id]?.cash ?? 0), 0);
    const tape0 = t.tape.length;
    const y0 = t.y;
    const r = buyBuzz(g, TRADER, 'BOAR', 'board', null);
    expect(r.ok).toBe(true);
    expect(cashOf(g, TRADER)).toBeCloseTo(payer - LP.BOARD_COST, 6);
    expect(g.economy.sinks.lpBuzz ?? 0).toBeCloseTo(buzz + LP.BOARD_COST, 6);
    expect(g.economy.faucets.npcRetail ?? 0).toBe(faucet);
    const cash1 = t.micro!.traders.reduce((s, w) => s + (g.market.accounts[w.id]?.cash ?? 0), 0);
    expect(cash1).toBeLessThan(cash0);
    expect(t.tape.length).toBeGreaterThan(tape0);
    expect(t.npcPending ?? 0).toBe(0);
    expect(t.y).toBeLessThan(y0);
  });

  it('emptied wallets still pay the promo fee and leave the price where it was', () => {
    const { g, t } = world('board-empty', 'EMPT');
    for (const w of t.micro!.traders) g.market.accounts[w.id]!.cash = 0;
    const y0 = t.y;
    const tape0 = t.tape.length;
    const faucet = g.economy.faucets.npcRetail ?? 0;
    const payer = cashOf(g, TRADER);
    const r = buyBuzz(g, TRADER, 'EMPT', 'board', null);
    expect(r.ok).toBe(true);
    expect(cashOf(g, TRADER)).toBeCloseTo(payer - LP.BOARD_COST, 6);
    expect(g.economy.faucets.npcRetail ?? 0).toBe(faucet);
    expect(t.y).toBe(y0);
    expect(t.tape.length).toBe(tape0);
    expect(t.npcPending ?? 0).toBe(0);
  });

  it('the sniper pays from its account inside the launch, and the exit pays that account back', () => {
    const { g, t } = world('snipe-cash', 'SNIP');
    const spent = NPC.SNIPER_MAX - g.market.accounts[SNIPER_ID]!.cash;
    expect(spent).toBeGreaterThan(NPC.SNIPER_MIN * 0.9);
    expect(spent).toBeLessThanOrEqual(NPC.SNIPER_MAX);
    expect(cohortsOf(t).find(c => c.sniper)?.wallet).toBe(SNIPER_ID);
    expect(t.sniper).toBeDefined();
    const afterBuy = g.market.accounts[SNIPER_ID]!.cash;
    g.market = { ...g.market, tick: t.sniper!.tick + NPC.SNIPER_EXIT_TICKS };
    lpTick(g, null);
    expect(t.sniper).toBeUndefined();
    expect(g.market.accounts[SNIPER_ID]!.cash).toBeGreaterThan(afterBuy);
  });

  it('a crowd sale of a wallet cohort credits that account', () => {
    const { g, t } = world('crowd-sell', 'CSEL');
    t.sniper = undefined;
    const bag = cohortsOf(t).find(c => c.wallet && c.tokens > 0 && !c.sniper);
    expect(bag).toBeDefined();
    bag!.role = 'scalp';
    crowdTick(g, t, null);
    t.crowd!.vwap = spotAt(t.y) * 0.5;
    const id = bag!.wallet!;
    const cash0 = g.market.accounts[id]!.cash;
    const sink0 = g.economy.sinks.npcRetail ?? 0;
    const faucet0 = g.economy.faucets.npcRetail ?? 0;
    crowdTick(g, t, null);
    const credited = g.market.accounts[id]!.cash - cash0;
    expect(credited).toBeGreaterThan(1);
    expect((g.economy.sinks.npcRetail ?? 0) - sink0).toBeLessThan(credited);
    expect(g.economy.faucets.npcRetail ?? 0).toBe(faucet0);
  });

  it('a reply sets attention and does not trade on that tick', () => {
    const { g, t } = world('reply-attn', 'RPLY');
    const y = t.y;
    const flows = JSON.stringify(t.flows);
    const accounts = JSON.stringify(g.market.accounts);
    const faucet = g.economy.faucets.npcRetail ?? 0;
    const tape = t.tape.length;
    const r = replyToken(g, TRADER, 'RPLY', 'watching this one', null);
    expect(r.ok).toBe(true);
    expect(t.y).toBe(y);
    expect(JSON.stringify(t.flows)).toBe(flows);
    expect(JSON.stringify(g.market.accounts)).toBe(accounts);
    expect(g.economy.faucets.npcRetail ?? 0).toBe(faucet);
    expect(t.tape.length).toBe(tape);
    expect(t.micro!.traders.some(w => (w.attn ?? 0) > 0 && (w.attnUntil ?? 0) > g.market.tick)).toBe(true);
  });

  it('a reply adds attention: the replied coin draws more excitation and its tape departs from the control', () => {
    const control = world('reply-attn-response', 'RSPS');
    const reactive = world('reply-attn-response', 'RSPS');
    expect(replyToken(reactive.g, TRADER, 'RSPS', 'watching this one', null).ok).toBe(true);
    let excitedOnce = false;
    for (let i = 0; i < 24; i++) {
      control.g.market = { ...control.g.market, tick: control.g.market.tick + 1 };
      reactive.g.market = { ...reactive.g.market, tick: reactive.g.market.tick + 1 };
      lpTick(control.g, null);
      lpTick(reactive.g, null);
      if ((reactive.g.launchpad!.tokens.RSPS!.micro!.pa!.e) > (control.g.launchpad!.tokens.RSPS!.micro!.pa!.e)) excitedOnce = true;
    }
    expect(excitedOnce).toBe(true);
    // the same seed and the same archetype: only the reply's attention differs
    expect(reactive.g.launchpad!.tokens.RSPS!.micro!.pa!.arch).toBe(control.g.launchpad!.tokens.RSPS!.micro!.pa!.arch);
    expect(JSON.stringify(reactive.g.launchpad!.tokens.RSPS!.tape)).not.toBe(JSON.stringify(control.g.launchpad!.tokens.RSPS!.tape));
  });

  /** A coin whose attention is switched off: no drive, no excitation, no insider events left. */
  function silence(t: ReturnType<typeof world>['t'], buyP = 0.5, drive = 0) {
    const pa = t.micro!.pa!;
    pa.plan = [[1_000_000, drive, buyP, 1]];
    pa.pumps = [];
    pa.e = 0;
    pa.f = 0;
    pa.insiderDone = true;
    pa.devSellAt = -1;
    pa.rugAt = -1;
    pa.lastBuzz = t.buzz.base + t.buzz.board + t.buzz.wire;
  }

  it('a coin with no attention stays quiet: no order, no settlement', () => {
    const { g, t } = world('pa-quiet', 'QUIE');
    microTick(g, t, null);
    silence(t);
    t.micro!.panic = 0;
    g.market = { ...g.market, tick: g.market.tick + 1 };
    const tape = t.tape.length;
    const y = t.y;
    const accounts = JSON.stringify(g.market.accounts);
    microTick(g, t, null);
    expect(t.tape).toHaveLength(tape);
    expect(t.y).toBe(y);
    expect(JSON.stringify(g.market.accounts)).toBe(accounts);
  });

  it('a coin leaning to selling takes holders out of their bags, paid from the curve', () => {
    const { g, t } = world('pa-sell-lean', 'RISK');
    microTick(g, t, null);
    const wallet = t.micro!.traders.find(w => w.id.startsWith('lp:npc:trader:') && spendableCents(g, w) >= 100_000)!;
    expect(wallet).toBeDefined();
    expect(buyCurve(g, null, t.ticker, 100_000, 1, null, true, false, wallet).ok).toBe(true);
    silence(t, 0, 3);
    const bagOf = () => cohortsOf(g.launchpad!.tokens.RISK!).filter(c => c.wallet === wallet.id).reduce((sum, c) => sum + c.tokens, 0);
    const qtyBefore = bagOf();
    const cashBefore = g.market.accounts[wallet.accountId!]!.cash;
    for (let i = 1; i <= 24 && bagOf() >= qtyBefore; i++) {
      g.market = { ...g.market, tick: g.market.tick + 1 };
      microTick(g, g.launchpad!.tokens.RISK!, null);
    }
    expect(bagOf()).toBeLessThan(qtyBefore);
    expect(g.market.accounts[wallet.accountId!]!.cash).toBeGreaterThan(cashBefore);
  });

  it('a sell-leaning tick with no bag to sell never falls through into a buy', () => {
    const { g, t } = world('pa-no-bag', 'NOBY');
    microTick(g, t, null);
    silence(t, 0, 3);
    // nobody on the coin holds a bag: every order this tick is a sell with nothing to sell
    for (const c of cohortsOf(t)) c.tokens = 0;
    t.npcBal = 0; t.npcCost = 0; t.npcCohorts = [];
    t.micro!.panic = 0;
    g.market = { ...g.market, tick: g.market.tick + 1 };
    const accounts = JSON.stringify(g.market.accounts);
    const tape = t.tape.length;
    microTick(g, t, null);
    expect(t.tape).toHaveLength(tape);
    expect(JSON.stringify(g.market.accounts)).toBe(accounts);
  });

  it('a wallet round trip moves faucet minus sink only by the booked fee', () => {
    const { g, t } = world('round-trip', 'RTRP');
    const w = t.micro!.traders.find(tr => spendableCents(g, tr) >= 50_000);
    expect(w).toBeDefined();
    const gap = () => {
      const f = Object.values(g.economy.faucets).reduce((a, b) => a + b, 0);
      const s = Object.values(g.economy.sinks).reduce((a, b) => a + b, 0);
      return f - s;
    };
    const gap0 = gap();
    const faucet0 = g.economy.faucets.npcRetail ?? 0;
    const buy = buyCurve(g, null, t.ticker, 50_000, 1, null, true, false, w, 'hold');
    expect(buy.ok).toBe(true);
    const cs = cohortsOf(t);
    const plan = cs.map(c => (c.wallet === w!.id && c.role === 'hold' ? c.tokens : 0));
    const qty = plan.reduce((a, b) => a + b, 0);
    expect(qty).toBeGreaterThan(0);
    const sell = sellCurve(g, null, t.ticker, qty, 1, null, true, plan, false, w);
    expect(sell.ok).toBe(true);
    expect(g.economy.faucets.npcRetail ?? 0).toBe(faucet0);
    const buyFee = ((buy.data as { feeCents: number }).feeCents) / 100;
    const sellFee = ((sell.data as { feeCents: number }).feeCents) / 100;
    // Half of an odd-cent fee is rounded at the book boundary; total world conservation is covered separately.
    expect(Math.abs(gap0 - gap() - (buyFee + sellFee) / 2)).toBeLessThanOrEqual(0.01);
  });
});
