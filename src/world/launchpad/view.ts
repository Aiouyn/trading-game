import { priceOf } from '../core';
import type { GameState } from '../types';
import { LP, bookAccountId } from './constants';
import { curveProgress, spotAt } from './curve';
import { iconSvg } from './icon';
import { launchGate } from './launch';
import { lockedAmount, vestCliffDay, vestEndDay, vestFraction } from './vest';
import { dayOf } from './state';
import type { LpToken, LpTrade } from './types';

/**
 * The Launchpad view (lead-launchpad.md L1 and L7). What a player sees of the tokens, and nothing of anyone else's holdings: the
 * holder buckets are the top-10 share of supply and the number of holders, and the tape has no handles except the creator's own
 * trades, which are public and flagged. The viewer's own holdings and creator console are theirs alone.
 */

export interface LpCard {
  ticker: string;
  name: string;
  tagline: string;
  icon: string;
  creatorHandle: string | null;
  status: 'live' | 'graduated' | 'dead';
  deadReason: string | null;
  createdTick: number;
  /** the share of the curve sold, from 0 to 1 (the progress bar to graduation) */
  progress: number;
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
}

export interface LpPage extends LpCard {
  allocation: number;
  vesting: { cliffDay: number; endDay: number; unlocked: number };
  /** the creator's fees earned on this token: present only for the creator (the figure is not public) */
  creatorFees?: number;
  chart: [number, number][];
  tape: LpTrade[];
  buckets: { top10Share: number; holders: number };
  /** the spot price and the default maximum slippage the ticket starts from */
  ticket: { spot: number; maxSlip: number };
  /** the viewer may file a rug case on this token (a flag exists and they are an eligible holder) */
  canFile: boolean;
}

export interface LaunchpadView {
  /** the launch gate for the viewer: null when they may launch, otherwise the refusal code */
  gate: string | null;
  feeds: { newest: LpCard[]; trending: LpCard[]; graduated: LpCard[] };
  /** `vest` is the creator's own vesting (end day and the unlocked share), null for everyone else's holding */
  holdings: { ticker: string; name: string; qty: number; value: number; locked: number; status: LpCard['status']; vest: { endDay: number; unlocked: number } | null }[];
  /** the creator console: the viewer's own tokens with their vesting, fees, promos and flags */
  console: { ticker: string; name: string; status: LpCard['status']; fees: number; allocation: number; unlocked: number; flag: LpCard['flag']; promos: number; capUsed: number; capMax: number; cancellable: boolean }[];
  /** the viewer's live token count against the limit */
  live: { count: number; max: number };
}

/**
 * The view carries no token pages. A page is read on demand (`lpPageOf`, the `lp-page` request) for the token that is open, so a tick
 * costs the feeds, the viewer's holdings and console, and nothing per token page (a page is about 7 KB; 40 rows of three feeds were
 * about 460 KB per view).
 */
const PAGE_TAPE = 30;
const PAGE_CHART = 120;
const FEED = 40;

export function cardOf(g: GameState, t: LpToken): LpCard {
  const price = spotAt(t.y);
  const curveCash = t.status === 'graduated' ? t.gradRaise ?? 0 : (g.market.accounts[`lp:curve:${t.ticker}`]?.cash ?? 0);
  const day = dayOf(g.market.tick);
  const vol = t.volPrev > 0 ? t.volPrev : t.volToday;
  const promosToday = t.promos.filter((p) => dayOf(p.tick) === day).length;
  return {
    ticker: t.ticker, name: t.name, tagline: t.tagline, icon: iconSvg(t.ticker),
    creatorHandle: t.creatorId ? g.players[t.creatorId]?.handle ?? null : null,
    status: t.status, deadReason: t.deadReason ?? null, createdTick: t.createdTick,
    progress: t.status === 'graduated' ? 1 : curveProgress(t.y), price,
    marketCap: price * LP.SUPPLY, raised: curveCash, vol,
    flag: flagOf(t), sponsored: promosToday,
    gradTick: t.gradTick ?? null, gradPrice: t.gradPrice ?? null,
  };
}

/** The public flag of a token, or null. */
export function flagOf(t: LpToken): { reason: 'dump' | 'sweep'; tick: number } | null {
  return t.flag ? { reason: t.flag.reason, tick: t.flag.tick } : null;
}

