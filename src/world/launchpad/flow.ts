import { Rng } from '@/engine';
import { cashOf, debit, notify, spendableCash, TPD } from '../core';
import type { CommandResult, GameState, StepOutput } from '../types';
import { BUZZ_DECAY, LP, NPC, curveAccountId, npcAccountId } from './constants';
import { formulaCashAt, spotAt } from './curve';
import { liquidateCohort, sellCurve } from './trade';
import { npcLaunchDraw } from './launch';
import { arrive, viralPerTick } from './demand';
import { cohortsOf } from './cohorts';
import { crowdTick } from './crowd';
import { microTick, MICROFLOW, releaseMicroCash } from './microflow';
import { absorbPending } from './absorb';
import { openSellQty } from './graduate';
import { priceNow } from './rug';
import { npcReplyTick } from './reply';
import { carryBar } from './bars';
import { dayOf, ensureLaunchpad, lpWire, refuse, sinkCents, tokenOf } from './state';
import { placeOrder } from '@/engine';
import type { LpToken } from './types';

/**
 * The hype and the NPC flow (lead-launchpad.md L6, as amended in v1.1 and v1.2), run once per tick by stepGame. Every live token:
 *   - its buzz decays (the base with a two-day half-life, the Quay billboard in six ticks, the Wire promo in a day);
 *   - it takes viral shocks at a hazard that falls with its age (L6.7, v1.3; a finite-mean heavy tail in size), and each shock and buzz item is an ARRIVAL; a
 *     player's buy is not one (L6.5);
 *   - an arrival is bought by the NPC cohort in full in the tick it arrives (L6.4, absorb.ts), so no player can act before the top;
 *   - an NPC sniper buys inside the launch command (launch.ts sniperEnter) and sells here into the first hype (so players cannot
 *     farm the edge: no fill can sit between a launch and the sniper's price impact);
 *   - the crowd (crowd.ts) then trades the coin: holders keep a bag until it is far above cost or the story has died, scalpers
 *     fade the average, faders sell into a chase, and FOMO and news chasers buy late and small. A player buy is not an arrival;
 *   - funded participants (microflow.ts) create bounded bursts of real orders with persistent cash, entry costs and exits;
 *     their accounts survive graduation, and their tape identities match their holder rows;
 *   - a token dies with no trade for 24 game days, or with curve cash under 2% of the raise at the close of 7 game days in a row,
 *     the closes counted from day 3 (L3.1, v1.3). At death the cohorts sell what they hold to the curve, so the NPC side is flat in tokens;
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
  // R-9-6 (Phase 9 rulings): a buzz item is an op, and restricted (ad or fresh-start) cash cannot pay for it
  if (spendableCash(g, pid) < cost) return refuse(cashOf(g, pid) >= cost ? 'adCashOps' : 'cash', { need: cost.toLocaleString('en-US'), name: t.name });
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
 * One tick of the NPC side (L6, as amended). The sniper exits first, into the first hype or on its clock. Otherwise the crowd
 * trades (crowd.ts): holders no longer sell on a timer while the story is alive. Arrivals left pending are absorbed here, which
 * is only a fill the curve refused earlier (a fresh arrival is absorbed by its caller in the same tick, L6.4).
 */
function npcFlow(g: GameState, t: LpToken, out: StepOutput | null): void {
  const tick = g.market.tick;
  // the sniper's exit: it entered in the launch command (sniperEnter) and sells into the first hype, or after its time
  if (t.sniper) {
    const spot = spotAt(t.y);
    if (spot >= t.sniper.entry * NPC.SNIPER_EXIT_MULT || tick - t.sniper.tick >= NPC.SNIPER_EXIT_TICKS) {
      // the sniper's tokens leave its own cohort (v1.2 review item 5), never the other cohorts
      const cs = cohortsOf(t);
      const si = cs.findIndex((c) => c.sniper);
      const entered = t.sniper.tokens;
      t.sniper = undefined;
      if (si >= 0) {
        const sc = cs[si]!;
        delete sc.sniper;
        const qty = Math.min(entered, sc.tokens);
        if (qty > 0) sellCurve(g, null, t.ticker, qty, 1, out, true, cs.map((_, i) => (i === si ? qty : 0)));
      }
      return;
    }
  }
  const buzz = t.buzz.base + t.buzz.board + t.buzz.wire;
  t.npcPeak = Math.max(t.npcPeak ?? buzz, buzz);
  crowdTick(g, t, out);
  // a demand a refused fill left pending waits here. A fresh arrival was absorbed by its caller (L6.4)
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
    // L6.7: the hazard falls with the token's age; a live token only (a dead or graduated token takes no shock)
    if (rng.chance(viralPerTick(tick - t.createdTick))) {
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
    // the death rules (L3, L3.1 as v1.3): no trade for 24 game days, or the cash clock. The cash clock counts CLOSES: at the close of each
    // game day (the day's last tick) from day 3 on, a close with curve cash under the line adds one, a close above it resets the count.
    // An intraday round trip does not reset it, so a token cannot be kept alive by a buy and sell inside one day.
    const curveCash = g.market.accounts[curveAccountId(t.ticker)]?.cash ?? 0;
    if (t.status === 'live') {
      if (tick - t.lastTradeTick >= LP.DEAD_NO_TRADE_DAYS * TPD) kill(g, t, 'noTrade', out);
      else if (tick % TPD === 0 && dayOf(tick) >= LP.DEAD_CASH_FROM_DAY) {
        t.lowCloses = curveCash < RAISE_LINE ? (t.lowCloses ?? 0) + 1 : 0;
        if (t.lowCloses >= LP.DEAD_CASH_DAYS) kill(g, t, 'cash', out);
      }
    }
    // the trades table's crowd. After the death check, so a coin that just died does not keep a wall.
    if (t.wall) t.wall = undefined;
  }
  // Curve and graduated candles carry the last fill on idle minutes. Engine fills touch OHLC in lpFills; sampling the mid here
  // would overwrite a boundary tick's closing fill. Every token that is not dead may get an NPC reply (reply.ts).
  for (const ticker of s.order) {
    const t = s.tokens[ticker];
    if (!t || t.status === 'dead') continue;
    if (MICROFLOW.enabled) microTick(g, t, out);
    if (tick % LP.CHART_EVERY === 0) {
      carryBar(t, tick, priceNow(g, t));
    }
    npcReplyTick(g, t);
  }
  unwindGraduated(g);
  if (newDay) rumorOfTheDay(g, out, day);
}

function kill(g: GameState, t: LpToken, reason: 'noTrade' | 'cash', out: StepOutput | null): void {
  // the cohort's tokens go back to the curve first (the dead token's curve still pays sellers), so the NPC side ends flat
  liquidateCohort(g, t, out);
  releaseMicroCash(g, t);
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
