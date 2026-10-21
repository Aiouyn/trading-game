import { describe, expect, it } from 'vitest';
import { autoStep, initialTier, isBatterySaver, measureFps, FPS_THRESHOLD } from '@/city/tiers/select';

describe('C-01 tiers (17-AT-24)', () => {
  it('order: override → no WebGL2 → battery saver → T2', () => {
    expect(initialTier({ override: 'T1', hasWebGL2: true, batterySaver: true })).toEqual({ tier: 'T1', reason: 'override' });
    expect(initialTier({ override: 'auto', hasWebGL2: false, batterySaver: true })).toEqual({ tier: 'T0', reason: 'no-webgl2' });
    expect(initialTier({ override: 'auto', hasWebGL2: true, batterySaver: true })).toEqual({ tier: 'T0', reason: 'battery-saver' });
    expect(initialTier({ override: 'auto', hasWebGL2: true, batterySaver: false })).toEqual({ tier: 'T2', reason: 'initial' });
    expect(initialTier({ override: 'T2', hasWebGL2: false, batterySaver: false })).toEqual({ tier: 'T0', reason: 'no-webgl2' });
  });
  it('battery saver = discharging at ≤ 20 %', () => {
    expect(isBatterySaver({ charging: false, level: 0.2 })).toBe(true);
    expect(isBatterySaver({ charging: false, level: 0.21 })).toBe(false);
    expect(isBatterySaver({ charging: true, level: 0.05 })).toBe(false);
    expect(isBatterySaver(null)).toBe(false);
  });
  it('an injected 25 fps frame clock over 2 s steps T2 → T1; 60 fps keeps T2', () => {
    const at = (ms: number, n: number) => Array.from({ length: n }, (_, i) => i * ms);
    expect(measureFps(at(40, 10))).toBeNull(); // window not full yet
    const slow = measureFps(at(40, 52))!;
    expect(slow).toBeCloseTo(25, 5);
    expect(autoStep('T2', slow)).toBe('T1');
    const fast = measureFps(at(1000 / 60, 125))!;
    expect(fast).toBeGreaterThanOrEqual(FPS_THRESHOLD);
    expect(autoStep('T2', fast)).toBe('T2');
    expect(autoStep('T1', 120)).toBe('T1'); // never steps up
  });
});
