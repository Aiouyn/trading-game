import { cancelOrderResult, equityOf, placeOrder, tradeOption, type Account } from '@/engine';
import {
  CHAPTER_TICKS, REAL_DAY, REAL_WEEK, RESTRICT_TICKS, cashOf, creditExternal, debit, credit, notify, playerBusinesses, playerProperties,
  restrictedNow,
} from './core';
import { refreshNetWorth, sellBusiness, sellProperty } from './assets';
import { applyRank } from './players';
import { tradesOf } from './ledger';
import { adRefusal, adsUsedToday, SPONSOR } from './sponsor';
import type { CommandResult, ComebackPerk, ComebackState, GameState, Player, StepOutput } from './types';

/**
 * The comeback (velvet-bankruptcy.md, ROADMAP 2.6, lead-phase6.md 6B). A player under $1,000 of net worth, or one whose account
 * was closed by the clearing house (equity below zero), can start a new chapter: the positions are sold, the businesses and
 * property are sold at the usual terms, the cash is swept (a booked sink), and the account opens with $5,000 of fresh-start
 * cash, held 72 real hours. The rank, the shell, titles, cosmetics, licenses and research stay. One fresh start is allowed
 * every 8 real weeks. A second bust inside that window is not a dead end: the negative cash is discharged to zero (a booked
 * faucet) and the player keeps trading, earns contracts and can take the ad path.
 *
 * Perks (pick one, non-cash): Old contacts (one T1 business at 50% off), Lessons learned (half the trading fees for 7 real
 * days), Second wind (business income x1.25 for 7 real days). Leverage is capped at 1x for 7 real days after a fresh start.
 * Reputation -10. The fresh start is a booked faucet (`fresh start`, at most $5,000), the sweep a booked sink (`chapter close`).
 */

export const COMEBACK = {
  /** the low-cash line: the card shows under it, and a fresh start needs it */
  lowCash: 1000,
  freshCash: 5000,
  /** a fresh start at most once per 8 real weeks (the chapter length) */
  cooldownTicks: CHAPTER_TICKS,
  /** the perk windows and the leverage cap: 7 real days each */
  perkTicks: REAL_WEEK,
  leverageTicks: REAL_WEEK,
  /** a dismissed card stays hidden for a real day */
  dismissTicks: REAL_DAY,
  /** the reputation hit of a fresh start */
  reputationHit: -10,
  /** the ad-cash lot a fresh start opens, the same window as ads */
  lotTicks: RESTRICT_TICKS,
};

export const PERKS: ComebackPerk[] = ['contacts', 'lessons', 'wind'];

/** The comeback record of a player, created the first time it is needed (a save without one is unchanged). */
export function ensureComeback(p: Player): ComebackState {
  p.comeback ??= { chapter: 1, chapterStartTick: p.joinedTick, peak: p.netWorthPeak };
  return p.comeback;
}

/** Ticks until the next fresh start is allowed (0 when it is allowed now). */
export function cooldownLeft(g: GameState, p: Player): number {
  const f = p.comeback?.freshTick;
  if (f === undefined) return 0;
  return Math.max(0, f + COMEBACK.cooldownTicks - g.market.tick);
}

/** Whether a perk can be picked: contacts and wind need a business (the Phase 0 rule: before businesses only lessons shows). */
export function perkAvailable(g: GameState, pid: string, perk: ComebackPerk): boolean {
  if (perk === 'lessons') return true;
  return playerBusinesses(g, pid).length > 0;
}

/** True while the player's leverage is capped at 1x (7 real days after a fresh start). */
export function leverageCapped(p: Player, tick: number): boolean {
  return (p.comeback?.leverageUntil ?? 0) > tick;
}

/** A forced close: equity below zero after a liquidation. Only the account is checked; the engine has already sold. */
function busted(g: GameState, pid: string): boolean {
  const acct = g.market.accounts[pid];
  return !!acct && equityOf(g.market, acct) < 0;
}

