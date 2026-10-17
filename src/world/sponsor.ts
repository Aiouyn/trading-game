import { commission, type OrderRequest } from '@/engine';
import { linkedAccounts } from './collusion';
import { keyedRng, cashOf, creditExternal, notify, priceOf, realDayOf, REAL_DAY, RESTRICT_TICKS, restrictedNow, spendableCash } from './core';
import type { CommandResult, GameState, Player, StepOutput } from './types';

/**
 * Simulated sponsor breaks (velvet-rewarded-ads.md, ROADMAP 2.7, lead-phase6.md 6B). There is no ad network and no tracking:
 * a break is a 15-second in-app card for a fictional brand. A full watch pays $250 of ad cash; a skip after 5 seconds pays
 * nothing.
 *
 * The offer (adRefusal) is decided at the start of the real day (lead-phase6.md Q3, ruling B): the account is a real day old,
 * and its cash and net worth at that start were both under $1,000. A player who starts the day under the line may run the
 * day's breaks while the net worth passes it; the card hides once the live net worth is over the line and no offer is open.
 * The cap and the day-start snapshot are keyed on the real day (24 game hours), not on the game day: a game day is one real
 * hour, so ten breaks a game day would be $60,000 a real day. Ten a real day is $2,500 (ROADMAP 2.7).
 *
 * The cap is one count for the whole collusion group (collusion.ts linkedAccounts: the alliance, a shared device, funding by gifts
 * or loans, and mirrored fills). Each account counts its own breaks, and the group's breaks are summed, so an alt or an alliance
 * hop cannot reset the count (exploit: alt farming and alliance hopping). An unlinked alt is not counted with its owner.
 *
 * Ad cash is tagged and held 72 real hours (core.ts restrictedNow): it cannot pay for ops, margin, derivatives or transfers.
 * Every reward is a booked faucet line, `adCash` (economy.faucets), so the world money identity still closes.
 */

/** The lead's numbers (lead-phase6.md 6B). The break times are in ticks: one tick is five real seconds at the live pace. */
export const SPONSOR = {
  reward: 250,
  dailyCap: 10,
  /** offered only under this much cash (at the start of the real day), and only under this live net worth */
  lowCash: 1000,
  /** the card runs this long; a full watch needs 15 s (three ticks) */
  watchSeconds: 15,
  fullTicks: 3,
  /** a skip is allowed after 5 s (one tick) and pays nothing */
  skipSeconds: 5,
  skipTicks: 1,
  /** an account must be a real day old before it is offered a break */
  minAgeTicks: REAL_DAY,
  /** the restricted-cash window for ad cash (ROADMAP C5): 72 real hours, one game day an hour */
  lotTicks: RESTRICT_TICKS,
};

/** Fictional brands for the sponsor card (no real brands). The copy is in en.json and fr.json under sponsor.brand.<id>. */
export const SPONSOR_BRANDS = ['aurelle', 'fennick', 'marlow', 'pelican', 'corvid', 'tessel'] as const;
export type SponsorBrand = (typeof SPONSOR_BRANDS)[number];

/** The alliance owner a player's alliance is headed by, or the player alone (the profile of the old per-profile count, kept for views). */
export function profileKeyOf(g: GameState, pid: string): string {
  const p = g.players[pid];
  const a = p?.allianceId ? g.alliances[p.allianceId] : undefined;
  return a?.ownerId ?? pid;
}

/** Rewarded breaks the player's collusion group has today (real day): the sum of each linked account's own count. */
export function adsUsedToday(g: GameState, pid: string): number {
  const day = realDayOf(g);
  let n = 0;
  for (const k of linkedAccounts(g, pid)) {
    const c = g.sponsor?.counts[k];
    if (c && c.day === day) n += c.n;
  }
  return n;
}

/** The start-of-day cash and net worth the offer reads: the real day's snapshot, or the live values before it exists. */
function dayStartOf(g: GameState, p: Player): { cash: number; netWorth: number } {
  return p.adDay?.day === realDayOf(g) ? p.adDay : { cash: cashOf(g, p.id), netWorth: p.netWorth };
}

