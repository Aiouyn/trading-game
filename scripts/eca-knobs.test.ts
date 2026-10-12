import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CATALYSTS } from '../src/engine/catalysts';
import { ECA_TUNE } from '../src/world/eca-tune';
import { applyEcaTune, harnessCatalysts, parseKnobs } from './eca-knobs';

const DEFAULTS = { ...ECA_TUNE };

describe('the harness knobs reach the production config', () => {
  beforeEach(() => { Object.assign(ECA_TUNE, DEFAULTS); });
  afterEach(() => { Object.assign(ECA_TUNE, DEFAULTS); });

  it('--priceIn lands in the world catalyst config the rumor print reads (catalysts.rumorPriceIn)', () => {
    expect(harnessCatalysts(parseKnobs(['--priceIn', '0.3'])).rumorPriceIn).toBe(0.3);
    expect(harnessCatalysts(parseKnobs(['--priceIn', '1.0'])).rumorPriceIn).toBe(1);
    expect(harnessCatalysts(parseKnobs([])).rumorPriceIn).toBe(DEFAULT_CATALYSTS.rumorPriceIn);
  });

  it('--tipBase and --inquiryScore land on the ECA_TUNE object that tips.ts and eca.ts read at call time', () => {
    const k = parseKnobs(['--tipBase', '55', '--inquiryScore', '70', '--k', '3', '--slope', '9']);
    expect(k).toMatchObject({ tipBase: 55, inquiryScore: 70, insiderK: 3, tribunalSlope: 9 });
    applyEcaTune(k);
    expect(ECA_TUNE.tipBase).toBe(55);
    expect(ECA_TUNE.inquiryScore).toBe(70);
    expect(ECA_TUNE.insiderK).toBe(3);
    expect(ECA_TUNE.tribunalSlope).toBe(9);
  });

  it('with no flags the knobs are the production values, and applying them changes nothing', () => {
    const k = parseKnobs([]);
    expect(k).toEqual({ priceIn: DEFAULT_CATALYSTS.rumorPriceIn, tipBase: DEFAULTS.tipBase, inquiryScore: DEFAULTS.inquiryScore, insiderK: DEFAULTS.insiderK, tribunalSlope: DEFAULTS.tribunalSlope });
    applyEcaTune(k);
    expect({ ...ECA_TUNE }).toEqual(DEFAULTS);
  });
});
