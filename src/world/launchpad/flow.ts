import { Rng } from '@/engine';
import { cashOf, debit, notify, TPD } from '../core';
import type { CommandResult, GameState, StepOutput } from '../types';
import { BUZZ_DECAY, LP, NPC, curveAccountId } from './constants';
import { formulaCashAt, spotAt } from './curve';
import { buyCurve, sellCurve } from './trade';
import { npcLaunchDraw } from './launch';
import { dayOf, ensureLaunchpad, lpWire, refuse, tokenOf } from './state';
import type { LpToken } from './types';

/**
 * The hype and the NPC flow (lead-launchpad.md L6), run once per tick by stepGame. Every live token:
 *   - its buzz decays (the base with a two-day half-life, the Quay billboard in six ticks, the Wire promo in a day);
 *   - it takes rare viral shocks (a heavy tail: few tokens, few shocks);
 *   - an NPC sniper buys in the first ticks and sells into the first hype (so players cannot farm the edge);
 *   - the NPC retail trades the curve: buy pressure from the buzz, or profit taking that grows with the price's rise above the
 *     cohort's cost and with time. The cohort's tokens are tracked and never sold beyond what it holds;
 *   - a token dies with no trade for 24 game days, or with curve cash under 2% of the raise for 7 game days (counted from the
 *     launch, tested from day 3).
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
  if (kind === 'board') t.buzz.board += LP.BOARD_ADD;
  else {
    t.buzz.wire += LP.WIRE_ADD;
    lpWire(g, out, 'info', 'Sponsored', { key: 'lp.wire.promo', vars: { name: t.name, ticker: t.ticker } }, t.ticker);
  }
  t.promos.push({ tick: g.market.tick, kind });
  if (t.promos.length > 20) t.promos.splice(0, t.promos.length - 20);
  return { ok: true, data: { kind, cost } };
}

/** One NPC retail or sniper action on a token (a single fill per tick: the bigger of the two signals). */
function npcFlow(g: GameState, t: LpToken, rng: Rng, out: StepOutput | null): void {
  const tick = g.market.tick;
  // the sniper: one small buy in the first ticks, sold into the first hype
  if (!t.sniperDone && tick >= t.createdTick + 2) {
    t.sniperDone = true;
    const spendDollars = NPC.SNIPER_MIN + (NPC.SNIPER_MAX - NPC.SNIPER_MIN) * rng.uniform();
    const r = buyCurve(g, null, t.ticker, Math.round(spendDollars * 100), 1, out, true);
    if (r.ok) {
      const d = r.data as { tokens: number; avgPrice: number };
      t.sniper = { tick, tokens: d.tokens, entry: d.avgPrice };
    }
    return;
  }
  if (t.sniper) {
    const spot = spotAt(t.y);
    if (spot >= t.sniper.entry * NPC.SNIPER_EXIT_MULT || tick - t.sniper.tick >= NPC.SNIPER_EXIT_TICKS) {
      const qty = Math.min(t.sniper.tokens, t.npcBal);
      t.sniper = undefined;
      if (qty > 0) sellCurve(g, null, t.ticker, qty, 1, out, true);
      return;
    }
  }
  const buzz = t.buzz.base + t.buzz.board + t.buzz.wire;
  const buyDollars = NPC.BUY_PER_TICK * buzz;
  const spot = spotAt(t.y);
  const avg = t.npcBal > 0 ? t.npcCost / t.npcBal : 0;
  const gain = avg > 0 ? spot / avg - 1 : 0;
  const share = Math.min(1, (gain > 0 ? NPC.PROFIT_PER_TICK * gain : 0) + NPC.TIME_SELL_PER_TICK);
  const sellTokens = Math.floor(t.npcBal * share);
  if (sellTokens > 0 && sellTokens * spot > buyDollars) {
    sellCurve(g, null, t.ticker, sellTokens, 1, out, true);
  } else if (buyDollars >= 0.01) {
    buyCurve(g, null, t.ticker, Math.round(buyDollars * 100), 1, out, true);
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
    const rng = new Rng(t.rng);
    if (rng.chance(NPC.VIRAL_PER_DAY / TPD)) {
      t.buzz.base += NPC.VIRAL_SCALE * (Math.pow(Math.max(1e-9, rng.uniform()), -1 / NPC.VIRAL_ALPHA) - 1);
    }
    npcFlow(g, t, rng, out);
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
      else if (t.cashLowSince !== null && day >= LP.DEAD_CASH_FROM_DAY && tick - t.cashLowSince >= LP.DEAD_CASH_DAYS * TPD) kill(g, t, 'cash', out);
    }
    if (t.status === 'live' && tick % LP.CHART_EVERY === 0) {
      t.chart.push([tick, spotAt(t.y)]);
      if (t.chart.length > 400) t.chart.splice(0, t.chart.length - 400);
    }
  }
  if (newDay) rumorOfTheDay(g, out, day);
}

function kill(g: GameState, t: LpToken, reason: 'noTrade' | 'cash', out: StepOutput | null): void {
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