/**
 * The holder buckets. A live or dead token's holders are its curve balances. A graduated token's curve balances are cleared at
 * graduation (graduate.ts), so its holders are the engine positions of its ticker, except the liquidity book, which holds the
 * unsold supply and is the pool, not a holder.
 */
function holdersOf(g: GameState, t: LpToken): { top10Share: number; holders: number } {
  const raw = t.status === 'graduated'
    ? Object.entries(g.market.accounts).filter(([id]) => id !== bookAccountId(t.ticker)).map(([, a]) => a.positions?.[t.ticker]?.qty ?? 0)
    : Object.values(t.bal);
  const qs = raw.filter((q) => q > 0).sort((a, b) => b - a);
  const top = qs.slice(0, 10).reduce((a, b) => a + b, 0);
  return { top10Share: top / LP.SUPPLY, holders: qs.length };
}

/** A token page: the card plus the chart, the public tape (creator flagged, no handles) and the holder buckets. */
export function pageOf(g: GameState, t: LpToken, pid: string): LpPage {
  const card = cardOf(g, t);
  const chart = t.chart.slice(-PAGE_CHART);
  const isCreator = t.creatorId === pid;
  return {
    ...card,
    allocation: t.allocation,
    vesting: { cliffDay: vestCliffDay(t), endDay: vestEndDay(t), unlocked: vestFraction(t, g.market.tick) },
    ...(isCreator ? { creatorFees: t.creatorFees } : {}),
    chart,
    tape: t.tape.slice(-PAGE_TAPE),
    buckets: holdersOf(g, t),
    ticket: { spot: spotAt(t.y), maxSlip: LP.MAX_SLIP },
    canFile: !!t.flag && !!t.creatorId && !isCreator && (t.sued[pid] === undefined) && (t.flag?.buyers[pid] ?? 0) > 0,
  };
}

/** The token page the viewer asks for (any token, live, graduated or dead), or null when there is no such ticker. */
export function lpPageOf(g: GameState, pid: string, ticker: string): LpPage | null {
  const t = g.launchpad?.tokens[ticker];
  return t ? pageOf(g, t, pid) : null;
}

/** The creator's vesting on a holding (null for anyone else). */
function vestOf(g: GameState, t: LpToken, pid: string): { endDay: number; unlocked: number } | null {
  return t.creatorId === pid ? { endDay: vestEndDay(t), unlocked: vestFraction(t, g.market.tick) } : null;
}

/** The viewer's Launchpad view. Empty (no feeds) in a world that has never launched a token. */
export function launchpadView(g: GameState, pid: string): LaunchpadView {
  const s = g.launchpad;
  const empty: LaunchpadView = { gate: null, feeds: { newest: [], trending: [], graduated: [] }, holdings: [], console: [], live: { count: 0, max: LP.MAX_LIVE } };
  const gate = launchGate(g, pid);
  const gateCode = gate && !gate.ok ? (gate.data as { refusal?: string } | undefined)?.refusal ?? null : null;
  if (!s) return { ...empty, gate: gateCode };
  const all = s.order.map((k) => s.tokens[k]!).filter(Boolean);
  const live = all.filter((t) => t.status === 'live');
  const newestTokens = [...live].reverse().slice(0, FEED);
  const newest = newestTokens.map((t) => cardOf(g, t));
  // the trending order: each token's volume is read once (a card builds an icon, so it is not made inside the comparator)
  const vols = new Map(live.map((t) => [t, t.volPrev > 0 ? t.volPrev : t.volToday] as const));
  const trendingTokens = [...live].sort((a, b) => vols.get(b)! - vols.get(a)!).slice(0, FEED);
  const trending = trendingTokens.map((t) => cardOf(g, t));
  const gradTokens = all.filter((t) => t.status === 'graduated').reverse().slice(0, FEED);
  const graduated = gradTokens.map((t) => cardOf(g, t));
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
    // a cancel is open while nobody has traded the token (launch.ts cancelLaunch)
    cancellable: t.status === 'live' && t.tape.length === 0 && t.y === LP.Y0,
  }));
  return {
    gate: gateCode,
    feeds: { newest, trending, graduated },
    holdings,
    console: consoleRows,
    live: { count: mine.filter((t) => t.status === 'live').length, max: LP.MAX_LIVE },
  };
}
