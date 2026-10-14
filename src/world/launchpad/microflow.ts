import { Rng, seedStream, placeOrder, openAccount, buyingPower } from '@/engine';
import type { GameState, StepOutput } from '../types';
import type { LpToken, MicroState, MicroTrader } from './types';
import { TPD } from './constants';
import historicalFlow from './historical-flow.json';
import { cashReserveAt } from './curve';
import { cohortsOf } from './cohorts';
import { buyCurve, sellCurve } from './trade';
import { anonOf } from './anon';
import { priceNow } from './rug';
import { faucetCents } from './state';

/** Game calibration, not a claim of a statistical fit. All prices still come from settled orders. */
export const MICROFLOW = {
  enabled: true,
  traders: 24,
  population: 240,
  maxOrders: 32,
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const styles: MicroTrader['style'][] = ['trend', 'dip', 'scalp', 'holder', 'whale'];

/** Each world trader is funded once. The engine account is the sole balance across every coin. */
function population(g: GameState): void {
  if (g.market.accounts['lp:npc:trader:239']) return;
  const rng = new Rng(seedStream(g.seed, 'lp:population'));
  for (let i = 0; i < MICROFLOW.population; i++) {
    const id = `lp:npc:trader:${i}`;
    const cents = Math.round((2_000 + rng.uniform() * 48_000) * 100);
    if (g.market.accounts[id]) continue;
    g.market = openAccount(g.market, id, 0);
    faucetCents(g, id, 'npcRetail', cents);
  }
}

function chooseEpisode(m: MicroState, tick: number, rng: Rng): void {
  const kind = m.affinity > 0.45 ? 'hot' : m.affinity > 0.25 ? 'mixed' : 'quiet';
  const candidates = historicalFlow.map((p, i) => ({p, i})).filter(x => x.p.kind === kind);
  m.episode = { profile: candidates[Math.floor(rng.uniform() * candidates.length)]!.i, startTick: tick, cursor: 0 };
}

function ensure(g: GameState, t: LpToken): MicroState {
  population(g);
  const rng = new Rng(t.micro?.rng ?? seedStream(g.seed, `lp:micro:${t.ticker}`));
  if (t.micro?.episode) return t.micro;
  // Convert old external wallets exactly once; cash and owned bags are preserved.
  const previous = t.micro?.traders ?? [];
  if (t.status === 'graduated') {
    const cash = g.market.accounts[`lp:book:${t.ticker}`]?.cash ?? 0;
    g.market.config = {...g.market.config, assets:g.market.config.assets.map(a =>
      a.id === t.ticker && (a.advNotional ?? 0) > 1_000_000 ? {...a,advNotional:Math.max(1000,cash)} : a)};
  }
  for (const w of previous) {
    if (!g.market.accounts[w.id]) g.market = openAccount(g.market, w.id, 0);
    if (!w.accountId && w.cashCents > 0) faucetCents(g, w.id, 'npcRetail', w.cashCents);
    w.cashCents = 0;
    w.accountId = w.id;
  }
  const ids = Array.from({length: MICROFLOW.population}, (_, i) => i);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng.uniform() * (i + 1));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  const traders = ids.slice(0, MICROFLOW.traders).map((id): MicroTrader => ({
    id: `lp:npc:trader:${id}`, accountId: `lp:npc:trader:${id}`, style: styles[id % styles.length]!, cashCents: 0,
    takeProfit: 1.12 + 1.5 * rng.uniform(), stop: 0.06 + 0.3 * rng.uniform(),
    patience: 12 + Math.floor(rng.uniform() * 120), lastAction: g.market.tick,
  }));
  const p = priceNow(g, t);
  const m = t.micro ?? {
    traders: [], rng: rng.state(), lastPrice: p, peak: p, momentum: 0, affinity: 0.2 + 0.8 * rng.uniform(),
    activity: 1, mood: 2 * rng.uniform() - 1, panic: 0,
    lastBuy: t.flows.npcBuy + t.flows.playerBuy, lastSell: t.flows.npcSell + t.flows.playerSell,
  };
  m.traders = [...traders, ...previous];
  chooseEpisode(m, t.createdTick, rng);
  const elapsed = g.market.tick - t.createdTick;
  const events = historicalFlow[m.episode!.profile]!.events;
  if (elapsed > 1) while (m.episode!.cursor < events.length && events[m.episode!.cursor]![0]! < elapsed) m.episode!.cursor++;
  m.rng = rng.state();
  return t.micro = m;
}

