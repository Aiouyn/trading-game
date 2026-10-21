import { isCcy, type Ccy, type Id } from './money';
import type { EntityKind } from './types';

export type AccountClass = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' | 'MEMO';
export const SYS_ID = 'sys_SYSTEM';
export const cbkId = (ccy: Ccy): Id => `cbk_${ccy}`;

/** Pure memo of kindOfId (ids are immutable strings); holds no world state. */
const KIND: Record<string, EntityKind | null> = Object.create(null);
export function kindOfId(id: Id): EntityKind | undefined {
  const hit = KIND[id];
  if (hit !== undefined) return hit ?? undefined;
  const r = kindUncached(id); KIND[id] = r ?? null; return r;
}
function kindUncached(id: Id): EntityKind | undefined {
  const k = id.split('_')[0];
  return (['sys', 'cbk', 'gov', 'reg', 'crt', 'exc', 'ccp', 'rat', 'bnk', 'ins', 'fnd', 'spv', 'cmp', 'biz', 'prop', 'ali', 'npc', 'hh', 'frm', 'row', 'chr'] as const)
    .find((x) => x === k);
}

/** '<entityId>:<code>[:<sub>]:<ccy>'; the sub may itself contain ':' (e.g. RESTRICTED:51840:AD_GRANT). */
export function accountKey(entityId: Id, code: number, ccy: Ccy, sub?: string): string {
  return sub === undefined ? `${entityId}:${code}:${ccy}` : `${entityId}:${code}:${sub}:${ccy}`;
}
export interface ParsedKey { entityId: Id; code: number; sub?: string; ccy: Ccy }
/** Pure memo of parseAccountKey (keys are immutable strings); holds no world state. */
const PARSED: Record<string, ParsedKey | null> = Object.create(null);
export function parseAccountKey(key: string): ParsedKey | undefined {
  const hit = PARSED[key];
  if (hit !== undefined) return hit ?? undefined;
  const r = parseUncached(key);
  PARSED[key] = r ?? null;
  return r;
}
function parseUncached(key: string): ParsedKey | undefined {
  const parts = key.split(':');
  if (parts.length < 3) return undefined;
  const ccy = parts[parts.length - 1];
  const code = Number(parts[1]);
  if (!isCcy(ccy) || !/^\d{4}$/.test(parts[1]) || parts[0] === '' || kindOfId(parts[0]) === undefined) return undefined;
  const sub = parts.length > 3 ? parts.slice(2, -1).join(':') : undefined;
  return { entityId: parts[0], code, sub, ccy };
}
export const entityOfKey = (key: string): Id => key.split(':')[0];

/**
 * Class by first digit (T03-01 classOfCode). TODO(systems): the full 03 §3.2 chart (names, kinds, contra flags) is not in the
 * reference set; only the first-digit rule is implemented.
 */
export function classOfCode(code: number): AccountClass | undefined {
  const d = Math.floor(code / 1000);
  return (['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE', 'EXPENSE', undefined, undefined, 'MEMO'] as const)[d - 1];
}
/** Base-money accounts (BMA, spec §2.5) and deposits. 1009 is virtual elastic money (never M0/M2). */
export const BMA_CODES = [1001, 1002, 1003] as const;
export function isMoneyCode(code: number, kind: EntityKind | undefined): boolean {
  return code === 1001 || code === 1002 || code === 1003 || code === 1010 || (code === 1009 && (kind === 'hh' || kind === 'frm' || kind === 'row'));
}
/** T03-06 defaultMoneyCode: bnk, ccp -> 1002 reserves; gov -> 1003 treasury; others 1001 settlement cash. */
export function defaultMoneyCode(kind: EntityKind | undefined): 1001 | 1002 | 1003 {
  return kind === 'bnk' || kind === 'ccp' ? 1002 : kind === 'gov' ? 1003 : 1001;
}
/** cbk holder liability mirroring a holder BMA (03 §3.5.3). */
export const cbMirrorCode = (bma: 1001 | 1002 | 1003): 2001 | 2002 | 2003 => (bma + 1000) as 2001 | 2002 | 2003;
export const RESTRICTED_PREFIX = 'RESTRICTED:';
export const restrictedSub = (releaseTick: number, tag: string): string => `${RESTRICTED_PREFIX}${releaseTick}:${tag}`;
