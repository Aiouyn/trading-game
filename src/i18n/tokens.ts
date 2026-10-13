/**
 * Number tokens in message descriptors. A server builds a sentence with its figures as tokens (a string var that starts with
 * "#"), and the reader's locale formats them when the sentence is rendered (the client's t(), and the server's render for an
 * English inbox line), so one descriptor reads right in either language:
 *   "#n:<value>,<min>,<max>"  a plain number, with min to max decimals         1 284,10 in French
 *   "#usd:<value>"            a dollar figure, two decimals, '-' when negative  $1,500.00 / 1 500,00 $
 *   "#susd:<value>"           the same with an explicit '+' when positive        +$12.00 / +12,00 $
 *   "#pct:<fraction>"         a percent from a fraction, two decimals           1.23% / 1,23 %
 *   "#spct:<fraction>"        the same with an explicit '+' when positive       +1.23% / +1,23 %
 *   "#mpct:<fraction>"        a market move: one decimal, '+' or the true minus sign '−' (the wire's form)  +3.5% / −3,5 %
 * The French forms follow src/game/format.ts: a decimal comma, a no-break space before the dollar sign or the percent sign.
 */

export type TokenLocale = 'en' | 'fr';

const NBSP = ' ';
const TAG: Record<TokenLocale, string> = { en: 'en-US', fr: 'fr-FR' };

/**
 * Intl prints the French group separator as a narrow no-break space (U+202F), which the body and hero fonts draw with no gap
 * ("8005250,00 $" on screen). French groups take the no-break space (U+00A0), the same character as the currency gap.
 */
export const groupSpace = (s: string): string => s.replace(/ /g, NBSP);
const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(locale: TokenLocale, min: number, max: number): Intl.NumberFormat {
  const key = `${locale}:${min}:${max}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(TAG[locale], { minimumFractionDigits: min, maximumFractionDigits: max });
    formatters.set(key, f);
  }
  return f;
}

/** True for a string that is a number token (the "#" forms above). */
export function isNumberToken(v: string): boolean {
  return /^#(n|usd|susd|pct|spct|mpct):/.test(v);
}

/** A "#n:" token: a plain number with the given decimals, in the locale's separators. */
export function formatNumberToken(locale: TokenLocale, token: string): string {
  const [value = '', min = '0', max = '2'] = token.slice(3).split(',');
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return groupSpace(formatterFor(locale, Number(min), Number(max)).format(n));
}

/** Any number token, formatted in the locale. A token that does not parse is shown as typed, never as a crash. */
export function formatToken(locale: TokenLocale, token: string): string {
  if (token.startsWith('#n:')) return formatNumberToken(locale, token);
  const colon = token.indexOf(':');
  const kind = token.slice(1, colon);
  const x = Number(token.slice(colon + 1));
  if (!Number.isFinite(x)) return token.slice(colon + 1);
  const signed = kind === 'susd' || kind === 'spct';
  const move = kind === 'mpct';
  // a market move always carries its sign: '+' when zero or up, the true minus sign when down (the wire has always printed that)
  const sign = move ? (x < 0 ? '−' : '+') : x < 0 ? '-' : signed && x > 0 ? '+' : '';
  const a = Math.abs(x);
  const dec = move ? 1 : 2;
  const figure = groupSpace(formatterFor(locale, dec, dec).format(kind === 'pct' || kind === 'spct' || move ? a * 100 : a));
  if (kind === 'pct' || kind === 'spct' || move) return locale === 'fr' ? `${sign}${figure}${NBSP}%` : `${sign}${figure}%`;
  return locale === 'fr' ? `${sign}${figure}${NBSP}$` : `${sign}$${figure}`;
}

/** A dollar figure token: the amount to the server's money helpers' form (the sign is the caller's, here or in susd). */
export const usdToken = (x: number): string => `#usd:${x}`;
export const signedUsdToken = (x: number): string => `#susd:${x}`;
export const pctToken = (fraction: number): string => `#pct:${fraction}`;
export const signedPctToken = (fraction: number): string => `#spct:${fraction}`;
