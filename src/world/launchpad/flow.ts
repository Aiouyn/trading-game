import { Rng } from '@/engine';
import { cashOf, debit, notify, TPD } from '../core';
import type { CommandResult, GameState, StepOutput } from '../types';
import { BUZZ_DECAY, LP, NPC, curveAccountId, npcAccountId } from './constants';
import { formulaCashAt, spotAt } from './curve';
import { liquidateCohort, sellCurve } from './trade';
import { npcLaunchDraw } from './launch';
import { buzzOf, arrive } from './demand';
import { absorbPending } from './absorb';
import { openSellQty } from './graduate';
import { priceNow } from './rug';
import { dayOf, ensureLaunchpad, lpWire, refuse, sinkCents, tokenOf } from './state';
import { placeOrder } from '@/engine';
import type { LpToken } from './types';

/**
 * The hype and the NPC flow (lead-launchpad.md L6, as amended in v1.1 and v1.2), run once per tick by stepGame. Every live token:
 *   - its buzz decays (the base with a two-day half-life, the Quay billboard in six ticks, the Wire promo in a day);
 *   - it takes rare viral shocks (a finite-mean heavy tail: few tokens, few shocks), and each shock and buzz item is an ARRIVAL; a
 *     player's buy is not one (L6.5);
 *   - an arrival is bought by the NPC cohort in full in the tick it arrives (L6.4, absorb.ts), so no player can act before the top;
 *   - an NPC sniper buys inside the launch command (launch.ts sniperEnter) and sells here into the first hype (so players cannot
 *     farm the edge: no fill can sit between a launch and the sniper's price impact);
 *   - the cohort sells into the fade (slow bleed): a capitulation share that grows as the buzz falls below its peak since the last
 *     arrival, a time share, and profit taking above its cost. It never sells tokens it does not hold;
 *   - a token dies with no trade for 24 game days, or with curve cash under 2% of the raise for 7 game days (counted from the
 *     launch, tested from day 3). At death the cohort sells what it holds to the curve, so the NPC side is flat in tokens;
 *   - a graduated token's cohort position is unwound into the liquidity book through the engine's order path, with a one-day
 *     half-life (L6.2), and the proceeds are booked as the npcRetail sink.
 * A world with no launch does nothing here (the state is absent), so its fingerprints do not move.
 */

const RAISE_LINE = 0.02 * formulaCashAt(LP.GRAD_Y);

/** Buzz items: a Quay billboard or a Wire promo. Sinks; at most three per token per game day. */
export function buyBuzz(g: GameState, pid: string, ticker: string, kind: 'board' | 'wire', out: StepOutput | null): CommandResult {
  const t = tokenOf(g, ticker);
  if (!t) return refuse('noToken', { ticker });
  if (t.status === 'graduated') return refuse('graduated', { ticker });
  if (t.status === 'dead') return refuse('dead', { ticker });
  const day = dayOf(g.market.tick);
  if (t.buzzDay.day !== day) t.buzzDay = { day, n: 0 };
  if (t.buzzDay.n >= LP.BUZZ_MAX_PER_DAY) return refuse('buzzCap', { max: LP.BUZZ_MAX_PER_DAY });
  const cost = kind === 'board' ? LP.BOARD_COST : LP.WIRE_PROMO_COST;
  if (cashOf(g, pid) < cost) return refuse('cash', { need: cost.toLocaleString('en-US') });
  debit(g, pid, cost, 'lpBuzz');
  ensureLaunchpad(g).totals.buzz += cost;
  t.buzzDay.n++;
  if (kind === 'board') {
    t.buzz.board += LP.BOARD_ADD;
    arrive(t, LP.BOARD_ADD);
  } else {
    t.buzz.wire += LP.WIRE_ADD;
    arrive(t, LP.WIRE_ADD);
    lpWire(g, out, 'info', 'Sponsored', { key: 'lp.wire.promo', vars: { name: t.name, ticker: t.ticker } }, t.ticker);
  }
  t.promos.push({ tick: g.market.tick, kind });
  if (t.promos.length > 20) t.promos.splice(0, t.promos.length - 20);
  // L6.4: the arrival is bought by the cohort in full now, before any player can act on the promoted token
  absorbPending(g, t, out);
  return { ok: true, data: { kind, cost } };
}