/** The fresh start may be confirmed: low cash (or a bust), no cooldown, no close already running, a valid perk. */
export function confirmRefusal(g: GameState, p: Player, perk: ComebackPerk): string | null {
  if (!PERKS.includes(perk)) return 'comebackPerk';
  const c = p.comeback;
  if (c?.closing) return 'comebackClosing';
  if (cooldownLeft(g, p) > 0) return 'comebackCooldown';
  if (p.netWorth >= COMEBACK.lowCash && !c?.bust) return 'comebackNotLow';
  if (!perkAvailable(g, p.id, perk)) return 'comebackPerk';
  return null;
}

/** The player's commands: the fresh start (held to confirm in the app) and the card's dismissal. */
export function comebackCommand(g: GameState, pid: string, cmd: { type: 'comeback.confirm'; perk: ComebackPerk } | { type: 'comeback.dismiss' }, out: StepOutput | null): CommandResult {
  const p = g.players[pid];
  if (!p || p.npc) return { ok: false, error: 'comebackNotLow' };
  if (cmd.type === 'comeback.dismiss') {
    ensureComeback(p).dismissedUntil = g.market.tick + COMEBACK.dismissTicks;
    return { ok: true };
  }
  const why = confirmRefusal(g, p, cmd.perk);
  if (why) return { ok: false, error: why };
  const c = ensureComeback(p);
  c.closing = { tick: g.market.tick, perk: cmd.perk, forced: !!c.bust, netWorth: p.netWorth };
  closeStep(g, p, out);
  return { ok: true, data: { perk: cmd.perk } };
}

/**
 * The per-NW-refresh pass (every 12 ticks, after the net worth refresh): tracks the chapter peak of players with a comeback
 * record, detects a forced close (equity below zero, and the cooldown decides whether a fresh start is offered), and lifts the
 * leverage cap when its window ends.
 */
export function comebackRefresh(g: GameState, out: StepOutput | null): void {
  const tick = g.market.tick;
  for (const p of Object.values(g.players)) {
    if (p.npc) continue;
    const c = p.comeback;
    if (c) {
      if (p.netWorth > c.peak) c.peak = p.netWorth;
      if (c.leverageUntil !== undefined && c.leverageUntil <= tick) {
        delete c.leverageUntil;
        applyRank(g, p, out, true);
      }
      if (c.bust?.blocked && tick - c.bust.tick >= REAL_DAY) delete c.bust;
    }
    if (c?.closing || c?.bust) continue;
    if (!busted(g, p.id)) continue;
    const cc = ensureComeback(p);
    const blocked = cooldownLeft(g, p) > 0;
    cc.bust = { tick, blocked };
    if (blocked) {
      // the floor: the negative cash is written off (a booked faucet) so the account is never a dead end
      const cash = cashOf(g, p.id);
      if (cash < 0) credit(g, p.id, -cash, 'bust discharge');
      notify(g, out, p.id, { kind: 'system', tone: 'warn', text: 'The clearing house closed your account. You still have contracts, businesses and ad cash. A fresh start opens again after 8 weeks.', msg: { key: 'comeback.bust.blocked' } });
    } else {
      notify(g, out, p.id, { kind: 'system', tone: 'warn', text: 'The account was closed by the clearing house. Your chapter is ready to close.', msg: { key: 'comeback.bust.forced' } });
    }
  }
}

/** Every tick: the closing players sell down and are reset once they are flat. */
export function comebackTick(g: GameState, out: StepOutput | null): void {
  for (const p of Object.values(g.players)) {
    if (p.npc || !p.comeback?.closing) continue;
    closeStep(g, p, out);
  }
}

