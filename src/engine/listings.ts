import { Rng, seedStream } from './rng';
import { settleAsset } from './trading';
import type {
  AssetDef, AssetState, EcoAssetState, RivalState, StepEvent, WorldConfig, WorldState,
} from './types';

/**
 * The evolving universe: NPC IPOs, bankruptcies, cash mergers and spin-offs. Rolled once per game day on stream
 * 'macro:listings' (one event at most a day), applied at the day boundary before that day's first tick, so a listing
 * never moves a price inside a tick. Assets are appended to config and state together; a delisted asset keeps its index
 * slot with `listed: false, delisted: true`, a frozen price, and no pool flow, so arrays stay aligned.
 *
 * Settlement: holders of a bankrupt or merged name are paid in cash at a settlement price, shorts are closed at it
 * too, and open orders in the name are cancelled. A spin-off hands each holder child shares at a fixed ratio and
 * lowers the parent by the same value, so the holder's total value is conserved (up to whole shares).
 */
export interface ListingsConfig {
  /** chance per game day of each kind (at most one event a day) */
  odds: Record<ListingKind, number>;
}

export type ListingKind = 'ipo' | 'bankruptcy' | 'merger' | 'spinoff';

/** Tuning defaults for Ledger's review: about two IPOs a game year, a bankruptcy every few years. */
export const DEFAULT_LISTINGS: ListingsConfig = {
  odds: { ipo: 0.0015, bankruptcy: 0.0005, merger: 0.0008, spinoff: 0.0006 },
};

const MERGER_PREMIUM = 1.1;
const SPIN_RATIO = 0.1;
const PREFIXES = [
  'Ardent', 'Brisk', 'Calder', 'Dunmore', 'Eskar', 'Fallow', 'Garnet', 'Halden', 'Ivory', 'Juno', 'Kestrel', 'Lumen',
  'Marrow', 'Northgate', 'Orrin', 'Pallas', 'Quarry', 'Redwake', 'Sable', 'Tarrow', 'Umber', 'Vantage', 'Wexford', 'Yarrow',
];
const SUFFIXES = [
  'Systems', 'Holdings', 'Dynamics', 'Works', 'Labs', 'Group', 'Industries', 'Biotech', 'Logistics', 'Energy', 'Foods',
  'Motors', 'Analytics', 'Networks',
];

export function listingsConfig(cfg: WorldConfig): ListingsConfig | null {
  return cfg.listings ? { ...DEFAULT_LISTINGS, ...cfg.listings, odds: { ...DEFAULT_LISTINGS.odds, ...cfg.listings.odds } } : null;
}

/** A fresh asset state for a new listing, anchored on its initial price (the same mapping as createWorld). */
export function newAssetState(seed: string, def: AssetDef): AssetState {
  const lnP = Math.log(def.initialPrice);
  return {
    id: def.id, lnP, lnV: lnP, h: 1, lnOpen: lnP, haltUntil: -1, haltedToday: false, dayJump: 0, pending: 0,
    rng: seedStream(seed, `asset:${def.id}`), vrng: seedStream(seed, `volume:${def.id}`),
    volume: 0, notional: 0, dayVolume: 0, dayNotional: 0, cumVolume: 0, heat: 0,
  };
}

/** A fresh shadow book for a new listing (the same shape initEcology gives every asset). */
export function newEcoAsset(seed: string, def: AssetDef, lnP: number): EcoAssetState {
  return {
    id: def.id, lnS: lnP, lnV: lnP, core: lnP, skew: 0, inv: 0,
    pos: { value: 0, trend: 0, retail: 0, pension: 0 }, closes: [lnP], headline: 0, pensionAnchor: lnP, own: 0, ownBy: {},
    rng: seedStream(seed, `eco:retail:${def.id}`),
  };
}

/** Append an asset to config, state and (when on) the ecology, in one place, so the arrays never disagree. */
export function appendAsset(state: WorldState, def: AssetDef): WorldState {
  const a = newAssetState(state.seed, def);
  const config: WorldConfig = { ...state.config, assets: [...state.config.assets, def] };
  const ecology = state.ecology
    ? { ...state.ecology, assets: [...state.ecology.assets, newEcoAsset(state.seed, def, a.lnP)] }
    : undefined;
  return { ...state, config, assets: [...state.assets, a], ...(ecology ? { ecology } : {}) };
}

