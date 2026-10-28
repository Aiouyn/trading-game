// T04-16 test kit: cbWorld plus bloc, global and public-view rows for the release rules, and a seeded, draw-counting ctx.rng.
import { makeRng, type Rng } from '@tycoon/engine-core';
import { BLOC_DEFAULTS } from '../blocs';
import { BLOC_ORDER, macroTables, RELEASE_KINDS, type BlocId, type BlocMacroState } from '../schema';
import { cbWorld, type CbWorld } from './cbWorld';
import { fiscalState } from './fiscalWorld';

/** sfc32 words from a string seed (test only). */
function words(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  let a = h, b = 0x9e3779b9, c = 0x243f6a88 ^ h, d = 1;
  const u32 = (): number => { a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0; return t >>> 0; };
  for (let i = 0; i < 15; i++) u32();
  return u32;
}
/** T04-02 calendar params not in the registry yet (as calendar.test.ts). */
const CAL_PARAMS = { macro_cb_meetings_per_year: 4, macro_cb_decision_tick: 420, macro_auction_tick: 330, macro_auction_announce_tick: 420 };
export interface ReleaseWorld extends CbWorld { normals: Record<string, number>; bloc(b: BlocId): BlocMacroState; at(tick: number): void;
  /** Replace the normals of `key` with a script (then 0s). */ script(key: string, xs: number[]): void }

export function releaseWorld(tick = 0, seed = 'w'): ReleaseWorld {
  const w = cbWorld([], tick); w.nums(CAL_PARAMS);
  const normals: Record<string, number> = {}, rngs: Record<string, Rng> = {}, scripts: Record<string, number[]> = {};
  (w.ctx as unknown as { rng(k: string): Rng }).rng = (k: string): Rng => {
    const r = (rngs[k] ??= makeRng(words(`${seed}|${k}`)));
    return { ...r, normal: (): number => { normals[k] = (normals[k] ?? 0) + 1; const s = scripts[k]; return s ? (s.shift() ?? 0) : r.normal(); } };
  };
  for (const b of BLOC_ORDER) {
    const d0 = BLOC_DEFAULTS[b];
    w.put(macroTables.bloc.name, { id: b, bloc: b, tick, outputGap: 0, potentialGrowth: 0.02, realGdpIndex: 100, gdpGrowthQoQAnn: 0.02, headlineInflation: d0.inflationTarget,
      coreInflation: d0.inflationTarget, inflationExp1y: d0.inflationTarget, cpiLevel: 100, coreCpiLevel: 100, wageGrowth: 0.04, unemployment: d0.nairu,
      creditGrowth: 0.05, creditConditions: 0, fiscal: fiscalState({ deficitGdp: 0.03, primaryBalanceGdp: -0.01, debtGdp: 0.9 }),
      fx: { reservesFdl: 500_000_000_000_000n, reserveCoverMonths: 6, currentAccountGdp: -0.02 } } as never);
    w.put(macroTables.publicView.name, { id: b, bloc: b, prints: Object.fromEntries(RELEASE_KINDS.map((k) => [k, null])) } as never);
  }
  w.put(macroTables.global.name, { id: 'GLOBAL', fearIndex: 30 } as never);
  const bloc = (b: BlocId): BlocMacroState => w.rows(macroTables.bloc.name).find((r) => (r as BlocMacroState).bloc === b) as BlocMacroState;
  return Object.assign(w, { normals, bloc, script: (k: string, xs: number[]) => { scripts[k] = [...xs]; },
    at: (t: number) => { w.setTick(t); for (const b of BLOC_ORDER) bloc(b).tick = t; } });
}
