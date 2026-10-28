// T04-09 macroprudential: ccyb target, 91-day delay, release, LTV/DTI; LTRO window.
import { describe, expect, it } from 'vitest';
import { cbkId } from '@tycoon/engine-ledger';
import { cbRow, cbWorld } from '../testkit/cbWorld';
import { macroTables, type CentralBank } from '../schema';
import { applyPendingCcyb, ccybTarget, CCYB_DELAY_TICKS, ltvCaps, macroprudentialAtMeeting, macroprudentialRelease, openLtro } from './macroprudential';

const mp = { ccyb: 0, ltvCapResidential: 0.8, ltvCapCommercial: 0.65, dtiCap: 0.4 };
const cbOf = (w: ReturnType<typeof cbWorld>): CentralBank => w.ctx.store.get<CentralBank>(macroTables.cb.name, cbkId('EUN'))!;
const world = (creditGap: number, extra: Partial<CentralBank> = {}, regime = 'EXPANSION', fsi = 0.2): ReturnType<typeof cbWorld> => {
  const w = cbWorld([cbRow('EUN', { macroprudential: mp, ccybPending: null, ...extra })], 1000);
  w.put(macroTables.bloc.name, { id: 'EUN', creditGap, housePriceGap: 0, regime } as never);
  w.put(macroTables.global.name, { id: 'GLOBAL', financialStressIndex: fsi } as never);
  return w;
};

describe('T04-09 macroprudential', () => {
  it('ccybTarget: 0.065 → 0.01, 0.03 → 0, 0.15 → 0.025, 0.06 → 0.01, 0.0599 → 0.005', () => {
    expect([0.065, 0.03, 0.15, 0.06, 0.0599, -0.1].map(ccybTarget)).toEqual([0.01, 0, 0.025, 0.01, 0.005, 0]);
  });
  it('LTV: house gap 0.20 → 0.75, 0.35 → 0.70, 0.15 → 0.80; creditGap 0.07 → commercial 0.60, 0.06 → 0.65; DTI 0.40', () => {
    expect(ltvCaps(0.2, 0)).toEqual({ residential: 0.75, commercial: 0.65, dti: 0.4 });
    expect(ltvCaps(0.35, 0.07)).toEqual({ residential: 0.7, commercial: 0.6, dti: 0.4 });
    expect(ltvCaps(0.15, 0.06)).toEqual({ residential: 0.8, commercial: 0.65, dti: 0.4 });
  });
  it('an increase applies exactly 91 × 720 ticks after the meeting, not a tick earlier', () => {
    const w = world(0.065);
    macroprudentialAtMeeting(w.ctx, 'EUN');
    expect(cbOf(w).ccybPending).toEqual({ value: 0.01, effectiveTick: 1000 + 91 * 720 });
    expect(CCYB_DELAY_TICKS).toBe(91 * 720);
    w.setTick(1000 + 91 * 720 - 1); applyPendingCcyb(w.ctx, 'EUN');
    expect(cbOf(w).macroprudential.ccyb).toBe(0);
    w.setTick(1000 + 91 * 720); applyPendingCcyb(w.ctx, 'EUN');
    expect(cbOf(w)).toMatchObject({ macroprudential: { ccyb: 0.01 }, ccybPending: null });
    expect(w.events.map((e) => (e.payload as { tool: string }).tool)).toEqual(['CCYB_CHANGE', 'LTV_CHANGE', 'CCYB_CHANGE']);   // gap 0.065 > 0.06 → commercial 0.60
  });
  it('a decrease at a meeting applies now; LTV change emits LTV_CHANGE', () => {
    const w = world(0.03, { macroprudential: { ...mp, ccyb: 0.02 } });
    w.put(macroTables.bloc.name, { id: 'EUN', creditGap: 0.07, housePriceGap: 0.2, regime: 'EXPANSION' } as never);
    macroprudentialAtMeeting(w.ctx, 'EUN');
    expect(cbOf(w).macroprudential).toEqual({ ccyb: 0.01, ltvCapResidential: 0.75, ltvCapCommercial: 0.6, dtiCap: 0.4 });
    expect(w.events.map((e) => (e.payload as { tool: string }).tool)).toEqual(['CCYB_CHANGE', 'LTV_CHANGE']);
  });
  it('CONTRACTION (or FSI > 0.5) releases to 0 at once and cancels the pending increase; calm → nothing', () => {
    for (const [regime, fsi] of [['CONTRACTION', 0.2], ['EXPANSION', 0.51]] as const) {
      const w = world(0.1, { macroprudential: { ...mp, ccyb: 0.01 }, ccybPending: { value: 0.02, effectiveTick: 99_999 } }, regime, fsi);
      macroprudentialRelease(w.ctx, 'EUN');
      expect(cbOf(w)).toMatchObject({ macroprudential: { ccyb: 0 }, ccybPending: null });
    }
    const w = world(0.1, { macroprudential: { ...mp, ccyb: 0.01 } }, 'EXPANSION', 0.5);
    macroprudentialRelease(w.ctx, 'EUN');
    expect(cbOf(w).macroprudential.ccyb).toBe(0.01);
    expect(w.events).toEqual([]);
  });
  it('openLtro sets and only extends the window; LTRO_OPEN', () => {
    const w = world(0, { ltroOpenUntilTick: null });
    openLtro(w.ctx, 'EUN', 5000, 'EMERGENCY');
    openLtro(w.ctx, 'EUN', 4000, 'CRISIS_POLICY');
    expect(cbOf(w).ltroOpenUntilTick).toBe(5000);
    expect(w.events.map((e) => (e.payload as { params: { untilTick: number } }).params.untilTick)).toEqual([5000, 5000]);
  });
});
