import { ADVICE_PATTERNS_EN, ADVICE_PATTERNS_FR, BANNED_WORDS, BANNED_WORDS_FR, adviceIn, bannedIn } from '../../src/world/text/banned';
import { allowedNumbers, numbersIn, stringValuesOf } from './facts';

/** Why a model reply was not used. Each reason has its own counter in the readout. */
export type RejectReason = 'json' | 'locale' | 'language' | 'length' | 'number' | 'banned' | 'advice';

export type Validated = { ok: true; en: string; fr: string } | { ok: false; reason: RejectReason };

/**
 * English function words that are not French words (no French word is spelled the same). A French line that uses one of them is
 * English in disguise. A word that the facts themselves contain (a company name, a ticker phrase) is allowed.
 */
export const EN_STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'with', 'from', 'its', 'was', 'were', 'has', 'have', 'had', 'this', 'that', 'their', 'after', 'before',
  'is', 'are', 'of', 'to', 'by', 'at', 'which', 'while', 'it', 'they',
]);

/** The lower-cased words of a text (letters only, so an apostrophe splits a word). */
export function wordsOf(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}]+/u).filter((w) => w !== '');
}

/**
 * One reply, checked (lead-phase7.md P7-2): valid JSON with both locales, the length cap, no number that the facts do not
 * allow, no banned word, no advice pattern in either language, and a French line that is French (no English stopword the facts
 * do not contain). Any failure sends the caller back to the template.
 */
export function validateReply(raw: string, facts: unknown, maxChars: number): Validated {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { ok: false, reason: 'json' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, reason: 'json' };
  const { en, fr } = parsed as { en?: unknown; fr?: unknown };
  if (typeof en !== 'string' || typeof fr !== 'string' || en.trim() === '' || fr.trim() === '') return { ok: false, reason: 'locale' };
  const lines = [en.trim(), fr.trim()];
  if (lines.some((l) => l.length > maxChars)) return { ok: false, reason: 'length' };
  const allowed = allowedNumbers(facts);
  if (lines.some((l) => numbersIn(l).some((n) => !allowed.has(n)))) return { ok: false, reason: 'number' };
  if (bannedIn(lines[0]!, BANNED_WORDS).length || bannedIn(lines[1]!, BANNED_WORDS_FR).length) return { ok: false, reason: 'banned' };
  if (adviceIn(lines[0]!, ADVICE_PATTERNS_EN).length || adviceIn(lines[1]!, ADVICE_PATTERNS_FR).length) return { ok: false, reason: 'advice' };
  const factWords = new Set(stringValuesOf(facts).flatMap(wordsOf));
  if (wordsOf(lines[1]!).some((w) => EN_STOPWORDS.has(w) && !factWords.has(w))) return { ok: false, reason: 'language' };
  return { ok: true, en: lines[0]!, fr: lines[1]! };
}
