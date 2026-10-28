// T04-08 reserve requirements, tiered interest on reserves (exploit 6 counter) and the reserve penalty rate (04 §3.8.2).
import { accrue, EngineFault, GAME_DAYS_PER_QUARTER, mulRate, roundHalfEven, TICKS_PER_GAME_DAY, type Money, type PhaseCtx, type StoreRead } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';
import type { MacroPorts } from '../ports';
import { isPlayerBank, postCbInterest } from './cbInterest';
import { macroTables, type BlocId, type CentralBank } from '../schema';

const e6 = (r: number): bigint => BigInt(roundHalfEven(r * 1e6));
const r6 = (r: number): number => roundHalfEven(r * 1e6) / 1e6;   // keeps 0.10 + 0.02 at 0.12
const RR_STEP = 0.02, RR_CAP = 0.2, PENALTY_SPREAD = 0.02, IOR_TIER_MULTIPLE = 3;

function cbOf(s: StoreRead, b: BlocId): CentralBank {
  const cb = s.get<CentralBank>(macroTables.cb.name, cbkId(b));
  if (!cb) throw new EngineFault('I0.macro_missing', `no cb row for ${b}`);
  return cb;
}

export function requiredReserves(rr: number, eligibleDeposits: Money): Money { return mulRate(eligibleDeposits, e6(rr)); }

export interface IorSplit { tierBase: Money; excess: Money; tierInterest: Money; excessInterest: Money }   // signed; negative = charge
/** Daily (Δ = 1/364): tierBase = min(balance, m × required) earns i, the excess earns depositRate; half-even per part. */
export function iorSplit(balance: Money, required: Money, tierMultiple: number, i: number, depositRate: number): IorSplit {
  const cap = required * BigInt(tierMultiple);
  const tierBase = balance < cap ? balance : cap, excess = balance - tierBase;
  return { tierBase, excess, tierInterest: accrue(tierBase, e6(i), 1), excessInterest: accrue(excess, e6(depositRate), 1) };
}

export function reservePenaltyRate(store: StoreRead, b: BlocId): number { return cbOf(store, b).facilities.lendingRate + PENALTY_SPREAD; }
export function reservePenalty(shortfall: Money, lendingRate: number): Money { return accrue(shortfall, e6(lendingRate + PENALTY_SPREAD), 1); }

/** SRL only. DEFENCE +0.02 (cap 0.20); EASING −0.02 at most once per quarter, floor = macro_rr_srl. Emits RR_CHANGE on a change. */
export function adjustRr(ctx: PhaseCtx, b: BlocId, reason: 'DEFENCE' | 'EASING'): boolean {
  if (b !== 'SRL') return false;
  const cb = cbOf(ctx.store, b), quarter = Math.floor(Math.floor(ctx.tick / TICKS_PER_GAME_DAY) / GAME_DAYS_PER_QUARTER);
  let rr: number;
  if (reason === 'DEFENCE') rr = r6(Math.min(RR_CAP, cb.reserveRequirement + RR_STEP));
  else {
    if (cb.rrEasingQuarter === quarter) return false;
    rr = r6(Math.max(ctx.params.num('macro_rr_srl'), cb.reserveRequirement - RR_STEP));
  }
  if (rr === cb.reserveRequirement) return false;
  ctx.store.put<CentralBank>(macroTables.cb.name, { ...cb, reserveRequirement: rr, ...(reason === 'EASING' ? { rrEasingQuarter: quarter } : {}) });
  ctx.emit('macro.cb.tool', [cbkId(b)], { bloc: b, tool: 'RR_CHANGE', params: { rr, reason } }, 'PUBLIC');
  return true;
}

/** Day close (P8), chartered banks of the bloc in sorted id order; credit = null → nothing (edge 18). */
export function postInterestOnReserves(ctx: PhaseCtx, b: BlocId, ports: MacroPorts): void {
  const credit = ports.credit;
  if (!credit) return;
  const cb = cbOf(ctx.store, b);
  const ids = [...credit.charteredBankIds(ctx.store, b)].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  for (const bankId of ids) {
    const r = credit.bankReserves(ctx.store, bankId);
    if (!r) continue;
    const s = iorSplit(r.balance, r.required, IOR_TIER_MULTIPLE, cb.policyRate, cb.facilities.depositRate);
    const player = isPlayerBank(ctx.store, ports, bankId);
    postCbInterest(ctx, b, bankId, player, s.tierInterest, 'CBK_IOR');
    postCbInterest(ctx, b, bankId, player, s.excessInterest, 'CBK_IOR');
  }
}