/** One tick of a close: cancel the open orders, sell what is held (reduce-only), and reset the account once it is flat. */
function closeStep(g: GameState, p: Player, out: StepOutput | null): void {
  if (!g.market.accounts[p.id]) return;
  for (const id of g.market.orders.filter((o) => o.playerId === p.id && o.status === 'open').map((o) => o.id)) {
    const r = cancelOrderResult(g.market, p.id, id);
    if (!r.error) g.market = r.state;
  }
  const acct = g.market.accounts[p.id] as Account;
  const openAssets = new Set(g.market.orders.filter((o) => o.playerId === p.id && o.status === 'open').map((o) => o.assetId));
  for (const [assetId, pos] of Object.entries(acct.positions)) {
    if (pos.qty === 0 || openAssets.has(assetId)) continue;
    const r = placeOrder(g.market, { playerId: p.id, assetId, side: pos.qty > 0 ? 'sell' : 'buy', type: 'market', qty: Math.abs(pos.qty), reduceOnly: true });
    g.market = r.state;
  }
  for (const [cid, op] of Object.entries(acct.options ?? {})) {
    if (op.qty <= 0) continue;
    const r = tradeOption(g.market, p.id, cid, 'sell', op.qty);
    if (!r.error) g.market = r.state;
  }
  const after = g.market.accounts[p.id] as Account;
  const flat = Object.values(after.positions).every((x) => x.qty === 0)
    && Object.values(after.options ?? {}).every((x) => x.qty <= 0)
    && !g.market.orders.some((o) => o.playerId === p.id && o.status === 'open');
  if (flat) finishFreshStart(g, p, out);
}

/** The reset: the businesses and property sell, the cash is swept, and the account opens with $5,000 of fresh-start cash. */
function finishFreshStart(g: GameState, p: Player, out: StepOutput | null): void {
  const c = p.comeback!;
  const cl = c.closing!;
  const tick = g.market.tick;
  refreshNetWorth(g, p);
  const trips = tradesOf(g, p.id).trips
    .filter((t) => t.closeTick >= c.chapterStartTick && t.realizedPnl < 0)
    .sort((a, b) => a.realizedPnl - b.realizedPnl)
    .slice(0, 3)
    .map((t) => ({ id: t.id, assetId: t.assetId, pnl: t.realizedPnl }));
  c.last = { chapter: c.chapter, startTick: c.chapterStartTick, endTick: tick, peak: Math.max(c.peak, p.netWorth), end: p.netWorth, losses: trips };
  for (const b of [...playerBusinesses(g, p.id)]) sellBusiness(g, p.id, b.id, out);
  for (const pr of [...playerProperties(g, p.id)]) sellProperty(g, p.id, pr.id);
  const cash = cashOf(g, p.id);
  if (cash > 0) debit(g, p.id, cash, 'chapter close');
  else if (cash < 0) credit(g, p.id, -cash, 'bust discharge');
  creditExternal(g, p.id, COMEBACK.freshCash, 'fresh start');
  p.adLots = [{ amount: COMEBACK.freshCash, untilTick: tick + COMEBACK.lotTicks, kind: 'start' }];
  p.reputation += COMEBACK.reputationHit;
  c.freshTick = tick;
  c.chapter += 1;
  c.chapterStartTick = tick;
  c.peak = COMEBACK.freshCash;
  if (cl.perk === 'contacts') c.voucher = true;
  else c.perk = { id: cl.perk, untilTick: tick + COMEBACK.perkTicks };
  c.leverageUntil = tick + COMEBACK.leverageTicks;
  delete c.closing;
  delete c.bust;
  delete c.dismissedUntil;
  refreshNetWorth(g, p);
  // the leverage cap is set by the rank's license (applyRank reads leverageUntil), so the account follows it at once
  applyRank(g, p, out, true);
  notify(g, out, p.id, {
    kind: 'system', tone: 'brass', text: `Chapter ${c.chapter} begins with $${COMEBACK.freshCash.toLocaleString('en-US')}. Your rank, titles and cosmetics stay.`,
    msg: { key: 'comeback.newChapter', vars: { chapter: c.chapter, amount: COMEBACK.freshCash } },
  });
}

