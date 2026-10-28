// T04-08 facility intents (04 §4): bank.cb.repo, bank.cb.repoRepay, bank.cb.deposit, bank.cb.depositWithdraw, bank.cb.elaRequest.
import { TICKS_PER_GAME_DAY, type Id, type IntentHandler, type PhaseCtx, type Qty, type Reject, type SealedIntent, type StoreRead, type Tick, type ValidateCtx } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';
import { z } from 'zod';
import { defaultMacroPorts, type MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type BlocId, type CentralBank, type DepositFacilityBalance, type FacilityLoan } from '../schema';
import { closeFacility, collateralValue, isCounterparty, openFacility } from '../rules/facilities';

// Decision: the handlers are constants, so the module binds its ports once at init (T04-21); unbound = defaultMacroPorts() (credit null, edge 18).
let ports: MacroPorts = defaultMacroPorts();
export function bindFacilityPorts(p: MacroPorts): void { ports = p; }

const NOT_ELIGIBLE: Reject = { code: 'CBK_NOT_ELIGIBLE' }, INELIGIBLE: Reject = { code: 'CBK_COLLATERAL_INELIGIBLE' };
const SHORT: Reject = { code: 'CBK_HAIRCUT_SHORT' }, INSOLVENT: Reject = { code: 'CBK_ELA_INSOLVENT' };
const ELA_TERM_DAYS = 90, LTRO_TERM_DAYS = 91, MAX_TICK: Tick = Number.MAX_SAFE_INTEGER;
const amount = z.string().regex(/^[1-9][0-9]*$/), bloc = z.enum(BLOC_ORDER as [BlocId, ...BlocId[]]), id = z.string().min(1);
const collateral = z.array(z.strictObject({ assetId: id, qty: amount })).min(1);
type Line = { assetId: string; qty: string };
const lines = (c: Line[]): { assetId: string; qty: Qty }[] => c.map((l) => ({ assetId: l.assetId, qty: BigInt(l.qty) }));
const cbOf = (s: StoreRead, b: BlocId): CentralBank | undefined => s.get<CentralBank>(macroTables.cb.name, cbkId(b));

/** Shared collateral check: eligibility, free quantity (available − pledged), post-haircut ≥ amount. */
function checkCollateral(ctx: ValidateCtx, b: BlocId, bankId: Id, c: Line[], amt: bigint, mode: 'REPO' | 'ELA'): Reject | ReturnType<typeof collateralValue> {
  const v = collateralValue(ctx.store, ports, b, lines(c), mode, ctx.tick);
  if (v.ineligible.length > 0) return INELIGIBLE;
  const want: { assetId: string; qty: Qty }[] = [];   // Decision: repeated asset lines are summed before the free-quantity check
  for (const l of v.lines) { const w = want.find((x) => x.assetId === l.assetId); if (w) w.qty += l.qty; else want.push({ assetId: l.assetId, qty: l.qty }); }
  for (const l of want) if (l.qty > ctx.ledger.availableQty(bankId, l.assetId) - (ports.credit?.pledgedQty(ctx.store, bankId, l.assetId) ?? 0n)) return INELIGIBLE;
  return v.postHaircut < amt ? SHORT : v;
}
function placeHolds(ctx: PhaseCtx, bankId: Id, ls: FacilityLoan['collateral'], expires: Tick, ref: Id): Id[] | Reject {
  const ids: Id[] = [];
  for (const l of ls) {
    const h = ctx.holds.placeQty(bankId, l.assetId, l.qty, expires, ref);
    if (typeof h !== 'string') { for (const x of ids) ctx.holds.release(x); return INELIGIBLE; }
    ids.push(h);
  }
  return ids;
}

type RepoP = { bloc: BlocId; bankId: Id; amount: string; termDays: number; collateral: Line[] };
function validateRepo(ctx: ValidateCtx, i: SealedIntent<RepoP>): Reject | ReturnType<typeof collateralValue> {
  const p = i.payload, cb = cbOf(ctx.store, p.bloc);
  if (!ports.credit || !cb || ports.players.isHeld(ctx.store, i.actorId) || !isCounterparty(ctx.store, ports, p.bloc, p.bankId)) return NOT_ELIGIBLE;
  const ltro = p.termDays === LTRO_TERM_DAYS && cb.ltroOpenUntilTick !== null && cb.ltroOpenUntilTick > ctx.tick;
  if (!ltro && !(p.termDays >= 1 && p.termDays <= cb.facilities.maxTermDays)) return NOT_ELIGIBLE;
  return checkCollateral(ctx, p.bloc, p.bankId, p.collateral, BigInt(p.amount), 'REPO');
}
const rej = (r: Reject | object): Reject | null => ('code' in r ? (r as Reject) : null);

