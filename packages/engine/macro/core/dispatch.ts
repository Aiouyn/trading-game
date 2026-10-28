// T04-20 steps 2 and 4: one P2 handler in a fixed order (boundaries stay empty), P4 pool orders, P6 auctions, P8 day-close cash.
/* eslint-disable @typescript-eslint/no-explicit-any -- G6 ViewHandler<any, any> */
import { TICKS_PER_GAME_DAY, type Boundary, type PhaseCtx, type PhaseId, type ViewHandler } from '@tycoon/engine-core';
import { cbkId, govId } from '@tycoon/engine-ledger';
import type { MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type BlocId, type BlocMacroState, type CentralBank, type PublicMacroView, type SovAuction } from '../schema';
import { meetingPlan, quarterStartDay, writeQuarterSchedule } from '../rules/calendar';
import { planQuarter, announceDue } from '../rules/issuance';
import { chapterStart } from '../rules/scheduler';
import { postConsensus, publishRelease, releasesDue } from '../rules/releases';
import { guidanceAt, minutesAt } from '../rules/guidance';
import { runMeeting } from '../rules/cb';
import { setCorridor } from '../rules/corridor';
import { macroprudentialAtMeeting } from '../rules/macroprudential';
import { realignAtMeeting } from '../rules/fxRegimes';
import { recomputeCurve, type CurveRecomputeReason } from '../rules/curves';
import { hourlyFsi } from '../rules/fsi';
import { hourlyFear } from '../rules/fear';
import { applyPoolFills, writePoolOrders } from '../rules/poolOrders';
import { remitProfit, reserveRebalanceOrders } from '../rules/reserveManagers';
import { runAuction } from '../rules/auction';
import { facilityDaily } from '../rules/facilities';
import { postInterestOnReserves } from '../rules/reserves';
import { refreshPublicView } from '../views/publicView';
import { mirrorStabilizer, weeklyStabReport, type StabReportPort } from '../views/stabReport';
import { MACRO_SCREEN_VIEWS } from '../views/screens';
import { macroDayStep } from './dayStep';

const D = TICKS_PER_GAME_DAY;
/** Step 2.6 recompute order. */
export const RECOMPUTE_ORDER: readonly CurveRecomputeReason[] = ['RELEASE', 'CB_GUIDANCE', 'CB_DECISION', 'CB_MINUTES', 'FX_REGIME', 'RATING_ACTION'];
/** Unit decision: reserve rebalance orders once per day at the continuous-session open (tick 61); the function gates the 5-day window. */
export const REBALANCE_TICK_OF_DAY = 61;

type Marks = Record<BlocId, CurveRecomputeReason[]>;
const mark = (m: Marks, b: BlocId, r: CurveRecomputeReason): void => { if (!m[b].includes(r)) m[b].push(r); };

/** Step 2.3: CB guidance / decision / minutes ticks from this and the previous quarter's plan (minutes fall 14 days after the meeting). */
function cbStep(ctx: PhaseCtx, b: BlocId, m: Marks): void {
  const now = ctx.tick, q = quarterStartDay(Math.floor(now / D));
  for (const qs of [q - 91, q, q + 91]) {
    if (qs < 0) continue;
    const p = meetingPlan(b, qs, ctx.params);
    if (p.guidanceTick === now) { guidanceAt(ctx, b); mark(m, b, 'CB_GUIDANCE'); }
    if (p.meetingTick === now) {
      runMeeting(ctx, b, false, null); setCorridor(ctx, b); macroprudentialAtMeeting(ctx, b);
      if (b === 'PYN') realignAtMeeting(ctx, b);
      mark(m, b, 'CB_DECISION');
    }
    if (p.minutesTick === now) {
      const cb = ctx.store.get<CentralBank>(macroTables.cb.name, cbkId(b));
      const d = cb?.lastDecisions.find((x) => x.tick === p.meetingTick && !x.emergency);
      if (d) { minutesAt(ctx, b, d.meetingId); mark(m, b, 'CB_MINUTES'); }
    }
  }
  const cb = ctx.store.get<CentralBank>(macroTables.cb.name, cbkId(b));
  if (cb?.pendingEmergency?.tick === now) {   // E-100 (c): after releases, so this tick's prints are seen
    runMeeting(ctx, b, true, cb.pendingEmergency.triggers); setCorridor(ctx, b); mark(m, b, 'CB_DECISION');
  }
}

