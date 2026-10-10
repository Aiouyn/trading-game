/**
 * The OS-update ceremony timeline (velvet-desktop-os.md "Ceremony", P2-200..P2-209). Pure: time comes
 * in as a number, so the beats and the start rules are tested without a clock or a DOM.
 *
 * Beats (ms from the start): 0-600 the desktop dims; 600-1400 INSTALLING with the progress hairline;
 * 1400-2600 the rank name rises; 2600-4200 three cards; 4200 on, the Keep going button. The ceremony
 * is skippable after 1 s by a tap or Esc (C-31). It starts only with no pending order, 10 s idle and no
 * world takeover playing (P2-201). Reduced motion shows every beat at once (P2-206).
 */

export const CEREMONY_DIM_MS = 600;
export const CEREMONY_INSTALL_END_MS = 1400;
export const CEREMONY_RANK_END_MS = 2600;
export const CEREMONY_CARDS_END_MS = 4200;
/** The skip opens after one second (P2-201, C-31). */
export const CEREMONY_SKIP_AFTER_MS = 1000;
/** The desktop must be idle this long before the ceremony starts (P2-201). */
export const CEREMONY_IDLE_MS = 10_000;

export interface CeremonyBeat {
  /** Dim of the desktop, 0 to 0.85 (bg0 at 85%, P2-200). */
  dim: number;
  installing: boolean;
  /** Progress hairline, 0 to 1, linear over the install beat. */
  progress: number;
  rankShown: boolean;
  /** Cards on screen: 0 to 3. */
  cards: number;
  keepGoing: boolean;
  skippable: boolean;
  done: boolean;
}

/** The beat at `ms` after the ceremony began. Reduced motion jumps to the last beat (P2-206). */
export function ceremonyBeat(ms: number, reduced = false): CeremonyBeat {
  const t = reduced ? Number.POSITIVE_INFINITY : Math.max(0, ms);
  const installProgress = t < CEREMONY_DIM_MS ? 0 : Math.min(1, (t - CEREMONY_DIM_MS) / (CEREMONY_INSTALL_END_MS - CEREMONY_DIM_MS));
  return {
    dim: t >= CEREMONY_DIM_MS ? 0.85 : (0.85 * t) / CEREMONY_DIM_MS,
    installing: t >= CEREMONY_DIM_MS && t < CEREMONY_INSTALL_END_MS,
    progress: installProgress,
    rankShown: t >= CEREMONY_INSTALL_END_MS,
    cards: t >= CEREMONY_RANK_END_MS ? 3 : 0,
    keepGoing: t >= CEREMONY_CARDS_END_MS,
    skippable: t >= CEREMONY_SKIP_AFTER_MS,
    done: t >= CEREMONY_CARDS_END_MS,
  };
}

/**
 * The ranks a multi-rank update also passed (P2-204): the ids strictly between `from` and `to`, in order. The
 * ceremony plays `to` (the highest); card 1 names these as "Also". Ids are R0..R6; a missing or equal `from` gives none.
 */
export function alsoRanks(from: string | null, to: string): string[] {
  const f = from === null ? NaN : Number(from.slice(1));
  const t = Number(to.slice(1));
  if (!Number.isFinite(f) || !Number.isFinite(t) || t - f < 2) return [];
  return Array.from({ length: t - f - 1 }, (_, k) => `R${f + 1 + k}`);
}

/** What blocks the ceremony from starting now. Every flag is read by the caller at each check. */
export interface CeremonyGate {
  /** Any open order on any ticker (P2-201, V:192). */
  pendingOrder: boolean;
  /** Milliseconds since the last pointer, key or touch (a drag resets it, P2-201). */
  idleMs: number;
  /** A major world event is on screen (P2-202). */
  worldTakeover: boolean;
}

/** Whether the ceremony may start. Rank-ups wait; they never interrupt an order or a takeover. */
export function ceremonyMayStart(g: CeremonyGate): boolean {
  return !g.pendingOrder && !g.worldTakeover && g.idleMs >= CEREMONY_IDLE_MS;
}