/** Decision: holds are placed in apply (P6, after the re-check), so a rejected or failed apply leaves none behind. */
export const cbRepoIntent: IntentHandler<RepoP> = {
  kind: 'bank.cb.repo', applyPhase: 'P6',
  schema: z.strictObject({ bloc, bankId: id, amount, termDays: z.number().int(), collateral }),
  validate: (ctx, i) => rej(validateRepo(ctx, i)),
  apply: (ctx, i) => {
    const v = validateRepo(ctx, i);
    if ('code' in v) return v as Reject;
    const p = i.payload, days = p.termDays;
    const h = placeHolds(ctx, p.bankId, v.lines, ctx.tick + (days + 1) * TICKS_PER_GAME_DAY, i.intentId);
    if (isRejectList(h)) return h;
    openFacility(ctx, days === LTRO_TERM_DAYS ? 'LTRO' : 'REPO', p.bloc, p.bankId, BigInt(p.amount), days, v.lines, h);
    return null;
  },
};
function isRejectList(h: Id[] | Reject): h is Reject { return !Array.isArray(h); }

/** Own facility, available ≥ amount + accrued; early repayment pays interest to date. */
function validateRepay(ctx: ValidateCtx, i: SealedIntent<{ repoId: Id }>): Reject | null {
  const l = ctx.store.get<FacilityLoan>(macroTables.facility.name, i.payload.repoId);
  if (!ports.credit || !l || l.status !== 'OPEN' || l.kind === 'ELA') return NOT_ELIGIBLE;
  const g = ports.players.ownerGroupOf;
  if (i.actorId !== l.bankId && g(ctx.store, i.actorId) !== g(ctx.store, l.bankId)) return NOT_ELIGIBLE;
  return ctx.ledger.available(l.bankId, l.ccy) >= l.amount + l.accrued ? null : NOT_ELIGIBLE;
}
export const cbRepoRepayIntent: IntentHandler<{ repoId: Id }> = {
  kind: 'bank.cb.repoRepay', applyPhase: 'P6', schema: z.strictObject({ repoId: id }),
  validate: validateRepay,
  apply: (ctx, i) => validateRepay(ctx, i) ?? (closeFacility(ctx, i.payload.repoId, 'EARLY'), null),
};

type DepP = { bloc: BlocId; bankId: Id; amount: string };
const depSchema = z.strictObject({ bloc, bankId: id, amount });
const depRow = (s: StoreRead, p: DepP): DepositFacilityBalance | undefined => s.get<DepositFacilityBalance>(macroTables.depositFacility.name, `${p.bloc}:${p.bankId}`);
function validateDeposit(ctx: ValidateCtx, i: SealedIntent<DepP>): Reject | null {
  const p = i.payload;
  if (!ports.credit || !ports.credit.isChartered(ctx.store, p.bankId, p.bloc)) return NOT_ELIGIBLE;
  return BigInt(p.amount) <= ctx.ledger.available(p.bankId, p.bloc) ? null : NOT_ELIGIBLE;
}
/** Decision: one earmark hold per row, re-placed at the new total on each deposit (the row keeps its id). */
export const cbDepositIntent: IntentHandler<DepP> = {
  kind: 'bank.cb.deposit', applyPhase: 'P8', schema: depSchema, validate: validateDeposit,
  apply: (ctx, i) => {
    const r = validateDeposit(ctx, i);
    if (r) return r;
    const p = i.payload, row = depRow(ctx.store, p), total = (row?.amount ?? 0n) + BigInt(p.amount), rowId = `${p.bloc}:${p.bankId}`;
    if (row?.holdId) ctx.holds.release(row.holdId);
    const h = ctx.holds.placeCash(p.bankId, p.bloc, total, MAX_TICK, rowId);
    if (typeof h !== 'string') return NOT_ELIGIBLE;
    ctx.store.put<DepositFacilityBalance>(macroTables.depositFacility.name, { id: rowId, bloc: p.bloc, bankId: p.bankId, amount: total, holdId: h });
    return null;
  },
};
function validateWithdraw(ctx: ValidateCtx, i: SealedIntent<DepP>): Reject | null {
  const row = depRow(ctx.store, i.payload);
  return ports.credit && row && BigInt(i.payload.amount) <= row.amount ? null : NOT_ELIGIBLE;
}
export const cbDepositWithdrawIntent: IntentHandler<DepP> = {
  kind: 'bank.cb.depositWithdraw', applyPhase: 'P8', schema: depSchema, validate: validateWithdraw,
  apply: (ctx, i) => {
    const r = validateWithdraw(ctx, i);
    if (r) return r;
    const row = depRow(ctx.store, i.payload)!, amt = BigInt(i.payload.amount), left = row.amount - amt;
    if (row.holdId) { if (left === 0n) ctx.holds.release(row.holdId); else ctx.holds.reduce(row.holdId, amt); }
    ctx.store.put<DepositFacilityBalance>(macroTables.depositFacility.name, { ...row, amount: left, ...(left === 0n ? { holdId: undefined } : {}) });
    return null;
  },
};