/**
 * The real-day snapshot (game.ts, at each game day that opens a new real day): the cash of every human player, so the offer
 * reads the start of the real day and not the live balance.
 */
export function sponsorDayStart(g: GameState): void {
  const day = realDayOf(g);
  for (const p of Object.values(g.players)) {
    if (p.npc || p.adDay?.day === day) continue;
    p.adDay = { day, cash: cashOf(g, p.id), netWorth: p.netWorth };
  }
}

/** Why the player is not offered a break now (a refusal code), or null when one may open. */
export function adRefusal(g: GameState, pid: string, opts: { ignorePending?: boolean } = {}): string | null {
  const p = g.players[pid];
  if (!p || p.npc) return 'adNotOffered';
  if (g.market.tick - p.joinedTick < SPONSOR.minAgeTicks) return 'adAge';
  // the lead's ruling (Q3-B): cash and net worth at the start of the real day both under the line
  const start = dayStartOf(g, p);
  if (start.cash >= SPONSOR.lowCash || start.netWorth >= SPONSOR.lowCash) return 'adNotOffered';
  if (adsUsedToday(g, pid) >= SPONSOR.dailyCap) return 'adCap';
  if (!opts.ignorePending && g.sponsor?.pending[pid]) return 'adBusy';
  return null;
}

/** Open a sponsor card. The brand is drawn from the seeded stream for this player and sequence number. */
export function startBreak(g: GameState, pid: string): CommandResult {
  const why = adRefusal(g, pid);
  if (why) return { ok: false, error: why };
  const sp = (g.sponsor ??= { counts: {}, pending: {}, seq: 0 });
  sp.seq++;
  const id = `ad${sp.seq}`;
  const brand = SPONSOR_BRANDS[Math.floor(keyedRng(g, `sponsor:${pid}:${sp.seq}`).uniform() * SPONSOR_BRANDS.length)]!;
  sp.pending[pid] = { id, startTick: g.market.tick, brand };
  return { ok: true, data: { id, brand, watchSeconds: SPONSOR.watchSeconds, skipSeconds: SPONSOR.skipSeconds } };
}

/**
 * Close the open card. A full watch needs three ticks since the card opened and pays the reward (the offer is checked again,
 * so two cards in one profile cannot pass the cap). A skip needs one tick and pays nothing.
 */
export function finishBreak(g: GameState, pid: string, id: string, skip: boolean, out: StepOutput | null): CommandResult {
  const sp = g.sponsor;
  const pending = sp?.pending[pid];
  if (!sp || !pending || pending.id !== id) return { ok: false, error: 'adNoBreak' };
  const p = g.players[pid];
  if (!p) return { ok: false, error: 'adNoBreak' };
  const elapsed = g.market.tick - pending.startTick;
  if (skip) {
    if (elapsed < SPONSOR.skipTicks) return { ok: false, error: 'adTooSoon' };
    delete sp.pending[pid];
    return { ok: true, data: { reward: 0, skipped: true } };
  }
  if (elapsed < SPONSOR.fullTicks) return { ok: false, error: 'adTooSoon' };
  delete sp.pending[pid];
  const why = adRefusal(g, pid, { ignorePending: true });
  if (why) return { ok: false, error: why };
  const day = realDayOf(g);
  const c = sp.counts[pid];
  sp.counts[pid] = c && c.day === day ? { day, n: c.n + 1 } : { day, n: 1 };
  creditExternal(g, pid, SPONSOR.reward, 'adCash');
  const tick = g.market.tick;
  p.adLots = [...(p.adLots ?? []).filter((l) => l.untilTick > tick), { amount: SPONSOR.reward, untilTick: tick + SPONSOR.lotTicks, kind: 'ad' }];
  notify(g, out, pid, {
    kind: 'system', tone: 'gain', text: `+$${SPONSOR.reward} of ad cash added. It works for trades and businesses for 72 hours, not for ops, margin, derivatives or transfers.`,
    msg: { key: 'ad.toast.added', vars: { amount: SPONSOR.reward } },
  });
  return { ok: true, data: { reward: SPONSOR.reward } };
}

