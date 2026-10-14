import { halfSpread, seedStream, Rng } from '@/engine';
import { createPlayer } from './players';
import type { GameState, MarketPrint } from './types';

/**
 * The crowd on listed names. Thousands of accounts would each be a player: net worth, rank, the directory and a
 * scan on every tick. The names are computed (40 × 40 × 5 = 8,000) and a tick writes a handful of prints per name.
 * Those prints are the crowd you see. They are not orders, and they do not move the price or the variance.
 *
 * The 240 accounts stay, so a save that already has them still loads and seedRetail stays idempotent. They are not
 * the tape. The 24 named rivals keep their own slow clock. The stream for their cash is `world:retail:seed`, not
 * the NPC stream. A world that never calls seedRetail has no tape from here, and retailTick does nothing there.
 */

export const RETAIL_COUNT = 240;
/** Prints kept per name. The frame sends this many; a longer tape would be thrown away on the next tick. */
const TAPE_KEEP = 12;

const FIRST = ['ash', 'bri', 'cal', 'dex', 'emi', 'fox', 'gem', 'hal', 'ira', 'jot', 'keo', 'lux', 'mio', 'ned', 'ori', 'pia', 'quinn', 'rio', 'sol', 'tia', 'uma', 'vex', 'wynn', 'yae', 'zek'];
const SECOND = ['moor', 'lane', 'wick', 'holt', 'vay', 'pex', 'lin', 'dor', 'kai', 'nix', 'bee', 'ox', 'ryn', 'tal', 'vee'];
const COUNTRIES = ['AV', 'NH', 'MU', 'SD', 'KY'] as const;
const BIOS = [
  'Trades the open and leaves before lunch.',
  'Small clips, all day.',
  'In and out of the same names.',
  'Watches crypto and nothing else.',
  'Buys dips the size of a lunch.',
];

/** The computed roster. Not stored. 40 × 40 bases × 5 suffixes. */
const NAME_A = ['ash', 'bri', 'cal', 'dex', 'emi', 'fox', 'gem', 'hal', 'ira', 'jot', 'keo', 'lux', 'mio', 'ned', 'ori', 'pia', 'qui', 'rio', 'sol', 'tia', 'uma', 'vex', 'wyn', 'yae', 'zek', 'noe', 'pal', 'rex', 'sab', 'tor', 'una', 'val', 'wes', 'xan', 'yul', 'zia', 'kip', 'lan', 'moe', 'nia'] as const;
const NAME_B = ['moor', 'lane', 'wick', 'holt', 'vay', 'pex', 'lin', 'dor', 'kai', 'nix', 'bee', 'ox', 'ryn', 'tal', 'vee', 'ark', 'bay', 'cove', 'dell', 'elm', 'fen', 'glen', 'hart', 'isle', 'jade', 'keel', 'loch', 'mist', 'nook', 'oak', 'peak', 'quay', 'reef', 'shaw', 'tide', 'vale', 'well', 'yard', 'zedd', 'birch'] as const;
const NAME_S = ['', 'x', 'q', 'k', 'z'] as const;
const ROSTER = NAME_A.length * NAME_B.length * NAME_S.length;

export function retailId(i: number): string {
  return `npc-rt-${String(i).padStart(3, '0')}`;
}

/** Adds the retail accounts once. A second call, and a save that already has them, changes nothing. */
export function seedRetail(g: GameState): void {
  if (g.players[retailId(0)] && g.players[retailId(RETAIL_COUNT - 1)]) return;
  const rng = new Rng(seedStream(g.seed, 'world:retail:seed'));
  const taken = new Set(Object.values(g.players).map((p) => p.handle.toLowerCase()));
  for (let i = 0; i < RETAIL_COUNT; i++) {
    const id = retailId(i);
    if (g.players[id]) continue;
    const base = `${FIRST[i % FIRST.length]}${SECOND[Math.floor(i / FIRST.length) % SECOND.length]}`;
    let handle = base;
    let n = 2;
    while (taken.has(handle.toLowerCase())) handle = `${base}${n++}`;
    taken.add(handle.toLowerCase());
    const cash = 2_000 + Math.floor(rng.uniform() * 48_000);
    createPlayer(g, id, handle, COUNTRIES[i % COUNTRIES.length]!, { npc: id, bio: BIOS[i % BIOS.length]!, cash });
  }
}

