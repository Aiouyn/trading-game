// T04-18 step 7-8: emergent crisis labels (04 §3.16.5) checked each game hour, and outcome metrics at ENDED.
// Per-label state lives in mac.inputs `EMERGENT` (unit decision): `h.fsi` / `h.hack` consecutive hourly checks over threshold,
// `fired.<KIND>` 1 while an episode is open, `off.<KIND>` the tick the condition went false (re-armed after 7 game days false).
import { TICKS_PER_GAME_DAY, type PhaseCtx, type StoreRead, type Tick } from '@tycoon/engine-core';
import type { MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type BlocId, type BlocMacroState, type CrisisKind, type DailyHistoryRow, type GlobalMacroState, type MacroInputs, type WorldEvent } from '../schema';
import { chooseBlocs } from './crisisCatalog';
import { FSI_DIVISORS, FSI_WEIGHTS, type FsiComponents } from './fsi';
import { attachEmergent } from './phases';

const D = TICKS_PER_GAME_DAY, HOUR = D / 24;
const FSI_LEVEL = 0.75, FSI_HOURS = 72, HACK_LEVEL = 85, HACK_HOURS = 48, GX_DD = 0.20, DEPEG = 0.10, PLAYER_SHARE = 0.5, REARM_DAYS = 7, BREAK_RECENT_DAYS = 7;
const FSI_KEYS: readonly (keyof FsiComponents)[] = ['interbank', 'repoHaircut', 'ccpFund', 'bankEquityDd', 'igSpread', 'stablecoinDepeg', 'etfDiscount', 'sovStressMax'];

function stateRow(s: StoreRead, tick: Tick): MacroInputs {
  const r = s.get<MacroInputs>(macroTables.inputs.name, 'EMERGENT');
  return r ? { ...r, staleKeys: [], values: { ...r.values } } : { id: 'EMERGENT', tick, staleKeys: [], values: {} };
}
const v = (r: MacroInputs, k: string, dflt: number): number => r.values[k] ?? dflt;

/** BANKING_PANIC when interbank or bank-equity drawdown is the largest weighted FSI component (HOURLY `fsi.<key>` held values), else FUNDING_RUN. */
function fsiLabel(s: StoreRead): 'BANKING_PANIC' | 'FUNDING_RUN' {
  const h = s.get<MacroInputs>(macroTables.inputs.name, 'HOURLY')?.values ?? {};
  let best: keyof FsiComponents = 'interbank', bestW = -1;
  for (const k of FSI_KEYS) {
    const raw = h[`fsi.${k}`] ?? 0, w = FSI_WEIGHTS[k] * Math.min(1, Math.max(0, raw / FSI_DIVISORS[k]));
    if (w > bestW) { best = k; bestW = w; }
  }
  return best === 'interbank' || best === 'bankEquityDd' ? 'BANKING_PANIC' : 'FUNDING_RUN';
}

