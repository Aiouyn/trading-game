import { priceOf } from '../core';
import type { GameState } from '../types';
import { LP, bookAccountId, npcAccountId } from './constants';
import { anonOf } from './anon';
import { curveProgress, spotAt } from './curve';
import { tickerHash } from './icon';
import { barsOf } from './bars';
import { repliesOf } from './reply';
import { canCancel, launchGate } from './launch';
import { lockedAmount, vestCliffDay, vestEndDay, vestFraction } from './vest';
import { dayOf } from './state';
import { LP_NPC_HANDLES } from '../text/lpReplies';
import type { LpBar, LpReply, LpToken, LpTrade } from './types';

/**
 * The Launchpad view (lead-launchpad.md L1 and L7, R-10-6 as Phase 10). What a player sees of the tokens, and nothing of anyone else's
 * holdings: the holder distribution is anonymous (an id per account and token, never a handle), and the tape has no handles except the
 * creator's own trades, which are public and flagged. The viewer's own holdings and creator console are theirs alone.
 */

export interface LpCard {
  ticker: string;
  name: string;
  tagline: string;
  creatorHandle: string | null;
  status: 'live' | 'graduated' | 'dead';
  deadReason: string | null;
  createdTick: number;
  /** the share of the curve sold, from 0 to 1 (the progress bar to graduation) */
  progress: number;
  /** dollars per token: the curve's spot on the curve, the engine's live mid once graduated (R-10-6) */
  price: number;
  /** price times supply, dollars */
  marketCap: number;
  /** the cash raised on the curve (dollars) */
  raised: number;
  /** the volume of the last whole game day (dollars), or today's before the first day ends */
  vol: number;
  /** the flag, public: null when there is none */
  flag: { reason: 'dump' | 'sweep'; tick: number } | null;
  /** the promos bought in the last game day (Sponsored), for the feed's label */
  sponsored: number;
  gradTick: number | null;
  gradPrice: number | null;
  /** R-10-6: the tick of the last trade on the tape (the board's bump order) */
  lastTrade: number;
  /** R-10-6: the replies on the thread */
  replies: number;
  /** R-10-6: the generated image variant the creator picked (the client draws the image from the ticker and this) */
  art: number;
}

/** One holder row of a token page: an anonymous id, the tokens and the share of supply. `role` marks the curve, the dev and the NPC cohort. */
export interface LpHolder {
  anon: string;
  qty: number;
  share: number;
  role: 'curve' | 'dev' | 'npc' | 'you' | 'holder';
}

/** One tape line as the viewer sees it: the notional in dollars, and the anonymous id of a player's trade. */
export interface LpTape {
  tick: number;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  usd: number;
  creator: boolean;
  npc: boolean;
  anon?: string;
}

/** One line of the live trades bar: who (an anonymous id, or a fictional handle for NPC flow), the side, the dollars, the token. */
export interface LpBarRow {
  ticker: string;
  side: 'buy' | 'sell';
  usd: number;
  who: string;
  npc: boolean;
  creator: boolean;
  tick: number;
}

export interface LpPage extends LpCard {
  description: string | null;
  allocation: number;
  vesting: { cliffDay: number | null; endDay: number | null; unlocked: number };
  /** the creator's fees earned on this token: present only for the creator (the figure is not public) */
  creatorFees?: number;
  /** the candles on the game clock (review fix, Phase 10): minute and hour bars, [tick, open, high, low, close] in dollars per token */
  bars: { m: LpBar[]; h: LpBar[] };
  tape: LpTape[];
  buckets: { top10Share: number; holders: number };
  /** R-10-6: the top holders (HOLDERS_SHOWN), the curve, the dev and the NPC cohort marked, anonymous ids */
  holders: LpHolder[];
  /** R-10-6: the replies thread, newest last (the card's count is `replies`) */
  thread: LpReply[];
  /** the default maximum slippage the ticket starts from */
  ticket: { maxSlip: number };
  /** the viewer may file a rug case on this token (a flag exists and they are an eligible holder) */
  canFile: boolean;
}

