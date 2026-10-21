// E-79 (2): the T20A-01 InvariantScope carries DAY_CLOSE (ledger-core §4 binds INV-LED-010 and others at DAY_CLOSE).
import { describe, expect, expectTypeOf, it } from 'vitest';
import { calendarOf } from '../calendar/date';
import type { InvariantCtx, InvariantDef, InvariantImpl, InvariantScope, TruthStoreRead } from './index';

// Exhaustive pin: adding or removing a member of InvariantScope fails typecheck here (both directions).
const SCOPES = { TICK: 0, PHASE: 1, DAY_CLOSE: 2, SNAPSHOT: 3, OFFLINE: 4, STATIC: 5 } as const satisfies Record<InvariantScope, number>;
type Exact = keyof typeof SCOPES;

describe('E-79 InvariantDef.scope carries DAY_CLOSE', () => {
  it('the scope union is exactly the T20A-01 set, which includes TICK, DAY_CLOSE and OFFLINE', () => {
    expectTypeOf<InvariantScope>().toEqualTypeOf<Exact>();
    expectTypeOf<InvariantDef['scope']>().toEqualTypeOf<InvariantScope>();
    expectTypeOf<'DAY_CLOSE'>().toMatchTypeOf<InvariantDef['scope']>();
    expectTypeOf<'TICK'>().toMatchTypeOf<InvariantDef['scope']>();
    expectTypeOf<'OFFLINE'>().toMatchTypeOf<InvariantDef['scope']>();
    expect(Object.getOwnPropertyNames(SCOPES)).toEqual(['TICK', 'PHASE', 'DAY_CLOSE', 'SNAPSHOT', 'OFFLINE', 'STATIC']);
  });

  it('a DAY_CLOSE-scoped invariant runs at the day-close tick (t = 719 of the day) and only there', () => {
    const seen: number[] = [];
    const none: TruthStoreRead = { get: () => undefined, iter: () => [], count: () => 0 };
    const inv: InvariantImpl = {
      def: { id: 'INV-TEST-DC', module: '03', scope: 'DAY_CLOSE', severity: 'QUARANTINE', description: 'day-close probe', costClass: 'O1', sampling: 'NEVER', sinceEngineVersion: '1.0.0' },
      check: (ctx) => { seen.push(ctx.tick); return ctx.scope === 'DAY_CLOSE' ? { ok: true } : { ok: false, entityIds: [], observed: ctx.scope, expected: 'DAY_CLOSE' }; },
    };
    const ctxAt = (tick: number, scope: InvariantScope): InvariantCtx => ({ tick, phase: 'P13', scope, partitionId: 'p1', safeMode: false, pre: none, post: none,
      writeSet: [], postings: [], events: [], facts: { get: () => undefined }, num: () => 0 });
    // Test-local dispatch by calendar boundary; the T20A-01 runner (forScope / runInvariants) is not built in this PR.
    for (const tick of [0, 718, 719, 720, 1438, 1439]) {
      const scopes: InvariantScope[] = calendarOf(tick).boundaries.has('DAY_CLOSE') ? ['TICK', 'DAY_CLOSE'] : ['TICK'];
      for (const s of scopes) if (s === inv.def.scope) expect(inv.check(ctxAt(tick, s))).toEqual({ ok: true });
    }
    expect(seen).toEqual([719, 1439]);
    expect(inv.check(ctxAt(5, 'TICK'))).toMatchObject({ ok: false, observed: 'TICK' });
  });
});
