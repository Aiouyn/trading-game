// T04-14 Concord Stability Facility (04 §3.13.6, §2.13, §6.6). npc_CSF lends FDL to blocs in crisis under conditions.
import { accrue, divRoundHalfEven, EngineFault, fromMoney, roundHalfEven, TICKS_PER_GAME_DAY, toMoney, type Money, type PhaseCtx, type StoreRead, type Tick } from '@tycoon/engine-core';
import { govId } from '@tycoon/engine-ledger';
import { BLOC_ORDER, macroTables, type BlocId, type BlocMacroState, type ConcordFacility, type CurveState } from '../schema';
import { CSF_ID } from '../ids';
import { setCapitalControls } from './capitalControls';
import { nominalGdpFdl } from './fxReserves';
import { nsZero } from './nelsonSiegel';
import { addProgram } from './programs';
import { trancheSourceId, writeHook } from './hooks';

export type ConcordProgram = ConcordFacility['programs'][number];
type Cause = 'BREAK_PENDING' | 'FX_SERVICE' | 'SPREAD' | 'RESTRUCTURING';
const D = TICKS_PER_GAME_DAY, Q = 91, TRANCHES = 4, QUOTA_E6 = 20_000n, CAP_X = 3n, SIZE_X = 3n, RATE_SPREAD = 0.02, PB_STEP = 0.015,
  PHASE_OUT_DAYS = 91, COMPLIANCE_MIN = 0.7, REPAY_LAG_DAYS = 364, INSTALLMENTS = 8, SPREAD_TRIGGER = 0.08, LAMBDA_MAX = 0.15;
const e6 = (r: number): bigint => BigInt(roundHalfEven(r * 1e6));

function facility(s: StoreRead): ConcordFacility {
  return s.get<ConcordFacility>(macroTables.csf.name, CSF_ID) ?? { id: CSF_ID, quotas: {} as Record<BlocId, Money>, lendingCapacity: 0n, programs: [] };
}
const blocOf = (s: StoreRead, b: BlocId): BlocMacroState & { id: BlocId } => {
  const r = s.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, b);
  if (!r) throw new EngineFault('MAC_STATE_MISSING', `no bloc row ${b}`);
  return r;
};
const outstanding = (p: ConcordProgram): Money => p.drawn - (p.repaid ?? 0n);
const open = (p: ConcordProgram): boolean => p.closedTick === undefined;

/** 2% of bloc nominal GDP in FDL. */
export function quotas(store: StoreRead): Record<BlocId, Money> {
  const q = {} as Record<BlocId, Money>;
  for (const b of BLOC_ORDER) q[b] = divRoundHalfEven(nominalGdpFdl(store, b) * QUOTA_E6, 1_000_000n);
  return q;
}
/** Σ quotas × 3 − outstanding loans. */
export function lendingCapacity(store: StoreRead): Money {
  const q = quotas(store);
  let c = 0n;
  for (const b of BLOC_ORDER) c += q[b];
  c *= CAP_X;
  for (const p of facility(store).programs) c -= outstanding(p);
  return c;
}
export function concordActive(store: StoreRead, b: BlocId): boolean { return facility(store).programs.some((p) => p.bloc === b && open(p)); }
const sizeFor = (s: StoreRead, b: BlocId): Money => { const m = quotas(s)[b] * SIZE_X, c = lendingCapacity(s); return m < c ? m : c; };
function crisis(s: StoreRead, b: BlocId): boolean { const st = blocOf(s, b); return !!st.fx.breakArmed || !!st.fx.fxServicePending || st.sovereign.spread10y > SPREAD_TRIGGER; }
function agreeable(s: StoreRead, b: BlocId): boolean {
  if (b === 'FDL' || concordActive(s, b)) return false;
  const size = sizeFor(s, b);
  return blocOf(s, b).sovereign.hazard * 0.6 < LAMBDA_MAX && size > 0n && lendingCapacity(s) >= size;
}
/** Crisis condition (break pending, FX service pending, or s10 > 0.08) and λ·0.6 < 0.15 and capacity ≥ size. */
export function canAgreeConcord(store: StoreRead, b: BlocId): boolean { return crisis(store, b) && agreeable(store, b); }

function save(ctx: PhaseCtx, f: ConcordFacility): void {
  ctx.store.put(macroTables.csf.name, { ...f, quotas: quotas(ctx.store), lendingCapacity: 0n });
  const g = facility(ctx.store);
  ctx.store.put(macroTables.csf.name, { ...g, lendingCapacity: lendingCapacity(ctx.store) });
}
function emitProgram(ctx: PhaseCtx, p: ConcordProgram): void {
  ctx.emit('macro.csf.program', [CSF_ID, govId(p.bloc)], { bloc: p.bloc, size: p.size.toString(), rate: p.rate, startTick: p.startTick, endTick: p.endTick,
    trancheTicks: p.trancheTicks ?? [], conditions: p.conditions, compliance: p.compliance }, 'PUBLIC');
}
const tranche = (p: ConcordProgram): Money => p.size / BigInt(TRANCHES);
/** Tranche k pays size/4; the last one also carries the division remainder. A suspended tranche is withheld for good (the card has no
 *  release: QA #82 follow-up 4); `suspended` counts the withheld ones. */
