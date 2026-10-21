// E-15.1 cpPolicy: allowed counterparty entity kinds (id prefix) per PAY / SWAP_ASSET code. Data generated into cppolicy-data.ts.
import { kindOfId } from './accounts';
import { SortedMap } from './det';
import { CPPOLICY_SEED } from './cppolicy-data';
import type { Id } from './money';

/** '*' any kind; '!S' any kind except the system side; '!S|gov|cbk' that plus the listed kinds; 'gov|reg|crt' only the listed kinds. */
export interface CpPolicyRow { code: string; payer: string; payee: string; oneSide?: string }
export const SYSTEM_KINDS: readonly string[] = ['gov', 'cbk', 'reg', 'crt', 'sys'];
export const CP_POLICY = new SortedMap<string, CpPolicyRow>(CPPOLICY_SEED.map((r) => [r.code, r]));

export function kindAllowed(spec: string, id: Id): boolean {
  const k = kindOfId(id) ?? '';
  if (spec === '*') return true;
  const parts = spec.split('|');
  if (parts.includes(k)) return true;
  return parts[0] === '!S' && !SYSTEM_KINDS.includes(k);
}
/** null when the pair fits the code's policy (or the code has none); else the observed / expected text for INV-LED-025. */
export function cpMismatch(code: string, payer: Id, payee: Id): { observed: string; expected: string } | null {
  if (code.startsWith('TAX_') && payer === payee) return { observed: `cp_self_pay ${code} payer=payee=${payer}`, expected: 'TAX_* payer ≠ payee' }; // QA pr6 #6
  const r = CP_POLICY.get(code); if (!r) return null;
  const okSide = r.oneSide === undefined || kindOfId(payer) === r.oneSide || kindOfId(payee) === r.oneSide;
  if (kindAllowed(r.payer, payer) && kindAllowed(r.payee, payee) && okSide) return null;
  return { observed: `cp_kind_mismatch ${code} payer=${kindOfId(payer) ?? payer} payee=${kindOfId(payee) ?? payee}`,
    expected: `payer ${r.payer}, payee ${r.payee}${r.oneSide ? `, one side ${r.oneSide}` : ''}` };
}
