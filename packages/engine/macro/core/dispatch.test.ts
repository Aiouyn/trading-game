import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cbkId, govId } from '@tycoon/engine-ledger';
import { macroTables } from '../schema';
import { macroWorld } from '../testkit/macroWorld';
import { stubPorts } from '../testkit/cbWorld';

const h = vi.hoisted(() => {
  const log: string[] = [];
  return { log, publish: [] as { bloc: string; tick: number }[],
    rec: (name: string) => (...a: unknown[]) => { log.push([name, ...a.filter((x) => typeof x === 'string')].join(':')); return [] as never; } };
});
vi.mock('../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../rules/releases', () => ({ releasesDue: (_s: unknown, t: number) => ({ consensus: [], publish: h.publish.filter((r) => r.tick === t) }),
  postConsensus: h.rec('consensus'), publishRelease: (_c: unknown, b: string) => { h.log.push(`publish:${b}`); } }));
vi.mock('../rules/cb', () => ({ runMeeting: (_c: unknown, b: string, e: boolean) => { h.log.push(`meeting:${b}:${e}`); } }));
vi.mock('../rules/guidance', () => ({ guidanceAt: h.rec('guidance'), minutesAt: h.rec('minutes') }));
vi.mock('../rules/corridor', () => ({ setCorridor: h.rec('corridor') }));
vi.mock('../rules/macroprudential', () => ({ macroprudentialAtMeeting: h.rec('mpru') }));
vi.mock('../rules/fxRegimes', () => ({ realignAtMeeting: h.rec('realign') }));
vi.mock('../rules/curves', () => ({ recomputeCurve: (_c: unknown, b: string, r: string) => { h.log.push(`curve:${b}:${r}`); } }));
vi.mock('../rules/fsi', () => ({ hourlyFsi: (c: { tick: number }) => { h.log.push(`fsi:${c.tick}`); } }));
vi.mock('../rules/fear', () => ({ hourlyFear: (c: { tick: number }) => { h.log.push(`fear:${c.tick}`); } }));
vi.mock('../rules/issuance', () => ({ planQuarter: h.rec('plan'), announceDue: () => undefined }));
vi.mock('../rules/scheduler', () => ({ chapterStart: h.rec('chapter') }));
vi.mock('../rules/calendar', async (o) => ({ ...(await o<object>()), writeQuarterSchedule: (_c: unknown, q: number) => { h.log.push(`sched:${q}`); } }));
vi.mock('../rules/poolOrders', () => ({ applyPoolFills: h.rec('fills'), writePoolOrders: (_c: unknown, _p: unknown, x: unknown[]) => { h.log.push(`orders:${x.length}`); } }));
vi.mock('../rules/reserveManagers', () => ({ reserveRebalanceOrders: (_c: unknown, b: string) => { h.log.push(`rebal:${b}`); return [{}]; }, remitProfit: h.rec('remit') }));
vi.mock('../rules/auction', () => ({ runAuction: (_c: unknown, a: { id: string }) => { h.log.push(`auction:${a.id}`); } }));
vi.mock('../rules/facilities', () => ({ facilityDaily: h.rec('facility') }));
vi.mock('../rules/reserves', () => ({ postInterestOnReserves: h.rec('ior') }));
vi.mock('../views/publicView', () => ({ refreshPublicView: h.rec('refresh') }));
vi.mock('../views/stabReport', () => ({ mirrorStabilizer: h.rec('mirror'), weeklyStabReport: (c: { tick: number }) => { h.log.push(`weekly:${c.tick}`); } }));
vi.mock('./dayStep', () => ({ macroDayStep: (c: { tick: number }) => { h.log.push(`day:${c.tick}`); } }));

import { macroBoundaries, macroP2, macroPhases, MACRO_VIEWS, REBALANCE_TICK_OF_DAY } from './dispatch';
import { MACRO_SCREEN_VIEWS } from '../views/screens';

const stab = { latestDailyReport: () => null };
const world = () => macroWorld('d', 0);
const ticks = (w: ReturnType<typeof world>, a: number, b: number, f: () => void) => { for (let t = a; t < b; t++) { w.setTick(t); f(); } };
beforeEach(() => { h.log.length = 0; h.publish.length = 0; });

