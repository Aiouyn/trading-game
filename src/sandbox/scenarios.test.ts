import { beforeAll, describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { SANDBOX } from './config';
import { recordScenario } from './record';
import { Sandbox } from './sandbox';
import { SCENARIOS, gxReturn, scenarioHolds, scenarioNoteVars, type Scenario, type ScenarioRecord } from './scenarios';
import { SCENARIO_RULES } from './config';

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

  it('every number a note quotes comes from the rules, in both languages', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
    for (const s of SCENARIOS) {
      const vars = scenarioNoteVars(s);
      const enText = (en as Record<string, string>)[s.note]!;
      const frText = (fr as Record<string, string>)[s.note]!;
      expect(placeholders(enText), `en ${s.id}`).toEqual(Object.keys(vars).sort());
      expect(placeholders(frText), `fr ${s.id}`).toEqual(Object.keys(vars).sort());
    }
    // the quoted values are the rule values, so a tuned rule changes the copy with it
    expect(scenarioNoteVars(SCENARIOS.find((s) => s.id === 'quiet')!).percent).toBe(Math.round(SCENARIO_RULES.quietMaxDailyMove * 100));
    expect(scenarioNoteVars(SCENARIOS.find((s) => s.id === 'earnings-heavy')!)).toEqual({ count: SCENARIO_RULES.earningsMin, days: SCENARIO_RULES.earningsWindowDays });
    expect(scenarioNoteVars(SCENARIOS.find((s) => s.id === 'flash')!).day).toBe(SCENARIO_RULES.flashDay + 1);
  });
});
