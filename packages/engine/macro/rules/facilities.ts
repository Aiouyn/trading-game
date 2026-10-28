// T04-08 standing lending facility, LTRO, ELA, deposit facility, automatic (sf:) facilities and the daily public aggregates (04 §3.8.3–§3.8.4).
import { accrue, divRoundHalfEven, EngineFault, MICRO_N, mulRate, roundHalfEven, TICKS_PER_GAME_DAY, type Id, type Money, type PhaseCtx, type Qty,
  type StoreRead, type Tick } from '@tycoon/engine-core';
import { cbkId, govId, type FlowClass } from '@tycoon/engine-ledger';
import { regId } from '../ids';
import { defaultMacroPorts, type MacroPorts } from '../ports';
import { macroTables, type BlocId, type CentralBank, type ConcordFacility, type DepositFacilityBalance, type FacilityLoan, type PrimaryDealerStatus } from '../schema';
import { isPlayerBank, postCbInterest } from './cbInterest';
import { GRADES, lowestOfTwoBest } from './sovCredit';
import { accountsOfEntity, committedBalance, effectiveMark } from './t03Stubs';

export type CollateralKind = 'OWN_GOV' | 'OTHER_GOV' | 'CORP' | 'ABS_COVERED' | 'CREDIT_CLAIM' | 'EQUITY' | 'OTHER';
export type GradeBucket = 'AAA_AA' | 'A' | 'BBB' | 'BB' | 'BELOW';
/** §3.8.3 (macro_cb_haircut_* defaults); OWN_GOV BB only with a crisis waiver. */
export const HAIRCUTS: Readonly<Record<CollateralKind, Partial<Record<GradeBucket, number>>>> = Object.freeze({
  OWN_GOV: { AAA_AA: 0.01, A: 0.02, BBB: 0.04, BB: 0.15 }, OTHER_GOV: { AAA_AA: 0.03, A: 0.05, BBB: 0.10 },
  CORP: { AAA_AA: 0.05, A: 0.07, BBB: 0.12 }, ABS_COVERED: { AAA_AA: 0.08, A: 0.12, BBB: 0.20 }, CREDIT_CLAIM: {}, EQUITY: {}, OTHER: {} });
export const ELA_ONLY_HAIRCUTS: Readonly<{ CREDIT_CLAIM: 0.30; EQUITY: 0.40 }> = Object.freeze({ CREDIT_CLAIM: 0.30, EQUITY: 0.40 });

const e6 = (r: number): bigint => BigInt(roundHalfEven(r * 1e6));
const r6 = (r: number): number => roundHalfEven(r * 1e6) / 1e6;
const YEAR_TICKS = 364 * TICKS_PER_GAME_DAY;

function cbOf(s: StoreRead, b: BlocId): CentralBank {
  const cb = s.get<CentralBank>(macroTables.cb.name, cbkId(b));
  if (!cb) throw new EngineFault('I0.macro_missing', `no cb row for ${b}`);
  return cb;
}

export function gradeBucket(grade: string | null): GradeBucket | null {
  const i = grade === null ? -1 : (GRADES as readonly string[]).indexOf(grade);
  if (i < 0) return null;
  return i <= 3 ? 'AAA_AA' : i <= 6 ? 'A' : i <= 9 ? 'BBB' : i <= 12 ? 'BB' : 'BELOW';
}

/** null = ineligible; + 0.005 per year to maturity above 5. CREDIT_CLAIM / EQUITY in ELA mode only (any grade). */
export function haircutFor(kind: CollateralKind, bucket: GradeBucket | null, yearsToMaturity: number | null, mode: 'REPO' | 'ELA', crisisWaiver: boolean): number | null {
  let base: number | undefined;
  if (kind === 'CREDIT_CLAIM' || kind === 'EQUITY') base = mode === 'ELA' ? ELA_ONLY_HAIRCUTS[kind] : undefined;
  else if (bucket !== null && !(kind === 'OWN_GOV' && bucket === 'BB' && !crisisWaiver)) base = HAIRCUTS[kind][bucket];
  if (base === undefined) return null;
  return r6(base + 0.005 * Math.max(0, (yearsToMaturity ?? 0) - 5));
}