/** Each game hour: evaluate the 7 labels; a label fires once per episode through attachEmergent. */
export function emergentCheck(ctx: PhaseCtx, ports: MacroPorts): void {
  const s = ctx.store, tick = ctx.tick, r = stateRow(s, tick);
  const g = s.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL');
  const blocRows = BLOC_ORDER.map((b) => s.get<BlocMacroState>(macroTables.bloc.name, b)).filter((x): x is BlocMacroState => x !== undefined);
  const fsi = g?.financialStressIndex ?? 0, hack = ports.conflict.worldHackRate(s) ?? g?.worldHackRate ?? 0;
  r.values['h.fsi'] = fsi >= FSI_LEVEL ? v(r, 'h.fsi', 0) + 1 : 0;
  r.values['h.hack'] = hack >= HACK_LEVEL ? v(r, 'h.hack', 0) + 1 : 0;
  const breaks = blocRows.filter((b) => b.fx.breakTick !== undefined && tick - b.fx.breakTick < BREAK_RECENT_DAYS * D).map((b) => b.bloc);
  const defaults = blocRows.filter((b) => b.sovereign.status === 'SELECTIVE_DEFAULT').map((b) => b.bloc);
  const fsiKind = fsiLabel(s);
  const labels: { kind: CrisisKind; on: boolean; blocs: () => BlocId[]; key: string; origin?: 'PLAYER_CAUSED' }[] = [
    { kind: fsiKind, on: v(r, 'h.fsi', 0) >= FSI_HOURS, blocs: () => chooseBlocs(s, fsiKind, 0, ports), key: 'fsi_72h' },
    { kind: 'EQUITY_BUBBLE_BURST', on: (ports.markets.gxDrawdown21d(s) ?? 0) >= GX_DD, blocs: () => chooseBlocs(s, 'EQUITY_BUBBLE_BURST', 0, ports), key: 'market_crash' },
    { kind: 'CURRENCY_CRISIS', on: breaks.length > 0, blocs: () => breaks, key: 'currency_break' },
    { kind: 'SOVEREIGN_DEBT_CRISIS', on: defaults.length > 0, blocs: () => defaults, key: 'selective_default' },
    { kind: 'CYBER_PANDEMIC', on: v(r, 'h.hack', 0) >= HACK_HOURS, blocs: () => [], key: 'hack_48h',
      ...((ports.conflict.playerHackShare(s) ?? 0) >= PLAYER_SHARE ? { origin: 'PLAYER_CAUSED' as const } : {}) },
    { kind: 'CRYPTO_WINTER', on: (ports.assets.maxStablecoinDepeg(s) ?? 0) > DEPEG, blocs: () => [], key: 'stablecoin_depeg' },
    { kind: 'FLASH_CRASH', on: ports.markets.indexWideHalt(s, tick), blocs: () => [], key: 'index_halt' },
  ];
  for (const l of labels) {
    const fk = `fired.${l.kind}`, ok = `off.${l.kind}`;
    if (l.on) {
      r.values[ok] = -1;
      if (v(r, fk, 0) === 0) { r.values[fk] = 1; attachEmergent(ctx, l.kind, l.blocs(), l.origin ?? 'EMERGENT', { key: `label.${l.key}`, refs: [] }); }
    } else if (v(r, fk, 0) === 1) {
      if (v(r, ok, -1) < 0) r.values[ok] = tick;
      else if (tick - v(r, ok, -1) >= REARM_DAYS * D) { r.values[fk] = 0; r.values[ok] = -1; }
    }
  }
  s.put(macroTables.inputs.name, { ...r, tick });
}
export const EMERGENT_CHECK_EVERY_TICKS = HOUR;

/** Archive metrics over the event's life (precursor start to now): peak FSI and F (GLOBAL history), per event bloc the s10 spread and the
 *  CPI level change, SRL and PYN spot change (s10 at the end, not the peak: history has no spread; unit decision). Missing days are skipped. */
export function measureOutcomes(store: StoreRead, ev: WorldEvent): Record<string, number> {
  const d0 = Math.floor(ev.precursorStartTick / D), g = store.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL');
  const d1 = Math.floor((g?.tick ?? ev.phaseSinceTick) / D);
  const rows = (b: BlocId | 'GLOBAL'): DailyHistoryRow[] => {
    const out: DailyHistoryRow[] = [];
    for (let d = d0; d <= d1; d++) { const h = store.get<DailyHistoryRow>(macroTables.history.name, `${b}:${d}`); if (h) out.push(h); }
    return out;
  };
  const gl = rows('GLOBAL'), o: Record<string, number> = {
    peakFsi: gl.reduce((a, h) => Math.max(a, h.fsi), g?.financialStressIndex ?? 0),
    peakFear: gl.reduce((a, h) => Math.max(a, h.fearIndex), g?.fearIndex ?? 0) };
  const change = (b: BlocId, f: (h: DailyHistoryRow) => number): number | null => { const r = rows(b); return r.length ? f(r[r.length - 1]!) / f(r[0]!) - 1 : null; };
  for (const b of ev.blocs) {
    const st = store.get<BlocMacroState>(macroTables.bloc.name, b);
    if (st) o[`s10_${b}`] = st.sovereign.spread10y;
    const c = change(b, (h) => h.cpiLevel);
    if (c !== null) o[`cpiChange_${b}`] = c;
  }
  const srl = change('SRL', (h) => h.spotVsFdl), pyn = change('PYN', (h) => h.spotVsFdl);
  if (srl !== null) o['srlSpotChange'] = srl;
  if (pyn !== null) o['pynSpotChange'] = pyn;
  return o;
}
