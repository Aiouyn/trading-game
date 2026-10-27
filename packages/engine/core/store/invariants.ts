// T02-09 step 7: INV-ENG-001 (write ownership) and INV-ENG-006 (phase discipline), TICK / FATAL (20 §3.1).
import type { InvariantCtx, InvariantImpl, InvariantOutcome } from '../invariants';
import { phaseIndex, type PhaseId } from '../types';
import type { ReadStamp, StoreViolation } from './store';

export const FACT_STORE_VIOLATIONS = 'core.store.violations'; export const FACT_READ_STAMPS = 'core.store.readStamps';
const base = { module: '02', scope: 'TICK', severity: 'FATAL', sampling: 'NEVER', sinceEngineVersion: '1.0.0' } as const;

export const INV_ENG_001: InvariantImpl = {
  def: { ...base, id: 'INV-ENG-001', costClass: 'O_TOUCHED',
    description: 'Write ownership: every entity written this tick was written only by its owning module (19 Rule 3.1.3 ownership tables)' },
  check(ctx: InvariantCtx): InvariantOutcome {
    const v = ctx.facts.get<readonly StoreViolation[]>(FACT_STORE_VIOLATIONS) ?? [];
    if (v.length === 0) return { ok: true };
    return { ok: false, entityIds: v.map((x) => x.id), observed: v.map((x) => `module=${x.module} table=${x.table}`).join('; '), expected: 'writes only by the owning module' };
  },
};

export const INV_ENG_006: InvariantImpl = {
  def: { ...base, id: 'INV-ENG-006', costClass: 'O_TOUCHED',
    description: "Phase discipline: no module read a value written later in the same tick's pipeline than its own phase (00 §5.2), detected by the store's phase stamps" },
  check(ctx: InvariantCtx): InvariantOutcome {
    const bad = (ctx.facts.get<readonly ReadStamp[]>(FACT_READ_STAMPS) ?? []).filter((s) => phaseIndex(s.readerPhase as PhaseId) < phaseIndex(s.writerPhase as PhaseId));
    if (bad.length === 0) return { ok: true };
    return { ok: false, entityIds: bad.map((s) => s.id),
      observed: bad.map((s) => `${s.readerModule}@${s.readerPhase} read ${s.table}/${s.id} written in ${s.writerPhase}`).join('; '), expected: 'reads only of values written in the same or an earlier phase' };
  },
};