/** Replace one asset's definition in config (same index, so the arrays stay aligned). */
function replaceDef(state: WorldState, i: number, def: AssetDef): WorldState {
  const assets = state.config.assets.slice();
  assets[i] = def;
  return { ...state, config: { ...state.config, assets } };
}

/** Pick a name and a unique ticker for a new fictional company. Names never match a real firm by design. */
function newName(state: WorldState, rng: Rng): { id: string; name: string } {
  const p = PREFIXES[Math.floor(rng.uniform() * PREFIXES.length) % PREFIXES.length]!;
  const s = SUFFIXES[Math.floor(rng.uniform() * SUFFIXES.length) % SUFFIXES.length]!;
  const base = p.slice(0, 3).toUpperCase() + s.slice(0, 1).toUpperCase();
  const taken = new Set(state.config.assets.map((a) => a.id));
  let id = base;
  for (let k = 2; taken.has(id); k++) id = `${base}${k}`;
  return { id, name: `${p} ${s}` };
}

/** A new stock modelled on a random listed stock: same sector and loadings, its own name, price and float. */
function newStock(state: WorldState, rng: Rng, template: AssetDef, price: number): AssetDef {
  const { id, name } = newName(state, rng);
  return {
    ...template,
    id, name, initialPrice: price,
    sharesOutstanding: Math.round(3e8 + rng.uniform() * 5e8),
    vol: template.vol * (0.85 + 0.3 * rng.uniform()),
    advNotional: (template.advNotional ?? 1e9) * (0.5 + rng.uniform()),
    listed: undefined,
    delisted: undefined,
    blurb: `${name}: listed on Port Avalon this season.`,
  };
}

function eligibleStocks(state: WorldState): number[] {
  const out: number[] = [];
  state.config.assets.forEach((d, i) => {
    if (d.assetClass === 'stock' && d.listed !== false && !d.delisted) out.push(i);
  });
  return out;
}

/** Rivals' units in a delisted name are settled at the same price as everyone else. */
function settleRivals(state: WorldState, assetId: string, price: number): WorldState {
  const books = state.ecology?.rivals;
  if (!books) return state;
  const rivals: RivalState[] = books.map((b) => {
    const q = b.units[assetId];
    if (!q) return b;
    const units = { ...b.units };
    delete units[assetId];
    return { ...b, units, cash: b.cash + q * price };
  });
  return { ...state, ecology: { ...state.ecology!, rivals } };
}

/** Delist one asset: frozen price, no trading, no pool flow, every holder settled in cash at `price`. */
export function delist(state: WorldState, i: number, price: number): WorldState {
  const def = state.config.assets[i]!;
  let next = settleAsset(state, def.id, price);
  next = settleRivals(next, def.id, price);
  next = replaceDef(next, i, { ...def, listed: false, delisted: true });
  return next;
}

/**
 * Spin-off: each holder of the parent gets SPIN_RATIO child shares per parent share, and the parent falls by the value
 * handed over, so the holder's total is unchanged. Cost basis moves with the value. Whole shares only.
 */
