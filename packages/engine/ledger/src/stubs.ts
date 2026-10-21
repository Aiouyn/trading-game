// Minimal local stand-ins for pieces owned by other units. Each is the smallest interface the ledger core needs.
import type { Id } from './money';
import type { LedgerEntity } from './types';

/** TODO(unit-02): ctx.params registry (23). Values are the spec §6.5 PROVISIONAL defaults; read only through this object. */
export interface Params {
  led_code_alarm_mult: number;
  led_code_alarm_floor: number; // display dollars; toMoney -> micro
  led_tickflows_keep: number;
  flowday_keep_days: number;    // binding FlowDay retention (T03-11 :47-49)
}
export const DEFAULT_PARAMS: Readonly<Params> = { led_code_alarm_mult: 10, led_code_alarm_floor: 1_000_000, led_tickflows_keep: 720, flowday_keep_days: 364 };
/** TODO(unit-02): MSI (money scale index). Not used by INV-LED-001..015; stubbed at 1. */
export const msi = (): number => 1;

/** TODO(unit-02): T02-08 intent envelope. A duplicate intentId or a non-increasing nonce gets REJECT_REPLAY (spec §1.3, L16). */
export class IntentEnvelope {
  seen: Record<string, true> = {};
  lastNonce: Record<string, number> = {};
  accept(intentId: Id, entityId: Id, nonce: number): 'OK' | 'REJECT_REPLAY' {
    if (this.seen[intentId] || nonce <= (this.lastNonce[entityId] ?? -1)) return 'REJECT_REPLAY';
    this.seen[intentId] = true; this.lastNonce[entityId] = nonce;
    return 'OK';
  }
}

/** TODO(T03-16): ownership graph. Until then the ultimate controller is the end of the ownerId chain (cycle-safe). */
export function rootOwnerOf(entity: (id: Id) => LedgerEntity | undefined, id: Id): Id {
  const visited: Record<string, true> = {};
  let cur = id;
  for (;;) {
    visited[cur] = true;
    const next = entity(cur)?.ownerId;
    if (!next || visited[next]) return cur;
    cur = next;
  }
}

/** TODO(unit-16): actor-role registry (FUND_PRINCIPAL etc.). Only needed by Δ13 (INV-LED-021, out of scope); interface only. */
export interface RoleRegistry { hasRole(entityId: Id, role: string): boolean }
export const EMPTY_ROLES: RoleRegistry = { hasRole: () => false };
