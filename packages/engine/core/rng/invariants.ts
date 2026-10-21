// T02-06: INV-ENG-002 (TICK, FATAL). Uses the local InvariantImpl port (invariant-port.ts) until T20A-01 lands; T02-12 supplies the
// facts and T02-21 registers the invariant in core's ModuleDef.
import type { InvariantCtx, InvariantImpl, InvariantResult } from '../invariant-port';
import { cmpStr } from '../order';
import { matchStream } from './registry';
import type { RngLedgerRow } from './manager';

export const FACT_RNG_LEDGER = 'core.rng.ledger';
export const FACT_RNG_DELTAS = 'core.rng.counterDeltas';
export interface RngCounterDelta { key: string; before: bigint | number; after: bigint | number }

/** facts(key) may carry the rows directly or one array of rows per fact. */
function rows<T>(ctx: InvariantCtx, key: string): T[] {
  const out: T[] = [];
  for (const f of ctx.facts(key)) { if (Array.isArray(f)) out.push(...(f as T[])); else out.push(f as T); }
  return out;
}

/** Every ledger key is registered (live world), and for every stream after − before equals the draws recorded in the ledger. */
export const INV_ENG_002: InvariantImpl = {
  def: { id: 'INV-ENG-002', scope: 'TICK', severity: 'FATAL', module: '02' },
  check(ctx: InvariantCtx): InvariantResult {
    const ledger = rows<RngLedgerRow>(ctx, FACT_RNG_LEDGER), deltas = rows<RngCounterDelta>(ctx, FACT_RNG_DELTAS);
    const bad: string[] = [], observed: string[] = [], expected: string[] = [];
    const drawn: Record<string, bigint> = {};
    for (const r of ledger) {
      const spec = matchStream(r.key);
      if (!spec || spec.root === 'HARNESS') { bad.push(r.key); observed.push(`${r.key}: unregistered`); expected.push(`${r.key}: in 02 §3.10.4`); }
      drawn[r.key] = (drawn[r.key] ?? 0n) + BigInt(r.draws);
    }
    const seen: Record<string, true> = {};
    for (const d of deltas) {
      seen[d.key] = true;
      const adv = BigInt(d.after) - BigInt(d.before), led = drawn[d.key] ?? 0n;
      if (adv !== led) { bad.push(d.key); observed.push(`${d.key}: counter +${adv}`); expected.push(`${d.key}: ledger ${led}`); }
    }
    for (const r of ledger) if (!seen[r.key] && r.draws !== 0) { bad.push(r.key); observed.push(`${r.key}: no counter delta`); expected.push(`${r.key}: counter +${r.draws}`); }
    if (bad.length === 0) return { ok: true };
    const ids = bad.filter((k, i) => bad.indexOf(k) === i).sort(cmpStr);
    return { ok: false, entityIds: ids, observed: observed.join('; '), expected: expected.join('; ') };
  },
};
