import { ADVICE_PATTERNS_EN, ADVICE_PATTERNS_FR, BANNED_WORDS, BANNED_WORDS_FR, adviceIn, bannedIn } from '../../src/world/text/banned';
import { allowedNumbers, numbersIn } from './facts';

/** Why a model reply was not used. Each reason has its own counter in the readout. */
export type RejectReason = 'json' | 'locale' | 'length' | 'number' | 'banned' | 'advice';

export type Validated = { ok: true; en: string; fr: string } | { ok: false; reason: RejectReason };

/**
 * One reply, checked (lead-phase7.md P7-2): valid JSON with both locales, the length cap, no number that the facts do not
 * allow, no banned word and no advice pattern in either language. Any failure sends the caller back to the template.
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
  return { ok: true, en: lines[0]!, fr: lines[1]! };
}