/**
 * Restricted cash for a buy (ROADMAP C5, 2.7): a buy may use restricted cash only when the account's cash, less what its open
 * buys already reserve, covers it. Anything past that is margin, and margin cannot be backed by ad cash. A short is a margin sale.
 */
export function adOrderRefusal(g: GameState, pid: string, req: OrderRequest): string | null {
  if (restrictedNow(g, pid) <= 0) return null;
  return overdraws(g, pid, req) ? 'adCashMargin' : null;
}

/**
 * Whether an order would borrow: a buy whose cost (with commission) exceeds the cash less what open buys reserve, or a short.
 * A reduce-only order never borrows. Shared by the ad-cash rule (above) and the fresh-start margin block (comeback.ts).
 */
export function overdraws(g: GameState, pid: string, req: OrderRequest): boolean {
  if (req.reduceOnly) return false;
  const acct = g.market.accounts[pid];
  if (!acct) return false;
  if (req.side === 'buy') {
    const px = req.limitPrice ?? req.stopPrice ?? priceOf(g, req.assetId);
    if (!Number.isFinite(px) || px <= 0) return false;
    const def = g.market.config.assets.find((a) => a.id === req.assetId);
    const cost = req.qty * px;
    const need = cost + (def ? commission(g.market, def, cost, req.qty) : 0);
    return need + reservedBuys(g, pid) > acct.cash + 1e-6;
  }
  const long = Math.max(0, acct.positions[req.assetId]?.qty ?? 0);
  return req.qty > long;
}

/** Cash the player's open buys reserve (the worst case of each order, with its commission), as the engine reserves it. */
export function reservedBuys(g: GameState, pid: string): number {
  let r = 0;
  for (const o of g.market.orders) {
    if (o.status !== 'open' || o.playerId !== pid || o.side !== 'buy' || o.reduceOnly) continue;
    const remaining = o.qty - o.filledQty;
    const px = o.limitPrice ?? o.stopPrice ?? priceOf(g, o.assetId);
    if (!Number.isFinite(px) || px <= 0 || remaining <= 0) continue;
    const def = g.market.config.assets.find((a) => a.id === o.assetId);
    r += remaining * px + (def ? commission(g.market, def, remaining * px, remaining) : 0);
  }
  return r;
}

/** Restricted cash cannot buy options (a derivative, ROADMAP 2.7). */
export function adOptionRefusal(g: GameState, pid: string, side: string): string | null {
  return side === 'buy' && restrictedNow(g, pid) > 0 ? 'adCashDerivative' : null;
}

/** A transfer, a loan or a fund deposit may spend only the cash that is not restricted (spendableCash). */
export function adTransferRefusal(g: GameState, pid: string, amount: number): string | null {
  if (spendableCash(g, pid) >= amount) return null;
  return cashOf(g, pid) >= amount ? 'adCashTransfer' : null;
}

/**
 * Insider actions (ROADMAP 2.7, C5): no insider action may be paid from restricted cash. No player insider command exists yet;
 * 6C adds the command and calls this check (tested here so the rule is in place before it lands).
 */
export function adInsiderRefusal(g: GameState, pid: string, cost: number): string | null {
  if (spendableCash(g, pid) >= cost) return null;
  return cashOf(g, pid) >= cost ? 'adCashOps' : 'not enough cash';
}

/** The daily tick of the ad lots: drop the expired lots (no money moves). */
export function pruneAdLots(g: GameState): void {
  const tick = g.market.tick;
  for (const p of Object.values(g.players)) {
    if (!p.adLots?.length) continue;
    const live = p.adLots.filter((l) => l.untilTick > tick);
    if (live.length !== p.adLots.length) p.adLots = live;
  }
}
