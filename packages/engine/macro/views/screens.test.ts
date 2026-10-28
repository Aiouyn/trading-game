import { describe, expect, it } from 'vitest';
import { assertNoHiddenFields } from '../events';
import { macroTables, type PublicMacroView } from '../schema';
import { leagueTable } from '../rules/dealers';
import { curveOf, seed03, setNow, viewer, viewWorld } from '../testkit/viewWorld';
import { MACRO_SCREEN_VIEWS, viewAuctionTicket, viewBankConsole, viewCentralBank, viewDealerLeague, viewMacroCalendar, viewRates, viewSovereigns, viewStabilizer } from './screens';
import { weeklyStabReport, NULL_STAB_REPORT } from './stabReport';

const D = 720;
const anyone = viewer(null);

describe('T04-19 screens', () => {
  it('exports the 10 handlers in card order', () => {
    expect(MACRO_SCREEN_VIEWS.map((v) => v.id)).toEqual(['macro.calendar', 'macro.dashboard', 'macro.cb', 'macro.rates', 'macro.sovereigns', 'macro.system',
      'macro.stabilizer', 'macro.auctionTicket', 'macro.bankConsole', 'macro.dealerLeague']);
  });
  it('calendar: consensus null at tick 39, shown from 40; the actual never appears before 100', () => {
    const w = viewWorld(39);
    w.put(macroTables.schedule.name, { id: 'EUN:CPI:100', bloc: 'EUN', kind: 'CPI' } as never);
    w.put(macroTables.schedule.name, { id: 'FDL:CB_DECISION:100', bloc: 'FDL', kind: 'CB_DECISION' } as never);
    w.put(macroTables.schedule.name, { id: 'FDL:CB_MINUTES:100', bloc: 'FDL', kind: 'CB_MINUTES' } as never);
    const run = () => viewMacroCalendar.run(w.ctx.store, { fromDay: 0, toDay: 0 }, anyone);
    expect(run()).toEqual([
      { tick: 100, bloc: 'FDL', kind: 'CB_MEETING', ref: 'FDL:CB_DECISION:100', consensus: null, offeredFace: null },
      { tick: 100, bloc: 'EUN', kind: 'RELEASE', ref: 'CPI', consensus: null, offeredFace: null }]);
    setNow(w, 40);
    w.put(macroTables.release.name, { id: 'rel_EUN_CPI_100', bloc: 'EUN', kind: 'CPI', consensus: 0.021, consensusDispersion: 0.002, trueValue: 0.0234, actual: 0, pending: true } as never);
    expect(run()[1]!.consensus).toEqual({ consensus: 0.021, dispersion: 0.002 });
    for (const t of [40, 99]) { setNow(w, t); expect(JSON.stringify(MACRO_SCREEN_VIEWS.map((v) => v.id === 'macro.calendar' ? run() : null))).not.toMatch(/0\.0234|actual/); }
    expect(viewMacroCalendar.run(w.ctx.store, { fromDay: 1, toDay: 3 }, anyone)).toEqual([]);
  });
  it('calendar: auctions after announce, crisis week after announcement, capcon expiry only when active; sorted', () => {
    const w = viewWorld(10);
    w.put(macroTables.auction.name, { id: 'auc_2', govId: 'gov_PYN', announceTick: 5, auctionTick: 300, offeredFace: 7n } as never);
    w.put(macroTables.auction.name, { id: 'auc_1', govId: 'gov_FDL', announceTick: 11, auctionTick: 300, offeredFace: 7n } as never);
    const g = w.ctx.store.get<{ scheduler: object }>(macroTables.global.name, 'GLOBAL')!;
    w.put(macroTables.global.name, { ...g, scheduler: { ...g.scheduler, crisisWeek: { announcedTick: 20, startTick: 200, endTick: 900 } } } as never);
    const b = w.ctx.store.get<{ fx: object }>(macroTables.bloc.name, 'SRL')!;
    w.put(macroTables.bloc.name, { ...b, fx: { ...b.fx, capitalControls: 2, capitalControlsUntilTick: 400 } } as never);
    const ids = () => viewMacroCalendar.run(w.ctx.store, { fromDay: 0, toDay: 0 }, anyone).map((r) => `${r.tick}:${r.kind}:${r.ref}`);
    expect(ids()).toEqual(['300:AUCTION:auc_2', '400:CAPCON_EXPIRY:CAPCON_2']);
    setNow(w, 20);
    expect(ids()).toEqual(['200:CRISIS_WEEK:CRISIS_WEEK', '300:AUCTION:auc_1', '300:AUCTION:auc_2', '400:CAPCON_EXPIRY:CAPCON_2']);
  });
  it('rates: 0.031/0.029 → −0.002 inverted; 0.03/0.035 → +0.005 not inverted; carry vs FDL 3m', () => {
    const w = viewWorld(0), v = w.ctx.store.get<PublicMacroView>(macroTables.publicView.name, 'PYN')!;
    w.put(macroTables.publicView.name, { ...v, curve: [{ tenorYears: 0.25, yield: 0.045 }, ...curveOf(0.031, 0.029).slice(1)] } as never);
    const r = viewRates.run(w.ctx.store, { bloc: 'ALL' }, anyone);
    const pyn = r.curves.find((c) => c.bloc === 'PYN')!, fdl = r.curves.find((c) => c.bloc === 'FDL')!;
    expect(pyn.spread2s10s).toBeCloseTo(-0.002, 12); expect(pyn.inverted).toBe(true);
    expect(fdl.spread2s10s).toBeCloseTo(0.005, 12); expect(fdl.inverted).toBe(false);
    expect(r.carry.find((c) => c.bloc === 'PYN')!.carry3m).toBeCloseTo(0.015, 12);
    expect(pyn.basis).toBe(0.001);
    expect(r.curves.map((c) => c.bloc)).toEqual(['FDL', 'EUN', 'PYN', 'NKR', 'SRL']);
  });
  it('auction ticket: a non-owner sees ownBids [] and no result; the owner sees its 2 bids', () => {
    const w = viewWorld(100);
    w.put(macroTables.auction.name, { id: 'A', govId: 'gov_EUN', assetId: 'x', announceTick: 10, auctionTick: 200, offeredFace: 1000n, whenIssuedYield: 0.031,
      bids: [], result: { stopYield: 0.032, allotmentAtStopPct: 0.4, bidToCover: 2.1, tailBp: 1, awardedFace: 1000n, npcShare: 0.5, playerShare: 0.5, failed: false } } as never);
    for (const [id, who] of [['b1', 'p1'], ['b2', 'p1'], ['b3', 'p2']] as const)
      w.put(macroTables.bid.name, { id, bidId: id, auctionId: 'A', bidderId: who, kind: 'COMPETITIVE', yieldBp: 310, face: 5n, cashHoldId: 'h', submittedTick: 50, primaryDealer: false } as never);
    const other = viewAuctionTicket.run(w.ctx.store, { auctionId: 'A' }, viewer('p9'))!, own = viewAuctionTicket.run(w.ctx.store, { auctionId: 'A' }, viewer('p1'))!;
    expect(other.ownBids).toEqual([]); expect(other.ownResult).toBeNull();
    expect(other.auction).toEqual({ id: 'A', govId: 'gov_EUN', tick: 200, announceTick: 10, offeredFace: '1000', wiYield: 0.031 });
    expect(own.ownBids.map((b) => b.bidId)).toEqual(['b1', 'b2']);
    expect(own.ownResult).toEqual({ stopYield: 0.032, allotmentAtStopPct: 0.4, failed: false });
    expect(assertNoHiddenFields(own)).toEqual([]);
  });
  it('bank console: owner sees own facilities and dealer row; others see empty sections', () => {
    const w = viewWorld(100);
    w.put(macroTables.facility.name, { id: 'f1', kind: 'ELA', bloc: 'FDL', bankId: 'bk', status: 'OPEN' } as never);
    w.put(macroTables.facility.name, { id: 'f2', kind: 'REPO', bloc: 'FDL', bankId: 'bk2', status: 'OPEN' } as never);
    w.put(macroTables.dealer.name, { id: 'EUN:bk', bloc: 'EUN', entityId: 'bk', npc: false, status: 'ACTIVE' } as never);
    const own = viewBankConsole.run(w.ctx.store, { bankId: 'bk', tab: 'PRIMARY_DEALER' }, viewer('bk'));
    expect(own.facilities.map((f) => f.id)).toEqual(['f1']); expect(own.ela).toBe(true); expect(own.dealer?.id).toBe('EUN:bk');
    const other = viewBankConsole.run(w.ctx.store, { bankId: 'bk', tab: 'PRIMARY_DEALER' }, viewer('x'));
    expect([other.facilities, other.ela, other.dealer]).toEqual([[], false, null]);
  });
  it('dealerLeague equals leagueTable for the same args', () => {
    const w = viewWorld(100);
    w.put(macroTables.dealer.name, { id: 'EUN:npc_d1', bloc: 'EUN', entityId: 'npc_d1', npc: true, status: 'ACTIVE', awardedFaceQuarter: { range: () => [['0', '5']], get: () => '5' } } as never);
    expect(viewDealerLeague.run(w.ctx.store, { bloc: 'EUN', quarter: 0 }, anyone)).toEqual(leagueTable(w.ctx.store, 'EUN', 0));
  });
  it('cb view: decisions copy public fields; dissent and minutes only after the minutes lag', () => {
    const w = viewWorld(1000);
    const cb = w.ctx.store.get<object>(macroTables.cb.name, 'cbk_NKR')!;
    w.put(macroTables.cb.name, { ...cb, lastDecisions: [{ meetingId: 'm1', tick: 500, newRate: 0.035, previousRate: 0.03, statementKey: 's', voteFor: 6, voteAgainst: 3,
      dissentHigher: 1, dissentLower: 2, hawkAtMeeting: 0.7, ruleTerms: { outputGap: 0.1 } }, { meetingId: 'm2', tick: 10 ** 6, newRate: 0.04, statementKey: 's2', voteFor: 9, voteAgainst: 0, dissentHigher: 0, dissentLower: 0 }],
      swapLinesOut: [{ counterpartyCbk: 'cbk_SRL', active: true }, { counterpartyCbk: 'cbk_EUN', active: true }, { counterpartyCbk: 'cbk_PYN', active: false }] } as never);
    const v = () => viewCentralBank.run(w.ctx.store, { bloc: 'NKR' }, anyone);
    expect(v().decisions).toEqual([{ tick: 500, statementKey: 's', votes: { voteFor: 6, voteAgainst: 3, dissent: { higher: 0, lower: 0 } } }]);
    expect(v().minutes).toEqual([]);
    expect(v().swapLines).toEqual(['EUN', 'SRL']);
    setNow(w, 500 + 14 * D);
    expect(v().decisions[0]!.votes.dissent).toEqual({ higher: 1, lower: 2 });
    expect(v().minutes).toEqual([{ tick: 500 + 14 * D, key: 'm1' }]);
    expect(v().policyRateHistory).toEqual([{ tick: 500, rate: 0.035 }]);
    expect(assertNoHiddenFields(v())).toEqual([]);
  });
  it('sovereigns: maturity wall by game year, auctions with results only', () => {
    const w = viewWorld(100);
    for (const [id, m, f] of [['i1', 364 * D * 3 + 5, 10n], ['i2', 364 * D * 3 + 9, 5n], ['i3', 364 * D + 1, 7n]] as const)
      w.put(macroTables.issue.name, { id, assetId: id, govId: 'gov_EUN', maturityTick: m, faceOutstanding: f } as never);
    w.put(macroTables.auction.name, { id: 'a1', govId: 'gov_EUN', auctionTick: 50, result: { bidToCover: 2.5, tailBp: 2 } } as never);
    w.put(macroTables.auction.name, { id: 'a2', govId: 'gov_EUN', auctionTick: 60 } as never);
    const r = viewSovereigns.run(w.ctx.store, { bloc: 'EUN' }, anyone);
    expect(r.rows[0]!.maturityWall).toEqual([{ year: 1, face: '7' }, { year: 3, face: '15' }]);
    expect(r.rows[0]!.status).toBe('PERFORMING');
    expect(r.auctions).toEqual([{ auctionId: 'a1', bloc: 'EUN', tick: 50, cover: 2.5, tailBp: 2 }]);
  });
  it('stabilizer view: mac.stab values, lever directions over 7 days, weekly report after the first publish', () => {
    const w = viewWorld(10125); seed03(w, 13); setNow(w, 10125);
    expect(viewStabilizer.run(w.ctx.store, {}, anyone).weekly).toBeNull();
    const rep = weeklyStabReport(w.ctx, NULL_STAB_REPORT)!;
    const v = viewStabilizer.run(w.ctx.store, {}, anyone);
    expect(v.weekly).toEqual(rep);
    expect(v.levers.L1_demand).toEqual({ value: 1.13, direction: 1 });
  });
});