describe('T04-20 P2 dispatch', () => {
  it('RELEASE then emergency DECISION in one tick: release first, recompute RELEASE then CB_DECISION, one refresh', () => {
    const w = world(), T = 3 * 720 + 45;
    h.publish.push({ bloc: 'EUN', tick: T });
    w.store.put(macroTables.cb.name, { id: cbkId('EUN'), pendingEmergency: { tick: T, triggers: ['FSI'] }, lastDecisions: [] });
    w.setTick(T); macroP2(w.ctx, stubPorts(), stab);
    const l = h.log.filter((x) => /publish|meeting|curve|refresh|corridor/.test(x));
    expect(l).toEqual(['publish:EUN', 'meeting:EUN:true', 'corridor:EUN', 'curve:EUN:RELEASE', 'curve:EUN:CB_DECISION', 'refresh:EUN']);
  });
  it('hourly 24× a day at 0, 30, …, 690 (fsi before fear); day step once at 719', () => {
    const w = world(), ports = stubPorts();
    ticks(w, 720, 1440, () => macroP2(w.ctx, ports, stab));
    const fsi = h.log.filter((x) => x.startsWith('fsi:')).map((x) => Number(x.slice(4)) - 720);
    expect(fsi).toEqual(Array.from({ length: 24 }, (_, i) => i * 30));
    expect(h.log.indexOf('fsi:750') + 1).toBe(h.log.indexOf('fear:750'));
    expect(h.log.filter((x) => x.startsWith('day:'))).toEqual(['day:1439']);
    expect(h.log.indexOf('mirror')).toBe(h.log.indexOf('fsi:720') - 1);
  });
  it('weekly stabilizer report at 5085 and 10125 only', () => {
    const w = world(), ports = stubPorts();
    ticks(w, 0, 10200, () => macroP2(w.ctx, ports, stab));
    expect(h.log.filter((x) => x.startsWith('weekly:'))).toEqual(['weekly:5085', 'weekly:10125']);
  });
  it('QUARTER_OPEN at day 91 writes the quarter after next and plans every bloc; no chapter start at tick 0', () => {
    const w = world(), ports = stubPorts();
    w.setTick(0); macroP2(w.ctx, ports, stab);
    expect(h.log.filter((x) => x.startsWith('chapter'))).toEqual([]);
    h.log.length = 0; w.setTick(91 * 720); macroP2(w.ctx, ports, stab);
    expect(h.log.filter((x) => x.startsWith('sched'))).toEqual(['sched:273']);
    expect(h.log.filter((x) => x.startsWith('plan'))).toHaveLength(5);
  });
});

describe('T04-20 P4 / P6 / P8', () => {
  it('P6 runs due, uncleared auctions in id order', () => {
    const w = world(), T = 330;
    for (const [id, gov, t, res] of [['auc_b', govId('FDL'), T, undefined], ['auc_a', govId('NKR'), T, undefined], ['auc_c', govId('FDL'), T + 720, undefined], ['auc_d', govId('EUN'), T, { failed: false }]] as const)
      w.store.put(macroTables.auction.name, { id, govId: gov, auctionTick: t, ...(res ? { result: res } : {}) });
    const all = w.store.iter<{ govId: string }>(macroTables.auction.name);   // schedWorld indexes only hook_call/event
    vi.spyOn(w.store, 'index').mockImplementation(((t: string, _n: string, k: string) => (t === macroTables.auction.name ? all.filter((a) => a.govId === k) : [])) as never);
    w.setTick(T); macroPhases(stubPorts(), stab).P6!(w.ctx);
    expect(h.log).toEqual(['auction:auc_a', 'auction:auc_b']);
  });
  it('P8 only at 719; P4 adds rebalance orders only at tick 61', () => {
    const w = world(), ph = macroPhases(stubPorts(), stab);
    w.setTick(718); ph.P8!(w.ctx); expect(h.log).toEqual([]);
    w.setTick(719); ph.P8!(w.ctx); expect(h.log.filter((x) => x.startsWith('remit'))).toHaveLength(5);
    h.log.length = 0; w.setTick(REBALANCE_TICK_OF_DAY); ph.P4!(w.ctx); expect(h.log.at(-1)).toBe('orders:5');
    h.log.length = 0; w.setTick(62); ph.P4!(w.ctx); expect(h.log).toEqual(['fills', 'orders:0']);
  });
  it('boundaries empty; views = MACRO_SCREEN_VIEWS; phases P2 P4 P6 P8', () => {
    expect(macroBoundaries).toEqual({});
    expect(MACRO_VIEWS).toBe(MACRO_SCREEN_VIEWS);
    expect(Object.keys(macroPhases(stubPorts(), stab)).sort()).toEqual(['P2', 'P4', 'P6', 'P8']);
  });
});