type ElaP = { bloc: BlocId; bankId: Id; amount: string; collateral: Line[] };
export const ELA_REQUEST_MSG = 'mac.ela.request';
function validateEla(ctx: ValidateCtx, i: SealedIntent<ElaP>): Reject | ReturnType<typeof collateralValue> {
  const p = i.payload;
  if (!ports.credit || !cbOf(ctx.store, p.bloc) || !ports.credit.isChartered(ctx.store, p.bankId, p.bloc)) return NOT_ELIGIBLE;
  if (!ports.credit.solvencyOk(ctx.store, p.bankId)) return INSOLVENT;
  return checkCollateral(ctx, p.bloc, p.bankId, p.collateral, BigInt(p.amount), 'ELA');
}
export const cbElaRequestIntent: IntentHandler<ElaP> = {
  kind: 'bank.cb.elaRequest', applyPhase: 'P6',
  schema: z.strictObject({ bloc, bankId: id, amount, collateral }),
  validate: (ctx, i) => rej(validateEla(ctx, i)),
  apply: (ctx, i) => {
    const v = validateEla(ctx, i);
    if ('code' in v) return v as Reject;
    const p = i.payload, h = placeHolds(ctx, p.bankId, v.lines, ctx.tick + (ELA_TERM_DAYS + 2) * TICKS_PER_GAME_DAY, i.intentId);
    if (isRejectList(h)) return h;
    ctx.send(cbkId(p.bloc), ELA_REQUEST_MSG, { bloc: p.bloc, bankId: p.bankId, amount: p.amount,
      lines: v.lines.map((l) => ({ ...l, qty: l.qty.toString(), valueAtOpen: l.valueAtOpen.toString() })), holdIds: h }, 'NEXT');
    return null;
  },
};

/** Next tick, P8 (decision: called by T04-21's P8 step): re-check solvency; refused → release the holds (the strict loanEvent schema has no
 *  `refused` field, so no event; 07 resolves from its own checks); granted → ELA at lendingRate + 0.015 for 90 days (PARTIES + SEALED to reg). */
export function processElaRequests(ctx: PhaseCtx): void {
  for (const m of ctx.inbox(ELA_REQUEST_MSG)) {
    const r = m.body as { bloc: BlocId; bankId: Id; amount: string; lines: { assetId: string; qty: string; haircut: number; valueAtOpen: string }[]; holdIds: Id[] };
    if (!ports.credit || !ports.credit.solvencyOk(ctx.store, r.bankId)) { for (const h of r.holdIds) ctx.holds.release(h); continue; }
    openFacility(ctx, 'ELA', r.bloc, r.bankId, BigInt(r.amount), ELA_TERM_DAYS,
      r.lines.map((l) => ({ assetId: l.assetId, qty: BigInt(l.qty), haircut: l.haircut, valueAtOpen: BigInt(l.valueAtOpen) })), r.holdIds);
  }
}
