// T04-02: macro calendar. Places every scheduled macro happening on the tick grid: CB meetings with guidance and minutes
// (04 §3.6.1, D056), data releases (04 §3.15.1) and sovereign auctions (04 §3.10.2). Pure, except writeQuarterSchedule.
// Trading days come only from 02 (T02-05) isTradingDay. That defaults to D071 (no holidays); every function takes the same trailing
// `holidays` flag so the D016 table can be switched on without changing callers.
import { GAME_DAYS_PER_GAME_YEAR, GAME_DAYS_PER_QUARTER, HOLIDAYS_ENABLED_DEFAULT, isTradingDay, MONTH_LENGTHS, TICKS_PER_GAME_DAY,
  EngineFault, type ParamsView, type Tick } from '@tycoon/engine-core';
import type { PhaseCtx } from '../core-port';
import { BLOC_DEFAULTS } from '../blocs';
import { BLOC_ORDER, macroTables, RELEASE_KINDS, TENORS, type BlocId, type ReleaseKind, type ReleaseSchedule, type Tenor } from '../schema';

const D = TICKS_PER_GAME_DAY;
const Q = GAME_DAYS_PER_QUARTER;
const Y = GAME_DAYS_PER_GAME_YEAR;
const mod = (a: number, n: number): number => ((a % n) + n) % n;
/** 02 isTradingDay; days before genesis (never scheduled, T04-06 skips them) use the weekday rule only. */
const td = (b: BlocId, d: number, h: boolean): boolean => (d >= 0 ? isTradingDay(b, d, h) : mod(d, 7) < 5);

export function quarterStartDay(dayIndex: number): number { return dayIndex - mod(mod(dayIndex, Y), Q); }
/** 28/28/35 pattern (MONTH_LENGTHS). */
export function monthStartDay(dayIndex: number): number {
  const q = quarterStartDay(dayIndex), dIQ = dayIndex - q;
  return q + (dIQ < 28 ? 0 : dIQ < 56 ? 28 : 56);
}
const monthOfYear0 = (day: number): number => { const dIY = mod(day, Y), dIQ = dIY % 91; return Math.floor(dIY / 91) * 3 + (dIQ < 28 ? 0 : dIQ < 56 ? 1 : 2); };
const monthLength = (monthStart: number): number => MONTH_LENGTHS[monthOfYear0(monthStart)]!;

export function tradingDaysOfPeriod(b: BlocId, startDay: number, lengthDays: number, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): number[] {
  const out: number[] = [];
  for (let d = startDay; d < startDay + lengthDays; d++) if (td(b, d, holidays)) out.push(d);
  return out;
}
/** n ≥ 1; n > count → last trading day of the period (§3.15.1 last sentence). */
export function nthTradingDay(b: BlocId, startDay: number, lengthDays: number, n: number, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): number {
  if (!Number.isInteger(n) || n < 1) throw new EngineFault('I0.macro_nth', `trading day n=${n}`);
  const days = tradingDaysOfPeriod(b, startDay, lengthDays, holidays);
  if (days.length === 0) throw new EngineFault('I0.macro_nth', `${b}: no trading day in [${startDay}, ${startDay + lengthDays})`);
  return days[Math.min(n, days.length) - 1]!;
}
const indexIn = (b: BlocId, d: number, start: number, h: boolean): number | null =>
  (td(b, d, h) ? tradingDaysOfPeriod(b, start, d - start + 1, h).length : null);
export function tradingDayIndexInQuarter(b: BlocId, dayIndex: number, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): number | null {
  return indexIn(b, dayIndex, quarterStartDay(dayIndex), holidays);
}
export function tradingDayIndexInMonth(b: BlocId, dayIndex: number, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): number | null {
  return indexIn(b, dayIndex, monthStartDay(dayIndex), holidays);
}
/** Used by fiscal rule checks (trading day 1 and 131 of the year). */
export function tradingDayIndexInYear(b: BlocId, dayIndex: number, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): number | null {
  return indexIn(b, dayIndex, dayIndex - mod(dayIndex, Y), holidays);
}
export function previousTradingDay(b: BlocId, dayIndex: number, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): number {
  let d = dayIndex - 1;
  while (!td(b, d, holidays)) d--;
  return d;
}
const nextTd = (b: BlocId, dayIndex: number, h: boolean): number => { let d = dayIndex + 1; while (!td(b, d, h)) d++; return d; };

