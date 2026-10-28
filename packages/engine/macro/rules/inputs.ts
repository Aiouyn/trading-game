// T04-05 step 3: other inputs (04 §3.14.5), macro day step 1. Every missing input holds its last value and its key is listed in
// staleKeys (edge 23; T04-20 emits one SEALED macro.input.stale per day with the list).
// MacroInputs.values keys (this card's storage decision):
//   'energy', 'food'                         energyIndex / foodIndex (genesis 100 until 06 provides every genesis price)
//   'g0:<COMMODITY>'                         genesis close of each index commodity, captured per basket at the first day close where every member prints (E-87 (5))
//   'aiRaceIndex', 'worldHackRate', 'geopoliticalTension', 'politicalStability:<bloc>'
// Genesis defaults (unit decision): aiRaceIndex 50, worldHackRate 0, geopoliticalTension 30, politicalStability 0.7.
import type { StoreRead, Tick } from '@tycoon/engine-core';
import type { MacroPorts } from '../ports';
import { BLOC_ORDER, type MacroInputs } from '../schema';

type EnergyPx = { crude: number; gas: number; mwh: number };
type FoodPx = { wheat: number; corn: number; coffee: number; cocoa: number };

/** energyIndex = 100 × (0.5·crude/crude0 + 0.3·gas/gas0 + 0.2·MWh/MWh0). */
export function energyIndex(prices: EnergyPx, genesis: EnergyPx): number {
  return 100 * (0.5 * prices.crude / genesis.crude + 0.3 * prices.gas / genesis.gas + 0.2 * prices.mwh / genesis.mwh);
}

/** foodIndex = 100 × (0.3·wheat + 0.3·corn + 0.2·coffee + 0.2·cocoa, each ÷ genesis). */
export function foodIndex(prices: FoodPx, genesis: FoodPx): number {
  return 100 * (0.3 * prices.wheat / genesis.wheat + 0.3 * prices.corn / genesis.corn + 0.2 * prices.coffee / genesis.coffee + 0.2 * prices.cocoa / genesis.cocoa);
}

export const GENESIS_DEFAULT = { energy: 100, food: 100, aiRaceIndex: 50, worldHackRate: 0, geopoliticalTension: 30, politicalStability: 0.7 } as const;
type Commodity = 'CRUDE' | 'GAS' | 'MWH' | 'WHEAT' | 'CORN' | 'COFFEE' | 'COCOA';
const ENERGY: readonly Commodity[] = ['CRUDE', 'GAS', 'MWH'];
const FOOD: readonly Commodity[] = ['WHEAT', 'CORN', 'COFFEE', 'COCOA'];

/** Reads today's §3.14.5 inputs through the ports; null ⇒ last value held and the key listed as stale. */
export function collectInputs(store: StoreRead, ports: MacroPorts, prev: MacroInputs, tick: Tick): { inputs: MacroInputs; stale: string[] } {
  const values: Record<string, number> = {};
  const stale: string[] = [];
  const held = (key: string, dflt: number): number => prev.values[key] ?? dflt;
  const put = (key: string, now: number | null, dflt: number): void => {
    if (now === null || now === undefined) { stale.push(key); values[key] = held(key, dflt); } else values[key] = now;
  };

  // commodity closes. E-87 (5): a basket's genesis closes (g0:<COMMODITY>) are captured together, at the first day close where
  // every member of the basket prints; until then the index holds at 100. The first computed index is therefore exactly 100.
  const close: Partial<Record<Commodity, number>> = {};
  for (const c of [...ENERGY, ...FOOD]) {
    const px = ports.assets.commodityClose(store, c);
    if (px !== null && px !== undefined) close[c] = px;
  }
  for (const basket of [ENERGY, FOOD]) {
    if (basket.every((c) => prev.values[`g0:${c}`] !== undefined)) for (const c of basket) values[`g0:${c}`] = prev.values[`g0:${c}`]!;
    else if (basket.every((c) => close[c] !== undefined)) for (const c of basket) values[`g0:${c}`] = close[c]!;
  }
  const all = (cs: readonly Commodity[]): boolean => cs.every((c) => close[c] !== undefined && values[`g0:${c}`] !== undefined);
  const px = (c: Commodity): number => close[c]!;
  const g0 = (c: Commodity): number => values[`g0:${c}`]!;
  put('energy', all(ENERGY) ? energyIndex({ crude: px('CRUDE'), gas: px('GAS'), mwh: px('MWH') }, { crude: g0('CRUDE'), gas: g0('GAS'), mwh: g0('MWH') }) : null, GENESIS_DEFAULT.energy);
  put('food', all(FOOD) ? foodIndex({ wheat: px('WHEAT'), corn: px('CORN'), coffee: px('COFFEE'), cocoa: px('COCOA') },
    { wheat: g0('WHEAT'), corn: g0('CORN'), coffee: g0('COFFEE'), cocoa: g0('COCOA') }) : null, GENESIS_DEFAULT.food);

  put('aiRaceIndex', ports.ai.aiRaceIndex(store), GENESIS_DEFAULT.aiRaceIndex);
  put('worldHackRate', ports.conflict.worldHackRate(store), GENESIS_DEFAULT.worldHackRate);
  put('geopoliticalTension', ports.world.geopoliticalTension(store), GENESIS_DEFAULT.geopoliticalTension);
  for (const b of BLOC_ORDER) put(`politicalStability:${b}`, ports.world.politicalStability(store, b), GENESIS_DEFAULT.politicalStability);

  return { inputs: { id: 'INPUTS', tick, staleKeys: stale.slice(), values }, stale };
}
