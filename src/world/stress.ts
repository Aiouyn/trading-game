import type { AssetDef, WorldState } from '@/engine';
import { CRASH_SECTOR_MULT, STRESS_KINDS, STRESS_MOVES, STRESS_ROWS, type StressKind, type StressMove } from '@/content/stress';
import type { GameState } from './types';

/**
 * The Portfolio stress test (content/stress.ts): the player's book under each world-event kind, at the typical move of each
 * asset class. Pure reads of the book and the asset list. It never reads the world-event state, so it cannot reveal a
 * scheduled event, and it moves no money.
 *
 * Scope: cash and the held positions (stocks, crypto, commodities, forex, bonds, property). Options, margin loans and the
 * shorts' borrow cost are not in the first version; a short position falls when the market falls, as its quantity is negative.
 */

export interface StressRowResult {
  kind: StressKind;
  label: string;
  source: 'published' | 'round';
  /** the change in the book's value under the kind, in dollars */
  delta: number;
  /** the same change as a share of today's equity */
  pct: number;
}

export interface StressBookResult {
  /** cash plus the held positions at their mid price */
  equity: number;
  /** the held positions at their mid price */
  holdings: number;
  rows: StressRowResult[];
  /** how many positions the book holds */
  positions: number;
}

function classKey(def: AssetDef): keyof StressMove {
  if (def.id === 'GOLD') return 'gold';
  switch (def.assetClass) {
    case 'stock': return 'stock';
    case 'crypto': return 'crypto';
    case 'bond': return 'bond';
    case 'realestate': return 'realestate';
    case 'forex': return 'forex';
    default: return 'commodity';
  }
}

/** The move of one asset under one kind: its class move, with the crash's sector multiplier for stocks. */
export function stressMoveOf(kind: StressKind, def: AssetDef): number {
  const base = STRESS_MOVES[kind][classKey(def)];
  if (kind === 'crash' && def.assetClass === 'stock') return base * (CRASH_SECTOR_MULT[def.sector] ?? 1);
  return base;
}

/** Stress the player's book under the four kinds. Null for a player with no account. */
export function stressBook(g: GameState, pid: string): StressBookResult | null {
  const acct = g.market.accounts[pid];
  if (!acct) return null;
  const world: WorldState = g.market;
  const exposures: { def: AssetDef; value: number }[] = [];
  let holdings = 0;
  for (const [id, pos] of Object.entries(acct.positions)) {
    if (!pos.qty) continue;
    const i = world.config.assets.findIndex((a) => a.id === id);
    if (i < 0) continue;
    const def = world.config.assets[i]!;
    const px = Math.exp(world.assets[i]!.lnP);
    const value = pos.qty * px;
    holdings += value;
    exposures.push({ def, value });
  }
  const equity = acct.cash + holdings;
  const rows: StressRowResult[] = STRESS_KINDS.map((kind) => {
    const delta = exposures.reduce((s, x) => s + x.value * stressMoveOf(kind, x.def), 0);
    const row = STRESS_ROWS[kind];
    return { kind, label: row.label, source: row.source, delta, pct: equity > 0 ? delta / equity : 0 };
  });
  return { equity, holdings, rows, positions: exposures.length };
}
