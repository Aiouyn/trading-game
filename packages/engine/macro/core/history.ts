// T04-20 step 5: daily history rows (04 §3.1 row 3 step 13), pruning, and the E-90 (4) MAC_HISTORY_GAP check.
import { EngineFault, fromMoney, type PhaseCtx, type StoreRead } from '@tycoon/engine-core';
import { defaultMacroPorts, type MacroPorts } from '../ports';
import { nsZero } from '../rules/nelsonSiegel';
import { nominalGdpFdl, spotOfStore } from '../rules/fxReserves';
import { effectiveFxLn } from '../rules/inflation';
import { BLOC_ORDER, macroTables, type BlocId, type BlocMacroState, type CentralBank, type CurveState, type DailyHistoryRow, type GlobalMacroState } from '../schema';
import { cbkId } from '@tycoon/engine-ledger';

const H = macroTables.history.name;
export const HISTORY_KEEP_DAYS = 400;

/** day ≥ today − 400, or the first day of a game month (91q, 91q + 28, 91q + 56; T04-02 months 28/28/35). */
export function keepHistoryDay(day: number, today: number): boolean {
  if (day >= today - HISTORY_KEEP_DAYS) return true;
  const r = day % 91;
  return r === 0 || r === 28 || r === 56;
}

export function historyAt(store: StoreRead, key: BlocId | 'GLOBAL', day: number): DailyHistoryRow | null {
  return store.get<DailyHistoryRow>(H, `${key}:${day}`) ?? null;
}

/** E-90 (4) dev switch: missing row(b, d − 364) at d ≥ 364 throws MAC_HISTORY_GAP (tests and dev); production sets it false and
 *  falls back to the credit0 branch with no event. */
export const MACRO_DEV_CHECKS = { on: true };

/** credit364 for the close of day d (E-90 (4)). */
export function credit364Of(store: StoreRead, b: BlocId, d: number): number | null {
  if (d < 364) return null;
  const row = historyAt(store, b, d - 364);
  if (row === null) {
    if (MACRO_DEV_CHECKS.on) throw new EngineFault('MAC_HISTORY_GAP', `no history row ${b}:${d - 364}`, [b]);
    return null;
  }
  return row.credit;
}

/** Mean of `pick` over the rows of `key` for days [today − n + 1, today − 1] plus `now` (shorter at genesis; missing rows skipped). */
export function trailingMean(store: StoreRead, key: BlocId | 'GLOBAL', today: number, n: number, now: number | null, pick: (r: DailyHistoryRow) => number | null): number | null {
  let s = 0, k = 0;
  if (now !== null) { s += now; k++; }
  for (let d = Math.max(0, today - n + 1); d < today; d++) {
    const r = historyAt(store, key, d), v = r === null ? null : pick(r);
    if (v !== null) { s += v; k++; }
  }
  return k > 0 ? s / k : null;
}

const yieldAt = (c: CurveState | undefined, tau: number): number => (c ? nsZero(c.ns, tau) : 0);

/** One row per bloc + GLOBAL for game day `cal.gameDay`, from the post-step state. GLOBAL equityIndex = gxLevel at the close (null kept). */
export function writeHistoryRows(ctx: PhaseCtx, ports: MacroPorts = defaultMacroPorts()): void {
  const s = ctx.store, day = ctx.cal.gameDay;
  const g = s.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL');
  if (!g) throw new EngineFault('MAC_STATE_MISSING', 'writeHistoryRows GLOBAL');
  const spots = {} as Record<BlocId, number>, w = {} as Record<BlocId, number>;
  for (const b of BLOC_ORDER) { spots[b] = spotOfStore(s, b); w[b] = fromMoney(nominalGdpFdl(s, b)); }
  const common = { energyIndex: g.energyIndex, foodIndex: g.foodIndex, worldTradeIndex: g.worldTradeIndex, fearIndex: g.fearIndex, fsi: g.financialStressIndex };
  for (const b of BLOC_ORDER) {
    const st = s.get<BlocMacroState>(macroTables.bloc.name, b), cb = s.get<CentralBank>(macroTables.cb.name, cbkId(b));
    if (!st || !cb) throw new EngineFault('MAC_STATE_MISSING', `writeHistoryRows ${b}`, [b]);
    const c = s.get<CurveState>(macroTables.curve.name, b);
    s.put<DailyHistoryRow>(H, { id: `${b}:${day}`, bloc: b, gameDay: day, realGdpIndex: st.realGdpIndex, cpiLevel: st.cpiLevel, coreCpiLevel: st.coreCpiLevel,
      outputGap: st.outputGap, outputGapEstimate: st.outputGap + st.gapEstNoise, ...common, equityIndex: ports.markets.equityIndexLevel(s, b),
      spotVsFdl: spots[b], effectiveFx: effectiveFxLn(b, spots, w), reservesFdl: st.fx.reservesFdl.toString(), policyRate: cb.policyRate, y3m: yieldAt(c, 0.25), y10: yieldAt(c, 10),
      deficitPrimaryGdp: -st.fiscal.primaryBalanceGdp, credit: st.credit, creditGdp: st.creditGdpTrend + st.creditGap, housePriceIndex: ports.housing.housePriceIndex(s, b),
      regime: st.regime });
  }
  s.put<DailyHistoryRow>(H, { id: `GLOBAL:${day}`, bloc: 'GLOBAL', gameDay: day, realGdpIndex: 0, cpiLevel: 0, coreCpiLevel: 0, outputGap: 0, outputGapEstimate: 0, ...common,
    equityIndex: ports.markets.gxLevel(s), spotVsFdl: 1, effectiveFx: 0, reservesFdl: '0', policyRate: 0, y3m: 0, y10: 0, deficitPrimaryGdp: 0, credit: null, creditGdp: 0,
    housePriceIndex: null, regime: g.globalRegime });
}

/** Deletes rows with !keepHistoryDay(day, today); returns the count. */
export function pruneHistory(ctx: PhaseCtx, today: number): number {
  const del: string[] = [];
  for (const r of ctx.store.iter<DailyHistoryRow>(H)) if (!keepHistoryDay(r.gameDay, today)) del.push(r.id);
  for (const id of del) ctx.store.del(H, id);
  return del.length;
}