export interface LaunchpadView {
  /** the launch gate for the viewer: null when they may launch, otherwise the refusal code */
  gate: string | null;
  /** R-10-6: the gate's refusal data (its three parts with their numbers), so the Create form shows the hours to go */
  gateData: unknown;
  feeds: { newest: LpCard[]; trending: LpCard[]; graduated: LpCard[] };
  /** R-10-6: the king of the hill: the live token with the highest curve progress (null when no token has sold yet) */
  king: LpCard | null;
  /** R-10-6: the newest trades across tokens, for the live trades bar */
  bar: LpBarRow[];
  /** `vest` is the creator's own vesting (end day and the unlocked share), null for everyone else's holding */
  holdings: { ticker: string; name: string; qty: number; value: number; locked: number; status: LpCard['status']; vest: { endDay: number | null; unlocked: number } | null }[];
  /** the creator console: the viewer's own tokens with their vesting, fees, promos and flags */
  console: { ticker: string; name: string; status: LpCard['status']; fees: number; allocation: number; unlocked: number; flag: LpCard['flag']; promos: number; capUsed: number; capMax: number; cancellable: boolean; replies: number; art: number }[];
  /** the viewer's live token count against the limit */
  live: { count: number; max: number };
}

/**
 * The view carries no token pages. A page is read on demand (`lpPageOf`, the `lp-page` request) for the token that is open, so a tick
 * costs the feeds, the viewer's holdings and console, the trades bar, and nothing per token page.
 */
const PAGE_TAPE = 40;
const FEED = 40;

/** The anonymous id of a holder row or a trade: the account's id, hashed with the token. */
const anonFor = (t: LpToken, id: string) => anonOf(t.ticker, id);

/** The NPC handle that stands for an NPC trade on the bar (fictional, and the same for the same token and tick). */
function npcHandleOf(ticker: string, tick: number): string {
  return LP_NPC_HANDLES[tickerHash(`${ticker}:b:${tick}`) % LP_NPC_HANDLES.length]!;
}

export function cardOf(g: GameState, t: LpToken): LpCard {
  // a graduated token trades on the engine, so its price is the engine's live mid (the curve is frozen since graduation)
  const price = t.status === 'graduated' ? priceOf(g, t.ticker) : spotAt(t.y);
  const curveCash = t.status === 'graduated' ? t.gradRaise ?? 0 : (g.market.accounts[`lp:curve:${t.ticker}`]?.cash ?? 0);
  const day = dayOf(g.market.tick);
  const vol = t.volPrev > 0 ? t.volPrev : t.volToday;
  const promosToday = t.promos.filter((p) => dayOf(p.tick) === day).length;
  const last = t.tape[t.tape.length - 1];
  return {
    ticker: t.ticker, name: t.name, tagline: t.tagline,
    creatorHandle: t.creatorId ? g.players[t.creatorId]?.handle ?? null : null,
    status: t.status, deadReason: t.deadReason ?? null, createdTick: t.createdTick,
    progress: t.status === 'graduated' ? 1 : curveProgress(t.y), price,
    marketCap: price * LP.SUPPLY, raised: curveCash, vol,
    flag: flagOf(t), sponsored: promosToday,
    gradTick: t.gradTick ?? null, gradPrice: t.gradPrice ?? null,
    lastTrade: last ? last.tick : t.createdTick,
    replies: repliesOf(t),
    art: t.art ?? 0,
  };
}

/** The public flag of a token, or null. */
export function flagOf(t: LpToken): { reason: 'dump' | 'sweep'; tick: number } | null {
  return t.flag ? { reason: t.flag.reason, tick: t.flag.tick } : null;
}

/**
 * The holder rows of a token, with their roles (R-10-6). A live or dead token's holders are its curve balances, the NPC cohort and the
 * curve itself (the tokens it still holds for sale). A graduated token's holders are the engine positions of its ticker, except the
 * liquidity book, which holds the unsold supply and is the pool, not a holder; its NPC cohort's engine account is an NPC holder.
 */
function holderRows(g: GameState, t: LpToken, pid: string): { anon: string; qty: number; role: LpHolder['role'] }[] {
  const roleOf = (id: string): LpHolder['role'] => (id === t.creatorId ? 'dev' : id === pid ? 'you' : 'holder');
  const rows: { anon: string; qty: number; role: LpHolder['role'] }[] = [];
  if (t.status === 'graduated') {
    const book = bookAccountId(t.ticker);
    const npc = npcAccountId(t.ticker);
    for (const [id, a] of Object.entries(g.market.accounts)) {
      if (id === book) continue;
      const q = a.positions?.[t.ticker]?.qty ?? 0;
      if (q > 0) rows.push({ anon: anonFor(t, id), qty: q, role: id === npc ? 'npc' : roleOf(id) });
    }
    return rows;
  }
  // the curve still holds the tokens it has not sold: the supply above the graduation reserve (Y - GRAD_Y, the real tokens)
  rows.push({ anon: anonFor(t, 'curve'), qty: Math.max(0, t.y - LP.GRAD_Y), role: 'curve' });
  for (const [id, q] of Object.entries(t.bal)) if (q > 0) rows.push({ anon: anonFor(t, id), qty: q, role: roleOf(id) });
  if (t.npcBal > 0) rows.push({ anon: anonFor(t, npcAccountId(t.ticker)), qty: t.npcBal, role: 'npc' });
  return rows;
}

