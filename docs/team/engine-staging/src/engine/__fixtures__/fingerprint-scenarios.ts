/**
 * Price and volume fingerprint scenarios. The same code runs against the engine before the shadow
 * ecology existed (to write fingerprint.json, see scripts/ecology/fingerprint.ts) and against the
 * current engine in ecology.test.ts, so a change to any live formula fails the test.
 */
import type { WorldConfig, WorldState, StepResult, OrderRequest } from '../types';

export interface EngineApi {
  createWorld(seed: string, config?: WorldConfig, opts?: { ecology?: 'off' }): WorldState;
  step(state: WorldState): StepResult;
  defaultConfig(over?: Partial<WorldConfig>): WorldConfig;
  openAccount(state: WorldState, playerId: string, cash?: number): WorldState;
  placeOrder(state: WorldState, req: OrderRequest): { state: WorldState };
  quote(state: WorldState, assetId: string): { price: number; volume: number; dayVolume: number; cumVolume: number; notional: number };
}

export interface Scenario { name: string; samples: { tick: number; lnP: number[]; lnV: number[]; h: number[]; volume: number[]; notional: number[]; dayVolume: number[]; cumVolume: number[]; quoteVolume: number[] }[]; fills: number; finalHash: string }
export type Fingerprint = Record<string, Scenario>;

export function fnv(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

/** the live part of a state: everything except the shadow ecology and the config (which carries the flag) */
export function liveJson(s: WorldState): string {
  const { ecology: _e, config: _c, ...rest } = s as WorldState & { ecology?: unknown };
  return JSON.stringify(rest);
}

function run(api: EngineApi, name: string, seed: string, cfg: WorldConfig, ticks: number, every: number, orders?: (s: WorldState, tick: number) => WorldState): { scenario: Scenario; state: WorldState } {
  // no ecology field = an old save: built on the legacy path explicitly (new worlds default to 'full' since the flip)
  let s = cfg.ecology === undefined ? api.createWorld(seed, cfg, { ecology: 'off' }) : api.createWorld(seed, cfg);
  const samples: Scenario['samples'] = [];
  let fills = 0;
  for (let k = 1; k <= ticks; k++) {
    if (orders) s = orders(s, k);
    const r = api.step(s);
    s = r.state;
    fills += r.fills.length;
    if (k % every === 0) {
      samples.push({
        tick: s.tick,
        lnP: s.assets.map((a) => a.lnP), lnV: s.assets.map((a) => a.lnV), h: s.assets.map((a) => a.h),
        volume: s.assets.map((a) => a.volume), notional: s.assets.map((a) => a.notional),
        dayVolume: s.assets.map((a) => a.dayVolume), cumVolume: s.assets.map((a) => a.cumVolume),
        quoteVolume: s.config.assets.map((d) => api.quote(s, d.id).volume),
      });
    }
  }
  return { scenario: { name, samples, fills, finalHash: fnv(liveJson(s)) }, state: s };
}

/** `ecology` is merged into every config; undefined = the field is absent (an old save). */
export function runScenarios(api: EngineApi, ecology?: Record<string, unknown>): Fingerprint {
  const withEco = (c: WorldConfig): WorldConfig => (ecology === undefined ? c : ({ ...c, ecology } as WorldConfig));
  const out: Fingerprint = {};
  // A: default universe, 24 ticks/day, 40 game days, daily samples
  out.A = run(api, 'A', 'fp-a', withEco(api.defaultConfig({ ticksPerDay: 24 })), 24 * 40, 24).scenario;
  // B: default universe at the real 720 ticks/day, 2 game days, every 36 ticks
  out.B = run(api, 'B', 'fp-b', withEco(api.defaultConfig()), 720 * 2, 36).scenario;
  // C: a player trading (market, limit, stop) so fills, impact and player volume are in the fingerprint
  const cfgC = withEco(api.defaultConfig({ ticksPerDay: 24 }));
  out.C = run(api, 'C', 'fp-c', cfgC, 24 * 25, 6, (s, k) => {
    if (k === 1) s = api.openAccount(s, 'p1', 1e6);
    if (k === 2) s = api.placeOrder(s, { playerId: 'p1', assetId: 'HLCN', side: 'buy', type: 'market', qty: 400 }).state;
    if (k === 30) s = api.placeOrder(s, { playerId: 'p1', assetId: 'AUC', side: 'buy', type: 'market', qty: 3 }).state;
    if (k === 60) s = api.placeOrder(s, { playerId: 'p1', assetId: 'HLCN', side: 'sell', type: 'limit', qty: 200, limitPrice: 1 }).state;
    if (k === 61) s = api.placeOrder(s, { playerId: 'p1', assetId: 'HLCN', side: 'sell', type: 'stop', qty: 100, stopPrice: 1e9 }).state;
    if (k === 200) s = api.placeOrder(s, { playerId: 'p1', assetId: 'NMBS', side: 'buy', type: 'market', qty: 5000 }).state;
    return s;
  }).scenario;
  return out;
}
