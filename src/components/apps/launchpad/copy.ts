// The Launchpad app's copy helpers: which i18n key a refusal code, a status, a reason or a tagline maps to, the three-part
// refusal text, the client's own checks of a name (the world checks it again at launch), and the price figures. Pure functions
// (no React), so copy.test.ts can check that every key they can return exists in English and French.
import { hasKey, t, tm, type Msg } from '@/i18n';
import { LP, TPD } from '@/world/launchpad/constants';
import { moderateName, nameFormatOk, tickerFormatOk, type NameRefusal } from '@/world/launchpad/moderate';
import { moderatorLine } from '@/world/launchpad/moderatorLine';

/** A refusal in its three parts: what happened, why, and what the viewer can do. */
export interface RefusalCopy {
  what: string;
  why: string;
  do: string;
}

/** Every refusal code the Launchpad world can send (state.ts refuse). Each has its three parts in en.json and fr.json. */
export const REFUSAL_CODES = [
  'age', 'allocation', 'alreadySued', 'ban', 'buzzCap', 'cash', 'cooldown', 'creatorCap', 'dead', 'devBuy', 'graduated', 'holdings',
  'live', 'locked', 'lockedEngine', 'lockedGrad', 'maxSlip', 'nameAbuse', 'nameBrand', 'nameCrypto', 'nameFigure', 'nameFormat', 'nameTaken',
  'noFlag', 'noPlayer', 'noToken', 'notCreator', 'notEligible', 'ownFlag', 'rank', 'slippage', 'sold', 'tagline', 'tickerCrypto',
  'tickerFormat', 'tickerRecent', 'tickerTaken', 'tooLarge', 'tooSmall', 'traded', 'zero',
] as const;

/**
 * The copy of a refusal. The world sends its three parts as descriptors (`data.parts`, already with their numbers), so the
 * viewer's language is used; a code with no copy falls back to the generic line, so a refusal never shows a raw key.
 */
export function refusalOf(data: unknown, code?: string): RefusalCopy {
  const parts = partsOf(data);
  if (parts) return { what: t(parts[0].key, parts[0].vars), why: t(parts[1].key, parts[1].vars), do: t(parts[2].key, parts[2].vars) };
  return refusalCopy(code ?? codeOf(data) ?? 'unknown');
}

/** The copy of a refusal code, for the refusals the client finds before it sends (a slippage over the setting, a name). */
export function refusalCopy(code: string, vars: Record<string, string | number> = {}): RefusalCopy {
  const base = hasKey(`lp.refuse.${code}.what`) ? `lp.refuse.${code}` : 'lp.refuse.unknown';
  // a refused name or ticker says its first part in the moderator's line, as the world's refusal does
  const subject = code === 'tickerCrypto' ? vars.ticker : vars.name;
  const moderated = moderatorLine(code, subject === undefined ? undefined : String(subject));
  return {
    what: moderated ? tm(moderated) : t(`${base}.what`, vars),
    why: t(`${base}.why`, vars),
    do: t(`${base}.do`, vars),
  };
}

/** The refusal code of a command's data, or null. */
export function codeOf(data: unknown): string | null {
  if (data && typeof data === 'object' && typeof (data as { refusal?: unknown }).refusal === 'string') {
    return (data as { refusal: string }).refusal;
  }
  return null;
}

function partsOf(data: unknown): [Msg, Msg, Msg] | null {
  if (!data || typeof data !== 'object') return null;
  const p = (data as { parts?: unknown }).parts;
  if (!Array.isArray(p) || p.length !== 3) return null;
  const ok = p.every((m) => m && typeof m === 'object' && typeof (m as Msg).key === 'string');
  return ok ? (p as [Msg, Msg, Msg]) : null;
}

/** The key of a token status (live, graduated, dead). */
export function statusKey(status: string): string {
  return `lp.status.${status}`;
}

/** The key of a dead token's reason (the world's deadReason: no trade for 24 game days, the cash rule, or a cancelled launch). */
export function deadReasonKey(reason: string): string {
  return `lp.page.deadReason.${reason}`;
}

