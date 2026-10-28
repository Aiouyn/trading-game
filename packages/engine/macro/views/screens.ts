// T04-19: 04's screen read models (04 §7). Handlers read public sources only (mac.public_view, published release rows, auction
// results, mac.schedule, public event views) and, for SEALED rows, copy named public fields one by one. Every output passes
// assertNoHiddenFields (04#15). Store "now" is mac.global.tick (StoreRead carries no tick).
import { EngineFault, fromMoney, GAME_DAYS_PER_GAME_YEAR, TICKS_PER_GAME_DAY, type Id, type StoreRead, type Tick, type ViewerContext, type ViewHandler } from '@tycoon/engine-core';
import { govId } from '@tycoon/engine-ledger';
import { z } from 'zod';
import { blocOfEntity } from '../ids';
import { BLOC_ORDER, macroTables, RELEASE_KINDS, type AuctionBid, type BlocId, type BlocMacroState, type CentralBank, type ConcordFacility, type CurveState,
  type DailyHistoryRow, type FacilityLoan, type GlobalMacroState, type PrimaryDealerStatus, type PublicMacroView,
  type SovAuction, type SovereignIssue, type SovExchangeVote } from '../schema';
import { leagueTable } from '../rules/dealers';
import { sovereignStatus } from '../rules/default';
import { restructuringTerms } from '../rules/restructuring';
import { activeWorldEvents } from '../rules/phases';
import type { CbDecisionRow } from '../rules/cb';
import { buildWeeklyReport, formatMoneyVsPath, leverDirection, type StabWeeklyReport } from './stabReport';
import { ledStab, LEVER_KEYS } from './ledgerSources';

const D = TICKS_PER_GAME_DAY, Y = GAME_DAYS_PER_GAME_YEAR;
const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const blocIdx = (b: BlocId | null): number => (b === null ? -1 : BLOC_ORDER.indexOf(b));
const blocZ = z.enum(['FDL', 'EUN', 'PYN', 'NKR', 'SRL']);
const blocOrAll = z.union([blocZ, z.literal('ALL')]);
const blocsOf = (b: BlocId | 'ALL'): readonly BlocId[] => (b === 'ALL' ? BLOC_ORDER : [b]);
const nowOf = (s: StoreRead): Tick => s.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL')?.tick ?? 0;
const pv = (s: StoreRead, b: BlocId): (PublicMacroView & { id: BlocId }) | undefined => s.get<PublicMacroView & { id: BlocId }>(macroTables.publicView.name, b);
const yAt = (c: readonly { tenorYears: number; yield: number }[], t: number): number => c.find((p) => p.tenorYears === t)?.yield ?? 0;
const tickOfId = (id: string): Tick => Number(id.slice(id.lastIndexOf(':') + 1));

// ───────── types (card exports) ─────────
export interface CalendarRow { tick: Tick; bloc: BlocId | null; kind: 'RELEASE' | 'CB_MEETING' | 'CB_GUIDANCE' | 'AUCTION' | 'CRISIS_WEEK' | 'CAPCON_EXPIRY';
  ref: string; consensus: Record<string, number> | null; offeredFace: string | null }
export interface DashboardView { rows: PublicMacroView[]; history: Pick<DailyHistoryRow, 'gameDay' | 'realGdpIndex' | 'cpiLevel' | 'policyRate' | 'y10' | 'spotVsFdl'>[] }
export interface CentralBankView { bloc: BlocId; governorNpcId: Id | null; policyRateHistory: { tick: Tick; rate: number }[]; corridor: { deposit: number; policy: number; lending: number };
  decisions: { tick: Tick; statementKey: string; votes: { voteFor: number; voteAgainst: number; dissent: { higher: number; lower: number } } }[]; guidance: PublicMacroView['guidance']; dots: PublicMacroView['dots'];
  marketImpliedPath: PublicMacroView['marketImpliedPath']; qeHoldingsGdp: number; qePace: number; yccCap: number | null; swapLines: BlocId[]; reserveRequirement: number;
  ccyb: number; ltvCapResidential: number; ltvCapCommercial: number; credibilityPublic: number; nextMeeting: PublicMacroView['nextMeeting']; minutes: { tick: Tick; key: string }[] }
export interface RatesView { curves: { bloc: BlocId; curve: PublicMacroView['curve']; prior: PublicMacroView['curve'] | null; ois: PublicMacroView['ois'];
  termPremium10y: number; breakeven10y: number; spread2s10s: number; inverted: boolean; basis: number }[]; carry: { bloc: BlocId; carry3m: number }[] }