function disburse(ctx: PhaseCtx, p: ConcordProgram, k: number): ConcordProgram {
  const amt = tranche(p) + (k === TRANCHES - 1 ? p.size - tranche(p) * BigInt(TRANCHES) : 0n);
  ctx.ledger.pay(CSF_ID, govId(p.bloc), amt, 'FDL', 'CSF_DISBURSE');
  return { ...p, drawn: p.drawn + amt, tranchesPaid: (p.tranchesPaid ?? 0) + 1 };
}
/** Opens a program (RESTRUCTURING skips the crisis condition); first tranche at once. Null when it cannot be agreed. */
export function openConcord(ctx: PhaseCtx, b: BlocId, cause: Cause): ConcordProgram | null {
  const s = ctx.store;
  if (!(cause === 'RESTRUCTURING' ? agreeable(s, b) : canAgreeConcord(s, b))) return null;
  const t: Tick = ctx.tick, st = blocOf(s, b), fdlCurve = s.get<CurveState>(macroTables.curve.name, 'FDL');
  if (!fdlCurve) throw new EngineFault('MAC_STATE_MISSING', 'no FDL curve');
  const trancheTicks = [0, 1, 2, 3].map((k) => t + k * Q * D), repay0 = trancheTicks[3]! + REPAY_LAG_DAYS * D;
  let p: ConcordProgram = { id: `csf_${b}_${t}`, cause, bloc: b, size: sizeFor(s, b), drawn: 0n, rate: nsZero(fdlCurve.nsOis, 5) + RATE_SPREAD, startTick: t,
    endTick: repay0 + (INSTALLMENTS - 1) * Q * D, conditions: { primaryBalanceStepPerYear: PB_STEP, cbIndependence: true, capitalControlsPhaseOutDays: PHASE_OUT_DAYS },
    compliance: 1, trancheTicks, tranchesPaid: 0, suspended: 0, repaid: 0n, accrued: 0n, pb0: st.fiscal.primaryBalanceGdp, phaseOutTick: t + PHASE_OUT_DAYS * D };
  p = disburse(ctx, p, 0);
  const f = facility(s);
  save(ctx, { ...f, programs: [...f.programs, p] });
  addProgram(ctx, { id: `fp_${b}_csf_${t}`, bloc: b, kind: 'AUSTERITY', sizeGdpPerYear: PB_STEP, sectorDemand: {}, budget: toMoney(PB_STEP * fromMoney(st.nominalGdp), b), spent: 0n,
    startTick: t, endTick: t + 364 * D, source: 'CONCORD_CONDITIONALITY', sponsorActorIds: [] }, false);
  if ((b === 'SRL' || b === 'PYN') && st.fx.capitalControls > 0) setCapitalControls(ctx, b, 0, 0, 'CONCORD_PHASE_OUT');
  emitProgram(ctx, p);
  return p;
}
/** clamp(achieved / required, 0, 1) × (controls phased out on time ? 1 : 0.5). */
export function compliance(prog: ConcordProgram, achievedPbStep: number, controlsPhasedOut: boolean): number {
  const r = prog.conditions.primaryBalanceStepPerYear, c = r > 0 ? Math.min(1, Math.max(0, achievedPbStep / r)) : 1;
  return c * (controlsPhasedOut ? 1 : 0.5);
}
/** Daily: SPREAD programs open for qualifying blocs; interest accrues; on tranche dates compliance ≥ 0.7 disburses, else the tranche is
 *  suspended (withheld, never paid later) with a Wire hook; quarterly interest; 8 quarterly installments from 364 days after the last tranche; closed at the last one. */
export function concordTranches(ctx: PhaseCtx): void {
  const t = ctx.tick, s = ctx.store;
  if (t % D !== 0) return;
  for (const b of BLOC_ORDER) if (b !== 'FDL' && blocOf(s, b).sovereign.spread10y > SPREAD_TRIGGER && canAgreeConcord(s, b)) openConcord(ctx, b, 'SPREAD');
  const f = facility(s), out: ConcordProgram[] = [];
  for (let p of f.programs) {
    if (!open(p) || t === p.startTick) { out.push(p); continue; }
    p = { ...p, accrued: (p.accrued ?? 0n) + accrue(outstanding(p), e6(p.rate), 1) };
    const days = Math.floor((t - p.startTick) / D), gov = govId(p.bloc);
    const k = (p.trancheTicks ?? []).indexOf(t);
    if (k > 0) {
      const st = blocOf(s, p.bloc), ach = (st.fiscal.primaryBalanceGdp - (p.pb0 ?? 0)) * 364 / days;
      const phased = (p.bloc !== 'SRL' && p.bloc !== 'PYN') || st.fx.capitalControls === 0 || t < (p.phaseOutTick ?? t);
      p = { ...p, compliance: compliance(p, ach, phased) };
      if (p.compliance >= COMPLIANCE_MIN) p = disburse(ctx, p, k);
      else {
        p = { ...p, suspended: (p.suspended ?? 0) + 1 };
        const src = trancheSourceId(p.id, k);   // throws on a missing program id (E-105: never '')
        writeHook(ctx, '16', 'WIRE_ITEM', { key: 'csf_tranche_suspended', bloc: p.bloc, programId: p.id! }, src);
      }
      emitProgram(ctx, p);
    }
    if (days % Q === 0 && (p.accrued ?? 0n) > 0n) { ctx.ledger.pay(gov, CSF_ID, p.accrued!, 'FDL', 'CSF_INTEREST'); p = { ...p, accrued: 0n }; }
    const repay0 = p.trancheTicks![3]! + REPAY_LAG_DAYS * D;
    if (t >= repay0 && (t - repay0) % (Q * D) === 0 && outstanding(p) > 0n) {
      const n = (t - repay0) / (Q * D), amt = n >= INSTALLMENTS - 1 ? outstanding(p) : divRoundHalfEven(p.drawn, BigInt(INSTALLMENTS));
      ctx.ledger.pay(gov, CSF_ID, amt, 'FDL', 'CSF_REPAY');
      p = { ...p, repaid: (p.repaid ?? 0n) + amt };
      if (outstanding(p) === 0n) p = { ...p, closedTick: t };
    }
    out.push(p);
  }
  save(ctx, { ...facility(s), programs: out });
}