/**
 * One tick of the NPC cohort on a token (L6.1). The sniper first (its exit, if it is in). Otherwise the cohort buys its pending
 * demand (the arrivals, decayed by the buy half-life) and sells into the fade: the capitulation share is NPC.CAPIT_PER_TICK times
 * (1 - buzz / peak), where the peak is the buzz since the last arrival (it never falls below the buzz now); the profit share is
 * NPC.PROFIT_PER_TICK times the price's gain over the cohort's cost, and the time share is NPC.TIME_SELL_PER_TICK. The sell is at
 * any price, and never more than the cohort holds. A sell and a buy in the same tick are two fills through the curve.
 */
function npcFlow(g: GameState, t: LpToken, out: StepOutput | null): void {
  const tick = g.market.tick;
  // the sniper's exit: it entered in the launch command (sniperEnter) and sells into the first hype, or after its time
  if (t.sniper) {
    const spot = spotAt(t.y);
    if (spot >= t.sniper.entry * NPC.SNIPER_EXIT_MULT || tick - t.sniper.tick >= NPC.SNIPER_EXIT_TICKS) {
      const qty = Math.min(t.sniper.tokens, t.npcBal);
      t.sniper = undefined;
      if (qty > 0) sellCurve(g, null, t.ticker, qty, 1, out, true);
      return;
    }
  }
  const buzz = buzzOf(t);
  const peak = Math.max(t.npcPeak ?? buzz, buzz);
  t.npcPeak = peak;
  // the sell: capitulation into the fade, profit taking above the cohort's cost, and the time share
  const spot = spotAt(t.y);
  const avg = t.npcBal > 0 ? t.npcCost / t.npcBal : 0;
  const gain = avg > 0 ? spot / avg - 1 : 0;
  const fade = peak > 0 ? Math.max(0, 1 - buzz / peak) : 0;
  const share = Math.min(1, NPC.CAPIT_PER_TICK * fade + (gain > 0 ? NPC.PROFIT_PER_TICK * gain : 0) + NPC.TIME_SELL_PER_TICK);
  const sellTokens = Math.min(t.npcBal, Math.floor(t.npcBal * share));
  if (sellTokens > 0) sellCurve(g, null, t.ticker, sellTokens, 1, out, true);
  // the buy: arrivals are absorbed in full in the tick they arrive (L6.4), so only a demand a refused fill left pending waits here
  absorbPending(g, t, out);
}

/**
 * L6.2, post-graduation unwind. The cohort's engine position is sold into the liquidity book through the engine's order path (a
 * market sell, matched by the engine's single impact path), a share of what it still holds each tick, so the half-life is one game
 * day. The sells already resting are counted, so a slow fill is not sold twice. The proceeds are swept to the npcRetail sink, so
 * the NPC side's cash is booked like its curve cash.
 */
export function unwindGraduated(g: GameState): void {
  const s = g.launchpad;
  if (!s) return;
  const share = 1 - Math.pow(0.5, 1 / (NPC.UNWIND_HALF_DAYS * TPD));
  for (const ticker of s.order) {
    const t = s.tokens[ticker];
    if (!t || t.status !== 'graduated') continue;
    const id = npcAccountId(ticker);
    const acct = g.market.accounts[id];
    if (!acct) continue;
    const cashC = Math.round(acct.cash * 100);
    if (cashC > 0) {
      sinkCents(g, id, 'npcRetail', cashC);
      t.flows.npcSell += cashC / 100;
    }
    const pos = acct.positions[ticker]?.qty ?? 0;
    if (!(pos > 0)) continue;
    const want = Math.min(pos, Math.max(1, Math.floor(pos * share)));
    const qty = want - openSellQty(g, id, ticker);
    if (qty <= 0) continue;
    const r = placeOrder(g.market, { playerId: id, assetId: ticker, side: 'sell', type: 'market', qty });
    g.market = r.state;
  }
}

/**
 * Tick work for the Launchpad. Returns nothing: deaths and graduations are recorded on the tokens and in the Wire and the inbox.
 */