export interface SovereignsView { rows: { bloc: BlocId; debtGdp: number; deficitGdp: number; maturityWall: { year: number; face: string }[]; spread10y: number; pd1y: number;
  grades: string[]; status: ReturnType<typeof sovereignStatus>; exchangeOffer: ReturnType<typeof restructuringTerms>; cacTally: { accept: string; reject: string } | null;
  concord: { programId: string; tranchesPaid: number } | null }[]; auctions: { auctionId: string; bloc: BlocId; tick: Tick; cover: number; tailBp: number }[] }
export interface SystemView { fearIndex: number; riskAppetite: number; fsi: number; fsiComponents: Record<string, number>; events: ReturnType<typeof activeWorldEvents> }
export interface StabilizerView { msi: number; levers: Record<string, { value: number; direction: -1 | 0 | 1 }>; e: number; eLabel: string; weekly: StabWeeklyReport | null }
export interface AuctionTicketView { auction: { id: string; govId: string; tick: Tick; announceTick: Tick; offeredFace: string } & { wiYield: number }; ownBids: AuctionBid[]; ownResult: unknown | null }
export interface BankConsoleView { tab: 'CENTRAL_BANK' | 'PRIMARY_DEALER'; facilities: FacilityLoan[]; reserves: string; required: string; iorEstimate: string; ela: boolean;
  dealer: PrimaryDealerStatus | null }

// ───────── macro.calendar (MKT-02) ─────────
const CB_KIND: Readonly<Record<string, CalendarRow['kind']>> = Object.freeze({ CB_DECISION: 'CB_MEETING', CB_GUIDANCE: 'CB_GUIDANCE' });
export function calendarRows(s: StoreRead, fromDay: number, toDay: number): CalendarRow[] {
  const lo = fromDay * D, hi = (toDay + 1) * D, now = nowOf(s), out: CalendarRow[] = [];
  const inRange = (t: Tick): boolean => t >= lo && t < hi;
  for (const r of s.iter<{ id: string; bloc: BlocId; kind: string }>(macroTables.schedule.name)) {
    const t = tickOfId(r.id);
    if (!inRange(t)) continue;
    if ((RELEASE_KINDS as readonly string[]).includes(r.kind)) {
      const rel = s.get<{ consensus: number; consensusDispersion: number }>(macroTables.release.name, `rel_${r.bloc}_${r.kind}_${t}`);   // written at consensusTick
      out.push({ tick: t, bloc: r.bloc, kind: 'RELEASE', ref: r.kind, consensus: rel ? { consensus: rel.consensus, dispersion: rel.consensusDispersion } : null, offeredFace: null });
    } else if (CB_KIND[r.kind]) out.push({ tick: t, bloc: r.bloc, kind: CB_KIND[r.kind]!, ref: r.id, consensus: null, offeredFace: null });
  }
  for (const a of s.iter<SovAuction>(macroTables.auction.name)) {
    const b = blocOfEntity(a.govId);
    if (b && a.announceTick <= now && inRange(a.auctionTick)) out.push({ tick: a.auctionTick, bloc: b, kind: 'AUCTION', ref: a.id, consensus: null, offeredFace: a.offeredFace.toString() });
  }
  const cw = s.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL')?.scheduler.crisisWeek ?? null;
  if (cw && cw.announcedTick <= now && inRange(cw.startTick)) out.push({ tick: cw.startTick, bloc: null, kind: 'CRISIS_WEEK', ref: 'CRISIS_WEEK', consensus: null, offeredFace: null });
  for (const b of BLOC_ORDER) {
    const fx = s.get<BlocMacroState>(macroTables.bloc.name, b)?.fx;
    if (fx && fx.capitalControls > 0 && fx.capitalControlsUntilTick !== undefined && inRange(fx.capitalControlsUntilTick))
      out.push({ tick: fx.capitalControlsUntilTick, bloc: b, kind: 'CAPCON_EXPIRY', ref: `CAPCON_${fx.capitalControls}`, consensus: null, offeredFace: null });
  }
  return out.sort((x, y) => x.tick - y.tick || blocIdx(x.bloc) - blocIdx(y.bloc) || cmpStr(x.kind, y.kind) || cmpStr(x.ref, y.ref));
}
export const viewMacroCalendar: ViewHandler<{ fromDay: number; toDay: number }, CalendarRow[]> = {
  id: 'macro.calendar', schema: z.strictObject({ fromDay: z.number().int().nonnegative(), toDay: z.number().int().nonnegative() }),
  run: (s, a) => calendarRows(s, a.fromDay, a.toDay) };

