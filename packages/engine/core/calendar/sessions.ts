// T02-05: session state per product family (02 §3.3).
import { EngineFault, type Tick } from '../types';
import { GAME_DAYS_PER_GAME_YEAR, TICKS_PER_GAME_DAY } from './constants';
import { HOLIDAYS_ENABLED_DEFAULT, holidayOn, type BlocCode } from './holidays';

export type ProductFamily = 'BLOC_LISTED' | 'FX' | 'FUT_24H' | 'FUT_FX' | 'FUT_BLOC' | 'COMMODITY' | 'COMMODITY_24_7' | 'CRYPTO' | 'REAL_ASSET' | 'OTC';
export type SessionState = 'CLOSED_QUEUE' | 'OPEN_AUCTION' | 'CONTINUOUS' | 'CLOSE_AUCTION' | 'TRADING' | 'CLOSED';
export interface SessionInfo { state: SessionState; matches: boolean; depthMult: number; officialClose: boolean; dailyMark: boolean }
export const PRODUCT_FAMILIES: readonly ProductFamily[] = Object.freeze(['BLOC_LISTED', 'FX', 'FUT_24H', 'FUT_FX', 'FUT_BLOC', 'COMMODITY', 'COMMODITY_24_7',
  'CRYPTO', 'REAL_ASSET', 'OTC'] as const);

type Opts = { bloc?: BlocCode; fxBlocs?: [BlocCode, BlocCode]; underlyingFamily?: ProductFamily; holidayFxDepthMult: number; holidays?: boolean };
const MATCHING: readonly SessionState[] = ['OPEN_AUCTION', 'CONTINUOUS', 'CLOSE_AUCTION', 'TRADING'];
const info = (state: SessionState, x: Partial<SessionInfo> = {}): SessionInfo =>
  ({ state, matches: MATCHING.includes(state), depthMult: 1, officialClose: false, dailyMark: false, ...x });

export function sessionState(family: ProductFamily, tick: Tick, opts: Opts): SessionInfo {
  const t = tick % TICKS_PER_GAME_DAY;
  const day = Math.floor(tick / TICKS_PER_GAME_DAY);
  const wd = day % 7;
  const doy = (day % GAME_DAYS_PER_GAME_YEAR) + 1;
  const hol = opts.holidays ?? HOLIDAYS_ENABLED_DEFAULT;
  const isHol = (b: BlocCode): boolean => holidayOn(b, doy, hol) !== undefined;
  const need = <T>(v: T | undefined, what: string): T => { if (v === undefined) throw new EngineFault('I0.session_opts', `${family} needs ${what}`); return v; };
  const mark = t === TICKS_PER_GAME_DAY - 1;
  switch (family) {
    case 'BLOC_LISTED': {
      const b = need(opts.bloc, 'bloc');
      if (wd >= 5 || isHol(b) || t < 60 || t > 540) return info('CLOSED_QUEUE');
      if (t === 60) return info('OPEN_AUCTION');
      if (t === 540) return info('CLOSE_AUCTION', { officialClose: true });
      return info('CONTINUOUS');
    }
    case 'FX': case 'FUT_FX': {
      const [a, c] = need(opts.fxBlocs, 'fxBlocs');
      if (wd === 5 || (wd === 6 && t < 660)) return info('CLOSED');   // Sat t=0 .. Sun t=659
      return info('TRADING', { depthMult: isHol(a) || isHol(c) ? opts.holidayFxDepthMult : 1, dailyMark: mark });
    }
    case 'FUT_24H': case 'CRYPTO': case 'COMMODITY_24_7':
      return info('TRADING', { dailyMark: mark });
    case 'FUT_BLOC': {
      const b = need(opts.bloc, 'bloc');
      if (wd >= 5 || isHol(b) || t < 60 || t > 540) return info('CLOSED');
      return info('TRADING', { officialClose: t === 540 });
    }
    case 'COMMODITY':
      return wd >= 5 ? info('CLOSED') : info('TRADING', { dailyMark: mark });
    case 'REAL_ASSET':
      return info('TRADING');
    case 'OTC': {
      const u = need(opts.underlyingFamily, 'underlyingFamily');
      if (u === 'OTC') throw new EngineFault('I0.session_opts', 'OTC underlying cannot be OTC');
      return sessionState(u, tick, opts);
    }
  }
}

/** Families that trade at t without bloc/pair context (bloc-scoped families use FDL and FDL/EUN as the representative). */
export function productFamiliesOpen(tick: Tick, holidayFxDepthMult: number): ProductFamily[] {
  const out: ProductFamily[] = [];
  for (const f of PRODUCT_FAMILIES) {
    if (f === 'OTC') continue;
    if (sessionState(f, tick, { bloc: 'FDL', fxBlocs: ['FDL', 'EUN'], holidayFxDepthMult }).matches) out.push(f);
  }
  return out;
}