/**
 * The holder distribution: the top HOLDERS_SHOWN rows by tokens (the curve is a row, marked), the top-10 share of supply over the
 * people (the curve excluded), and the number of holders (the curve excluded, the NPC cohort included as an anonymous holder).
 */
function holdersOf(g: GameState, t: LpToken, pid: string): { top: LpHolder[]; top10Share: number; holders: number } {
  const rows = holderRows(g, t, pid).sort((a, b) => b.qty - a.qty || (a.anon < b.anon ? -1 : a.anon > b.anon ? 1 : 0));
  const people = rows.filter((r) => r.role !== 'curve');
  const top = people.slice(0, 10).reduce((a, r) => a + r.qty, 0);
  return {
    top: rows.slice(0, LP.HOLDERS_SHOWN).map((r) => ({ ...r, share: r.qty / LP.SUPPLY })),
    top10Share: top / LP.SUPPLY,
    holders: people.length,
  };
}

/** A tape line for the viewer: the dollars (an old line without them is qty times price), the anonymous id when there is one. */
function tapeOf(tr: LpTrade): LpTape {
  return {
    tick: tr.tick, side: tr.side, qty: tr.qty, price: tr.price, usd: tr.usd ?? tr.qty * tr.price,
    creator: tr.creator, npc: tr.npc, ...(tr.anon ? { anon: tr.anon } : {}),
  };
}

/** A token page: the card plus the chart, the public tape, the holders, and the replies. */
export function pageOf(g: GameState, t: LpToken, pid: string): LpPage {
  const card = cardOf(g, t);
  const isCreator = t.creatorId === pid;
  const h = holdersOf(g, t, pid);
  return {
    ...card,
    description: t.description ?? null,
    allocation: t.allocation,
    vesting: { cliffDay: vestCliffDay(t), endDay: vestEndDay(t), unlocked: vestFraction(t, g.market.tick) },
    ...(isCreator ? { creatorFees: t.creatorFees } : {}),
    bars: barsOf(t),
    tape: t.tape.slice(-PAGE_TAPE).map(tapeOf),
    buckets: { top10Share: h.top10Share, holders: h.holders },
    holders: h.top,
    thread: (t.replies ?? []).slice(-LP.REPLY_KEEP),
    ticket: { maxSlip: LP.MAX_SLIP },
    canFile: !!t.flag && !!t.creatorId && !isCreator && (t.sued[pid] === undefined) && (t.flag?.buyers[pid] ?? 0) > 0,
  };
}

/** The token page the viewer asks for (any token, live, graduated or dead), or null when there is no such ticker. */
export function lpPageOf(g: GameState, pid: string, ticker: string): LpPage | null {
  // tickers are upper-case letters; an own-property check keeps "constructor", "toString" and "__proto__" from resolving to
  // Object.prototype members (review item 1: the lookup threw in cardOf and killed the server)
  const s = g.launchpad;
  const key = ticker.toUpperCase();
  if (!s || !Object.hasOwn(s.tokens, key)) return null;
  return pageOf(g, s.tokens[key]!, pid);
}

/** The creator's vesting on a holding (null for anyone else). */
function vestOf(g: GameState, t: LpToken, pid: string): { endDay: number | null; unlocked: number } | null {
  return t.creatorId === pid ? { endDay: vestEndDay(t), unlocked: vestFraction(t, g.market.tick) } : null;
}

/**
 * The live trades bar (R-10-6): the newest trades across the tokens, player and creator lines under their anonymous id, NPC flow under a
 * fictional handle. A dead token's tape is not shown (it no longer trades).
 */
function tradeBar(all: LpToken[]): LpBarRow[] {
  const rows: LpBarRow[] = [];
  for (const t of all) {
    if (t.status === 'dead') continue;
    for (const tr of t.tape.slice(-LP.TRADE_BAR)) {
      rows.push({
        ticker: t.ticker, side: tr.side, usd: tr.usd ?? tr.qty * tr.price,
        who: tr.anon ?? npcHandleOf(t.ticker, tr.tick), npc: tr.npc && !tr.anon, creator: tr.creator, tick: tr.tick,
      });
    }
  }
  rows.sort((a, b) => b.tick - a.tick || (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));
  return rows.slice(0, LP.TRADE_BAR);
}