/** Decision: `tick` (optional, default 0) measures years to maturity; the card's signature has no clock. */
export function classifyCollateral(store: StoreRead, ports: MacroPorts, b: BlocId, assetId: string, tick: Tick = 0): { kind: CollateralKind; grade: string | null; yearsToMaturity: number | null } {
  const info = ports.assets.assetInfo(store, assetId);
  if (!info) {
    const kind: CollateralKind = ports.credit?.isLoanClaim(store, assetId) ? 'CREDIT_CLAIM' : 'OTHER';
    return { kind, grade: kind === 'CREDIT_CLAIM' ? ports.funds.gradeOf(store, assetId) : null, yearsToMaturity: null };
  }
  const kind: CollateralKind = info.cls === 'GOV' ? (info.issuerBloc === b ? 'OWN_GOV' : 'OTHER_GOV') : info.cls === 'CORP' ? 'CORP'
    : info.cls === 'ABS_SENIOR' || info.cls === 'COVERED' ? 'ABS_COVERED' : info.cls === 'EQUITY' ? 'EQUITY' : 'OTHER';
  const grade = info.cls === 'GOV' && info.issuerBloc !== null ? lowestOfTwoBest(ports.funds.sovereignGrades(store, govId(info.issuerBloc)))
    : ports.funds.gradeOf(store, assetId);
  const yearsToMaturity = info.maturityTick === null ? null : Math.max(0, (info.maturityTick - tick) / YEAR_TICKS);
  return { kind, grade, yearsToMaturity };
}

function crisisWaiver(store: StoreRead, b: BlocId, tick: Tick): boolean {
  const csf = store.get<ConcordFacility>(macroTables.csf.name, 'npc_CSF');
  return !!csf && csf.programs.some((p) => p.bloc === b && p.startTick <= tick && tick < p.endTick);
}

/** Value = fairPriceOf × qty (qty in micro-units), else effectiveMark; credit claims at principal. Missing price or haircut → ineligible. */
export function collateralValue(store: StoreRead, ports: MacroPorts, b: BlocId, items: { assetId: string; qty: Qty }[], mode: 'REPO' | 'ELA', tick: Tick):
  { gross: Money; postHaircut: Money; lines: FacilityLoan['collateral']; ineligible: string[] } {
  const waiver = crisisWaiver(store, b, tick);
  let gross = 0n, postHaircut = 0n;
  const lines: FacilityLoan['collateral'] = [], ineligible: string[] = [];
  for (const it of items) {
    const c = classifyCollateral(store, ports, b, it.assetId, tick);
    const h = haircutFor(c.kind, gradeBucket(c.grade), c.yearsToMaturity, mode, waiver);
    let value: Money | null = null;
    if (c.kind === 'CREDIT_CLAIM') value = ports.credit?.isLoanClaim(store, it.assetId)?.principal ?? null;
    else { const px = ports.markets.fairPriceOf(store, it.assetId) ?? effectiveMark(store, it.assetId, tick); value = px === null ? null : divRoundHalfEven(it.qty * px, MICRO_N); }
    if (h === null || value === null) { ineligible.push(it.assetId); continue; }
    gross += value; postHaircut += value - mulRate(value, e6(h));
    lines.push({ assetId: it.assetId, qty: it.qty, haircut: h, valueAtOpen: value });
  }
  return { gross, postHaircut, lines, ineligible };
}

/** CH_BANK chartered in the bloc, or an ACTIVE primary dealer of the bloc. */
export function isCounterparty(store: StoreRead, ports: MacroPorts, b: BlocId, entityId: Id): boolean {
  if (ports.credit?.isChartered(store, entityId, b)) return true;
  return store.get<PrimaryDealerStatus>(macroTables.dealer.name, `${b}:${entityId}`)?.status === 'ACTIVE';
}

