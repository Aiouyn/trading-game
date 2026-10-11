import { Rng } from '@/engine';
import { rankIndex } from '@/content/lifestyle';
import { TPD, credit, debit, notify } from '../core';
import type { CommandResult, GameState, StepOutput } from '../types';
import { LP, NPC, curveAccountId } from './constants';
import { quoteBuy, spotAt } from './curve';
import { buyCurve, liquidateCohort } from './trade';
import { arrive } from './demand';
import { absorbPending } from './absorb';
import { moderateName, nameFormatOk, normalizeName, tickerFormatOk, type NameRefusal } from './moderate';
import { dayOf, ensureLaunchpad, hasOtherTrader, liveCountOf, lpWire, openCurve, refuse, streamOf, tokenOf } from './state';

import type { LpToken } from './types';


/**
 * Launch, cancel (lead-launchpad.md L2). A launch passes the gates (rank R1 or higher, the account age, the ban, one launch per
 * 24 real hours, at most three live tokens), the inputs (name, ticker, tagline from the template list, creator allocation 0 to 5%,
 * an optional dev buy within the creator cap), and the moderator filter. It pays the $1,000 fee (a sink) and opens the curve.
 */

/** The tagline templates (ids; the copy is in en.json and fr.json as lp.tagline.<id>). No free text in V1. */
export const TAGLINE_IDS = ['tg1', 'tg2', 'tg3', 'tg4', 'tg5', 'tg6', 'tg7', 'tg8'] as const;

const NAME_REFUSAL_CODE: Record<NameRefusal, string> = {
  abuse: 'nameAbuse', crypto: 'nameCrypto', brand: 'nameBrand', figure: 'nameFigure', taken: 'nameTaken',
};

/** Every normalised name in the world: each asset's name, and each token's name (live, dead or graduated). */
export function takenNames(g: GameState): Set<string> {
  const taken = new Set<string>();
  for (const a of g.market.config.assets) taken.add(normalizeName(a.name).joined);
  for (const t of Object.values(g.launchpad?.tokens ?? {})) taken.add(normalizeName(t.name).joined);
  return taken;
}

/** Whole real hours for a count of ticks (720 ticks is one real hour), for the copy of the gates. */
function hoursOf(ticks: number): number {
  return Math.max(1, Math.ceil(ticks / TPD));
}

export interface LaunchInput {
  name: string;
  ticker: string;
  tagline: string;
  allocation: number;
  devBuyCents?: number;
}

/** The creator's gate checks (rank, age, ban, cooldown, live count). Null when the launch may proceed. */
export function launchGate(g: GameState, pid: string): CommandResult | null {
  const p = g.players[pid];
  if (!p || p.npc) return refuse('noPlayer', {});
  const tick = g.market.tick;
  if (rankIndex(p.rankId) < LP.MIN_RANK_INDEX) return refuse('rank', {});
  const age = tick - p.joinedTick;
  if (age < LP.MIN_AGE_TICKS) return refuse('age', { hours: hoursOf(LP.MIN_AGE_TICKS - age) });
  const s = g.launchpad;
  const ban = s?.bans[pid];
  if (ban !== undefined && ban > tick) return refuse('ban', { hours: hoursOf(ban - tick) });
  const last = s?.lastLaunch[pid];
  if (last !== undefined && tick - last < LP.LAUNCH_COOLDOWN_TICKS) return refuse('cooldown', { hours: hoursOf(LP.LAUNCH_COOLDOWN_TICKS - (tick - last)) });
  if (s && liveCountOf(s, pid) >= LP.MAX_LIVE) return refuse('live', { max: LP.MAX_LIVE });
  return null;
}

/**
 * The inputs' checks (format, tagline, allocation) and the moderator's (names, tickers). Null when they pass. A ticker is taken
 * for good once any token has used it (live, dead, cancelled or graduated: a graduated token is an engine asset id, and a dead
 * one keeps its curve and its history), and for 30 game days after a launch in any case.
 */
