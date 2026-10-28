// T04-20 test kit: the integrated macro world (genesis, day step, dispatch). schedWorld's fast store, rng and header, cbWorld's ledger and
// holds, ctx.cal = calendarOf(tick), and params = every registry plus the T04-04/05/06/07/08/16 test tables (as economy/regime/cb/inflation/fiscal tests).
import { calendarOf, type PhaseCtx } from '@tycoon/engine-core';
import { createParamsView, MACRO_E93_OPENING_PARAMS, MACRO_T04_07_PARAMS, MACRO_T04_08_PARAMS, MACRO_T04_17_PARAMS } from '@tycoon/params';
import { cbWorld, type CbWorld } from './cbWorld';
import { REV_BASE } from './fiscalWorld';
import { schedWorld, SEAL0, type MapStore } from './schedWorld';
import { macroTables } from '../schema';

export const MACRO_TEST_PARAMS: Readonly<Record<string, number>> = Object.freeze({
  macro_scale_ref_players: 5000, macro_scale_min: 0.2, macro_scale_max: 400, macro_world_gdp_ref: 100e12,
  macro_policy_lag_days: 120, macro_gap_halflife_years: 0.30, macro_gap_vol: 0.008, macro_ai_productivity_max: 0.005,
  macro_xreg_exp: 0.005, macro_xreg_ovh: 0.025, macro_xreg_con: -0.04, macro_xreg_rec: -0.01,
  macro_x_a_r: 0.5, macro_x_m: 0.8, macro_x_a_c: 0.012, macro_x_a_e: 0.4, macro_x_a_q: 0.10, macro_x_a_o: 0.03, macro_x_a_f: 0.010,
  macro_x_a_w: 0.05, macro_x_a_h: 0.08, macro_x_a_t: 0.2, macro_x_a_k: 0.010,
  macro_regime_mean_days_exp: 819, macro_regime_mean_days_ovh: 273, macro_regime_mean_days_con: 273, macro_regime_mean_days_rec: 273,
  macro_regime_min_days_exp: 182, macro_regime_min_days_ovh: 63, macro_regime_min_days_con: 91, macro_regime_min_days_rec: 91,
  macro_cb_phi_fs: 1.5, macro_cb_smoothing: 0.5, macro_cb_max_step: 0.005, macro_cb_max_step_wide: 0.0075,
  macro_cb_emergency_step: 0.01, macro_cred_guidance_break: 0.05, macro_governor_term_days: 2912, macro_corridor_halfwidth: 0.0025, macro_cb_max_emergency_per_quarter: 2,
  macro_phillips_slope: 0.25, ...REV_BASE,
  macro_cb_meetings_per_year: 4, macro_cb_decision_tick: 420, macro_auction_tick: 330, macro_auction_announce_tick: 420,
});

export interface MacroWorld { ctx: PhaseCtx; store: MapStore; cb: CbWorld; events: { kind: string; payload: unknown; vis: string }[];
  draws: Record<string, number>; setTick(t: number): void; nums(o: Record<string, number>): void; reads: string[] }

export function macroWorld(seed = 'g', tick0 = 0): MacroWorld {
  const sw = schedWorld(seed, tick0), cw = cbWorld([], tick0);
  for (const t of [macroTables.bloc.name, macroTables.global.name, macroTables.publicView.name]) for (const r of sw.store.iter<{ id: string }>(t)) sw.store.del(t, r.id);
  const defs = [...MACRO_T04_07_PARAMS, ...MACRO_T04_08_PARAMS, ...MACRO_E93_OPENING_PARAMS, ...MACRO_T04_17_PARAMS];
  const reg = createParamsView(defs.filter((d, i) => defs.findIndex((x) => x.key === d.key) === i));
  let over: Record<string, number> = {}, tick = tick0;
  const reads: string[] = [];
  const num = (k: string): number => { reads.push(k); return over[k] !== undefined ? over[k] : MACRO_TEST_PARAMS[k] !== undefined ? MACRO_TEST_PARAMS[k] : reg.num(k); };
  const base = sw.ctx as unknown as Record<string, unknown>, cbx = cw.ctx as unknown as Record<string, unknown>;
  const ctx = { get tick() { return tick; }, get header() { return { tick, sealUtcMs: SEAL0 + BigInt(tick) * 5000n }; }, get cal() { return calendarOf(tick); },
    phase: 'P8', params: { ...reg, num, int: num }, content: cbx.content, store: sw.store, newId: base.newId, rng: base.rng, emit: base.emit,
    ledger: cbx.ledger, holds: cbx.holds, send: cbx.send, inbox: cbx.inbox } as unknown as PhaseCtx;
  return { ctx, store: sw.store, cb: cw, events: sw.events, draws: sw.draws, reads, nums: (o) => { over = { ...over, ...o }; },
    setTick: (t) => { tick = t; cw.setTick(t); const g = sw.store.get<{ id: string }>(macroTables.global.name, 'GLOBAL'); if (g) sw.store.put(macroTables.global.name, { ...g, tick: t }); } };
}
