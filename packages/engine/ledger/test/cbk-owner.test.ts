// E-92 (5) pre-existing defect: LedgerWorld pre-registers cbk_<ccy> with no owner and registerEntity returned early on a known id, so
// T04-21 step 5's cbk_<B> ownerId govId(b) was lost. Fix: re-registering a known entity whose owner is null sets the given owner; nothing else changes.
import { describe, expect, it } from 'vitest';
import { LedgerWorld } from '../src';

describe('E-92 (5) cbk_<ccy> owner', () => {
  it('cbk_FDL.ownerId === gov_FDL after the T04-21 registration order (gov, then cbk with its owner)', () => {
    const w = new LedgerWorld();
    expect(w.entity('cbk_FDL')?.ownerId).toBeNull();   // constructor pre-registration
    w.registerEntity({ id: 'gov_FDL', reportingCcy: 'FDL' });
    expect(w.registerEntity({ id: 'cbk_FDL', reportingCcy: 'FDL', ownerId: 'gov_FDL' })).toBe('cbk_FDL');
    expect(w.entity('cbk_FDL')?.ownerId).toBe('gov_FDL');
    expect(w.sideTag('cbk_FDL')).toEqual({ side: 'S' });
  });
  it('only a null owner is filled: a set owner is kept, other fields keep their first registration, null/undefined owner is a no-op', () => {
    const w = new LedgerWorld();
    const before = w.entity('cbk_SRL')!;
    w.registerEntity({ id: 'cbk_SRL' });
    w.registerEntity({ id: 'cbk_SRL', ownerId: null });
    expect(w.entity('cbk_SRL')).toEqual(before);
    w.registerEntity({ id: 'cbk_SRL', ownerId: 'gov_SRL', reportingCcy: 'FDL', payFrom: { kind: 'CASH' } });
    expect(w.entity('cbk_SRL')).toEqual({ ...before, ownerId: 'gov_SRL' });
    w.registerEntity({ id: 'cbk_SRL', ownerId: 'gov_FDL' });
    expect(w.entity('cbk_SRL')?.ownerId).toBe('gov_SRL');
    expect(w.entity('cbk_SRL')?.reportingCcy).toBe(before.reportingCcy);
  });
});
