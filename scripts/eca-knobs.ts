// The 6C harness's tuning knobs, read from the command line and pushed into the production config (lead-phase6.md 6C).
// The rumor price-in travels in the world config (catalysts.rumorPriceIn, read at publication by catalystDay); the ECA knobs
// are the mutable ECA_TUNE object that court.ts, eca.ts and tips.ts read at call time. Pure functions only, so the pass-through
// is unit-tested (scripts/eca-knobs.test.ts) and the harness imports it.

import { DEFAULT_CATALYSTS } from '../src/engine/catalysts';
import type { CatalystConfig } from '../src/engine/types';
import { ECA_TUNE } from '../src/world/eca-tune';

export interface HarnessKnobs {
  priceIn: number;
  tipBase: number;
  inquiryScore: number;
  insiderK: number;
  tribunalSlope: number;
}

/** the value of `--name <number>` in argv, or def when the flag is absent */
export function numArg(argv: string[], name: string, def: number): number {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? Number(argv[i + 1]) : def;
}

/** the knob set of one harness run. The defaults are the production values (read now, before any override is applied). */
export function parseKnobs(argv: string[]): HarnessKnobs {
  return {
    priceIn: numArg(argv, 'priceIn', DEFAULT_CATALYSTS.rumorPriceIn ?? 0),
    tipBase: numArg(argv, 'tipBase', ECA_TUNE.tipBase),
    inquiryScore: numArg(argv, 'inquiryScore', ECA_TUNE.inquiryScore),
    insiderK: numArg(argv, 'k', ECA_TUNE.insiderK),
    tribunalSlope: numArg(argv, 'slope', ECA_TUNE.tribunalSlope),
  };
}

/** sets the ECA knobs on the production tuning object (the harness's runs only; production keeps the eca-tune.ts defaults) */
export function applyEcaTune(k: HarnessKnobs): void {
  ECA_TUNE.tipBase = k.tipBase;
  ECA_TUNE.inquiryScore = k.inquiryScore;
  ECA_TUNE.insiderK = k.insiderK;
  ECA_TUNE.tribunalSlope = k.tribunalSlope;
}

/** the harness's catalyst config: the production rumor rates with the run's price-in share */
export function harnessCatalysts(k: HarnessKnobs): CatalystConfig {
  return { ...DEFAULT_CATALYSTS, rumorProb: 0.32, rumorAccuracy: 0.55, everyDays: 12, jitterDays: 2, rumorPriceIn: k.priceIn };
}