/** The key of a flag reason (a dump after graduation, or a one-day sweep). */
export function reasonKey(reason: string): string {
  return `lp.reason.${reason}`;
}

/** The key of a tagline template (no free text in V1). */
export function taglineKey(id: string): string {
  return `lp.tagline.${id}`;
}

/** The key of a trade side in the tape. */
export function sideKey(side: 'buy' | 'sell'): string {
  return side === 'buy' ? 'lp.side.buy' : 'lp.side.sell';
}

/** The key of a buzz item's name and its cost line, by kind. */
export function buzzKey(kind: 'board' | 'wire'): string {
  return kind === 'board' ? 'lp.buzz.board' : 'lp.buzz.wire';
}

/** The game day a tick falls in (the same figure as state.ts dayOf, kept here so the client does not load the world's state). */
export function gameDayOf(tick: number): number {
  return tick <= 0 ? 0 : Math.floor((tick - 1) / TPD);
}

/** The virtual token reserve Y of a token from its curve progress (progress is (Y0 - Y) / curve supply, so this is exact). */
export function curveYOf(progress: number): number {
  return Math.round(LP.Y0 - progress * LP.CURVE_SUPPLY);
}

/** The cash the curve raises from the start to graduation, in dollars (about $43,950, lead-launchpad.md L3). */
export const GRAD_RAISE = (LP.X0 * LP.Y0) / LP.GRAD_Y - LP.X0;

/**
 * A token price in dollars. A launch price is a few millionths of a dollar, so the figure keeps enough digits to show a move:
 * 1,284.10 above a dollar, 0.0342 above a cent, and 0.00001398 below that (at least six decimals).
 */
export function lpPrice(n: number): string {
  if (!(n > 0)) return '0.00';
  if (n >= 1) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 0.01) return n.toFixed(4);
  const s = n.toFixed(10).replace(/0+$/, '');
  const dec = s.split('.')[1] ?? '';
  return dec.length < 6 ? n.toFixed(6) : s;
}

/** Whole tokens with separators, for the figures of a token (never abbreviated). */
export function tokens(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** The allocation in tokens from a percent of supply (1% is 10M), or null when the figure is not a number. */
export function allocationFromPct(text: string): number | null {
  const v = Number(text);
  if (text.trim() === '' || !Number.isFinite(v)) return null;
  return Math.round((v / 100) * LP.SUPPLY);
}

/** A typed dollar amount as whole cents, or null when it is not a positive amount. */
export function centsFromDollars(text: string): number | null {
  const v = Number(text);
  if (text.trim() === '' || !Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 100);
}

const NAME_CODE: Record<NameRefusal, string> = { abuse: 'nameAbuse', crypto: 'nameCrypto', brand: 'nameBrand', figure: 'nameFigure', taken: 'nameTaken' };

/**
 * The client's check of a name and a ticker as the viewer types (the live feedback on the Create form). It runs the same
 * moderator filter as the world, against the names this viewer can see; the world checks every name again at launch, so a
 * name that passes here can still be refused there. Returns the refusal code, or null when nothing is wrong.
 */
export function clientCheck(name: string, ticker: string, takenNames: ReadonlySet<string>): string | null {
  // the format is checked once the field could be complete (a name of three characters, a ticker of three letters)
  if (name.trim().length >= LP.NAME_MIN && !nameFormatOk(name)) return 'nameFormat';
  if (ticker.length >= LP.TICKER_MIN && !tickerFormatOk(ticker)) return 'tickerFormat';
  const tk = moderateName(ticker);
  if (tk.reason === 'crypto') return 'tickerCrypto';
  if (tk.reason === 'abuse') return 'nameAbuse';
  const nm = moderateName(name, takenNames);
  if (nm.reason) return NAME_CODE[nm.reason];
  return null;
}

/** The tagline templates a launch may use (the world's list, launch.ts TAGLINE_IDS). No free text in V1. */
export const TAGLINES = ['tg1', 'tg2', 'tg3', 'tg4', 'tg5', 'tg6', 'tg7', 'tg8'] as const;
