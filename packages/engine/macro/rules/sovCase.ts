// T04-13 shared helpers for the default case (default.ts, restructuring.ts): the case row, the lines and their payment dates.
import { EngineFault, mulRate, roundHalfEven, TICKS_PER_GAME_DAY, type Ccy, type PhaseCtx, type Qty, type StoreRead, type Tick } from '@tycoon/engine-core';
import { govId } from '@tycoon/engine-ledger';
import type { MacroPorts } from '../ports';
import { macroTables, type BlocId, type BlocMacroState, type SovereignDefaultCase, type SovereignIssue } from '../schema';

const D = TICKS_PER_GAME_DAY, HALF_YEAR_TICKS = 182 * D;
export type Bloc = BlocMacroState & { id: BlocId };
export type GovLine = { assetId: string; ccy: Ccy; couponRate: number; maturityTick: Tick; faceOutstanding: Qty; fxDenominated: boolean };

export function blocRow(s: StoreRead, b: BlocId): Bloc {
  const r = s.get<Bloc>(macroTables.bloc.name, b);
  if (!r) throw new EngineFault('MAC_STATE_MISSING', `bloc ${b}`, [b]);
  return r;
}
/** The bloc's latest default case (by triggerTick), resolved or not. */
export function latestCase(s: StoreRead, gov: string): SovereignDefaultCase | null {
  let best: SovereignDefaultCase | null = null;
  for (const c of s.iter<SovereignDefaultCase>(macroTables.defaultCase.name)) if (c.govId === gov && (!best || c.triggerTick > best.triggerTick)) best = c;
  return best;
}
/** Writes the case row and mirrors it (and optionally a new status) on the bloc's SovereignCreditState. */
export function saveCase(ctx: PhaseCtx, b: BlocId, c: SovereignDefaultCase, status?: Bloc['sovereign']['status']): Bloc {
  ctx.store.put(macroTables.defaultCase.name, c);
  const r = blocRow(ctx.store, b), nb: Bloc = { ...r, sovereign: { ...r.sovereign, defaultCase: c, ...(status ? { status } : {}) } };
  ctx.store.put(macroTables.bloc.name, nb);
  return nb;
}
/** mac.issue rows of the bloc's government plus 06's sovereignLines not already listed, sorted by assetId. */
export function govLines(s: StoreRead, b: BlocId, ports: MacroPorts): GovLine[] {
  const gov = govId(b), out: GovLine[] = [];
  for (const i of s.iter<SovereignIssue & { id: string }>(macroTables.issue.name)) if (i.govId === gov) out.push(i);
  for (const l of ports.assets.sovereignLines(s, gov)) if (!out.some((x) => x.assetId === l.assetId)) out.push({ ...l, ccy: l.fxDenominated ? 'FDL' : b });
  return out.sort((x, y) => (x.assetId < y.assetId ? -1 : x.assetId > y.assetId ? 1 : 0));
}
/** Payments in (from, to]: coupons face × c/2 every 182 game days back from maturity, plus the face at maturity. */
export function payments(l: GovLine, from: Tick, to: Tick): { tick: Tick; amount: Qty; principal: Qty }[] {
  const out: { tick: Tick; amount: Qty; principal: Qty }[] = [], cpn = mulRate(l.faceOutstanding, BigInt(roundHalfEven(l.couponRate / 2 * 1e6)));
  for (let t = l.maturityTick; t > from; t -= HALF_YEAR_TICKS) if (t <= to) {
    const principal = t === l.maturityTick ? l.faceOutstanding : 0n;
    out.push({ tick: t, amount: cpn + principal, principal });
  }
  return out.reverse();
}