/** One P2 tick (card step 2, items 1–9). */
export function macroP2(ctx: PhaseCtx, ports: MacroPorts, stab: StabReportPort): void {
  const cal = ctx.cal, tod = cal.tickOfDay, m = {} as Marks;
  for (const b of BLOC_ORDER) m[b] = [];
  if (tod === 0) {                                                        // 2.1
    mirrorStabilizer(ctx);
    if (cal.boundaries.has('QUARTER_OPEN')) {
      writeQuarterSchedule(ctx, quarterStartDay(cal.gameDay) + 182);
      for (const b of BLOC_ORDER) planQuarter(ctx, b, ports);
    }
    if (cal.boundaries.has('CHAPTER_OPEN') && ctx.tick > 0) chapterStart(ctx);   // genesis ran the first chapter start
  }
  const due = releasesDue(ctx.store, ctx.tick);                           // 2.2
  for (const r of due.consensus) postConsensus(ctx, r.bloc, r);
  for (const r of due.publish) { publishRelease(ctx, r.bloc, r); mark(m, r.bloc, 'RELEASE'); }
  for (const b of BLOC_ORDER) cbStep(ctx, b, m);                          // 2.3
  announceDue(ctx, ports);                                                // 2.4
  for (const b of BLOC_ORDER) {                                           // 2.5 (RATING_ACTION: MISSING EXPORT T08 rating action; never marked)
    const bl = ctx.store.get<BlocMacroState>(macroTables.bloc.name, b), v = ctx.store.get<PublicMacroView>(macroTables.publicView.name, b);
    if (bl && v && bl.fx.regime !== v.fx.regime) mark(m, b, 'FX_REGIME');
  }
  for (const b of BLOC_ORDER) {                                           // 2.6
    if (m[b].length === 0) continue;
    for (const r of RECOMPUTE_ORDER) if (m[b].includes(r)) recomputeCurve(ctx, b, r);
    refreshPublicView(ctx, b);
  }
  if (tod % 30 === 0) { hourlyFsi(ctx, ports); hourlyFear(ctx, ports); }  // 2.7
  if (cal.weekday === 0 && tod === 45 && cal.gameDay > 0) weeklyStabReport(ctx, stab);   // 2.8 (T04-19: none on day 0)
  if (tod === D - 1) macroDayStep(ctx, ports);                            // 2.9
}

/** P6: auctions whose auctionTick is now and not yet cleared, in id order. */
export function macroP6(ctx: PhaseCtx, ports: MacroPorts): void {
  const due: SovAuction[] = [];
  for (const b of BLOC_ORDER) for (const a of ctx.store.index<SovAuction>(macroTables.auction.name, 'govId', govId(b))) if (a.auctionTick === ctx.tick && !a.result) due.push(a);
  due.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  for (const a of due) runAuction(ctx, a, ports);
}

/** P8 at t = 719. Coupons and redemptions are not posted here: main (T04-10/11) exports only the schedule sovCase.payments and
 *  fiscal.ts assigns payment to 06 ("06 pays coupons from the treasury"). MISSING EXPORT: 06 coupon/redemption posting. */
export function macroP8(ctx: PhaseCtx, ports: MacroPorts): void {
  if (ctx.cal.tickOfDay !== D - 1) return;
  for (const b of BLOC_ORDER) { facilityDaily(ctx, b); postInterestOnReserves(ctx, b, ports); remitProfit(ctx, b); }
}

export function macroPhases(ports: MacroPorts, stab: StabReportPort): Partial<Record<PhaseId, (ctx: PhaseCtx) => void>> {
  return {
    P2: (ctx) => macroP2(ctx, ports, stab),
    P4: (ctx) => {
      applyPoolFills(ctx, ports);
      const extra = ctx.cal.tickOfDay === REBALANCE_TICK_OF_DAY ? BLOC_ORDER.flatMap((b) => reserveRebalanceOrders(ctx, b, ports)) : [];
      writePoolOrders(ctx, ports, extra);
    },
    P6: (ctx) => macroP6(ctx, ports),
    P8: (ctx) => macroP8(ctx, ports),
  };
}
export const macroBoundaries: Partial<Record<Boundary, (ctx: PhaseCtx) => void>> = {};
export const MACRO_VIEWS: ViewHandler<any, any>[] = MACRO_SCREEN_VIEWS;
