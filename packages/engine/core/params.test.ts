import { describe, expect, it } from 'vitest';
import { CORE_PARAM_KEYS, coreParams, PHASES, type ParamsView } from './index';

describe('coreParams (T02-21 params.ts)', () => {
  it('reads every key once through the ParamsView; no defaults hard-coded', () => {
    const reads: string[] = [];
    const v: ParamsView = { num: (k) => { reads.push(k); return 0.5; }, int: (k) => { reads.push(k); return 7; } };
    const p = coreParams(v);
    expect([...reads].sort()).toEqual([...CORE_PARAM_KEYS].sort());
    expect(new Set(CORE_PARAM_KEYS).size).toBe(CORE_PARAM_KEYS.length);
    expect(p.intentsPerTickPerActor).toBe(7); expect(p.shadowVerifyFraction).toBe(0.5);
    expect(Object.keys(p.phaseBudgetMs)).toEqual([...PHASES]);
    expect(CORE_PARAM_KEYS).toContain('phase_budget_ms_P14');
  });
});
