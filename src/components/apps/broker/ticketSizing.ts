import { assetIndex, commission, estimateFill, qtyStep, type AssetDef, type Side, type WorldState } from '@/engine';

/** The ticket's unit grid; the engine permits arbitrary fractions outside stocks. */
export function quantityGrid(def: AssetDef): { step: number; decimals: number } {
  const configured = qtyStep(def);
  const step = configured > 0 ? configured : def.assetClass === 'crypto' ? 1e-8 : def.assetClass === 'forex' ? 1 : 1e-4;
  const text = String(step);
  const decimals = text.includes('e-') ? Number(text.split('e-')[1]) : (text.split('.')[1]?.length ?? 0);
  return { step, decimals };
}

export function floorQuantity(def: AssetDef, units: number): number {
  const { step, decimals } = quantityGrid(def);
  return Number((Math.floor(Math.max(0, units) / step + 1e-9) * step).toFixed(decimals));
}

/** Estimate the submitted quantity under its actual account; a typed entry level is a price assumption. */
export function ticketEstimate(world: WorldState, assetId: string, side: Side, units: number, accountId?: string, entryPrice = 0) {
  const estimate = estimateFill(world, { assetId, side, qty: units, playerId: accountId });
  if (!(entryPrice > 0)) return estimate;
  const def = world.config.assets[assetIndex(world, assetId)]!;
  const fee = commission(world, def, units * entryPrice, units);
  return { ...estimate, price: entryPrice, fee, total: units * entryPrice + (side === 'buy' ? fee : -fee) };
}

/** Largest on-grid size within a dollar budget, including the class's real fee and quantity-dependent own impact. */
export function unitsForBudget(world: WorldState, assetId: string, budget: number, accountId?: string, entryPrice = 0): number {
  if (!(budget > 0) || !Number.isFinite(budget)) return 0;
  const i = assetIndex(world, assetId);
  const def = world.config.assets[i]!;
  const { step } = quantityGrid(def);
  const price = entryPrice > 0 ? entryPrice : Math.exp(world.assets[i]!.lnP);
  let lo = 0;
  let hi = budget / price;
  const cost = (q: number) => ticketEstimate(world, assetId, 'buy', q, accountId, entryPrice).total;
  for (let pass = 0; pass < 48 && hi - lo > step / 4; pass++) {
    const q = (lo + hi) / 2;
    if (cost(q) <= budget) lo = q;
    else hi = q;
  }
  let result = floorQuantity(def, lo);
  const next = Number((result + step).toPrecision(15));
  if (cost(next) <= budget) result = next;
  return result;
}
