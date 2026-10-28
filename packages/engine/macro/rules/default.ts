// T04-13 sovereign default (04 §3.12.1–2): triggers checked at day close, case, grace, selective default.
// Pure trigger rules first; the PhaseCtx steps (checkDefaultTriggers, openDefaultCase, stepDefaultCase) follow in this file.
import { dmath, EngineFault, TICKS_PER_GAME_DAY, type Money, type PhaseCtx, type StoreRead, type Tick } from '@tycoon/engine-core';
import { cbkId, govId } from '@tycoon/engine-ledger';
import { blocOfEntity } from '../ids';
import type { MacroPorts } from '../ports';
import { macroTables, type BlocId, type CentralBank, type HookCall, type SovereignCreditState, type SovereignDefaultCase } from '../schema';
import { S } from '../streams';
import { closeOffer, openOffer, tallyOffer } from './restructuring';
import { blocRow, govLines, latestCase, payments, saveCase } from './sovCase';
import { canAgreeConcord, concordActive, fxReservesFdl, importsMonthFdl } from './t0414Stubs';

export type DefaultTrigger = SovereignDefaultCase['trigger'];

/** FAILED_ROLLOVER: ≥ 2 failed auctions in 21 days, buffer below the next 21 days' maturities, and no backstop left. */
export function failedRolloverTrigger(x: { failed21d: number; cashBuffer: Money; maturities21d: Money; backstopAvailable: boolean; backstopExhausted: boolean }): boolean {
  return x.failed21d >= 2 && x.cashBuffer < x.maturities21d && (!x.backstopAvailable || x.backstopExhausted);
}

/** FX_SERVICE: FDL service due in 21 days above reserves less one month of imports, and no Concord program can be agreed. */
export function fxServiceTrigger(x: { fdlServiceDue21d: Money; reservesFdl: Money; importsMonthFdl: Money; concordAgreeable: boolean }): boolean {
  return x.fdlServiceDue21d > x.reservesFdl - x.importsMonthFdl && !x.concordAgreeable;
}

/** POLITICAL: a decision from 09 with debt/GDP > 1.5 and ≥ 63 consecutive trading days of s10 > 0.15; never FDL or NKR. */
export function politicalTrigger(b: BlocId, x: { politicalDecision: boolean; debtGdp: number; highSpreadTradingDays: number }): boolean {
  if (b === 'FDL' || b === 'NKR') return false;
  return x.politicalDecision && x.debtGdp > 1.5 && x.highSpreadTradingDays >= 63;
}

/** HAZARD: daily surprise probability 1 − e^(−0.25·λ/364) when λ > 0.10, else 0 (the draw is still consumed by the caller). */
export function hazardDrawProbability(lambda: number): number {
  return lambda > 0.10 ? -dmath.expm1(-0.25 * lambda / 364) : 0;
}

const D = TICKS_PER_GAME_DAY, WINDOW_DAYS = 21, ROUND1_DELAY_DAYS = 7, ROUND_GAP_DAYS = 28, POST_DAYS = 364;
/** `macro_sov_grace_days` = 7 (§3.12.2; registry row MISSING EXPORT T23). */
export const SOV_GRACE_DAYS = 7;

/**
 * Day close, after T04-07's credit step. Exactly one draw per bloc per day on S.sov(b) (drawn first, whatever the status);
 * updates the s10 > 0.15 trading-day counter; checks FAILED_ROLLOVER, FX_SERVICE, POLITICAL, HAZARD in that order, only while PERFORMING with no case.
 */
export function checkDefaultTriggers(ctx: PhaseCtx, b: BlocId, ports: MacroPorts): DefaultTrigger | null {
  const s = ctx.store, u = ctx.rng(S.sov(b)).next(), bloc = blocRow(s, b), sov = bloc.sovereign;
  const high = sov.spread10y > 0.15 ? (bloc.highSpreadTradingDays ?? 0) + 1 : 0;
  s.put(macroTables.bloc.name, { ...bloc, highSpreadTradingDays: high });
  if (sov.status !== 'PERFORMING' || sov.defaultCase) return null;
  const gov = govId(b), tick = ctx.tick, end = tick + WINDOW_DAYS * D;
  let maturities = 0n, fdlDue = 0n;
  for (const l of govLines(s, b, ports)) for (const p of payments(l, tick, end)) {
    if (l.fxDenominated) fdlDue += p.amount; else maturities += p.principal;
  }
  const cb = s.get<CentralBank>(macroTables.cb.name, cbkId(b));
  if (failedRolloverTrigger({ failed21d: sov.failedAuctions21d, cashBuffer: ctx.ledger.cash(gov, b), maturities21d: maturities,
    backstopAvailable: !(b === 'EUN' && !concordActive(s, b)), backstopExhausted: !cb?.backstop })) return 'FAILED_ROLLOVER';
  if (fdlDue > 0n && fxServiceTrigger({ fdlServiceDue21d: fdlDue, reservesFdl: fxReservesFdl(s, b, ports), importsMonthFdl: importsMonthFdl(s, b), concordAgreeable: canAgreeConcord(s, b) })) return 'FX_SERVICE';
  if (politicalTrigger(b, { politicalDecision: ports.world.politicalDefault(s, b), debtGdp: bloc.fiscal.debtGdp, highSpreadTradingDays: high })) return 'POLITICAL';
  return u < hazardDrawProbability(sov.hazard) ? 'HAZARD' : null;
}