// ───────── macro.dashboard (MKT-03) ─────────
export const viewMacroDashboard: ViewHandler<{ bloc: BlocId | 'ALL' }, DashboardView> = {
  id: 'macro.dashboard', schema: z.strictObject({ bloc: blocOrAll }),
  run: (s, a) => {
    const rows: PublicMacroView[] = [];
    for (const b of blocsOf(a.bloc)) { const v = pv(s, b); if (v) rows.push(v); }
    const key = a.bloc === 'ALL' ? 'GLOBAL' : a.bloc, history: DashboardView['history'] = [];
    for (const h of s.iter<DailyHistoryRow>(macroTables.history.name)) if (h.bloc === key)
      history.push({ gameDay: h.gameDay, realGdpIndex: h.realGdpIndex, cpiLevel: h.cpiLevel, policyRate: h.policyRate, y10: h.y10, spotVsFdl: h.spotVsFdl });
    return { rows, history: history.sort((x, y) => x.gameDay - y.gameDay) };
  } };

// ───────── macro.cb (MKT-04) ─────────
export function centralBankView(s: StoreRead, b: BlocId): CentralBankView {
  const cb = s.get<CentralBank>(macroTables.cb.name, b), v = pv(s, b), bl = s.get<BlocMacroState>(macroTables.bloc.name, b), now = nowOf(s);
  if (!cb || !v || !bl) throw new EngineFault('MAC_STATE_MISSING', `macro.cb ${b}`, [b]);
  const lag = cb.meetings.minutesLagTicks, ds = (cb.lastDecisions as CbDecisionRow[]).filter((d) => d.tick <= now).sort((x, y) => x.tick - y.tick);
  const minutesOut = (d: CbDecisionRow): boolean => d.tick + lag <= now;
  const gdp = fromMoney(bl.nominalGdp), swaps: BlocId[] = [];
  for (const l of cb.swapLinesOut) { const c = blocOfEntity(l.counterpartyCbk); if (l.active && c) swaps.push(c); }
  return { bloc: b, governorNpcId: cb.governorNpcId, policyRateHistory: ds.map((d) => ({ tick: d.tick, rate: d.newRate })),
    corridor: { deposit: v.depositRate, policy: v.policyRate, lending: v.lendingRate },
    decisions: ds.map((d) => ({ tick: d.tick, statementKey: d.statementKey, votes: { voteFor: d.voteFor, voteAgainst: d.voteAgainst,
      dissent: minutesOut(d) ? { higher: d.dissentHigher, lower: d.dissentLower } : { higher: 0, lower: 0 } } })),
    guidance: v.guidance, dots: v.dots, marketImpliedPath: v.marketImpliedPath, qeHoldingsGdp: v.qeHoldingsGdp,
    qePace: gdp > 0 ? fromMoney(cb.qe.purchasesPerMonth) / gdp : 0, yccCap: cb.ycc?.active ? cb.ycc.capYield : null,
    swapLines: swaps.sort((x, y) => blocIdx(x) - blocIdx(y)), reserveRequirement: v.reserveRequirement, ccyb: v.ccyb,
    ltvCapResidential: v.ltvCapResidential, ltvCapCommercial: v.ltvCapCommercial, credibilityPublic: v.credibilityPublic, nextMeeting: v.nextMeeting,
    minutes: ds.filter(minutesOut).map((d) => ({ tick: d.tick + lag, key: d.meetingId })) };
}
export const viewCentralBank: ViewHandler<{ bloc: BlocId }, CentralBankView> = { id: 'macro.cb', schema: z.strictObject({ bloc: blocZ }), run: (s, a) => centralBankView(s, a.bloc) };

