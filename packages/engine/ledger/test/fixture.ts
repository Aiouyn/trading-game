import { LedgerWorld, accountKey as K, type Ccy } from '../src';

/** Fixture world: P player, its fund F and business B; NPC company N; banks; treasury; exchange exc_X; elastic sectors. */
export function fixture(opts: ConstructorParameters<typeof LedgerWorld>[0] = {}): LedgerWorld {
  const w = new LedgerWorld(opts);
  for (const id of ['chr_P', 'chr_A', 'chr_B', 'chr_a', 'chr_b', 'chr_c', 'cmp_N', 'bnk_N', 'bnk_X', 'bnk_Y', 'gov_FDL', 'hh_C1', 'frm_FDL', 'npc_S', 'exc_X'])
    w.registerEntity({ id });
  w.registerEntity({ id: 'fnd_F', ownerId: 'chr_P' });
  w.registerEntity({ id: 'biz_B', ownerId: 'chr_P' });
  return w;
}
export const M = (units: number): bigint => BigInt(Math.round(units * 1e6)); // test literals only; src uses toMoney
export { K };
export const cashKey = (id: string, ccy: Ccy = 'FDL'): string => K(id, 1001, ccy);

/** Small seeded PRNG for test drivers (tests are outside the G8 lint scope). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
