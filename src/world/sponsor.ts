import { keyedRng, cashOf, creditExternal, notify, priceOf, REAL_DAY, RESTRICT_TICKS, restrictedNow, today } from './core';
import type { CommandResult, GameState, StepOutput } from './types';
import type { OrderRequest } from '@/engine';

/**
 * Simulated sponsor breaks (velvet-rewarded-ads.md, ROADMAP 2.7, lead-phase6.md 6B). There is no ad network and no tracking:
 * a break is a 15-second in-app card for a fictional brand. A full watch pays $250 of ad cash; a skip after 5 seconds pays
 * nothing. The world offers a break only when the player was under $1,000 at the start of the game day, the account is a
 * real day old, and the profile has not yet reached 10 rewarded breaks that day. The profile is the alliance owner's account
 * when the player is in an alliance, else the player alone (the owner links stand in for the collusion graph until 6C).
 *
 * Ad cash is tagged and held 72 real hours (core.ts restrictedOf): it cannot pay for ops, margin, derivatives or transfers.
 * Every reward is a booked faucet line, `adCash` (economy.faucets), so the world money identity still closes.
 */

/** The lead's numbers (lead-phase6.md 6B). The break times are in ticks: one tick is five real seconds at the live pace. */
export const SPONSOR = {
  reward: 250,
  dailyCap: 10,
  /** offered only under this much cash (at the day start), and the card shows under this net worth */
  lowCash: 1000,
  /** the card runs this long; a full watch needs 15 s (three ticks) */
  watchSeconds: 15,
  fullTicks: 3,
  /** a skip is allowed after 5 s (one tick) and pays nothing */
  skipSeconds: 5,
  skipTicks: 1,
  /** an account must be a real day old before it is offered a break */
  minAgeTicks: REAL_DAY,
  /** the restricted-cash window for ad cash (ROADMAP C5) */
  lotTicks: RESTRICT_TICKS,
};

/** Fictional brands for the sponsor card (no real brands). The copy is in en.json and fr.json under sponsor.brand.<id>. */
export const SPONSOR_BRANDS = ['aurelle', 'fennick', 'marlow', 'pelican', 'corvid', 'tessel'] as const;
export type SponsorBrand = (typeof SPONSOR_BRANDS)[number];

/** The profile a sponsor cap is counted on: the alliance owner, or the player alone. */
export function profileKeyOf(g: GameState, pid: string): string {
  const p = g.players[pid];
  const a = p?.allianceId ? g.alliances[p.allianceId] : undefined;
  return a?.ownerId ?? pid;
}

/** Rewarded breaks the profile has today. */
export function adsUsedToday(g: GameState, pid: string): number {
  const c = g.sponsor?.counts[profileKeyOf(g, pid)];
  return c && c.day === today(g) ? c.n : 0;
}

/** Why the player is not offered a break now (a refusal code), or null when one may open. */
export function adRefusal(g: GameState, pid: string, opts: { ignorePending?: boolean } = {}): string | null {
  const p = g.players[pid];
  if (!p || p.npc) return 'adNotOffered';
  if (g.market.tick - p.joinedTick < SPONSOR.minAgeTicks) return 'adAge';
  // the offer reads the cash at the day start (the lead's rule): a player may run all ten breaks in the day even as the cash
  // passes the line, so the live net worth is not checked here
  const startCash = p.dayStart.cash ?? cashOf(g, pid);
  if (startCash >= SPONSOR.lowCash) return 'adNotOffered';
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
 * Close the open card. A full watch needs three ticks since the card opened and pays the reward (the cap and the offer are
 * checked again, so two cards in one profile cannot pass the cap). A skip needs one tick and pays nothing.
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
  const key = profileKeyOf(g, pid);
  const c = sp.counts[key];
  const day = today(g);
  sp.counts[key] = c && c.day === day ? { day, n: c.n + 1 } : { day, n: 1 };
  creditExternal(g, pid, SPONSOR.reward, 'adCash');
  const tick = g.market.tick;
  p.adLots = [...(p.adLots ?? []).filter((l) => l.untilTick > tick), { amount: SPONSOR.reward, untilTick: tick + SPONSOR.lotTicks, kind: 'ad' }];
  notify(g, out, pid, {
    kind: 'system', tone: 'gain', text: `+$${SPONSOR.reward} of ad cash added. It works for trades and businesses for 72 hours, not for ops, margin, derivatives or transfers.`,
    msg: { key: 'ad.toast.added', vars: { amount: SPONSOR.reward } },
  });
  return { ok: true, data: { reward: SPONSOR.reward } };
}

/** Restricted cash for a use (ROADMAP C5): a buy larger than the cash is margin, and a short is a margin sale. */
export function adOrderRefusal(g: GameState, pid: string, req: OrderRequest): string | null {
  if (req.reduceOnly) return null;
  if (restrictedNow(g, pid) <= 0) return null;
  const acct = g.market.accounts[pid];
  if (!acct) return null;
  if (req.side === 'buy') {
    const px = req.limitPrice ?? req.stopPrice ?? priceOf(g, req.assetId);
    if (!Number.isFinite(px) || px <= 0) return null;
    return req.qty * px > acct.cash ? 'adCashMargin' : null;
  }
  const long = Math.max(0, acct.positions[req.assetId]?.qty ?? 0);
  return req.qty > long ? 'adCashMargin' : null;
}

/** Restricted cash cannot buy options (a derivative, ROADMAP 2.7). */
export function adOptionRefusal(g: GameState, pid: string, side: string): string | null {
  return side === 'buy' && restrictedNow(g, pid) > 0 ? 'adCashDerivative' : null;
}

/** A transfer or a loan out of the player: only unrestricted cash may leave (P2P moves are barred for ad cash). */
export function adTransferRefusal(g: GameState, pid: string, amount: number): string | null {
  if (cashOf(g, pid) >= amount && cashOf(g, pid) - restrictedNow(g, pid) < amount) return 'adCashTransfer';
  return null;
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