/** Opens the case on the earliest coupon or principal due after today (ties: lower assetId); the status stays PERFORMING until it is missed. */
export function openDefaultCase(ctx: PhaseCtx, b: BlocId, trigger: DefaultTrigger, ports: MacroPorts): SovereignDefaultCase {
  const tick = ctx.tick;
  let due: SovereignDefaultCase['missedPayment'] | null = null;
  for (const l of govLines(ctx.store, b, ports)) {
    const p = payments(l, tick, l.maturityTick)[0];
    if (p && (!due || p.tick < due.dueTick)) due = { assetId: l.assetId, amount: p.amount, dueTick: p.tick };
  }
  if (!due) throw new EngineFault('MAC_STATE_MISSING', `no sovereign line for ${b}`, [b]);
  const c: SovereignDefaultCase = { id: ctx.newId('sdc'), govId: govId(b), triggerTick: tick, trigger, missedPayment: due, graceEndsTick: due.dueTick + SOV_GRACE_DAYS * D, offers: [] };
  saveCase(ctx, b, c);
  return c;
}

function status(ctx: PhaseCtx, b: BlocId, c: SovereignDefaultCase, st: SovereignCreditState['status'], trigger: DefaultTrigger | null): void {
  saveCase(ctx, b, c, st);
  ctx.emit('macro.sov.status', [c.govId], { govId: c.govId, status: st, trigger }, 'PUBLIC');
}

/**
 * Each tick: missed payment at dueTick → GRACE (status event, Wire hook to 16); grace end → SELECTIVE_DEFAULT (macro.sov.default listing all lines);
 * round 1 opens 7 days later, a failed round's successor 28 days after its close (at most 3 rounds); open offers tally at each day start and close at closeTick;
 * POST_RESTRUCTURING returns to PERFORMING 364 days after resolution.
 */
export function stepDefaultCase(ctx: PhaseCtx, b: BlocId, ports: MacroPorts): void {
  const bloc = blocRow(ctx.store, b), sov = bloc.sovereign, c = sov.defaultCase, tick = ctx.tick;
  if (!c) return;
  if (c.resolvedTick !== undefined) {
    if (sov.status === 'POST_RESTRUCTURING' && tick >= c.resolvedTick + POST_DAYS * D) {
      const { defaultCase: _done, ...rest } = sov;
      ctx.store.put(macroTables.bloc.name, { ...bloc, sovereign: { ...rest, status: 'PERFORMING' } });
      ctx.emit('macro.sov.status', [c.govId], { govId: c.govId, status: 'PERFORMING', trigger: null }, 'PUBLIC');
    }
    return;
  }
  if (sov.status === 'PERFORMING') {
    if (tick < c.missedPayment.dueTick) return;
    status(ctx, b, c, 'GRACE', c.trigger);
    ctx.store.put<HookCall>(macroTables.hookCall.name, { id: ctx.newId('hook'), owner: '16', hook: 'WIRE_ITEM', args: { key: 'sov_grace', govId: c.govId, caseId: c.id }, worldEventId: '', createdTick: tick, startTick: tick + 1 });
    return;
  }
  if (sov.status === 'GRACE') {
    if (tick < c.graceEndsTick) return;
    status(ctx, b, c, 'SELECTIVE_DEFAULT', c.trigger);
    ctx.emit('macro.sov.default', [c.govId], { govId: c.govId, caseId: c.id, assetIds: govLines(ctx.store, b, ports).map((l) => l.assetId),
      missedAssetId: c.missedPayment.assetId, missedAmount: c.missedPayment.amount.toString(), dueTick: c.missedPayment.dueTick }, 'PUBLIC');
    return;
  }
  const last = c.offers[c.offers.length - 1];
  if (last?.status === 'OPEN') {
    if (tick >= last.closeTick) { closeOffer(ctx, b, ports); return; }
    if (tick % D === 0 && tick > last.openTick) {
      const t = tallyOffer(ctx.store, last);
      saveCase(ctx, b, { ...c, offers: c.offers.map((o) => (o.id === last.id ? { ...o, consentSoFar: t.consent } : o)) });
      ctx.emit('macro.sov.exchange.tally', [c.govId], { offerId: last.id, consentSoFar: t.consent }, 'PUBLIC');
    }
    return;
  }
  const at: Tick = last ? last.closeTick + ROUND_GAP_DAYS * D : c.graceEndsTick + ROUND1_DELAY_DAYS * D;
  if (tick >= at && c.offers.length < 3) openOffer(ctx, b, (c.offers.length + 1) as 1 | 2 | 3, ports);
}

/** 06 reads it: GRACE from case opening (06 withholds that and later payments) until the case advances; else the bloc's status. */
export function sovereignStatus(store: StoreRead, gov: string): SovereignCreditState['status'] {
  const b = blocOfEntity(gov), bloc = b ? store.get<{ sovereign: SovereignCreditState }>(macroTables.bloc.name, b) : undefined;
  if (!bloc) throw new EngineFault('MAC_STATE_MISSING', `bloc of ${gov}`, [gov]);
  const st = bloc.sovereign.status, c = latestCase(store, gov);
  return st === 'PERFORMING' && c && c.resolvedTick === undefined ? 'GRACE' : st;
}
