import type { Msg, Locale } from '@/i18n';
import type { DailyClose } from '../ledger-types';
import { templateTextProvider } from './template';

/**
 * Text the world makes for a player (Phase 3, section 5). The world never writes a sentence inline: it asks the provider
 * for message descriptors (keys in en.json and fr.json, with variables), and the viewer's language renders them. Phase 7
 * adds other roles and a model-backed provider behind this same interface.
 */
export interface TextProvider {
  /** The daily close card's lines, as descriptors. Facts only, past tense, no banned words (text/banned.ts). */
  dailyClose(card: Omit<DailyClose, 'lines'>): Msg[];
  /** The Research Desk memo: at most three past-tense sentences from a dossier's facts (velvet-research-desk.md). */
  deskMemo(facts: DeskMemoFacts): Msg[];
  /** The one-line explanation of a closed trade, from its parts (velvet-trade-journal-replay.md). */
  tripLine(facts: TripLineFacts): Msg;
  /** Render a descriptor in a language (falls back to English, then to the key). */
  render(m: Msg, locale: Locale): string;
}

/** The facts a desk memo is written from: the move, its largest part (a row key), and the pool that led the flow. */
export interface DeskMemoFacts {
  assetId: string;
  from: number;
  to: number;
  move: number;
  dominant: string | null;
  pool: { id: string; buying: boolean } | null;
}

/** The facts a trade line is written from: the realized P&L and the rows (a row key to dollars; fees is fees and slippage). */
export interface TripLineFacts {
  realized: number;
  rows: Partial<Record<string, number>>;
}

export const textProvider: TextProvider = templateTextProvider;

export type { Msg, Locale };