export function lpTick(g: GameState, out: StepOutput | null): void {
  const s = g.launchpad;
  if (!s) return;
  const tick = g.market.tick;
  const day = dayOf(tick);
  const newDay = tick > 1 && (tick - 1) % TPD === 0;
  if (s.npcLaunches) {
    // world launches: one draw per tick at the daily rate
    const rng = new Rng(s.worldRng);
    const hit = rng.chance(NPC.LAUNCHES_PER_DAY / TPD);
    s.worldRng = rng.state();
    if (hit) npcLaunchDraw(g, out);
  }
  if (newDay) {
    // a graduated token's day starts at the engine's price (the post-graduation sweep test reads it, rug.ts priceNow)
    for (const ticker of s.order) {
      const t = s.tokens[ticker];
      if (t?.status === 'graduated') t.creatorDay = { day, qty: 0, proceeds: 0, startPrice: priceNow(g, t), wired: false };
    }
  }
  for (const ticker of s.order) {
    const t = s.tokens[ticker];
    if (!t || t.status !== 'live') continue;
    if (newDay) {
      t.volPrev = t.volToday;
      t.volToday = 0;
      t.creatorDay = { day, qty: 0, proceeds: 0, startPrice: spotAt(t.y), wired: false };
    }
    t.buzz.base *= BUZZ_DECAY.base;
    t.buzz.board *= BUZZ_DECAY.board;
    t.buzz.wire *= BUZZ_DECAY.wire;
    let rng = new Rng(t.rng);
    if (rng.chance(NPC.VIRAL_PER_DAY / TPD)) {
      const shock = NPC.VIRAL_SCALE * (Math.pow(Math.max(1e-9, rng.uniform()), -1 / NPC.VIRAL_ALPHA) - 1);
      t.buzz.base += shock;
      arrive(t, shock);
      // L6.4: the shock is bought by the cohort in full in this tick. A graduation inside that fill advances the token's stream, so the
      // local stream is taken again from the token after it
      t.rng = rng.state();
      absorbPending(g, t, out);
      rng = new Rng(t.rng);
    }
    if (t.status === 'live') npcFlow(g, t, out);
    t.rng = rng.state();
    // the death rules (L3)
    const curveCash = g.market.accounts[curveAccountId(t.ticker)]?.cash ?? 0;
    if (curveCash < RAISE_LINE) {
      if (t.cashLowSince === null) t.cashLowSince = tick;
    } else {
      t.cashLowSince = null;
    }
    if (t.status === 'live') {
      if (tick - t.lastTradeTick >= LP.DEAD_NO_TRADE_DAYS * TPD) kill(g, t, 'noTrade', out);
      // the cash clock counts from the later of the first low tick and day 3 (L3: "7 game days after day 3"), so a launch on day 2
      // with no funding is dead on day 10, not day 9
      else if (t.cashLowSince !== null && tick - Math.max(t.cashLowSince, LP.DEAD_CASH_START_TICK) >= LP.DEAD_CASH_DAYS * TPD) kill(g, t, 'cash', out);
    }
    if (t.status === 'live' && tick % LP.CHART_EVERY === 0) {
      t.chart.push([tick, spotAt(t.y)]);
      if (t.chart.length > 400) t.chart.splice(0, t.chart.length - 400);
    }
  }
  unwindGraduated(g);
  if (newDay) rumorOfTheDay(g, out, day);
}

function kill(g: GameState, t: LpToken, reason: 'noTrade' | 'cash', out: StepOutput | null): void {
  // the cohort's tokens go back to the curve first (the dead token's curve still pays sellers), so the NPC side ends flat
  liquidateCohort(g, t, out);
  t.status = 'dead';
  t.deadTick = g.market.tick;
  t.deadReason = reason;
  ensureLaunchpad(g).totals.deaths++;
  if (t.creatorId) {
    notify(g, out, t.creatorId, { kind: 'system', tone: 'loss', text: `${t.name} (${t.ticker}) is dead: no more trading.`, msg: { key: `lp.inbox.dead.${reason}`, vars: { name: t.name, ticker: t.ticker } } });
  }
}

/** One Wire rumor a game day, for the top trending token by its last whole game day of volume (a template line). */
function rumorOfTheDay(g: GameState, out: StepOutput | null, day: number): void {
  const s = g.launchpad!;
  if (s.rumorDay === day) return;
  let top: LpToken | null = null;
  for (const ticker of s.order) {
    const t = s.tokens[ticker];
    if (!t || t.status !== 'live' || t.volPrev <= 0) continue;
    if (!top || t.volPrev > top.volPrev) top = t;
  }
  if (!top) return;
  s.rumorDay = day;
  lpWire(g, out, 'info', 'Rumor', { key: 'lp.wire.rumor', vars: { name: top.name, ticker: top.ticker } }, top.ticker);
}

/** The ticker-level helper the view and the balance harness read: the curve cash of a token (dollars). */
export function curveCashOf(g: GameState, ticker: string): number {
  return g.market.accounts[curveAccountId(ticker)]?.cash ?? 0;
}