// ───────── CB meetings (§3.6.1, D056) ─────────
export interface MeetingPlan { bloc: BlocId; quarterStartDay: number; meetingTick: Tick; guidanceTick: Tick; minutesTick: Tick }
const decisionTick = (p: ParamsView): number => {
  if (p.int('macro_cb_meetings_per_year') !== 4) throw new EngineFault('I0.macro_meetings', 'macro_cb_meetings_per_year must be 4 (fixed, D056)');
  return p.int('macro_cb_decision_tick');
};
export function meetingPlan(b: BlocId, quarterStart: number, params: ParamsView, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): MeetingPlan {
  const t = decisionTick(params);
  const day = nthTradingDay(b, quarterStart, Q, BLOC_DEFAULTS[b].meetingTradingDayOfQuarter, holidays);
  const g0 = day - 24, m0 = day + 14;   // guidanceLeadTicks = 24 × 720; minutes 14 game days after
  const g = td(b, g0, holidays) ? g0 : previousTradingDay(b, g0, holidays);
  const m = td(b, m0, holidays) ? m0 : nextTd(b, m0, holidays);
  return { bloc: b, quarterStartDay: quarterStart, meetingTick: day * D + t, guidanceTick: g * D + t, minutesTick: m * D + t };
}
const blocRank = (b: BlocId): number => BLOC_ORDER.indexOf(b);
/** All blocs, meetingTick in [fromTick, toTick), sorted by meetingTick then bloc order. */
export function meetingsInRange(fromTick: Tick, toTick: Tick, params: ParamsView, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): MeetingPlan[] {
  const out: MeetingPlan[] = [];
  for (let q = quarterStartDay(Math.max(0, Math.floor(fromTick / D))); q * D < toTick; q += Q) {
    for (const b of BLOC_ORDER) { const p = meetingPlan(b, q, params, holidays); if (p.meetingTick >= fromTick && p.meetingTick < toTick) out.push(p); }
  }
  return out.sort((x, y) => x.meetingTick - y.meetingTick || blocRank(x.bloc) - blocRank(y.bloc));
}

// ───────── data releases (§3.15.1) ─────────
export interface ScheduledRelease { bloc: BlocId; kind: ReleaseKind; tick: Tick; consensusTick: Tick; referencePeriod: { kind: 'MONTH' | 'QUARTER' | 'WEEK'; index: number } }
const MONTHLY: readonly [ReleaseKind, number, number][] = [['PMI', 1, 45], ['JOBS', 2, 45], ['RESERVES', 4, 300], ['CPI', 6, 45], ['RETAIL', 9, 45],
  ['TRADE', 12, 45], ['HOUSING', 14, 45], ['CREDIT', 16, 300]];
const monthIndex = (day: number): number => Math.floor(day / Y) * 12 + monthOfYear0(day);
const consensusTickOf = (b: BlocId, day: number, h: boolean): Tick => previousTradingDay(b, day, h) * D + 420;   // §3.15.2: 1 game day before at t = 420
const kindRank = (k: ReleaseKind): number => RELEASE_KINDS.indexOf(k);

/** Releases of one quarter (all blocs, every kind except CB_*). Monthly and quarterly prints measure the previous period; weekly the current week. */
function releasesOfQuarter(q: number, h: boolean): (ScheduledRelease & { day: number })[] {
  const out: (ScheduledRelease & { day: number })[] = [];
  for (const b of BLOC_ORDER) {
    const off = BLOC_DEFAULTS[b].releaseOffset;
    const push = (kind: ReleaseKind, day: number, tickOfDay: number, ref: ScheduledRelease['referencePeriod']): void => {
      if (ref.index < 0) return;   // no print measures a period before genesis
      out.push({ bloc: b, kind, day, tick: day * D + tickOfDay, consensusTick: consensusTickOf(b, day, h), referencePeriod: ref });
    };
    for (const ms of [q, q + 28, q + 56]) {
      const len = monthLength(ms);
      for (const [kind, n, t] of MONTHLY) push(kind, nthTradingDay(b, ms, len, n + off, h), t, { kind: 'MONTH', index: monthIndex(ms) - 1 });
    }
    for (let w = q; w < q + Q; w += 7) {   // weeks start on Mondays (every quarter starts on a Monday)
      const fri = w + 4;
      const day = td(b, fri, h) ? fri : tradingDaysOfPeriod(b, w, 7, h).at(-1);
      if (day !== undefined) push('SENTIMENT', day, 300, { kind: 'WEEK', index: Math.floor(w / 7) });
    }
    const prevQ = Math.floor(q / Q) - 1;
    const adv = nthTradingDay(b, q, Q, 10 + off, h);
    push('GDP_ADV', adv, 45, { kind: 'QUARTER', index: prevQ });
    push('GDP_REV1', nthTradingDay(b, adv + 1, Q, 20, h), 45, { kind: 'QUARTER', index: prevQ });
    push('GDP_REV2', nthTradingDay(b, adv + 1, Q, 40, h), 45, { kind: 'QUARTER', index: prevQ });
    push('FISCAL', nthTradingDay(b, q, Q, 15 + off, h), 300, { kind: 'QUARTER', index: prevQ });
  }
  return out;
}
/** §3.15.1 rows except CB_* (those come from meetingPlan); release day in [fromDay, toDay); sorted by tick, bloc order, kind order. */
export function releasesInRange(fromDay: number, toDay: number, params: ParamsView, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): ScheduledRelease[] {
  void params;
  const out: ScheduledRelease[] = [];
  for (let q = quarterStartDay(Math.max(0, fromDay)); q < toDay; q += Q) {
    for (const r of releasesOfQuarter(q, holidays)) if (r.day >= fromDay && r.day < toDay) out.push({ bloc: r.bloc, kind: r.kind, tick: r.tick, consensusTick: r.consensusTick, referencePeriod: r.referencePeriod });
  }
  return out.sort((x, y) => x.tick - y.tick || blocRank(x.bloc) - blocRank(y.bloc) || kindRank(x.kind) - kindRank(y.kind));
}