// ───────── macro.rates (MKT-05) ─────────
export function ratesView(s: StoreRead, sel: BlocId | 'ALL'): RatesView {
  const curves: RatesView['curves'] = [], carry: RatesView['carry'] = [], fdl = pv(s, 'FDL')?.curve ?? [];
  for (const b of blocsOf(sel)) {
    const v = pv(s, b);
    if (!v) continue;
    const spread = yAt(v.curve, 10) - yAt(v.curve, 2);
    curves.push({ bloc: b, curve: v.curve, prior: null, ois: v.ois, termPremium10y: v.termPremium10y, breakeven10y: v.breakeven10y,
      spread2s10s: spread, inverted: spread < 0, basis: s.get<CurveState>(macroTables.curve.name, b)?.basis ?? 0 });
    carry.push({ bloc: b, carry3m: yAt(v.curve, 0.25) - yAt(fdl, 0.25) });
  }
  return { curves, carry };
}
export const viewRates: ViewHandler<{ bloc: BlocId | 'ALL' }, RatesView> = { id: 'macro.rates', schema: z.strictObject({ bloc: blocOrAll }), run: (s, a) => ratesView(s, a.bloc) };

// ───────── macro.sovereigns (MKT-06) ─────────
export function sovereignsView(s: StoreRead, sel: BlocId | 'ALL'): SovereignsView {
  const now = nowOf(s), rows: SovereignsView['rows'] = [], auctions: SovereignsView['auctions'] = [];
  const csf = s.get<ConcordFacility>(macroTables.csf.name, 'npc_CSF');
  for (const b of blocsOf(sel)) {
    const v = pv(s, b);
    if (!v) continue;
    const gov = govId(b), wall: { year: number; face: bigint }[] = [];
    for (const i of s.iter<SovereignIssue & { id: string }>(macroTables.issue.name)) if (i.govId === gov && i.faceOutstanding > 0n) {
      const year = Math.floor(i.maturityTick / (Y * D)), w = wall.find((x) => x.year === year);
      if (w) w.face += i.faceOutstanding; else wall.push({ year, face: i.faceOutstanding });
    }
    const maturityWall = wall.sort((x, y) => x.year - y.year).map((w) => ({ year: w.year, face: w.face.toString() }));
    const offer = restructuringTerms(s, gov, now);
    let tally: { accept: string; reject: string } | null = null;
    if (offer) {
      let acc = 0n, rej = 0n;
      for (const x of s.iter<SovExchangeVote>(macroTables.vote.name)) if (x.offerId === offer.id) { if (x.vote === 'ACCEPT') acc += x.face; else rej += x.face; }
      tally = { accept: acc.toString(), reject: rej.toString() };
    }
    const prog = csf?.programs.find((p) => p.bloc === b && p.closedTick === undefined && p.endTick > now) ?? null;
    rows.push({ bloc: b, debtGdp: v.fiscalPrints.debtGdp, deficitGdp: v.fiscalPrints.deficitGdp, maturityWall,
      spread10y: v.sovereignSpread10y, pd1y: v.sovereignPd1y, grades: [], status: sovereignStatus(s, gov), exchangeOffer: offer, cacTally: tally,
      concord: prog ? { programId: prog.id ?? '', tranchesPaid: prog.tranchesPaid ?? 0 } : null });
    for (const a of s.index<SovAuction>(macroTables.auction.name, 'govId', gov))
      if (a.result) auctions.push({ auctionId: a.id, bloc: b, tick: a.auctionTick, cover: a.result.bidToCover, tailBp: a.result.tailBp });
  }
  return { rows, auctions: auctions.sort((x, y) => x.tick - y.tick || blocIdx(x.bloc) - blocIdx(y.bloc) || cmpStr(x.auctionId, y.auctionId)) };
}
export const viewSovereigns: ViewHandler<{ bloc: BlocId | 'ALL' }, SovereignsView> = { id: 'macro.sovereigns', schema: z.strictObject({ bloc: blocOrAll }), run: (s, a) => sovereignsView(s, a.bloc) };

// ───────── macro.system (MKT-07) ─────────
export const viewSystem: ViewHandler<Record<string, never>, SystemView> = {
  id: 'macro.system', schema: z.strictObject({}),
  run: (s) => {
    const g = s.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL');
    return { fearIndex: g?.fearIndex ?? 0, riskAppetite: g?.riskAppetite ?? 0, fsi: g?.financialStressIndex ?? 0, fsiComponents: {}, events: g ? activeWorldEvents(s) : [] };
  } };

