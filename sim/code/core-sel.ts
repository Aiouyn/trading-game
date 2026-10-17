// CURVE=pf selects Pump.fun's real curve (core-pf.ts); anything else keeps the old core.ts path (CURVE_S thin curve).
import { Coin as Old } from './core'; import { PFCoin } from './core-pf';
export const CURVE = process.env.CURVE === 'pf' ? 'pf' : 'old';
export const Coin: typeof Old = CURVE === 'pf' ? (PFCoin as any) : Old;
