import { DEFAULT_TRADING } from './config';
import type { AssetDef, EcologyState, RivalDef, RivalState, RivalStyle, WorldConfig, WorldState } from './types';

/**
 * NPC rival funds (specs/quant-npc-funds.md). A rival has no order path of its own. Each close, its trade is a slice of
 * its pool's flow (value pool for Hale, trend pool for Pinn and Vetch): filled pro rata, in the pool's own direction,
 * never more than the pool trades. So nothing is added twice, and a rival changes no price the pool would not already
 * move. Rules rank on closes already printed, and no rival sees the next close.
 */
export const DEFAULT_RIVALS: RivalDef[] = [
  { id: 'hale', name: 'Hale & Ward', style: 'value', startingCash: 7000 },
  { id: 'pinn', name: 'Pinn Partners', style: 'momentum', startingCash: 50000 },
  { id: 'vetch', name: 'Vetch', style: 'degen', startingCash: 50000 },
];

/** Most a rival trades in one asset in one day, as a share of that asset's ADV. */
export const RIVAL_CAP_ADV = 0.05;
const REBALANCE_DAYS: Record<RivalStyle, number> = { value: 21, momentum: 21, degen: 5 };
const RIVAL_POOL: Record<RivalStyle, 'value' | 'trend'> = { value: 'value', momentum: 'trend', degen: 'trend' };

export function initRivals(cfg: WorldConfig): RivalState[] {
  return (cfg.rivals ?? []).map((r) => ({ id: r.id, cash: r.startingCash, units: {}, target: [], peak: r.startingCash }));
}

function eligible(def: AssetDef, style: RivalStyle): boolean {
  if (def.listed === false) return false;
  return style === 'degen' ? def.assetClass === 'crypto' : def.assetClass === 'stock';
}

/** Value: the 3 stocks furthest below their own value. Momentum: the best 63-day return. Degen: the best 21-day crypto. */
function pickTargets(cfg: WorldConfig, eco: EcologyState, lnV: readonly number[], style: RivalStyle): string[] {
  const scored: { i: number; s: number }[] = [];
  cfg.assets.forEach((def, i) => {
    if (!eligible(def, style)) return;
    if (style === 'value') {
      scored.push({ i, s: eco.assets[i]!.lnS - lnV[i]! }); // most negative = furthest below value
      return;
    }
    const c = eco.assets[i]!.closes;
    if (c.length < 2) return;
    const lookback = style === 'momentum' ? 63 : 21;
    const back = c[Math.max(0, c.length - 1 - lookback)]!;
    scored.push({ i, s: back - c[c.length - 1]! }); // lower = better return
  });
  scored.sort((a, b) => a.s - b.s || a.i - b.i);
  return scored.slice(0, style === 'value' ? 3 : 1).map((x) => cfg.assets[x.i]!.id);
}

/** A day's rival plan, before the pools clear: rebalanced targets and each rival's wanted trade per asset. */
export interface RivalDay {
  /** the rivals in config order, with this day's targets (cash and units not yet changed) */
  rivals: RivalState[];
  /** per rival, per asset (config order): the signed trade it wants, in ADV, capped at RIVAL_CAP_ADV */
  desire: number[][];
}

/** Plan the rivals' day from the closes already printed. Null when no rivals are configured. Pure. */
export function rivalsDay(cfg: WorldConfig, eco: EcologyState, lnV: readonly number[], day: number): RivalDay | null {
  const defs = cfg.rivals ?? [];
  if (defs.length === 0) return null;
  const books = eco.rivals ?? initRivals(cfg);
  const n = cfg.assets.length;
  const rivals: RivalState[] = [];
  const desire: number[][] = [];
  for (const book of books) {
    const def = defs.find((d) => d.id === book.id);
    if (!def) continue;
    const target = day % REBALANCE_DAYS[def.style] === 0 ? pickTargets(cfg, eco, lnV, def.style) : book.target;
    const px = eco.assets.map((a) => Math.exp(a.lnS));
    let equity = book.cash;
    cfg.assets.forEach((a, i) => { equity += (book.units[a.id] ?? 0) * px[i]!; });
    const d = new Array<number>(n).fill(0);
    cfg.assets.forEach((a, i) => {
      const held = book.units[a.id] ?? 0;
      const inTarget = target.includes(a.id);
      if (!inTarget && held === 0) return;
      const adv = a.advNotional ?? 1e9;
      const want = inTarget ? equity / target.length : 0;
      const cap = RIVAL_CAP_ADV * adv;
      const delta = Math.max(-cap, Math.min(cap, want - held * px[i]!));
      d[i] = delta / adv;
    });
    rivals.push({ ...book, target });
    desire.push(d);
  }
  return { rivals, desire };
}

