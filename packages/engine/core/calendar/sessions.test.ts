import { describe, expect, it } from 'vitest';
import { PRODUCT_FAMILIES, productFamiliesOpen, sessionState } from './index';

const M = 0.5;
const day = (d: number, t: number): number => d * 720 + t;
describe('sessions (02 §3.3)', () => {
  it('02#6 on an FDL holiday (flag ON): FDL equity never matches, EUN clears 60..540, FX FDL/EUN depth ×0.5', () => {
    for (let t = 0; t < 720; t++) {
      const k = day(59, t);
      if (sessionState('BLOC_LISTED', k, { bloc: 'FDL', holidayFxDepthMult: M, holidays: true }).matches) throw new Error(`FDL ${t}`);
      const eun = sessionState('BLOC_LISTED', k, { bloc: 'EUN', holidayFxDepthMult: M, holidays: true });
      if (eun.matches !== (t >= 60 && t <= 540)) throw new Error(`EUN ${t}`);
      const fx = sessionState('FX', k, { fxBlocs: ['FDL', 'EUN'], holidayFxDepthMult: M, holidays: true });
      if (!fx.matches || fx.depthMult !== 0.5) throw new Error(`FX ${t}`);
    }
    expect(sessionState('FX', day(59, 100), { fxBlocs: ['EUN', 'PYN'], holidayFxDepthMult: M, holidays: true }).depthMult).toBe(1);
    expect(sessionState('FX', day(59, 100), { fxBlocs: ['EUN', 'FDL'], holidayFxDepthMult: M, holidays: true }).depthMult).toBe(0.5);   // holiday bloc second
    expect(sessionState('FUT_BLOC', day(59, 100), { bloc: 'FDL', holidayFxDepthMult: M, holidays: true }).state).toBe('CLOSED');
  });
  it('flag OFF (D071): day 59 is a normal FDL day', () => {
    expect(sessionState('BLOC_LISTED', day(59, 100), { bloc: 'FDL', holidayFxDepthMult: M }).matches).toBe(true);
    expect(sessionState('FX', day(59, 100), { fxBlocs: ['FDL', 'EUN'], holidayFxDepthMult: M }).depthMult).toBe(1);
  });
  it('02#7 FX closed Sat t=0..Sun t=659, open at Sun 660', () => {
    for (let k = day(5, 0); k <= day(6, 659); k++) if (sessionState('FX', k, { fxBlocs: ['FDL', 'EUN'], holidayFxDepthMult: M }).matches) throw new Error(`${k}`);
    expect(sessionState('FX', day(6, 660), { fxBlocs: ['FDL', 'EUN'], holidayFxDepthMult: M }).matches).toBe(true);
    expect(sessionState('FX', day(4, 719), { fxBlocs: ['FDL', 'EUN'], holidayFxDepthMult: M })).toMatchObject({ matches: true, dailyMark: true });
    expect(sessionState('FUT_FX', day(5, 10), { fxBlocs: ['FDL', 'EUN'], holidayFxDepthMult: M }).matches).toBe(false);
  });
  it('02#8 crypto and perps every tick incl. weekends and an all-bloc holiday', () => {
    for (const holidays of [false, true]) for (let k = 0; k < day(7, 0); k++) for (const f of ['CRYPTO', 'FUT_24H'] as const) {
      if (!sessionState(f, k, { holidayFxDepthMult: M, holidays }).matches) throw new Error(`${f} ${k}`);
    }
  });
  it('equity phases', () => {
    const s = (t: number) => sessionState('BLOC_LISTED', day(1, t), { bloc: 'FDL', holidayFxDepthMult: M });
    expect([0, 59, 60, 61, 539, 540, 541, 719].map((t) => s(t).state)).toEqual(['CLOSED_QUEUE', 'CLOSED_QUEUE', 'OPEN_AUCTION', 'CONTINUOUS', 'CONTINUOUS',
      'CLOSE_AUCTION', 'CLOSED_QUEUE', 'CLOSED_QUEUE']);
    expect(s(540).officialClose).toBe(true); expect(s(539).officialClose).toBe(false);
    expect(sessionState('BLOC_LISTED', day(5, 100), { bloc: 'FDL', holidayFxDepthMult: M }).state).toBe('CLOSED_QUEUE');
  });
  it('futures on bloc underlyings, commodities, real assets, OTC', () => {
    const fb = (d: number, t: number) => sessionState('FUT_BLOC', day(d, t), { bloc: 'EUN', holidayFxDepthMult: M });
    expect([fb(1, 59).state, fb(1, 60).state, fb(1, 540).state, fb(1, 541).state, fb(6, 100).state]).toEqual(['CLOSED', 'TRADING', 'TRADING', 'CLOSED', 'CLOSED']);
    expect(fb(1, 540).officialClose).toBe(true);
    expect(sessionState('COMMODITY', day(5, 0), { holidayFxDepthMult: M }).matches).toBe(false);
    expect(sessionState('COMMODITY', day(59, 0), { holidayFxDepthMult: M, holidays: true }).matches).toBe(true);
    expect(sessionState('COMMODITY_24_7', day(6, 3), { holidayFxDepthMult: M }).matches).toBe(true);
    expect(sessionState('REAL_ASSET', day(6, 3), { holidayFxDepthMult: M }).matches).toBe(true);
    expect(sessionState('OTC', day(5, 3), { underlyingFamily: 'FX', fxBlocs: ['FDL', 'EUN'], holidayFxDepthMult: M }).matches).toBe(false);
    expect(sessionState('OTC', day(5, 3), { underlyingFamily: 'CRYPTO', holidayFxDepthMult: M }).matches).toBe(true);
    expect(() => sessionState('OTC', 0, { holidayFxDepthMult: M })).toThrow(/underlyingFamily/);
    expect(() => sessionState('BLOC_LISTED', 0, { holidayFxDepthMult: M })).toThrow(/bloc/);
  });
  it('productFamiliesOpen', () => {
    expect(productFamiliesOpen(day(5, 100), M)).toEqual(['FUT_24H', 'COMMODITY_24_7', 'CRYPTO', 'REAL_ASSET']);
    expect(productFamiliesOpen(day(1, 100), M)).toEqual(PRODUCT_FAMILIES.filter((f) => f !== 'OTC'));
  });
});