// ───────── sovereign auctions (§3.10.2) ─────────
export interface ScheduledAuction { bloc: BlocId; tenor: Tenor; dayIndex: number; auctionTick: Tick; announceTick: Tick; bidOpenTick: Tick;
  newLine: boolean; syndicated: boolean; fxDenominated: boolean }
/** STUB (E-51 AC-04-02-ZEROSHARE): tenors with a zero issuance share (§3.10.1, the two 0% rows: SC N30Y, L10Y). Replaced by the T04-11 mix table (AC-04-11-MIXSTUB). */
const ZERO_SHARE: Readonly<Partial<Record<BlocId, readonly Tenor[]>>> = { SRL: ['N30Y', 'L10Y'] };
const tenorRank = (t: Tenor): number => TENORS.indexOf(t);

export function auctionsInQuarter(b: BlocId, quarterStart: number, params: ParamsView, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): ScheduledAuction[] {
  const at = params.int('macro_auction_tick'), ann = params.int('macro_auction_announce_tick');   // E-51: own key (value 420, §3.10.2)
  const h = holidays, off = BLOC_DEFAULTS[b].releaseOffset, zero = ZERO_SHARE[b] ?? [];
  const out: ScheduledAuction[] = [];
  const add = (tenor: Tenor, day: number, x: { newLine?: boolean; syndicated?: boolean; fxDenominated?: boolean } = {}): void => {
    if (zero.includes(tenor)) return;
    let a = day; for (let i = 0; i < 3; i++) a = previousTradingDay(b, a, h);   // 3 bloc trading days before
    out.push({ bloc: b, tenor, dayIndex: day, auctionTick: day * D + at, announceTick: a * D + ann, bidOpenTick: a * D + ann,
      newLine: x.newLine ?? false, syndicated: x.syndicated ?? false, fxDenominated: x.fxDenominated ?? false });
  };
  for (let w = quarterStart; w < quarterStart + Q; w += 7) {   // Mondays
    const day = td(b, w, h) ? w : nextTd(b, w, h);
    add('B3M', day); add('B6M', day);
    if ((Math.floor(mod(w, Y) / 7) + 1) % 4 === 0) add('B1Y', day);   // weekOfYear ≡ 0 (mod 4)
  }
  const months = [quarterStart, quarterStart + 28, quarterStart + 56];
  months.forEach((ms, i) => {
    const len = monthLength(ms);
    add('N2Y', nthTradingDay(b, ms, len, 8 + off, h)); add('N5Y', nthTradingDay(b, ms, len, 8 + off, h));
    add('N10Y', nthTradingDay(b, ms, len, 10 + off, h), { newLine: i === 0 });
  });
  add('N30Y', nthTradingDay(b, months[1]!, monthLength(months[1]!), 12, h));                   // quarterly reopening
  if (mod(quarterStart, Y) === 0) add('N30Y', nthTradingDay(b, quarterStart, Q, 20, h), { newLine: true, syndicated: true });   // DEFAULT (card): Q1, trading day 20
  add('L10Y', nthTradingDay(b, months[2]!, monthLength(months[2]!), 12, h));
  if (b === 'SRL') add('N10Y', nthTradingDay(b, months[0]!, monthLength(months[0]!), 20, h), { newLine: true, syndicated: true, fxDenominated: true });   // "SRL Global FDL 10Y"
  return out.sort((x, y) => x.auctionTick - y.auctionTick || tenorRank(x.tenor) - tenorRank(y.tenor) || Number(x.fxDenominated) - Number(y.fxDenominated));
}
export function auctionsCountInQuarter(b: BlocId, quarterStart: number, tenor: Tenor, params: ParamsView, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): number {
  return auctionsInQuarter(b, quarterStart, params, holidays).filter((a) => a.tenor === tenor).length;
}