export function spinOff(state: WorldState, parentIdx: number, child: AssetDef): WorldState {
  const parent = state.config.assets[parentIdx]!;
  const pa = state.assets[parentIdx]!;
  const pPrice = Math.exp(pa.lnP);
  const cPrice = child.initialPrice;
  const ratio = Math.min(SPIN_RATIO, (0.5 * pPrice) / cPrice);
  const frac = (ratio * cPrice) / pPrice; // parent value handed over, as a fraction of the parent price
  const drop = Math.log(1 - frac);
  let next = appendAsset(state, child);
  const accounts = { ...next.accounts };
  for (const [id, acct] of Object.entries(next.accounts)) {
    const pos = acct.positions[parent.id];
    if (!pos) continue;
    const childQty = Math.trunc(pos.qty * ratio);
    const positions = { ...acct.positions, [parent.id]: { ...pos, avgCost: pos.avgCost * (1 - frac) } };
    if (childQty !== 0) positions[child.id] = { qty: childQty, avgCost: (pos.avgCost * frac) / ratio, realizedPnl: 0 };
    accounts[id] = { ...acct, positions };
  }
  next = { ...next, accounts };
  if (next.ecology?.rivals) {
    const rivals: RivalState[] = next.ecology.rivals.map((b) => {
      const q = b.units[parent.id];
      if (!q) return b;
      const cq = Math.trunc(q * ratio);
      const units = { ...b.units };
      if (cq !== 0) units[child.id] = cq;
      return { ...b, units };
    });
    next = { ...next, ecology: { ...next.ecology, rivals } };
  }
  // the parent falls by the value handed over; price and value move together, as news does
  const assets = next.assets.slice();
  assets[parentIdx] = { ...assets[parentIdx]!, lnP: assets[parentIdx]!.lnP + drop, lnV: assets[parentIdx]!.lnV + drop };
  next = { ...next, assets };
  if (next.ecology) {
    const eco = next.ecology.assets.slice();
    const p = eco[parentIdx]!;
    eco[parentIdx] = { ...p, lnS: p.lnS + drop, core: p.core + drop, ...(p.lnV !== undefined ? { lnV: p.lnV + drop } : {}) };
    next = { ...next, ecology: { ...next.ecology, assets: eco } };
  }
  return next;
}

/**
 * The listings roll for one game day. Returns the next state (arrays aligned) and the events to publish. `tick` is the
 * first tick of the day. Pure.
 */
export function listingsDay(state: WorldState, tick: number): { state: WorldState; events: StepEvent[] } {
  const lc = listingsConfig(state.config);
  if (!lc) return { state, events: [] };
  const rng = new Rng(state.listings?.rng ?? seedStream(state.seed, 'macro:listings'));
  const u = rng.uniform();
  let kind: ListingKind | null = null;
  let acc = 0;
  for (const k of ['ipo', 'bankruptcy', 'merger', 'spinoff'] as const) {
    acc += lc.odds[k];
    if (u < acc) { kind = k; break; }
  }
  const seq = (state.listings?.seq ?? 0) + (kind ? 1 : 0);
  let next: WorldState = { ...state, listings: { rng: rng.state(), seq } };
  if (!kind) return { state: next, events: [] };

  const pool = eligibleStocks(next);
  if (pool.length === 0) return { state: next, events: [] };
  const pick = () => pool[Math.floor(rng.uniform() * pool.length) % pool.length]!;
  const events: StepEvent[] = [];

  if (kind === 'ipo') {
    const t = next.config.assets[pick()]!;
    const price = 15 + rng.uniform() * 75;
    const def = newStock(next, rng, t, price);
    next = appendAsset(next, def);
    events.push({ type: 'listing', tick, kind: 'ipo', assetId: def.id, price });
  } else if (kind === 'bankruptcy') {
    const i = pick();
    const def = next.config.assets[i]!;
    const recovery = 0.02 + 0.13 * rng.uniform();
    const price = Math.exp(next.assets[i]!.lnP) * recovery;
    next = delist(next, i, price);
    events.push({ type: 'listing', tick, kind: 'bankruptcy', assetId: def.id, price });
  } else if (kind === 'merger') {
    const i = pick();
    const def = next.config.assets[i]!;
    const price = Math.exp(next.assets[i]!.lnP) * MERGER_PREMIUM;
    const buyers = eligibleStocks(next).filter((j) => j !== i);
    const acquirer = buyers.length ? next.config.assets[buyers[Math.floor(rng.uniform() * buyers.length) % buyers.length]!]!.id : undefined;
    next = delist(next, i, price);
    events.push({ type: 'listing', tick, kind: 'merger', assetId: def.id, ...(acquirer ? { otherId: acquirer } : {}), price });
  } else {
    const i = pick();
    const parent = next.config.assets[i]!;
    const cPrice = 15 + rng.uniform() * 45;
    const child = newStock(next, rng, parent, cPrice);
    next = spinOff(next, i, child);
    events.push({ type: 'listing', tick, kind: 'spinoff', assetId: parent.id, otherId: child.id, price: cPrice });
  }
  return { state: { ...next, listings: { rng: rng.state(), seq } }, events };
}
