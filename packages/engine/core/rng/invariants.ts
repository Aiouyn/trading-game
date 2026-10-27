// T02-06: INV-ENG-002 (TICK, FATAL), on the T20A-01 contract types (T02-09 / E-70, E-71). T02-12 supplies the facts and T02-21
// registers the invariant in core's ModuleDef.
import type { InvariantCtx, InvariantImpl, InvariantOutcome } from '../invariants';
import { cmpStr } from '../order';
import { matchStream } from './registry';
import type { RngLedgerRow } from './manager';

export const FACT_RNG_LEDGER = 'core.rng.ledger';
export const FACT_RNG_DELTAS = 'core.rng.counterDeltas';
export interface RngCounterDelta { key: string; before: bigint | number; after: bigint | number }

/** The fact under key is the row array (or a single row); absent -> no rows. */
function rows<T>(ctx: InvariantCtx, key: string): T[] {
  const f = ctx.facts.get<unknown>(key);
  return f === undefined ? [] : Array.isArray(f) ? (f.slice() as T[]) : [f as T];
}

/** Every ledger key is registered (live world), and for every stream after − before equals the draws recorded in the ledger. */
export const INV_ENG_002: InvariantImpl = {
  def: { id: 'INV-ENG-002', module: '02', scope: 'TICK', severity: 'FATAL', costClass: 'O_TOUCHED', sampling: 'NEVER', sinceEngineVersion: '1.0.0',
    description: "RNG discipline: every random draw came from a named 02 stream; the per-stream draw counters advanced only by draws recorded in the tick's RNG ledger" },
  check(ctx: InvariantCtx): InvariantOutcome {
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
