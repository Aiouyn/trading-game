import { describe, expect, it } from 'vitest';
import { BLOC_ORDER, CRISIS_KINDS, type BlocId } from '../schema';
import { MAJORS, weightOf, type CatalogInputs } from './crisisCatalog';

const per = <T>(v: T): Record<BlocId, T> => Object.fromEntries(BLOC_ORDER.map((b) => [b, v])) as Record<BlocId, T>;
const calm = (o: Partial<CatalogInputs> = {}): CatalogInputs => ({ blocZ: per({ credit: 0, valuation: 0, house: 0 }),
  gdpShareFdl: { FDL: 0.32, EUN: 0.22, PYN: 0.24, NKR: 0.07, SRL: 0.15 }, fsi: 0, fear: 0, tension: 0, hackRate: 0, aiRace: 0, cryptoHype: null,
  minStablecoinBacking: null, semisValuationZ: null, reserveCover: per(12), currentAccount: per(0), lambda: per(0), worldHeadlineInflation: 0.02,
  poolUnderwritingQuality: null, repoLeverageIndex: null, npcBankBelow12x: per(0), housePriceGap: per(0), defaultRateRising: false, weakestNpcBanks: [], ...o });
const def = (k: string) => MAJORS.find((d) => d.kind === k)!;
const z = (b: BlocId, k: string, v: number) => { const s = calm(); s.blocZ[b] = { ...s.blocZ[b], [k]: v }; return s; };

describe('T04-18 crisis catalog', () => {
  it('all 15 majors in CRISIS_KINDS order', () => expect(MAJORS.map((d) => d.kind)).toEqual([...CRISIS_KINDS]));
  it('OIL weight at tension 60 = 0.8·e^1', () => expect(weightOf(def('OIL_SHOCK'), calm({ tension: 60 }))).toBeCloseTo(2.174625, 6));
  it('SOV weight at λ 0.03 = 0.6·3 = 1.8', () => { const s = calm(); s.lambda.EUN = 0.03; expect(weightOf(def('SOVEREIGN_DEBT_CRISIS'), s)).toBeCloseTo(1.8, 12); });
  it('BANKING vuln at FSI 0.5 = 2.0; clamped to 4 in the weight', () => {
    expect(def('BANKING_PANIC').vuln(calm({ fsi: 0.5 }))).toBeCloseTo(2, 12);
    expect(weightOf(def('BANKING_PANIC'), calm({ fsi: 0.9 }))).toBeCloseTo(0.6 * Math.E ** 4, 9);
  });
  it('CYBER weight is 0; ineligible kinds weigh 0', () => {
    expect(weightOf(def('CYBER_PANDEMIC'), calm({ hackRate: 99 }))).toBe(0);
    expect(weightOf(def('TRADE_WAR'), calm({ tension: 49 }))).toBe(0);
  });
  it('EQUITY eligible for FDL at z 1.2 (share 0.32), not for SRL at z 1.5 (share 0.15)', () => {
    const e = def('EQUITY_BUBBLE_BURST');
    expect(e.eligible(z('FDL', 'valuation', 1.2))).toBe(true);
    expect(e.blocs(z('FDL', 'valuation', 1.2), 0)).toEqual(['FDL']);
    expect(e.eligible(z('SRL', 'valuation', 1.5))).toBe(false);
    expect(weightOf(e, z('FDL', 'valuation', 1.2))).toBeCloseTo(Math.E ** 1.2, 12);
  });
  it('SOV picks the highest-λ bloc; TRADE_WAR hits FDL and PYN', () => {
    const s = calm(); s.lambda.EUN = 0.02; s.lambda.SRL = 0.05;
    expect(def('SOVEREIGN_DEBT_CRISIS').blocs(s, 0)).toEqual(['SRL']);
    expect(def('TRADE_WAR').blocs(calm(), 0)).toEqual(['FDL', 'PYN']);
  });
});
