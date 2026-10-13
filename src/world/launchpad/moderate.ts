/**
 * The Launchpad's name filter (lead-launchpad.md L2). A template filter for V1: the Phase 7 moderator role replaces it with
 * reviewed decisions, but the rules here are the floor. Names are normalised first (case, accents, leetspeak, spacing and
 * punctuation), then matched against the lists by token and by the joined word. Fictional names only.
 */

/** Leetspeak substitutions (lead-launchpad.md L2): 0>o 1>i 3>e 4>a 5>s 7>t @>a $>s. */
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

/**
 * The normalised form of a name: lowercase, accents removed, leetspeak mapped, and split on everything that is not a letter.
 * `tokens` are the words; `joined` is them concatenated (so "Doge Coin" and "dogecoin" compare equal).
 */
export function normalizeName(raw: string): { tokens: string[]; joined: string } {
  const folded = raw.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
  let mapped = '';
  for (const ch of folded) mapped += LEET[ch] ?? ch;
  const tokens = mapped.split(/[^a-z]+/).filter((t) => t.length > 0);
  return { tokens, joined: tokens.join('') };
}

/**
 * Plainly abusive words (a blocklist: slurs, abuse and common profanity; review fix, Phase 10 added the profanity). Matched as a whole
 * token, or inside the joined word when six letters or more.
 */
export const ABUSE_TERMS: readonly string[] = [
  'nigger', 'nigga', 'faggot', 'retard', 'kike', 'spic', 'chink', 'tranny', 'nazi', 'hitler', 'kkk', 'rapist', 'pedo',
  'killyourself', 'kys',
  'fuck', 'fucker', 'fuckers', 'fucking', 'fucked', 'motherfucker', 'shit', 'shitty', 'shitcoin', 'shitcoins', 'bullshit',
  'bitch', 'bitches', 'asshole', 'assholes', 'cunt', 'dickhead', 'dumbass',
];

/** Real cryptocurrency names and tickers (the lists in L2: BTC, ETH, SOL, DOGE, SHIB, PEPE, BONK and their names). */
export const CRYPTO_TERMS: readonly string[] = [
  'bitcoin', 'btc', 'ethereum', 'eth', 'ether', 'solana', 'sol', 'dogecoin', 'doge', 'shiba', 'shib', 'shibainu', 'pepe',
  'bonk', 'tether', 'usdt', 'usdc', 'ripple', 'xrp', 'cardano', 'ada', 'litecoin', 'ltc', 'polkadot', 'avalanche', 'binance',
  'bnb', 'chainlink', 'monero', 'tron', 'toncoin', 'dogwifhat', 'wif', 'floki', 'memecoin',
];

/** Real brands. */
export const BRAND_TERMS: readonly string[] = [
  'apple', 'google', 'alphabet', 'microsoft', 'amazon', 'tesla', 'nike', 'coca', 'cocacola', 'pepsi', 'mcdonalds', 'disney',
  'netflix', 'meta', 'facebook', 'instagram', 'twitter', 'tiktok', 'nvidia', 'intel', 'samsung', 'sony', 'toyota', 'ferrari',
  'starbucks', 'walmart', 'visa', 'mastercard', 'paypal', 'reddit', 'discord', 'openai', 'anthropic', 'spotify',
];

/** Real public figures. */
export const FIGURE_TERMS: readonly string[] = [
  'musk', 'elon', 'trump', 'biden', 'obama', 'putin', 'zuckerberg', 'bezos', 'gates', 'altman', 'kardashian', 'taylor',
  'swift', 'beyonce', 'drake', 'messi', 'ronaldo',
];

export type NameRefusal = 'abuse' | 'crypto' | 'brand' | 'figure' | 'taken';

export interface ModerationResult {
  ok: boolean;
  /** the list that refused the name, when refused */
  reason?: NameRefusal;
  /** the term that matched, for the moderator log */
  term?: string;
}

/** Whether a normalised name matches a list: a whole token, or the joined word equals the term or contains a long term. */
function matchIn(n: { tokens: string[]; joined: string }, terms: readonly string[]): string | null {
  for (const term of terms) {
    // a run of up to three whole tokens ("Ap-ple" reads as "apple"), or the joined word equal to the term
    for (let i = 0; i < n.tokens.length; i++) {
      let run = '';
      for (let j = i; j < Math.min(n.tokens.length, i + 3); j++) {
        run += n.tokens[j]!;
        if (run === term) return term;
      }
    }
    if (n.joined === term) return term;
    if (term.length >= 6 && n.joined.includes(term)) return term;
  }
  return null;
}