// ───────── macro.stabilizer (MKT-08) ─────────
export function stabilizerView(s: StoreRead): StabilizerView {
  const m = s.get<{ msi: number; errorLog: number; lastPublishedReportTick: Tick; diagnostics: { npcToPlayerWealthRatio: number } }>(macroTables.stab.name, 'STAB');
  const led = ledStab(s), levers: StabilizerView['levers'] = {};
  const h = led?.history ?? [], last = h[h.length - 1], ago = last ? h.find((x) => x.dayIndex === last.dayIndex - 7) : undefined;
  if (last) for (const k of LEVER_KEYS) levers[k] = { value: last.levers[k], direction: ago ? leverDirection(last.levers[k], ago.levers[k]) : 0 };
  const e = m?.errorLog ?? 0, rt = m?.lastPublishedReportTick ?? -1;
  return { msi: m?.msi ?? 0, levers, e, eLabel: formatMoneyVsPath(e),
    weekly: rt >= 0 ? buildWeeklyReport(s, Math.floor(rt / D) - 1, m!.diagnostics.npcToPlayerWealthRatio) : null };
}
export const viewStabilizer: ViewHandler<Record<string, never>, StabilizerView> = { id: 'macro.stabilizer', schema: z.strictObject({}), run: (s) => stabilizerView(s) };

// ───────── macro.auctionTicket (OWNER) ─────────
const owns = (v: ViewerContext, id: Id): boolean => v.viewerId === id || v.partyOf([id]);
export function auctionTicketView(s: StoreRead, auctionId: string, viewer: ViewerContext): AuctionTicketView | null {
  const a = s.get<SovAuction>(macroTables.auction.name, auctionId);
  if (!a || a.announceTick > nowOf(s)) return null;
  const own = [...s.index<AuctionBid & { id: string }>(macroTables.bid.name, 'auctionId', auctionId)].filter((b) => owns(viewer, b.bidderId))
    .map(({ id: _id, ...b }) => b).sort((x, y) => cmpStr(x.bidId, y.bidId));
  return { auction: { id: a.id, govId: a.govId, tick: a.auctionTick, announceTick: a.announceTick, offeredFace: a.offeredFace.toString(), wiYield: a.whenIssuedYield ?? 0 },
    ownBids: own, ownResult: a.result && own.length > 0 ? { stopYield: a.result.stopYield, allotmentAtStopPct: a.result.allotmentAtStopPct, failed: a.result.failed } : null };
}
export const viewAuctionTicket: ViewHandler<{ auctionId: string }, AuctionTicketView | null> = {
  id: 'macro.auctionTicket', schema: z.strictObject({ auctionId: z.string().min(1) }), run: (s, a, v) => auctionTicketView(s, a.auctionId, v) };

// ───────── macro.bankConsole (OWNER) ─────────
export function bankConsoleView(s: StoreRead, bankId: Id, tab: BankConsoleView['tab'], viewer: ViewerContext): BankConsoleView {
  const mine = owns(viewer, bankId);
  const fac = mine ? [...s.index<FacilityLoan>(macroTables.facility.name, 'bankId', bankId)].sort((x, y) => cmpStr(x.id, y.id)) : [];
  let dealer: PrimaryDealerStatus | null = null;
  if (mine) for (const b of BLOC_ORDER) { const d = s.get<PrimaryDealerStatus>(macroTables.dealer.name, `${b}:${bankId}`); if (d) { dealer = d; break; } }
  // MISSING EXPORT: T03 store-readable reserve balance / requirement / IOR accrual for a bank; "0" until it lands.
  return { tab, facilities: fac, reserves: '0', required: '0', iorEstimate: '0', ela: fac.some((f) => f.kind === 'ELA' && f.status === 'OPEN'), dealer };
}
export const viewBankConsole: ViewHandler<{ bankId: Id; tab: 'CENTRAL_BANK' | 'PRIMARY_DEALER' }, BankConsoleView> = {
  id: 'macro.bankConsole', schema: z.strictObject({ bankId: z.string().min(1) as unknown as z.ZodType<Id>, tab: z.enum(['CENTRAL_BANK', 'PRIMARY_DEALER']) }),
  run: (s, a, v) => bankConsoleView(s, a.bankId, a.tab, v) };

// ───────── macro.dealerLeague ─────────
export const viewDealerLeague: ViewHandler<{ bloc: BlocId; quarter: number }, ReturnType<typeof leagueTable>> = {
  id: 'macro.dealerLeague', schema: z.strictObject({ bloc: blocZ, quarter: z.number().int().nonnegative() }), run: (s, a) => leagueTable(s, a.bloc, a.quarter) };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogenous handler list (card export)
export const MACRO_SCREEN_VIEWS: ViewHandler<any, any>[] = [viewMacroCalendar, viewMacroDashboard, viewCentralBank, viewRates, viewSovereigns, viewSystem,
  viewStabilizer, viewAuctionTicket, viewBankConsole, viewDealerLeague];