/** The view of the comeback for the owner: the card, the chapter screen and the ad offer. */
export interface ComebackView {
  chapter: number;
  chapterStartTick: number;
  peak: number;
  netWorth: number;
  low: boolean;
  /** the card shows (low cash, not dismissed, not closing) */
  card: boolean;
  freshAvailable: boolean;
  cooldownLeft: number;
  closing: { forced: boolean; perk: ComebackPerk } | null;
  /** a bust with the chapter screen open (not blocked by the cooldown) */
  bust: { tick: number; blocked: boolean } | null;
  perks: { id: ComebackPerk; available: boolean }[];
  perk: { id: ComebackPerk; untilTick: number } | null;
  voucher: boolean;
  leverageUntil: number | null;
  /** the three largest realized losses of the chapter so far (the screen's "What happened") */
  losses: { id: string; assetId: string; pnl: number }[];
  last: ComebackState['last'] | null;
  restricted: { amount: number; until: number | null };
  ad: {
    offered: boolean;
    refusal: string | null;
    used: number;
    cap: number;
    reward: number;
    pending: { id: string; brand: string; startTick: number } | null;
  };
}

export function comebackView(g: GameState, pid: string): ComebackView | null {
  const p = g.players[pid];
  if (!p) return null;
  const c = p.comeback;
  const tick = g.market.tick;
  const chapter = c?.chapter ?? 1;
  const low = p.netWorth < COMEBACK.lowCash;
  const cool = cooldownLeft(g, p);
  const losses = tradesOf(g, pid).trips
    .filter((t) => t.closeTick >= (c?.chapterStartTick ?? p.joinedTick) && t.realizedPnl < 0)
    .sort((a, b) => a.realizedPnl - b.realizedPnl)
    .slice(0, 3)
    .map((t) => ({ id: t.id, assetId: t.assetId, pnl: t.realizedPnl }));
  const lots = (p.adLots ?? []).filter((l) => l.untilTick > tick);
  const until = lots.length ? Math.min(...lots.map((l) => l.untilTick)) : null;
  const hasBiz = playerBusinesses(g, pid).length > 0;
  const ad = adView(g, pid);
  const adOffered = ad.offered;
  return {
    chapter,
    chapterStartTick: c?.chapterStartTick ?? p.joinedTick,
    peak: c ? Math.max(c.peak, p.netWorth) : Math.max(p.netWorthPeak, p.netWorth),
    netWorth: p.netWorth,
    low,
    card: (low || adOffered) && !c?.closing && (c?.dismissedUntil ?? 0) <= tick,
    freshAvailable: cool === 0 && !c?.closing && (low || !!c?.bust),
    cooldownLeft: cool,
    closing: c?.closing ? { forced: c.closing.forced, perk: c.closing.perk } : null,
    bust: c?.bust && !c.bust.blocked ? c.bust : null,
    perks: PERKS.map((id) => ({ id, available: id === 'lessons' || hasBiz })),
    perk: c?.perk ?? null,
    voucher: !!c?.voucher,
    leverageUntil: c?.leverageUntil ?? null,
    losses,
    last: c?.last ?? null,
    restricted: { amount: restrictedNow(g, pid), until },
    ad,
  };
}

/** The sponsor offer for the owner (the card's row and the break): the rules are the sponsor module's. */
function adView(g: GameState, pid: string): ComebackView['ad'] {
  const pending = g.sponsor?.pending[pid];
  const refusal = adRefusal(g, pid);
  return {
    offered: refusal === null,
    refusal,
    used: adsUsedToday(g, pid),
    cap: SPONSOR.dailyCap,
    reward: SPONSOR.reward,
    pending: pending ? { id: pending.id, brand: pending.brand, startTick: pending.startTick } : null,
  };
}