export function launchInputError(g: GameState, input: LaunchInput): CommandResult | null {
  if (!nameFormatOk(input.name)) return refuse('nameFormat', { min: LP.NAME_MIN, max: LP.NAME_MAX });
  if (!tickerFormatOk(input.ticker)) return refuse('tickerFormat', { min: LP.TICKER_MIN, max: LP.TICKER_MAX });
  if (!(TAGLINE_IDS as readonly string[]).includes(input.tagline)) return refuse('tagline', {});
  if (!Number.isInteger(input.allocation) || input.allocation < 0 || input.allocation > LP.ALLOC_MAX) {
    return refuse('allocation', { max: LP.ALLOC_MAX.toLocaleString('en-US') });
  }
  if (g.market.config.assets.some((a) => a.id === input.ticker)) return refuse('tickerTaken', { ticker: input.ticker });
  const s = g.launchpad;
  if (s?.tokens[input.ticker]) return refuse('tickerTaken', { ticker: input.ticker });
  const seen = s?.tickerDay[input.ticker];
  if (seen !== undefined && dayOf(g.market.tick) - seen < LP.TICKER_HOLD_DAYS) return refuse('tickerRecent', { ticker: input.ticker, days: LP.TICKER_HOLD_DAYS });
  const tk = moderateName(input.ticker);
  if (tk.reason === 'crypto') return refuse('tickerCrypto', { ticker: input.ticker });
  if (tk.reason === 'abuse') return refuse('nameAbuse', {});
  const nm = moderateName(input.name, takenNames(g));
  if (nm.reason) return refuse(NAME_REFUSAL_CODE[nm.reason], { name: input.name });
  return null;
}

/**
 * Launches a token for a player. Every gate and input runs before any money or state moves. The dev buy (optional) runs through
 * the curve's own path right after the token exists: a refused buy rolls the token back, so a refused launch changes nothing, and
 * the fee is taken only once the launch has gone through.
 */
export function launchToken(g: GameState, pid: string, input: LaunchInput, out: StepOutput | null): CommandResult {
  const gate = launchGate(g, pid);
  if (gate) return gate;
  const bad = launchInputError(g, input);
  if (bad) return bad;
  const dev = input.devBuyCents ?? 0;
  if (!Number.isInteger(dev) || dev < 0) return refuse('devBuy', {});
  const need = LP.LAUNCH_FEE + dev / 100;
  const cash = g.market.accounts[pid]?.cash ?? 0;
  if (cash < need) return refuse('cash', { need: need.toLocaleString('en-US', { minimumFractionDigits: 2 }) });
  if (dev > 0) {
    const q = quoteBuy(LP.Y0, dev);
    if (!q.ok) return refuse('devBuy', {});
    if (q.slippage > LP.MAX_SLIP) return refuse('slippage', { slip: `${(q.slippage * 100).toFixed(1)}%`, max: `${(LP.MAX_SLIP * 100).toFixed(1)}%` });
    if (input.allocation + q.tokens > LP.CREATOR_CAP) return refuse('creatorCap', { room: Math.max(0, LP.CREATOR_CAP - input.allocation).toLocaleString('en-US') });
  }
  const s = ensureLaunchpad(g);
  const tick = g.market.tick;
  const t = createToken(g, input.ticker, input.name, input.tagline, pid, input.allocation, tick);
  s.tokens[t.ticker] = t;
  if (dev > 0) {
    const r = buyCurve(g, pid, t.ticker, dev, LP.MAX_SLIP, out, false);
    if (!r.ok) {
      // a refused buy changes nothing in the curve (buyCurve refuses before it moves money), so the rollback is the token and its account
      delete s.tokens[t.ticker];
      const { [curveAccountId(t.ticker)]: _curve, ...accounts } = g.market.accounts;
      void _curve;
      g.market = { ...g.market, accounts };
      return r;
    }
  }
  debit(g, pid, LP.LAUNCH_FEE, 'lpLaunchFee');
  s.totals.launchFee += LP.LAUNCH_FEE;
  s.totals.launches++;
  s.order.push(t.ticker);
  s.lastLaunch[pid] = tick;
  s.tickerDay[t.ticker] = dayOf(tick);
  s.seq++;
  // L6.4: the launch's own buzz is bought by the cohort in this tick (after the creator's dev buy, which is the creator's own fill)
  absorbPending(g, t, out);
  sniperEnter(g, t, out);
  const creator = g.players[pid]!;
  lpWire(g, out, 'brass', 'Launchpad', { key: 'lp.wire.launch', vars: { name: t.name, ticker: t.ticker, creator: creator.handle } }, t.ticker);
  notify(g, out, pid, { kind: 'system', tone: 'brass', text: `${t.name} (${t.ticker}) is live on the curve.`, msg: { key: 'lp.inbox.launched', vars: { name: t.name, ticker: t.ticker } } });
  return { ok: true, data: { ticker: t.ticker } };
}

