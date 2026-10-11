import { create } from 'zustand';
import { t } from '@/i18n';

/**
 * The comeback's screen state (in memory, per viewer): the chapter screen, the new-chapter moment, the sponsor card that is
 * running, and the forced close the viewer has already left. Nothing here is saved; the world holds the state (me.comeback).
 */
export interface SponsorCardState {
  id: string;
  brand: string;
  /** when the card opened on this device (ms): its 15-second run is timed from here */
  opened: number;
}

interface ComebackUi {
  chapterOpen: boolean;
  openChapter: () => void;
  closeChapter: () => void;
  /** the chapter the viewer just started (the 2.4-second new-chapter moment), or null */
  moment: { chapter: number; amount: number } | null;
  setMoment: (m: { chapter: number; amount: number } | null) => void;
  card: SponsorCardState | null;
  setCard: (c: SponsorCardState | null) => void;
  /** the bust tick of a forced close the viewer has left (so the chapter screen does not reopen over it) */
  forcedLeft: number | null;
  leaveForced: (tick: number) => void;
}

export const useComeback = create<ComebackUi>((set) => ({
  chapterOpen: false,
  openChapter: () => set({ chapterOpen: true }),
  closeChapter: () => set({ chapterOpen: false }),
  moment: null,
  setMoment: (moment) => set({ moment }),
  card: null,
  setCard: (card) => set({ card }),
  forcedLeft: null,
  leaveForced: (tick) => set({ forcedLeft: tick, chapterOpen: false }),
}));

/**
 * A refusal in its three parts (what, why, do), read from en.json and fr.json under `prefix.<code>`. A code without copy
 * falls back to the engine's own short text, so a new refusal is never shown as a raw key.
 */
export function refusalText(prefix: string, code: string, fallback?: string): string {
  const parts = ['what', 'why', 'do'].map((p) => t(`${prefix}.${code}.${p}`));
  const keys = ['what', 'why', 'do'].map((p) => `${prefix}.${code}.${p}`);
  if (parts.every((text, i) => text !== keys[i])) return parts.join(' ');
  return fallback ?? code;
}