// ───────── within-tick order (Producer ruling on #21) ─────────
/** On a CB meeting day the auction announcement shares t = 420 with the rate decision: the decision orders FIRST, the announcement SECOND. */
export const WITHIN_TICK_RANK = { CB_DECISION: 0, AUCTION_ANNOUNCE: 1 } as const;
export type TickHappening =
  | { kind: 'CB_DECISION'; tick: Tick; bloc: BlocId }
  | { kind: 'AUCTION_ANNOUNCE'; tick: Tick; bloc: BlocId; auction: ScheduledAuction };
/** CB decisions and auction announcements of every bloc in [fromTick, toTick), sorted by the deterministic key
 *  (tick, WITHIN_TICK_RANK, BLOC_ORDER, tenor, fxDenominated). */
export function happeningsInRange(fromTick: Tick, toTick: Tick, params: ParamsView, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): TickHappening[] {
  const out: TickHappening[] = [];
  for (const m of meetingsInRange(fromTick, toTick, params, holidays)) out.push({ kind: 'CB_DECISION', tick: m.meetingTick, bloc: m.bloc });
  const q0 = quarterStartDay(Math.floor(fromTick / D)), q1 = quarterStartDay(Math.floor(toTick / D)) + 2 * Q;   // announcements run up to 3 trading days ahead
  for (let q = q0; q <= q1; q += Q) for (const b of BLOC_ORDER) for (const a of auctionsInQuarter(b, q, params, holidays))
    if (a.announceTick >= fromTick && a.announceTick < toTick) out.push({ kind: 'AUCTION_ANNOUNCE', tick: a.announceTick, bloc: b, auction: a });
  const key = (h: TickHappening): number[] => [h.tick, WITHIN_TICK_RANK[h.kind], BLOC_ORDER.indexOf(h.bloc),
    h.kind === 'AUCTION_ANNOUNCE' ? tenorRank(h.auction.tenor) : -1, h.kind === 'AUCTION_ANNOUNCE' ? Number(h.auction.fxDenominated) : 0];
  return out.sort((x, y) => { const a = key(x), b = key(y); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!; return 0; });
}

// ───────── UTC bands ─────────
/** 0..23 on the planned map sealUtcMs + (k − tick)·5000 ms; bigint math, never Date. */
export function utcHourOfTick(header: { tick: Tick; sealUtcMs: bigint }, k: Tick): number {
  const ms = header.sealUtcMs + BigInt(k - header.tick) * 5000n;
  return Number((((ms % 86_400_000n) + 86_400_000n) % 86_400_000n) / 3_600_000n);
}
/** 00–08, 08–16, 16–24. */
export function utcBandOf(hour: number): 0 | 1 | 2 { return hour < 8 ? 0 : hour < 16 ? 1 : 2; }

// ───────── schedule rows ─────────
/** mac.schedule rows for the quarter (all blocs): releases and CB_GUIDANCE / CB_DECISION / CB_MINUTES; id `${bloc}:${kind}:${tick}`; idempotent.
 *  Auctions are not ReleaseKinds and are never written here: readers call auctionsInQuarter (E-51 AC-04-02-SCHEDULE). */
export function writeQuarterSchedule(ctx: PhaseCtx, quarterStart: number, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): void {
  const T = macroTables.schedule.name;
  const rows: (ReleaseSchedule & { id: string })[] = [];
  for (const r of releasesInRange(quarterStart, quarterStart + Q, ctx.params, holidays)) {
    const rule = r.referencePeriod.kind === 'MONTH' ? 'MONTHLY_DAY' : r.referencePeriod.kind === 'QUARTER' ? 'QUARTERLY_DAY' : 'WEEKLY_DAY';
    const day = Math.floor(r.tick / D);
    const start = rule === 'MONTHLY_DAY' ? monthStartDay(day) : rule === 'QUARTERLY_DAY' ? quarterStartDay(day) : day - mod(day, 7);
    rows.push({ id: `${r.bloc}:${r.kind}:${r.tick}`, bloc: r.bloc, kind: r.kind, rule, dayOffset: day - start, tickOfDay: r.tick % D });
  }
  for (const b of BLOC_ORDER) {
    const p = meetingPlan(b, quarterStart, ctx.params, holidays);
    for (const [kind, tick] of [['CB_GUIDANCE', p.guidanceTick], ['CB_DECISION', p.meetingTick], ['CB_MINUTES', p.minutesTick]] as const) {
      if (tick < 0) continue;   // before genesis (first NKR guidance)
      const day = Math.floor(tick / D);
      rows.push({ id: `${b}:${kind}:${tick}`, bloc: b, kind, rule: 'QUARTERLY_DAY', dayOffset: day - quarterStart, tickOfDay: tick % D });
    }
  }
  for (const r of rows) if (ctx.store.get(T, r.id) === undefined) ctx.store.put(T, r);
}