function bump(ctx: PhaseCtx, b: BlocId, kind: FacilityLoan['kind'], d: Money): void {
  const cb = cbOf(ctx.store, b), bs = cb.balanceSheet;
  ctx.store.put<CentralBank>(macroTables.cb.name, { ...cb, balanceSheet: kind === 'ELA' ? { ...bs, elaOutstanding: bs.elaOutstanding + d } : { ...bs, loansToBanks: bs.loansToBanks + d } });
}

const loanPayload = (l: FacilityLoan, termDays: number) => ({ bloc: l.bloc, bankId: l.bankId, loanId: l.id, amount: l.amount.toString(), ccy: l.ccy, termDays,
  collateral: l.collateral.map((c) => ({ assetId: c.assetId, qty: c.qty.toString(), haircut: c.haircut })) });

/** REPO at lendingRate, LTRO at i, ELA at lendingRate + elaPenaltySpread; cbCredit; PARTIES event (+ SEALED copy of ELA to reg_<bloc>). */
export function openFacility(ctx: PhaseCtx, kind: FacilityLoan['kind'], b: BlocId, bankId: Id, amount: Money, termDays: number, collateral: FacilityLoan['collateral'], holdIds: Id[]): FacilityLoan {
  const cb = cbOf(ctx.store, b), f = cb.facilities;
  const rate = kind === 'LTRO' ? cb.policyRate : kind === 'ELA' ? r6(f.lendingRate + f.elaPenaltySpread) : f.lendingRate;
  const loan: FacilityLoan = { id: ctx.newId('fac'), kind, bloc: b, bankId, amount, ccy: b, rate, openTick: ctx.tick, maturityTick: ctx.tick + termDays * TICKS_PER_GAME_DAY,
    collateral, accrued: 0n, status: 'OPEN', holdIds };
  ctx.store.put<FacilityLoan>(macroTables.facility.name, loan);
  ctx.ledger.cbCredit(cbkId(b), bankId, amount, b, kind === 'ELA' ? 'CBK_EMERGENCY_LIQUIDITY' : 'CBK_STANDING_FACILITY', { sub: loan.id });
  bump(ctx, b, kind, amount);
  const p = loanPayload(loan, termDays);
  if (kind === 'ELA') { ctx.emit('macro.cb.ela', [bankId], p, 'PARTIES', [bankId]); ctx.emit('macro.cb.ela', [regId(b)], p, 'SEALED', [regId(b)]); }
  else ctx.emit('macro.cb.repo', [bankId], p, 'PARTIES', [bankId]);
  return loan;
}

function openLoans(s: StoreRead, b: BlocId): FacilityLoan[] {
  const out: FacilityLoan[] = [];
  for (const l of s.iter<FacilityLoan>(macroTables.facility.name)) if (l.bloc === b && l.status === 'OPEN') out.push(l);
  return out;
}

/** Day close: accrued += half-even(amount × rate / 364); loans at maturity close (MATURITY). */
export function accrueFacilities(ctx: PhaseCtx, b: BlocId): void {
  for (const l of openLoans(ctx.store, b)) {
    ctx.store.put<FacilityLoan>(macroTables.facility.name, { ...l, accrued: l.accrued + accrue(l.amount, e6(l.rate), 1) });
    if (l.maturityTick <= ctx.tick) closeFacility(ctx, l.id, 'MATURITY');
  }
}

/** Unwind + interest to date + release holds; status REPAID. */
export function closeFacility(ctx: PhaseCtx, loanId: Id, _reason: 'MATURITY' | 'EARLY'): void {
  const l = ctx.store.get<FacilityLoan>(macroTables.facility.name, loanId);
  if (!l || l.status !== 'OPEN') return;
  const cbk = cbkId(l.bloc);
  ctx.ledger.cbCreditUnwind(l.bankId, cbk, l.amount, l.ccy, l.kind === 'ELA' ? 'CBK_EMERGENCY_LIQUIDITY_REPAY' : 'CBK_STANDING_FACILITY_REPAY', { sub: l.id });
  if (l.accrued > 0n) ctx.ledger.pay(l.bankId, cbk, l.accrued, l.ccy, 'CBK_FACILITY_INTEREST');
  for (const h of l.holdIds ?? []) ctx.holds.release(h);
  ctx.store.put<FacilityLoan>(macroTables.facility.name, { ...l, status: 'REPAID' });
  bump(ctx, l.bloc, l.kind, -l.amount);
}