/**
 * The NPC sniper's entry (L6.3, v1.2 amendment): one small buy, filled inside the launch command right after the launch's own buzz is
 * absorbed. A fill in the flow two ticks later let a player buy on the launch tick and sell into the sniper's price impact (the v1.2
 * review: +129 points on ten seeds); filled here, the sniper is the first fill and every later fill pays its impact. Its draw is on the
 * token's own stream, so a replay is byte-identical. Its exit stays in the flow (flow.ts).
 */
export function sniperEnter(g: GameState, t: LpToken, out: StepOutput | null): void {
  t.sniperDone = true;
  const rng = new Rng(t.rng);
  const spendDollars = NPC.SNIPER_MIN + (NPC.SNIPER_MAX - NPC.SNIPER_MIN) * rng.uniform();
  t.rng = rng.state();
  const r = buyCurve(g, null, t.ticker, Math.round(spendDollars * 100), 1, out, true);
  if (r.ok) {
    const d = r.data as { tokens: number; avgPrice: number };
    t.sniper = { tick: g.market.tick, tokens: d.tokens, entry: d.avgPrice };
  }
}

/** The initial buzz of a launch: a heavy-tailed draw on the token's own stream (most launches low, a few high). */
export function launchBuzz(t: LpToken): number {
  const rng = new Rng(t.rng);
  const u = Math.max(1e-9, rng.uniform());
  t.rng = rng.state();
  return NPC.BASE0 * (Math.pow(u, -1 / NPC.BASE0_ALPHA) - 1);
}

/** A fresh token: its curve account, the creator's allocation (locked by vesting) and its own stream. */
export function createToken(g: GameState, ticker: string, name: string, tagline: string, creatorId: string | null, allocation: number, tick: number): LpToken {
  openCurve(g, ticker);
  const price = spotAt(LP.Y0);
  const t: LpToken = {
    ticker, name, tagline, creatorId, createdTick: tick, day0: dayOf(tick), allocation, y: LP.Y0,
    bal: allocation > 0 && creatorId ? { [creatorId]: allocation } : {},
    npcBal: 0, npcCost: 0, creatorBought: 0,
    buzz: { base: 0, board: 0, wire: 0 }, buzzDay: { day: dayOf(tick), n: 0 }, promos: [],
    status: 'live', lastTradeTick: tick, lowCloses: 0, npcCohorts: [],
    creatorSoldSinceGrad: 0, creatorProceedsSinceGrad: 0, creatorDay: { day: dayOf(tick), qty: 0, proceeds: 0, startPrice: price, wired: false },
    creatorFees: 0, allocSold: 0, realized: {}, lots: {}, buyLog: [], tape: [], chart: [[tick, price]],
    volToday: 0, volPrev: 0, volDay: dayOf(tick), rng: streamOf(g, ticker),
    flows: { npcBuy: 0, npcSell: 0, playerBuy: 0, playerSell: 0, fee: 0 }, sued: {},
  };
  t.buzz.base = launchBuzz(t);
  // the launch's own buzz is the first arrival: it starts the NPC demand (L6.1)
  arrive(t, t.buzz.base);
  return t;
}

/**
 * Cancels the creator's own launch before any other player has traded it (ratified deviation, lead-launchpad.md v1.1). The token
 * dies; its curve stays and still pays sellers, so the creator's own dev buy (if any) remains sellable. The cohort's tokens go back
 * to the curve first (the NPC side is not an account, so the NPC's own early trades do not block a cancel). The creator gets half
 * the $1,000 launch fee back as a booked refund (`lpRefund`); the other half stays a sink. The ticker stays taken.
 */
export function canCancel(t: LpToken, pid: string): boolean {
  return t.creatorId === pid && t.status === 'live' && !hasOtherTrader(t);
}

export function cancelLaunch(g: GameState, pid: string, ticker: string): CommandResult {
  const t = tokenOf(g, ticker);
  if (!t) return refuse('noToken', { ticker });
  if (t.creatorId !== pid) return refuse('notCreator', { ticker });
  if (t.status !== 'live') return refuse('dead', { ticker });
  if (!canCancel(t, pid)) return refuse('traded', { ticker });
  liquidateCohort(g, t, null);
  t.status = 'dead';
  t.deadTick = g.market.tick;
  t.deadReason = 'cancelled';
  credit(g, pid, LP.LAUNCH_FEE / 2, 'lpRefund');
  return { ok: true };
}