/** Persistent accounts keep spare cash after death/cancellation; only legacy external fields are retired. */
export function releaseMicroCash(_g: GameState, t: LpToken): void {
  if (!t.micro) return;
  for (const w of t.micro.traders) {
    if (w.accountId) continue;
    // Legacy off-world cash is retired; persistent accounts retain their sale proceeds.
    w.cashCents = 0;
  }
}

function holding(g: GameState, t: LpToken, w: MicroTrader) {
  if (t.status === 'graduated') {
    const a = w.accountId ? g.market.accounts[w.accountId] : undefined;
    const pos = a?.positions[t.ticker];
    return { qty: Math.max(0, pos?.qty ?? 0), cost: (pos?.avgCost ?? 0) * Math.max(0, pos?.qty ?? 0),
      cashCents: w.accountId ? Math.max(0, Math.floor(Math.min(a?.cash ?? 0, buyingPower(g.market,w.accountId)) * 100)) : 0 };
  }
  let qty = 0, cost = 0;
  for (const c of cohortsOf(t)) if (c.wallet === w.id) { qty += c.tokens; cost += c.cost; }
  return { qty, cost, cashCents: w.accountId ? Math.max(0, Math.floor(Math.min(g.market.accounts[w.accountId]?.cash ?? 0, buyingPower(g.market,w.accountId)) * 100)) : w.cashCents };
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

/** Bootstrap observed order signs, timing and reserve-relative sizes; settlement determines prices. */
function historicalTick(g: GameState, t: LpToken, m: MicroState, rng: Rng, out: StepOutput | null): void {
  const e = m.episode!;
  const events = historicalFlow[e.profile]!.events;
  const elapsed = g.market.tick - e.startTick;
  let n = 0;
  while (e.cursor < events.length && events[e.cursor]![0]! <= elapsed && n++ < MICROFLOW.maxOrders) {
    const [, signed, actor] = events[e.cursor++]!;
    let w = m.traders[actor!]!;
    let bag = holding(g, t, w);
    const p = priceNow(g, t);
    let acted = false;
    if (signed! > 0) {
      const depth = t.status === 'live' ? cashReserveAt(t.y) : Math.max(1000, g.market.accounts[`lp:book:${t.ticker}`]?.cash ?? 0);
      const spend = Math.min(bag.cashCents, Math.round(depth * signed! * 100));
      if (spend >= 100) acted = t.status === 'live'
        ? buyCurve(g, null, t.ticker, spend, 1, out, true, false, w).ok
        : engineOrder(g, t, w, 'buy', Math.floor(spend / 100 / p / 1.15));
    } else {
      // A missing historical bag cannot be shorted into existence. Another actual holder
      // may supply the observed sell intent, but only from its own inventory.
      if (bag.qty <= 0) {
        const holders = m.traders.filter(x => holding(g, t, x).qty > 0);
        if (holders.length === 0) continue;
        w = holders[Math.floor(rng.uniform() * holders.length)]!;
        bag = holding(g, t, w);
      }
      const reserve = t.status === 'live' ? t.y : (g.market.accounts[`lp:book:${t.ticker}`]?.positions[t.ticker]?.qty ?? 0);
      acted = sell(g, t, w, Math.min(bag.qty, Math.max(1, Math.floor(reserve * -signed!))), out);
    }
    if (acted) { w.lastAction = g.market.tick; t.lastTradeTick = g.market.tick; m.activity = Math.min(3, m.activity + .12); }
  }
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
  historicalTick(g, t, m, rng, out);
  if (tick - m.episode!.startTick > 120 && rng.chance(0.004 * m.affinity)) chooseEpisode(m, tick, rng);
  const attention = m.affinity * Math.exp(-age / (TPD * 0.6)) + m.activity * 0.2;
  const active = rng.chance(clamp(0.12 + attention * 0.65, 0.05, 0.95));
  // Discretionary decisions react to movement. They no longer drown the historical bursts
  // in a steady stream of unrelated, alternating orders.
  const orders = active && (Math.abs(change) > 0.04 || m.panic > 0.2) ? 1 + Math.floor(rng.uniform() * 3) : 0;
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
