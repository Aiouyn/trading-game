// T22A-01 step 3: canonical bloc ids (24 R39, 22 §0.3) and the one 04 alias table (22 §1.1).
export type BlocId = 'FDL' | 'EUN' | 'PYN' | 'NKR' | 'SRL';
export type BlocAlias04 = 'FU' | 'EC' | 'PL' | 'NA' | 'SC';

export class ContentError extends Error {
  constructor(readonly code: string, msg: string) { super(`${code}: ${msg}`); this.name = 'ContentError'; }
}

/** 04 §3.19 draw order. */
export const BLOC_IDS: readonly BlocId[] = Object.freeze(['FDL', 'EUN', 'PYN', 'NKR', 'SRL'] as const);
export const BLOC_ALIAS_04: Readonly<Record<BlocAlias04, BlocId>> = Object.freeze({ FU: 'FDL', EC: 'EUN', PL: 'PYN', NA: 'NKR', SC: 'SRL' });
const ALIASES: readonly BlocAlias04[] = ['FU', 'EC', 'PL', 'NA', 'SC'];

export function isBlocId(x: string): x is BlocId { return (BLOC_IDS as readonly string[]).includes(x); }
function isAlias(x: string): x is BlocAlias04 { return (ALIASES as readonly string[]).includes(x); }

/** Accepts a canonical id or a 04 alias; throws CONTENT_UNKNOWN_BLOC otherwise. */
export function canonicalBloc(x: string): BlocId {
  if (isBlocId(x)) return x;
  if (isAlias(x)) return BLOC_ALIAS_04[x];
  throw new ContentError('CONTENT_UNKNOWN_BLOC', `unknown bloc ${x}`);
}

/** 22 §0.3: institution entity ids use the currency code. Only these five prefixes + a 04 alias are rewritten. */
const INSTITUTION_PREFIXES: readonly string[] = ['cbk_', 'exc_', 'reg_', 'gov_', 'crt_'];
export function canonicalEntityId(id: string): string {
  const pre = id.slice(0, 4);
  const rest = id.slice(4);
  if (INSTITUTION_PREFIXES.includes(pre) && isAlias(rest)) return pre + BLOC_ALIAS_04[rest];
  return id;
}
