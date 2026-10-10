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
  /** Render a descriptor in a language (falls back to English, then to the key). */
  render(m: Msg, locale: Locale): string;
}

export const textProvider: TextProvider = templateTextProvider;

export type { Msg, Locale };