function nameAt(i: number): string {
  const a = NAME_A[i % NAME_A.length]!;
  const b = NAME_B[Math.floor(i / NAME_A.length) % NAME_B.length]!;
  const s = NAME_S[Math.floor(i / (NAME_A.length * NAME_B.length)) % NAME_S.length]!;
  return `${a}${b}${s}`;
}

/** FNV-1a over the seed, mixed with the tick once. The NPC stream is not touched. */
function tickHash(seed: string, tick: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= tick + 1;
  return Math.imul(h, 16777619) >>> 0;
}

function mix(h: number, i: number, k: number): number {
  let x = Math.imul(h ^ (i + 1), 2246822519);
  x = Math.imul(x ^ (k + 0x9e3779b9), 3266489917);
  return x >>> 0;
}

function printsFor(assetClass: string): number {
  if (assetClass === 'crypto') return 10;
  if (assetClass === 'stock') return 6;
  return 3;
}

/**
 * One tick of the tape. No-op until seedRetail has run. Buy and sell split evenly, so the tape is not a bid.
 * A generated name that matches a real handle gets a suffix. Prices sit on the quote (mid ± the capped half-spread).
 */
export function retailTick(g: GameState): void {
  if (!g.players[retailId(0)]) return;
  const tick = g.market.tick;
  const seed = tickHash(g.seed, tick);
  const taken = new Set(Object.values(g.players).map((p) => p.handle.toLowerCase()));
  const cache = new Map<number, string>();
  const who = (i: number): string => {
    const hit = cache.get(i);
    if (hit) return hit;
    const base = nameAt(i);
    let handle = base;
    if (taken.has(base)) {
      let n = 2;
      while (taken.has(`${base}${n}`)) n += 1;
      handle = `${base}${n}`;
    }
    cache.set(i, handle);
    return handle;
  };
  const assets = g.market.config.assets;
  let tape = g.marketTape;
  for (let i = 0; i < assets.length; i++) {
    const def = assets[i]!;
    if (def.listed === false) continue;
    const st = g.market.assets[i];
    if (!st || st.id !== def.id || st.haltUntil > tick) continue;
    const mid = Math.exp(st.lnP);
    if (!(mid > 0)) continue;
    const n = printsFor(def.assetClass);
    const half = halfSpread(g.market, i);
    const whole = def.assetClass === 'stock' || (def.qtyStep ?? 0) >= 1;
    tape ??= (g.marketTape = {});
    const row = tape[def.id] ?? (tape[def.id] = []);
    for (let k = 0; k < n; k++) {
      const h = mix(seed, i, k);
      const side: 'buy' | 'sell' = (h & 1) === 0 ? 'buy' : 'sell';
      const slip = half * ((h >>> 8) % 1000) / 1000;
      const price = mid * (1 + (side === 'buy' ? slip : -slip));
      const notional = 80 + ((h >>> 10) % 420);
      let qty = whole ? Math.floor(notional / price) : Math.round((notional / price) * 1e4) / 1e4;
      if (!(qty > 0)) qty = whole ? 1 : notional / price;
      const print: MarketPrint = { tick, assetId: def.id, side, qty, price, who: who((h >>> 1) % ROSTER) };
      row.push(print);
    }
    if (row.length > TAPE_KEEP) row.splice(0, row.length - TAPE_KEEP);
  }
}

/** Keeps NPC fills for the broker tape. A human fill is dropped. */
export function recordNpcTape(g: GameState, fills: { playerId: string; assetId: string; side: 'buy' | 'sell'; qty: number; price: number; tick: number }[]): void {
  if (!fills.length) return;
  let tape = g.marketTape;
  for (const f of fills) {
    const who = g.players[f.playerId];
    if (!who?.npc || !(f.qty > 0)) continue;
    tape ??= (g.marketTape = {});
    const row = tape[f.assetId] ?? (tape[f.assetId] = []);
    const print: MarketPrint = { tick: f.tick, assetId: f.assetId, side: f.side, qty: f.qty, price: f.price, who: who.handle };
    row.push(print);
    if (row.length > TAPE_KEEP) row.splice(0, row.length - TAPE_KEEP);
  }
}