/**
 * World-launched names: fictional and coined (no English or French words), so every locale reads a world name the same way (review
 * item 7: "Moose Dust" in the French feed). The pair space is 48 prefixes by 36 suffixes (1,728 names, enough for 80 game days at the
 * world's rate). A draw starts at a random pair and walks the space to the first free one, so the world keeps launching until the
 * space is spent, and a name is never reused (the moderator's filter runs on every candidate).
 */
export const PREFIX = [
  'Zorbu', 'Plimo', 'Quazi', 'Brenta', 'Vaxil', 'Doomi', 'Kelvo', 'Tazzu', 'Mirok', 'Glenx', 'Sorvi', 'Bajoo', 'Fenno', 'Hulli', 'Ondri',
  'Pakko', 'Lumbo', 'Rixel', 'Dazzo', 'Vimbi', 'Nopra', 'Chezu', 'Fyrro', 'Wendo', 'Gorvi', 'Tilmo', 'Yazzo', 'Bemmo', 'Caskra', 'Juvel',
  'Mopti', 'Ruzzo', 'Selvo', 'Hamzi', 'Quibe', 'Porvo', 'Lanzu', 'Tenzo', 'Imbro', 'Wazzo', 'Kevri', 'Nubbo', 'Zimvo', 'Ferbo', 'Olzi',
  'Dribba', 'Ketto', 'Gulvi',
];
export const SUFFIX = [
  'Bliz', 'Tonk', 'Vorp', 'Pazz', 'Mimbo', 'Quarl', 'Dunzo', 'Fasko', 'Glimp', 'Hobbe', 'Kroma', 'Lemvo', 'Mazzo', 'Nyxal', 'Oddle',
  'Pirvo', 'Rendo', 'Sibbo', 'Tuvik', 'Ugzo', 'Vellu', 'Wibbo', 'Xandi', 'Yomba', 'Zerbo', 'Brumo', 'Cadla', 'Dravo', 'Feznu', 'Gorla',
  'Heximo', 'Imvo', 'Jebba', 'Koppa', 'Lindo', 'Murtu',
];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Draws a world launch (no creator, no fee, no allocation) from the world stream, unique among names and tickers. */
export function npcLaunchDraw(g: GameState, out: StepOutput | null): boolean {
  const s = ensureLaunchpad(g);
  const rng = new Rng(s.worldRng);
  // a ticker: three letters, or four, drawn fresh and never one a token has used
  let ticker = '';
  for (let attempt = 0; attempt < 16 && !ticker; attempt++) {
    let c = '';
    for (let k = 0; k < 3; k++) c += LETTERS[Math.floor(rng.uniform() * 26)];
    if (rng.uniform() < 0.5) c += LETTERS[Math.floor(rng.uniform() * 26)];
    if (!isFreeTicker(g, c)) continue;
    if (moderateName(c).reason) continue;
    ticker = c;
  }
  // a name: the first free pair from a random start, walking the whole space once
  const taken = takenNames(g);
  const space = PREFIX.length * SUFFIX.length;
  const start = Math.floor(rng.uniform() * space);
  let name: string | null = null;
  for (let k = 0; k < space && name === null; k++) {
    const idx = (start + k) % space;
    const cand = `${PREFIX[Math.floor(idx / SUFFIX.length)]} ${SUFFIX[idx % SUFFIX.length]}`;
    if (!moderateName(cand, taken).reason) name = cand;
  }
  if (!ticker || name === null) {
    s.worldRng = rng.state();
    return false;
  }
  const tagline = TAGLINE_IDS[Math.floor(rng.uniform() * TAGLINE_IDS.length)]!;
  s.worldRng = rng.state();
  s.npcSeq++;
  const t = createToken(g, ticker, name, tagline, null, 0, g.market.tick);
  s.tokens[ticker] = t;
  s.order.push(ticker);
  s.tickerDay[ticker] = dayOf(g.market.tick);
  s.totals.launches++;
  s.seq++;
  // L6.4: the world launch's own buzz is bought by the cohort in this tick
  absorbPending(g, t, out);
  sniperEnter(g, t, out);
  lpWire(g, out, 'info', 'Launchpad', { key: 'lp.wire.launchWorld', vars: { name, ticker } }, ticker);
  return true;
}

/** A ticker no token has used, no asset has, and that the 30-day hold has released. */
function isFreeTicker(g: GameState, ticker: string): boolean {
  const s = g.launchpad;
  if (g.market.config.assets.some((a) => a.id === ticker)) return false;
  if (s?.tokens[ticker]) return false;
  const seen = s?.tickerDay[ticker];
  return seen === undefined || dayOf(g.market.tick) - seen >= LP.TICKER_HOLD_DAYS;
}