/** The viewer's Launchpad view. Empty (no feeds) in a world that has never launched a token. */
export function launchpadView(g: GameState, pid: string): LaunchpadView {
  const s = g.launchpad;
  const empty: LaunchpadView = { gate: null, gateData: null, feeds: { newest: [], trending: [], graduated: [] }, king: null, bar: [], holdings: [], console: [], live: { count: 0, max: LP.MAX_LIVE } };
  const gate = launchGate(g, pid);
  const gateCode = gate && !gate.ok ? (gate.data as { refusal?: string } | undefined)?.refusal ?? null : null;
  const gateData = gate && !gate.ok ? gate.data ?? null : null;
  if (!s) return { ...empty, gate: gateCode, gateData };
  const all = s.order.map((k) => s.tokens[k]!).filter(Boolean);
  const live = all.filter((t) => t.status === 'live');
  // the New feed is in bump order (review fix, Phase 10): the live tokens sorted by their last trade, so a token with a fresh trade is
  // in it whatever its age. The newest launch wins a tie (the reversed list is newest first, and the sort is stable)
  const lastTickOf = (t: LpToken) => t.tape[t.tape.length - 1]?.tick ?? t.createdTick;
  const newestTokens = [...live].reverse().sort((a, b) => lastTickOf(b) - lastTickOf(a)).slice(0, FEED);
  const newest = newestTokens.map((t) => cardOf(g, t));
  // the trending order: each token's volume is read once (a card builds an icon, so it is not made inside the comparator)
  const vols = new Map(live.map((t) => [t, t.volPrev > 0 ? t.volPrev : t.volToday] as const));
  const trendingTokens = [...live].sort((a, b) => vols.get(b)! - vols.get(a)!).slice(0, FEED);
  const trending = trendingTokens.map((t) => cardOf(g, t));
  const gradTokens = all.filter((t) => t.status === 'graduated').reverse().slice(0, FEED);
  const graduated = gradTokens.map((t) => cardOf(g, t));
  // the king of the hill: the most progressed live token (ties go to the newer one, as the list is oldest first)
  let king: LpToken | null = null;
  for (const t of live) {
    if (curveProgress(t.y) > 0 && (!king || curveProgress(t.y) >= curveProgress(king.y))) king = t;
  }
  const holdings: LaunchpadView['holdings'] = [];
  for (const t of all) {
    if (t.status === 'graduated') {
      const pos = g.market.accounts[pid]?.positions[t.ticker];
      if (pos && pos.qty > 0) {
        holdings.push({ ticker: t.ticker, name: t.name, qty: pos.qty, value: pos.qty * priceOf(g, t.ticker), locked: t.creatorId === pid ? Math.min(pos.qty, lockedAmount(t, g.market.tick)) : 0, status: 'graduated', vest: vestOf(g, t, pid) });
      }
      continue;
    }
    const q = t.bal[pid] ?? 0;
    if (q > 0) {
      holdings.push({ ticker: t.ticker, name: t.name, qty: q, value: q * spotAt(t.y), locked: t.creatorId === pid ? Math.min(q, lockedAmount(t, g.market.tick)) : 0, status: t.status, vest: vestOf(g, t, pid) });
    }
  }
  const mine = all.filter((t) => t.creatorId === pid);
  const consoleRows = mine.map((t) => ({
    ticker: t.ticker, name: t.name, status: t.status, fees: t.creatorFees, allocation: t.allocation,
    unlocked: Math.floor(t.allocation * vestFraction(t, g.market.tick)), flag: flagOf(t),
    promos: t.promos.filter((p) => dayOf(p.tick) === dayOf(g.market.tick)).length,
    capUsed: t.allocation + t.creatorBought, capMax: LP.CREATOR_CAP,
    // the same predicate as cancelLaunch (review item 5): the tape of a v1.2 launch always holds its NPC buzz rows, so "no tape" is wrong
    cancellable: canCancel(t, pid),
    replies: repliesOf(t),
    art: t.art ?? 0,
  }));
  return {
    gate: gateCode,
    gateData,
    feeds: { newest, trending, graduated },
    king: king ? cardOf(g, king) : null,
    bar: tradeBar(all),
    holdings,
    console: consoleRows,
    live: { count: mine.filter((t) => t.status === 'live').length, max: LP.MAX_LIVE },
  };
}
