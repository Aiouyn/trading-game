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
  it('only a null cbk owner is filled: other fields keep their first registration, null/undefined/same owner is a no-op', () => {
    const w = new LedgerWorld();
    const before = w.entity('cbk_SRL')!;
    w.registerEntity({ id: 'cbk_SRL' });
    w.registerEntity({ id: 'cbk_SRL', ownerId: null });
    expect(w.entity('cbk_SRL')).toEqual(before);
    w.registerEntity({ id: 'cbk_SRL', ownerId: 'gov_SRL', reportingCcy: 'FDL', payFrom: { kind: 'CASH' } });
    expect(w.entity('cbk_SRL')).toEqual({ ...before, ownerId: 'gov_SRL' });
    expect(w.registerEntity({ id: 'cbk_SRL', ownerId: 'gov_SRL' })).toBe('cbk_SRL');
    w.registerEntity({ id: 'cbk_SRL' });
    expect(w.entity('cbk_SRL')).toEqual({ ...before, ownerId: 'gov_SRL' });
  });
  it('#68 item 1: a different owner on a known id throws, once filled and on any non-cbk id', () => {
    const w = new LedgerWorld();
    w.registerEntity({ id: 'cbk_SRL', ownerId: 'gov_SRL' });
    expect(() => w.registerEntity({ id: 'cbk_SRL', ownerId: 'gov_FDL' })).toThrow(/cbk_SRL is already registered with owner gov_SRL/);
    expect(w.entity('cbk_SRL')?.ownerId).toBe('gov_SRL');
    // a non-cbk known id with no owner is never filled
    w.registerEntity({ id: 'gov_FDL', reportingCcy: 'FDL' });
    expect(() => w.registerEntity({ id: 'gov_FDL', ownerId: 'gov_SRL' })).toThrow(/gov_FDL is already registered with owner null/);
    expect(w.entity('gov_FDL')?.ownerId).toBeNull();
    // the other ownerless constructor pre-registrations (sys, escrow court) are not fillable either
    const sys = w.entity('sys_SYSTEM')!;
    expect(sys.ownerId).toBeNull();
    expect(() => w.registerEntity({ id: 'sys_SYSTEM', ownerId: 'gov_FDL' })).toThrow(/already registered/);
    // a non-cbk id with an owner: same owner is a no-op, a different one throws
    w.registerEntity({ id: 'gov_SRL', ownerId: 'gov_FDL' });
    expect(w.registerEntity({ id: 'gov_SRL', ownerId: 'gov_FDL' })).toBe('gov_SRL');
    expect(() => w.registerEntity({ id: 'gov_SRL', ownerId: 'cbk_FDL' })).toThrow(/gov_SRL is already registered with owner gov_FDL/);
    expect(w.entity('gov_SRL')?.ownerId).toBe('gov_FDL');
  });
});