/** DAY_OPEN (P2): repay 03's sf:<bankId>:<ccy>:<gameDay> facilities of the previous game day with interest at lendingRate. */
export function repayAutomaticFacilities(ctx: PhaseCtx, b: BlocId): void {
  const cbk = cbkId(b), yesterday = Math.floor(ctx.tick / TICKS_PER_GAME_DAY) - 1, rate = e6(cbOf(ctx.store, b).facilities.lendingRate);
  for (const a of accountsOfEntity(ctx.store, cbk)) {
    if (a.code !== 1307 || !a.sub.startsWith('sf:')) continue;
    const parts = a.sub.split(':');
    if (Number(parts[parts.length - 1]) !== yesterday) continue;
    const bank = parts.slice(1, -2).join(':'), amt = committedBalance(ctx.store, a.key);
    if (amt === 0n) continue;
    ctx.ledger.cbCreditUnwind(bank, cbk, amt, a.ccy, 'CBK_STANDING_FACILITY_REPAY', { sub: a.sub });
    ctx.ledger.pay(bank, cbk, accrue(amt, rate, 1), a.ccy, 'CBK_FACILITY_INTEREST');
  }
}

function depositRows(s: StoreRead, b: BlocId): DepositFacilityBalance[] {
  const out: DepositFacilityBalance[] = [];
  for (const d of s.iter<DepositFacilityBalance>(macroTables.depositFacility.name)) if (d.bloc === b) out.push(d);
  return out;
}

/** Day close: half-even(amount × depositRate / 364); + → CBK_DEPOSIT_INTEREST_P/_W, − → the negative-rate charge codes (edge 2).
 *  Decision: `ports` (optional) tells player banks from world banks; the card's signature has none. */
export function postDepositFacilityInterest(ctx: PhaseCtx, b: BlocId, ports: MacroPorts = defaultMacroPorts()): void {
  const rate = e6(cbOf(ctx.store, b).facilities.depositRate);
  for (const d of depositRows(ctx.store, b))
    postCbInterest(ctx, b, d.bankId, isPlayerBank(ctx.store, ports, d.bankId), accrue(d.amount, rate, 1), 'CBK_DEPOSIT_INTEREST');
}

/** Day close, PUBLIC bloc aggregates only (L11): no ids. Decision: repoOutstanding includes LTRO (the T04-01 strict schema has no LTRO or bucket field). */
export function facilityDaily(ctx: PhaseCtx, b: BlocId): void {
  let repo = 0n, ela = 0n, dep = 0n;
  for (const l of openLoans(ctx.store, b)) if (l.kind === 'ELA') ela += l.amount; else repo += l.amount;
  for (const d of depositRows(ctx.store, b)) dep += d.amount;
  ctx.emit('macro.cb.facility.daily', [cbkId(b)], { bloc: b, repoOutstanding: repo.toString(), elaOutstanding: ela.toString(), deposits: dep.toString() }, 'PUBLIC');
}

/** Rows for T03-05 registerReasonCodes (called from T04-21). Owner 04; 07 may request the penalty codes. */
export const MACRO_EXTENSION_CODES_CBK: readonly { code: string; cls: FlowClass; template: string; desc: string; mayRequest?: readonly number[] }[] = Object.freeze([
  { code: 'CBK_NEGATIVE_RATE_CHARGE_P', cls: 'SINK', template: 'BURN', desc: 'negative policy / deposit rate charge, player bank' },
  { code: 'CBK_NEGATIVE_RATE_CHARGE_W', cls: 'TRANSFER', template: 'PAY', desc: 'negative policy / deposit rate charge, world bank' },
  { code: 'CBK_RESERVE_PENALTY_P', cls: 'SINK', template: 'BURN', desc: 'reserve shortfall penalty, player bank', mayRequest: [4, 7] },
  { code: 'CBK_RESERVE_PENALTY_W', cls: 'TRANSFER', template: 'PAY', desc: 'reserve shortfall penalty, world bank', mayRequest: [4, 7] },
]);
