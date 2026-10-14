import { Rng, seedStream, placeOrder, openAccount } from '@/engine';
import type { GameState, StepOutput } from '../types';
import type { LpToken, MicroState, MicroTrader } from './types';
import { TPD } from './constants';
import { cashReserveAt } from './curve';
import { cohortsOf } from './cohorts';
import { buyCurve, sellCurve } from './trade';
import { anonOf } from './anon';
import { priceNow } from './rug';
import { faucetCents } from './state';

/** Game calibration, not a claim of a statistical fit. All prices still come from settled orders. */
export const MICROFLOW = {
  enabled: true,
  traders: 12,
  initialCapitalCents: 50_000_000,
  dailyCapitalCents: 10_000_000,
  maxOrders: 10,
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const styles: MicroTrader['style'][] = ['trend', 'dip', 'scalp', 'holder', 'whale'];

/** This is external NPC cash until spent; buys already book it through npcRetail. No per-token refill. */
function capital(g: GameState) {
  const s = g.launchpad!;
  const tick = g.market.tick;
  const c = s.flowCapital ?? (s.flowCapital = {
    cents: MICROFLOW.initialCapitalCents, fundedCents: MICROFLOW.initialCapitalCents, fundingTick: tick,
  });
  const days = Math.floor(Math.max(0, tick - c.fundingTick) / TPD);
  if (days > 0) {
    const add = days * MICROFLOW.dailyCapitalCents;
    c.cents += add;
    c.fundedCents += add;
    c.fundingTick += days * TPD;
  }
  return c;
}

function ensure(g: GameState, t: LpToken): MicroState {
  if (t.micro) return t.micro;
  const rng = new Rng(seedStream(g.seed, `lp:micro:${t.ticker}`));
  const affinity = 0.2 + 0.8 * rng.uniform();
  const budget = Math.min(capital(g).cents, Math.round((10_000 + 25_000 * rng.uniform()) * 100));
  capital(g).cents -= budget;
  const weights = Array.from({ length: MICROFLOW.traders }, (_, i) => i % 5 === 4 ? 4 : 0.4 + 1.6 * rng.uniform());
  const sum = weights.reduce((a, b) => a + b, 0);
  let left = budget;
  const traders = weights.map((weight, i): MicroTrader => {
    const cashCents = i === weights.length - 1 ? left : Math.floor(budget * weight / sum);
    left -= cashCents;
    return {
      id: `lp:npc:${t.ticker}:flow:${i}`, style: styles[i % styles.length]!, cashCents,
      takeProfit: 1.12 + 1.5 * rng.uniform(), stop: 0.06 + 0.3 * rng.uniform(),
      patience: 12 + Math.floor(rng.uniform() * 120), lastAction: g.market.tick,
    };
  });
  const p = priceNow(g, t);
  if (t.status === 'graduated') {
    // An older save can first acquire this population after it has already migrated.
    for (const w of traders) {
      g.market = openAccount(g.market, w.id, 0);
      faucetCents(g, w.id, 'npcRetail', w.cashCents);
      w.cashCents = 0;
      w.accountId = w.id;
    }
  }
  const mood = 2 * rng.uniform() - 1;
  return t.micro = {
    traders, rng: rng.state(), lastPrice: p, peak: p, momentum: 0, affinity,
    activity: 0.5 + affinity, mood, panic: 0,
    lastBuy: t.flows.npcBuy + t.flows.playerBuy, lastSell: t.flows.npcSell + t.flows.playerSell,
  };
}

/** Return unused external capital at death/cancellation. Held tokens settle through the existing curve ledger. */
export function releaseMicroCash(g: GameState, t: LpToken): void {
  if (!t.micro) return;
  for (const w of t.micro.traders) {
    if (w.accountId) continue;
    capital(g).cents += w.cashCents;
    w.cashCents = 0;
  }
}

function holding(g: GameState, t: LpToken, w: MicroTrader) {
  if (t.status === 'graduated') {
    const a = w.accountId ? g.market.accounts[w.accountId] : undefined;
    const pos = a?.positions[t.ticker];
    return { qty: Math.max(0, pos?.qty ?? 0), cost: (pos?.avgCost ?? 0) * Math.max(0, pos?.qty ?? 0),
      cashCents: Math.max(0, Math.floor((a?.cash ?? 0) * 100)) };
  }
  let qty = 0, cost = 0;
  for (const c of cohortsOf(t)) if (c.wallet === w.id) { qty += c.tokens; cost += c.cost; }
  return { qty, cost, cashCents: w.cashCents };
}

function sell(g: GameState, t: LpToken, w: MicroTrader, qty: number, out: StepOutput | null): boolean {
  if (!(qty > 0)) return false;
  if (t.status === 'graduated') return engineOrder(g, t, w, 'sell', qty);
  const cs = cohortsOf(t);
  let remaining = qty;
  const plan = cs.map(c => {
    const n = c.wallet === w.id ? Math.min(c.tokens, remaining) : 0;
    remaining -= n;
    return n;
  });
  if (remaining > 0) return false;
  return sellCurve(g, null, t.ticker, qty, 1, out, true, plan, false, w).ok;
}

function engineOrder(g: GameState, t: LpToken, w: MicroTrader, side: 'buy' | 'sell', qty: number): boolean {
  if (!w.accountId || g.market.orders.some(o => o.status === 'open' && o.playerId === w.accountId && o.assetId === t.ticker)) return false;
  const r = placeOrder(g.market, { playerId: w.accountId, assetId: t.ticker, side, type: 'market', qty });
  g.market = r.state;
  return r.order.status === 'open';
}

/** A tick contains a bounded series of orders, each reacting to the reserves left by the previous fill. */
export function microTick(g: GameState, t: LpToken, out: StepOutput | null): void {
  if (!MICROFLOW.enabled || t.status === 'dead') return;
  const m = ensure(g, t);
  const rng = new Rng(m.rng);
  const tick = g.market.tick;
  const before = priceNow(g, t);
  const change = Math.log(before / m.lastPrice);
  const buy = t.flows.npcBuy + t.flows.playerBuy;
  const sale = t.flows.npcSell + t.flows.playerSell;
  const net = buy - m.lastBuy - (sale - m.lastSell);
  m.lastBuy = buy; m.lastSell = sale;
  m.momentum = clamp(m.momentum * 0.7 + change * 0.3, -0.6, 0.6);
  m.activity = clamp(m.activity * 0.9 + Math.abs(change) * 5 + Math.min(1, Math.abs(net) / 3000), 0, 3);
  m.peak = Math.max(before, m.peak * 0.997);
  const drawdown = 1 - before / m.peak;
  m.panic = Math.max(m.panic * 0.72, drawdown > 0.14 ? Math.min(1, drawdown * 2) : 0);
  if (rng.chance(0.08)) m.mood = clamp(m.mood * 0.5 + (rng.uniform() * 2 - 1) * 0.9, -1, 1);
  const age = Math.max(0, tick - t.createdTick);
  const attention = m.affinity * Math.exp(-age / (TPD * 0.6)) + m.activity * 0.2;
  const active = rng.chance(clamp(0.12 + attention * 0.65, 0.05, 0.95));
  const orders = active ? Math.min(MICROFLOW.maxOrders, 1 + Math.floor(rng.uniform() * (2 + attention * 6))) : 0;
  for (let n = 0; n < orders; n++) {
    const w = m.traders[Math.floor(rng.uniform() * m.traders.length)]!;
    const bag = holding(g, t, w);
    const p = priceNow(g, t);
    const avg = bag.qty > 0 ? bag.cost / bag.qty : p;
    const profit = avg > 0 ? p / avg : 1;
    const pressure = Math.log(p / before);
    const panic = clamp(m.panic + Math.max(0, -pressure) * 2, 0, 1);
    const stopped = profit < 1 - w.stop && w.style !== 'holder';
    const taking = profit >= w.takeProfit;
    const tired = tick - w.lastAction > w.patience;
    let bias = m.mood + m.momentum * (w.style === 'trend' ? 4 : 1);
    if (w.style === 'dip') bias += drawdown > 0.05 && panic < 0.4 ? 0.5 : -0.2;
    if (w.style === 'scalp') bias += profit < 0.95 ? 0.6 : profit > 1.08 ? -0.7 : 0;
    if (w.style === 'holder') bias += 0.2;
    const sellChance = stopped ? 0.95 : taking ? 0.8 : clamp(0.3 - bias * 0.25 + panic * 0.6 + (tired ? 0.2 : 0), 0.05, 0.95);
    let acted = false;
    if (bag.qty > 0 && rng.chance(sellChance)) {
      const frac = stopped || panic > 0.6 ? 0.5 + 0.5 * rng.uniform() : 0.12 + 0.6 * rng.uniform();
      const qty = Math.max(1, Math.floor(bag.qty * frac));
      acted = sell(g, t, w, qty, out);
    } else if (bag.cashCents >= 100 && rng.chance(clamp(0.6 + bias * 0.2 - panic * 0.5, 0.05, 0.9))) {
      const large = rng.chance(w.style === 'whale' ? 0.35 : 0.08);
      const fraction = large ? 0.55 + 0.4 * rng.uniform() : 0.08 + 0.35 * rng.uniform();
      const spend = Math.floor(bag.cashCents * fraction);
      if (t.status === 'live') {
        // Heavy-tailed prints can move a thin curve by dozens of percent, but cannot spend more than the wallet owns.
        const limit = cashReserveAt(t.y) * (large ? 0.3 : 0.1) * 100;
        acted = buyCurve(g, null, t.ticker, Math.min(spend, Math.floor(limit)), 1, out, true, false, w).ok;
      } else {
        acted = engineOrder(g, t, w, 'buy', Math.floor(spend / 100 / p / 1.15));
      }
    }
    if (acted) {
      w.lastAction = tick;
      m.activity = Math.min(3, m.activity + 0.12);
      if (t.status === 'live') {
        t.lastTradeTick = tick;
        // The wallet id comes from settlement. No synthetic rows and no reassignment after a tape wrap.
        const last = t.tape[t.tape.length - 1];
        if (last) last.anon = anonOf(t.ticker, w.id);
      }
      m.peak = Math.max(m.peak, priceNow(g, t));
    }
  }
  const after = priceNow(g, t);
  m.momentum = clamp(m.momentum + 0.4 * Math.log(after / before), -0.6, 0.6);
  m.lastPrice = after;
  m.peak = Math.max(m.peak, after);
  m.rng = rng.state();
}
