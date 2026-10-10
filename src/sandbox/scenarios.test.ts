import { beforeAll, describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { SANDBOX } from './config';
import { recordScenario } from './record';
import { Sandbox } from './sandbox';
import { SCENARIOS, gxReturn, scenarioHolds, type Scenario, type ScenarioRecord } from './scenarios';

/** one fresh run per scenario, shared by the tests below (each run is about two seconds of engine time) */
const runs = new Map<string, ScenarioRecord>();

beforeAll(() => {
  for (const s of SCENARIOS) runs.set(s.id, recordScenario(Sandbox.create({ kind: 'scenario', scenarioId: s.id })));
}, 300_000);

describe('scenario seeds (quant-scenario-seeds.md)', () => {
  it('exports the six Phase 0 scenarios with their lengths and opening regimes', () => {
    expect(SCENARIOS.map((s) => [s.id, s.days, s.startRegime])).toEqual([
      ['contraction-week', 21, 'contraction'],
      ['overheating', 21, 'overheating'],
      ['flash', 5, 'expansion'],
      ['earnings-heavy', 21, 'expansion'],
      ['quiet', 21, 'expansion'],
      ['crypto-winter', 21, 'contraction'],
    ]);
  });

  it('every scenario seed carries the sandbox prefix and is never the live seed', () => {
    for (const s of SCENARIOS) {
      expect(s.seed.startsWith(SANDBOX.seedPrefix)).toBe(true);
      expect(s.seed).not.toBe('avalon');
    }
    expect(new Set(SCENARIOS.map((s) => s.seed)).size).toBe(SCENARIOS.length);
  });

  for (const s of SCENARIOS) {
    it(`${s.id} reproduces its headline condition on a fresh run`, () => {
      const rec = runs.get(s.id)!;
      expect(rec.days).toBe(s.days);
      expect(scenarioHolds(s as Scenario, rec)).toBe(true);
    }, 120_000);
  }

  it('the flash scenario goes live on the second day', () => {
    const rec = runs.get('flash')!;
    const tpd = rec.ticksPerDay;
    expect(rec.flashStarts.some((t) => t >= tpd && t < 2 * tpd)).toBe(true);
  });

  it('buy-and-hold on the index is not positive in every scenario', () => {
    const returns = SCENARIOS.map((s) => gxReturn(runs.get(s.id)!));
    expect(returns.some((r) => r <= 0)).toBe(true);
  });

  it('a scenario run is repeatable: the same seed gives the same index path', () => {
    const again = recordScenario(Sandbox.create({ kind: 'scenario', scenarioId: 'quiet' }));
    expect(again.gx).toEqual(runs.get('quiet')!.gx);
    expect(again.gold).toEqual(runs.get('quiet')!.gold);
  }, 120_000);
});

describe('scenario text is translated', () => {
  it('every scenario title and note exists in English and French', () => {
    for (const s of SCENARIOS) {
      for (const key of [s.title, s.note]) {
        expect(key in en, `en ${key}`).toBe(true);
        expect(key in fr, `fr ${key}`).toBe(true);
      }
    }
  });
});