/**
 * Screens a token name or ticker. `taken` is the set of normalised names already in the world (live or delisted, every asset and
 * every token), and the joined form is compared to it exactly. A ticker is screened with the crypto list and the taken set too.
 */
export function moderateName(raw: string, taken: ReadonlySet<string> = new Set()): ModerationResult {
  const n = normalizeName(raw);
  if (n.joined.length === 0) return { ok: true };
  if (taken.has(n.joined)) return { ok: false, reason: 'taken', term: n.joined };
  const checks: [NameRefusal, readonly string[]][] = [['abuse', ABUSE_TERMS], ['crypto', CRYPTO_TERMS], ['brand', BRAND_TERMS], ['figure', FIGURE_TERMS]];
  for (const [reason, terms] of checks) {
    const term = matchIn(n, terms);
    if (term) return { ok: false, reason, term };
  }
  return { ok: true };
}

/** A ticker is 3 to 5 capital letters A-Z (the input is upper-cased first). */
export function tickerFormatOk(raw: string): boolean {
  return /^[A-Z]{3,5}$/.test(raw);
}

/** A name is 3 to 24 letters, digits, spaces, dots, apostrophes or hyphens (accents allowed). */
export function nameFormatOk(raw: string): boolean {
  const s = raw.trim();
  return s.length >= 3 && s.length <= 24 && /^[\p{L}\p{N} .'-]+$/u.test(s);
}

/** R-10-6 (Phase 10): why a piece of free text (a description, a reply) is refused. */
export type TextRefusal = 'empty' | 'long' | 'link' | 'abuse';

/**
 * A link on a token thread is a scam vector, so no link goes through (review fix, Phase 10). Three shapes are refused:
 *   - a scheme or a www prefix (http://, hxxp://, www.);
 *   - a host with a path under ANY top-level domain ("bit.ly/x", "pump.fun/x", "dapp.dev/mint", "linktr.ee/x", "a.b.zz/q");
 *   - a bare host under a common domain or a link shortener ("pump.fun", "t.co", "bit.ly").
 * A defanged host ("pump[.]fun", "pump(.)fun") is read with its dot first.
 */
const SCHEME_RE = /\b(?:hxxps?|https?|ftp):\/\/|\bwww\./i;
const HOST_PATH_RE = /(?:^|[^\w@./-])[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?::\d+)?\/\S/i;
const BARE_HOST_RE = /(?:^|[^\w@./-])[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|xyz|gg|me|app|finance|click|site|fun|dev|ly|gl|co|cc|ee|link|live|pro|info|biz|tech|shop|store|online|world|space|cloud|tv|ai|eth|sol|bio|page|vip|win|bet|top|pw|tk|ml|ga|cf|gq|xxx|crypto|nft|exchange|trade|bot)(?![a-z0-9-])/i;
const SHORTENER_RE = /(?:^|[^\w@./-])(?:bit\.ly|t\.co|goo\.gl|tinyurl\.com|is\.gd|cutt\.ly|rb\.gy|linktr\.ee|tiny\.cc|ow\.ly|buff\.ly|rebrand\.ly|shorturl\.at)(?![a-z0-9-])/i;

/** True when the text carries a link in one of the shapes above. */
export function hasLink(text: string): boolean {
  const read = text.replace(/\[\.\]|\(\.\)/g, '.');
  return SCHEME_RE.test(read) || HOST_PATH_RE.test(read) || BARE_HOST_RE.test(read) || SHORTENER_RE.test(read);
}

/**
 * The moderator's check of free text a player writes on a token (a description, a reply). The text is plain: whitespace is
 * collapsed and trimmed, and the length counts characters (code points), so an accented or emoji character is one character. A link
 * and an abusive word are refused with the same blocklist as a name (ABUSE_TERMS). Returns the cleaned text, or the refusal.
 */
export function moderateText(raw: string, max: number): { ok: true; text: string } | { ok: false; reason: TextRefusal } {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length === 0) return { ok: false, reason: 'empty' };
  if ([...text].length > max) return { ok: false, reason: 'long' };
  if (hasLink(text)) return { ok: false, reason: 'link' };
  if (matchIn(normalizeName(text), ABUSE_TERMS)) return { ok: false, reason: 'abuse' };
  return { ok: true, text };
}