/**
 * Clear the rivals' day at the close. Each rival's wanted trade is filled as a pro-rata slice of its pool's flow, in the
 * pool's direction and never more than the pool trades. Fills clear at the close price; a buy the cash cannot cover is
 * skipped, a sell is limited to the units held. Returns the rivals with cash, units and equity peak updated.
 */
export function rivalsClose(cfg: WorldConfig, day: RivalDay, qValue: readonly number[], qTrend: readonly number[], lnS: readonly number[]): RivalState[] {
  const n = cfg.assets.length;
  const defs = cfg.rivals ?? [];
  const styleOf = (k: number) => defs.find((d) => d.id === day.rivals[k]!.id)!.style;
  const poolOf = (k: number) => RIVAL_POOL[styleOf(k)];
  const sum: Record<'value' | 'trend', number[]> = { value: new Array<number>(n).fill(0), trend: new Array<number>(n).fill(0) };
  day.desire.forEach((d, k) => {
    const p = poolOf(k);
    for (let i = 0; i < n; i++) sum[p][i]! += d[i]!;
  });
  const trading = cfg.trading ?? DEFAULT_TRADING;
  const feeOf = (def: AssetDef) => trading.fees[def.assetClass] ?? trading.fees.stock;

  return day.rivals.map((book, k) => {
    const pool = poolOf(k);
    const flows = pool === 'value' ? qValue : qTrend;
    const units = { ...book.units };
    let cash = book.cash;
    for (let i = 0; i < n; i++) {
      const wanted = day.desire[k]![i]!;
      if (wanted === 0) continue;
      const D = sum[pool][i]!;
      const flow = flows[i]!;
      // the slice: only in the direction the pool trades, never more than the pool's flow
      if (D === 0 || Math.sign(flow) !== Math.sign(D)) continue;
      const ratio = Math.min(1, Math.abs(flow) / Math.abs(D));
      const def = cfg.assets[i]!;
      const px = Math.exp(lnS[i]!);
      let du = (wanted * ratio * (def.advNotional ?? 1e9)) / px;
      if (def.assetClass === 'stock') du = Math.round(du);
      if (du === 0) continue;
      const f = feeOf(def);
      if (du > 0) {
        // a buy is scaled down to what the cash covers after commission, never skipped for being too large
        const affordable = cash / (px * (1 + f.rate));
        du = Math.min(du, def.assetClass === 'stock' ? Math.floor(affordable) : affordable);
        if (du <= 0) continue;
        const cost = du * px;
        const total = cost + Math.max(f.min, f.rate * cost);
        if (total > cash) continue;
        cash -= total;
      } else {
        const held = units[def.id] ?? 0;
        if (-du > held) du = -held;
        if (du === 0) continue;
        const proceeds = -du * px;
        cash += proceeds - Math.max(f.min, f.rate * proceeds);
      }
      const next = (units[def.id] ?? 0) + du;
      if (Math.abs(next) < 1e-9) delete units[def.id];
      else units[def.id] = next;
    }
    let equity = cash;
    cfg.assets.forEach((a, i) => { equity += (units[a.id] ?? 0) * Math.exp(lnS[i]!); });
    return { ...book, cash, units, peak: Math.max(book.peak, equity) };
  });
}

/** A rival's equity at the last close. Server-side: the public surface is rivalLeaderboard. */
export function rivalEquity(state: WorldState, id: string): number {
  const book = state.ecology?.rivals?.find((r) => r.id === id);
  if (!book || !state.ecology) throw new Error(`rivalEquity: unknown rival ${id}`);
  let equity = book.cash;
  state.config.assets.forEach((a, i) => { equity += (book.units[a.id] ?? 0) * Math.exp(state.ecology!.assets[i]!.lnS); });
  return equity;
}

export interface RivalRow {
  id: string;
  name: string;
  equity: number;
}

/**
 * The public rival rows: name and equity only, highest first. Style, cash, units and targets never leave the ecology,
 * so no row shows how a rival trades.
 */
export function rivalLeaderboard(state: WorldState): RivalRow[] {
  const rows: RivalRow[] = [];
  for (const d of state.config.rivals ?? []) {
    if (!state.ecology?.rivals?.some((r) => r.id === d.id)) continue;
    rows.push({ id: d.id, name: d.name, equity: rivalEquity(state, d.id) });
  }
  return rows.sort((a, b) => b.equity - a.equity || a.id.localeCompare(b.id));
}
