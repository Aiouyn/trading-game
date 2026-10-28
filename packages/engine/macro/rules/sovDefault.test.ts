// T04-13 stateful default and restructuring tests (04#23 trigger part, grace path, 04#25, 04#26, post state, exchangeVote).
import { MICRO_N, type Id, type Qty, type SealedIntent } from '@tycoon/engine-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exchangeVoteIntent } from '../intents/exchangeVote';
import { BLOC_ORDER, macroTables, type BlocId, type ExchangeOffer, type HookCall, type SovereignDefaultCase } from '../schema';
import { cbRow, cbWorld, M, stubPorts, type CbWorld } from '../testkit/cbWorld';
import { putBloc } from '../testkit/fiscalWorld';
import { checkDefaultTriggers, openDefaultCase, sovereignStatus, stepDefaultCase } from './default';
import { hazardRaw } from './sovCredit';
import { executeExchange, restructuringTerms, sovereignRecovery, tallyOffer } from './restructuring';

const stub = vi.hoisted(() => ({ active: false, agree: false, reserves: 0n, imports: 0n, opened: [] as string[] }));
vi.mock('./fxReserves', () => ({ fxReservesFdl: () => stub.reserves, importsMonthFdl: () => stub.imports }));
vi.mock('./concord', () => ({
  concordActive: () => stub.active, canAgreeConcord: () => stub.agree,
  openConcord: (_c: unknown, b: string, cause: string) => { stub.opened.push(`${b}:${cause}`); return null; },
}));

const D = 720, T0 = 1000 * D, F = (x: number): Qty => BigInt(x) * MICRO_N, ports = stubPorts();
const L1 = 'ast_SOV_EUN_N10Y_1010', L2 = 'ast_SOV_EUN_N5Y_1100';
let draws = 0, script: number[] = [];
type Sov = { status?: string; hazard?: number; spread10y?: number; failedAuctions21d?: number };
function world(b: BlocId = 'EUN', sov: Sov = {}, high = 0): CbWorld {
  const w = cbWorld(BLOC_ORDER.map((x) => cbRow(x)), T0);
  for (const x of BLOC_ORDER) {
    putBloc(w, x, { fiscal: { debtGdp: 1.2, debt: M(1e12) } as never });
    const r = w.rows(macroTables.bloc.name).find((e) => (e as { id: string }).id === x) as Record<string, unknown>;
    w.put(macroTables.bloc.name, { ...r, shocks: [], highSpreadTradingDays: high, sovereign: { status: 'PERFORMING', hazard: 0.05, spread10y: 0, failedAuctions21d: 0, ...(x === b ? sov : {}) } } as never);
    w.put(macroTables.curve.name, { id: x, ns: { L: 0.05, S: 0, C: 0, lambda: 1 }, nsOis: { L: 0.02, S: 0, C: 0, lambda: 1 } } as never);
  }
  const line = (id: string, mat: number, c: number, fx = false) => w.put(macroTables.issue.name, { id, assetId: id, govId: `gov_${b}`, tenor: 'N10Y', ccy: fx ? 'FDL' : b, couponRate: c,
    issueTick: 0, maturityTick: mat, faceOutstanding: F(1e6), inflationLinked: false, fxDenominated: fx, cac: { threshold: 0.75, aggregated: true }, onTheRun: false } as never);
  line(L1, T0 + 10 * D, 0.04); line(L2, T0 + 100 * D, 0.02);
  draws = 0; script = [];
  Object.assign(w.ctx, { rng: () => ({ next: () => { draws++; return script.shift() ?? 0.5; }, normal: () => 0 }) });
  return w;
}
const bloc = (w: CbWorld, b: BlocId = 'EUN') => w.rows(macroTables.bloc.name).find((e) => (e as { id: string }).id === b) as { sovereign: { status: string; defaultCase?: SovereignDefaultCase }; fiscal: { debt: bigint }; shocks: { target: string; value: number; endTick: number; halfLifeDays?: number; shape: string }[]; highSpreadTradingDays: number; fx: { fxServicePending?: boolean } };
const offerOf = (w: CbWorld): ExchangeOffer => bloc(w).sovereign.defaultCase!.offers.at(-1)!;
let k = 0;
const vote = (w: CbWorld, actorId: Id, v: 'ACCEPT' | 'REJECT', offerId = offerOf(w).id) =>
  exchangeVoteIntent.apply(w.ctx as never, { intentId: `i${k++}`, actorId, payload: { offerId, vote: v }, tick: w.ctx.tick } as SealedIntent<{ offerId: string; vote: 'ACCEPT' | 'REJECT' }>);
const validate = (w: CbWorld, actorId: Id, offerId = offerOf(w).id) =>
  exchangeVoteIntent.validate(w.ctx as never, { intentId: `i${k++}`, actorId, payload: { offerId, vote: 'ACCEPT' }, tick: w.ctx.tick } as SealedIntent<{ offerId: string; vote: 'ACCEPT' | 'REJECT' }>);
/** EUN case open, grace done, round 1 opened; holders a 800k, b 200k of L1 (L2 held by c when given). */
function restructuring(holders: Record<string, number> = { usr_a: 800e3, usr_b: 200e3 }): CbWorld {
  const w = world('EUN', { failedAuctions21d: 2 });
  for (const [h, f] of Object.entries(holders)) w.qty[`${h}:${L1}`] = F(f);
  const c = openDefaultCase(w.ctx, 'EUN', 'FAILED_ROLLOVER', ports);
  for (const t of [c.missedPayment.dueTick, c.graceEndsTick, c.graceEndsTick + 7 * D]) { w.setTick(t); stepDefaultCase(w.ctx, 'EUN', ports); }
  return w;
}
beforeEach(() => { Object.assign(stub, { active: false, agree: false, reserves: 0n, imports: 0n, opened: [] }); });

describe('checkDefaultTriggers', () => {
  it('04#23 EUN: 2 failures, cash < 21-day maturities, no Concord → FAILED_ROLLOVER; Concord active waits for the backstop window to end', () => {
    const w = world('EUN', { failedAuctions21d: 2 });
    expect(checkDefaultTriggers(w.ctx, 'EUN', ports)).toBe('FAILED_ROLLOVER');
    expect(draws).toBe(1);
    stub.active = true;
    w.put(macroTables.cb.name, { ...cbRow('EUN'), backstop: { assetId: L1, face: F(1), days: 5, done: 0 } } as never);
    expect(checkDefaultTriggers(w.ctx, 'EUN', ports)).toBeNull();
    w.put(macroTables.cb.name, cbRow('EUN') as never);
    expect(checkDefaultTriggers(w.ctx, 'EUN', ports)).toBe('FAILED_ROLLOVER');
    w.cash['gov_EUN:EUN'] = F(1e6);
    expect(checkDefaultTriggers(w.ctx, 'EUN', ports)).toBeNull();
    expect(draws).toBe(4);
    const p = world('EUN', { failedAuctions21d: 2, status: 'POST_RESTRUCTURING' });
    expect(checkDefaultTriggers(p.ctx, 'EUN', ports)).toBeNull();
  });
  it('hazard: λ 0.20 draws HAZARD below p; λ 0.09 never but still consumes one draw; no draw-dependent check once a case is open', () => {
    const w = world('EUN', { hazard: 0.20 });
    script = [0.0001]; expect(checkDefaultTriggers(w.ctx, 'EUN', ports)).toBe('HAZARD');
    script = [0.0002]; expect(checkDefaultTriggers(w.ctx, 'EUN', ports)).toBeNull();
    const v = world('EUN', { hazard: 0.09 });
    script = [0]; expect(checkDefaultTriggers(v.ctx, 'EUN', ports)).toBeNull(); expect(draws).toBe(1);
    openDefaultCase(v.ctx, 'EUN', 'HAZARD', ports);
    script = [0]; expect(checkDefaultTriggers(v.ctx, 'EUN', ports)).toBeNull(); expect(draws).toBe(2);
  });
  it('POLITICAL: counter of s10 > 0.15 reaches 63 → SRL fires, FDL never; counter resets when s10 ≤ 0.15', () => {
    const p = stubPorts(); p.world = { ...p.world, politicalDefault: () => true };
    const s = world('SRL', { spread10y: 0.2 }, 62);
    for (const x of BLOC_ORDER) w2debt(s, x, 2);
    expect(checkDefaultTriggers(s.ctx, 'SRL', p)).toBe('POLITICAL');
    expect(bloc(s, 'SRL').highSpreadTradingDays).toBe(63);
    const f = world('FDL', { spread10y: 0.2 }, 62);
    for (const x of BLOC_ORDER) w2debt(f, x, 2);
    expect(checkDefaultTriggers(f.ctx, 'FDL', p)).toBeNull();
    expect(checkDefaultTriggers(s.ctx, 'EUN', p)).toBeNull(); expect(bloc(s, 'EUN').highSpreadTradingDays).toBe(0);
  });
  it('FX_SERVICE: SRL due 2e9 FDL, reserves 3e9, imports 1.5e9 → fires unless Concord can be agreed', () => {
    const w = world('SRL');
    w.put(macroTables.issue.name, { id: 'ast_SOV_SRL_N10Y_FDL_1005', assetId: 'ast_SOV_SRL_N10Y_FDL_1005', govId: 'gov_SRL', tenor: 'N10Y', ccy: 'FDL', couponRate: 0, issueTick: 0,
      maturityTick: T0 + 5 * D, faceOutstanding: F(2e9), inflationLinked: false, fxDenominated: true, cac: { threshold: 0.75, aggregated: true }, onTheRun: false } as never);
    w.cash['gov_SRL:SRL'] = F(1e9);
    Object.assign(stub, { reserves: F(3e9), imports: F(1.5e9) });
    expect(checkDefaultTriggers(w.ctx, 'SRL', ports)).toBe('FX_SERVICE');
    expect(bloc(w, 'SRL').fx.fxServicePending).toBe(true);
    expect(stub.opened).toEqual([]);
    stub.agree = true;
    expect(checkDefaultTriggers(w.ctx, 'SRL', ports)).toBeNull();
    expect(stub.opened).toEqual(['SRL:FX_SERVICE']);
    stub.reserves = F(4e9);
    expect(checkDefaultTriggers(w.ctx, 'SRL', ports)).toBeNull();
    expect(bloc(w, 'SRL').fx.fxServicePending).toBe(false);
    expect(stub.opened.length).toBe(1);
  });
});
function w2debt(w: CbWorld, b: BlocId, d: number): void { const r = bloc(w, b) as unknown as { fiscal: object }; w.put(macroTables.bloc.name, { ...r, fiscal: { ...r.fiscal, debtGdp: d } } as never); }

describe('case, grace, selective default', () => {
  it('CAC: exactly 75% consent is ACCEPTED', () => {
    const w = restructuring({ usr_a: 750e3, usr_b: 250e3 });
    vote(w, 'usr_a', 'ACCEPT'); w.setTick(offerOf(w).closeTick); stepDefaultCase(w.ctx, 'EUN', ports);
    expect(offerOf(w).status).toBe('ACCEPTED');
  });
  it('missed payment is the earliest across lines, not the first line', () => {
    const w = world('EUN');
    w.put(macroTables.issue.name, { ...(w.rows(macroTables.issue.name)[0] as object), id: 'ast_SOV_EUN_Z_1003', assetId: 'ast_SOV_EUN_Z_1003', maturityTick: T0 + 3 * D } as never);
    expect(openDefaultCase(w.ctx, 'EUN', 'HAZARD', ports).missedPayment.assetId).toBe('ast_SOV_EUN_Z_1003');
  });
  it('earliest payment after today; GRACE at due (5,040-tick grace, Wire hook); SELECTIVE_DEFAULT lists every line; sovereignStatus GRACE from opening', () => {
    const w = world('EUN', { failedAuctions21d: 2 });
    const c = openDefaultCase(w.ctx, 'EUN', 'FAILED_ROLLOVER', ports);
    expect(c.missedPayment).toEqual({ assetId: L1, amount: F(1e6) + F(20e3), dueTick: T0 + 10 * D });
    expect(c.graceEndsTick - c.missedPayment.dueTick).toBe(5040);
    expect(sovereignStatus(w.ctx.store, 'gov_EUN')).toBe('GRACE');
    expect(bloc(w).sovereign.status).toBe('PERFORMING');
    w.setTick(c.missedPayment.dueTick - 1); stepDefaultCase(w.ctx, 'EUN', ports); expect(w.events).toHaveLength(0);
    w.setTick(c.missedPayment.dueTick); stepDefaultCase(w.ctx, 'EUN', ports);
    expect(bloc(w).sovereign.status).toBe('GRACE');
    expect(w.events.map((e) => [e.kind, e.payload])).toEqual([['macro.sov.status', { govId: 'gov_EUN', status: 'GRACE', trigger: 'FAILED_ROLLOVER' }]]);
    expect((w.rows(macroTables.hookCall.name) as HookCall[]).map((h) => [h.owner, h.hook])).toEqual([['16', 'WIRE_ITEM']]);
    w.setTick(c.graceEndsTick - 1); stepDefaultCase(w.ctx, 'EUN', ports); expect(w.events).toHaveLength(1);
    w.setTick(c.graceEndsTick); stepDefaultCase(w.ctx, 'EUN', ports);
    expect(bloc(w).sovereign.status).toBe('SELECTIVE_DEFAULT');
    expect(w.events[2]).toMatchObject({ kind: 'macro.sov.default', payload: { assetIds: [L1, L2], missedAssetId: L1, missedAmount: String(F(1.02e6)) } });
    w.setTick(c.graceEndsTick + 7 * D - 1); stepDefaultCase(w.ctx, 'EUN', ports); expect(bloc(w).sovereign.defaultCase!.offers).toHaveLength(0);
    w.setTick(c.graceEndsTick + 7 * D); stepDefaultCase(w.ctx, 'EUN', ports);
    expect(bloc(w).sovereign.status).toBe('RESTRUCTURING');
    expect(offerOf(w)).toMatchObject({ round: 1, closeTick: c.graceEndsTick + 21 * D, status: 'OPEN' });
    expect(offerOf(w).haircutNpv).toBeCloseTo(0.333333, 6);
    expect(offerOf(w).newBonds.map((n) => [n.maturityYears, n.couponRate])).toEqual([[8, 0.03], [15, 0.03]]);
    expect(offerOf(w).newBonds[0]!.facePer100 * 2).toBeCloseTo(105.897733, 5);
    expect(restructuringTerms(w.ctx.store, 'gov_EUN', w.ctx.tick)?.id).toBe(offerOf(w).id);
    expect(sovereignRecovery(w.ctx.store, 'gov_EUN')).toBeCloseTo(0.666667, 6);
  });
});

describe('exchange', () => {
  it('04#25(a) 80% ACCEPT → every line exchanged incl. the rejecter; 04#26 MOVE_QTY only, cash untouched; post state', () => {
    const w = restructuring(), cash0 = JSON.stringify(w.cash), close = offerOf(w).closeTick;
    expect(vote(w, 'usr_a', 'ACCEPT')).toBeNull(); expect(vote(w, 'usr_b', 'REJECT')).toBeNull();
    expect(tallyOffer(w.ctx.store, offerOf(w))).toEqual({ acceptFace: F(800e3), eligibleFace: F(1e6), consent: 0.8 });
    const posts0 = w.posts.length;
    w.setTick(close); stepDefaultCase(w.ctx, 'EUN', ports);
    expect(offerOf(w).status).toBe('ACCEPTED');
    const n8 = `ast_SOV_EUN_N8Y_RS_${Math.floor(close / D) + 8 * 364}`, n15 = `ast_SOV_EUN_N15Y_RS_${Math.floor(close / D) + 15 * 364}`;
    expect([w.qty[`usr_b:${L1}`], w.qty[`usr_b:${n8}`], w.qty[`usr_b:${n15}`]]).toEqual([0n, F(105e3), F(105e3)]);
    expect([w.qty[`usr_a:${L1}`], w.qty[`usr_a:${n8}`], w.qty[`usr_a:${n15}`]]).toEqual([0n, F(424e3), F(424e3)]);
    const ex = w.posts.slice(posts0);
    expect(ex.every((p) => p.op === 'moveQty' && p.code === 'SOV_RESTRUCTURING_EXCHANGE')).toBe(true);
    expect(ex).toHaveLength(6);
    expect(JSON.stringify(w.cash)).toBe(cash0);
    expect(bloc(w).sovereign.status).toBe('POST_RESTRUCTURING');
    expect(bloc(w).fiscal.debt).toBe(M(1e12) - (F(1e6) - F(1058e3)));
    expect(stub.opened).toEqual(['EUN:RESTRUCTURING']);
    for (const b of BLOC_ORDER) {
      const sh = bloc(w, b).shocks.filter((s) => s.target === 'z5_fear_add');
      expect(sh.map((s) => [s.value, s.shape, s.halfLifeDays, s.endTick - close])).toEqual(b === 'EUN' ? [] : [[10, 'DECAY', 7, 21 * D]]);
    }
    expect(10 * 2 ** -(21 * D / (7 * D))).toBe(1.25);
    expect(sovereignRecovery(w.ctx.store, 'gov_EUN')).toBeCloseTo(0.666667, 6);
    const issued = w.rows(macroTables.issue.name) as { id: string; faceOutstanding: bigint }[];
    expect(issued.filter((r) => r.id === n8 || r.id === n15).map((r) => r.faceOutstanding)).toEqual([F(529e3), F(529e3)]);
    const mods = { concordActive: false, shockMult: 1 };
    expect([hazardRaw(0.0005, [0], [0], 'EUN', { ...mods, postRestructuringDays: 0 }), hazardRaw(0.0005, [0], [0], 'EUN', { ...mods, postRestructuringDays: 182 })]).toEqual([0.08, 0.04]);
    expect(issued.find((r) => r.id === L1)!.faceOutstanding).toBe(0n);
    w.setTick(close + 364 * D); stepDefaultCase(w.ctx, 'EUN', ports);
    expect(bloc(w).sovereign.status).toBe('PERFORMING'); expect(bloc(w).sovereign.defaultCase).toBeUndefined();
  });
  it('04#25(b) 60% in rounds 1–3 → unilateral exchange, one HOLDOUT_CLAIM per REJECT voter, none for abstainers; rounds 28 days apart, h − 0.05', () => {
    const w = restructuring({ usr_a: 600e3, usr_b: 300e3, usr_c: 100e3 });
    const hs: number[] = [];
    for (let r = 1; r <= 3; r++) {
      const o = offerOf(w); hs.push(o.haircutNpv);
      expect(o.round).toBe(r);
      vote(w, 'usr_a', 'ACCEPT'); vote(w, 'usr_b', 'REJECT');
      w.setTick(o.closeTick); stepDefaultCase(w.ctx, 'EUN', ports);
      expect(offerOf(w).status).toBe('FAILED');
      if (r < 3) {
        w.setTick(o.closeTick + 28 * D - 1); stepDefaultCase(w.ctx, 'EUN', ports); expect(offerOf(w).round).toBe(r);
        w.setTick(o.closeTick + 28 * D); stepDefaultCase(w.ctx, 'EUN', ports);
      }
    }
    expect(hs[1]).toBeCloseTo(0.283333, 6); expect(hs[2]).toBeCloseTo(0.233333, 6);
    expect([w.qty[`usr_a:${L1}`], w.qty[`usr_b:${L1}`], w.qty[`usr_c:${L1}`]]).toEqual([0n, 0n, 0n]);
    const hooks = (w.rows(macroTables.hookCall.name) as HookCall[]).filter((h) => h.hook === 'HOLDOUT_CLAIM');
    expect(hooks.map((h) => [h.owner, h.args.holderId, h.args.claimFace])).toEqual([['13', 'usr_b', 300e3]]);
    expect(hooks[0]!.args.parDifference).toBeCloseTo(300e3 * hs[2]!, 6);
    expect(bloc(w).sovereign.status).toBe('POST_RESTRUCTURING');
  });
  it('NPC sectors that reject file no holdout claim in a unilateral exchange', () => {
    const w = world('EUN');
    w.qty[`hh_EUN:${L1}`] = F(200e3);
    const c = openDefaultCase(w.ctx, 'EUN', 'HAZARD', ports);
    for (const t of [c.missedPayment.dueTick, c.graceEndsTick]) { w.setTick(t); stepDefaultCase(w.ctx, 'EUN', ports); }
    script = Array(20).fill(0.999);
    w.setTick(c.graceEndsTick + 7 * D); stepDefaultCase(w.ctx, 'EUN', ports);
    expect(w.rows(macroTables.vote.name).map((v) => (v as { vote: string }).vote)).toEqual(['REJECT']);
    executeExchange(w.ctx, 'EUN', offerOf(w), true);
    expect((w.rows(macroTables.hookCall.name) as HookCall[]).filter((h) => h.hook === 'HOLDOUT_CLAIM')).toEqual([]);
  });
  it('NPC sectors vote in 20 blocks, one draw each; executeExchange gives the lot remainder to the largest holder', () => {
    const w = world('EUN');
    w.qty[`hh_EUN:${L1}`] = F(200e3); w.qty[`usr_zz:${L1}`] = F(300e3);
    const c = openDefaultCase(w.ctx, 'EUN', 'HAZARD', ports);
    for (const t of [c.missedPayment.dueTick, c.graceEndsTick]) { w.setTick(t); stepDefaultCase(w.ctx, 'EUN', ports); }
    draws = 0; script = [...Array(5).fill(0), ...Array(15).fill(0.999)];
    w.setTick(c.graceEndsTick + 7 * D); stepDefaultCase(w.ctx, 'EUN', ports);
    expect(draws).toBe(20);
    expect(tallyOffer(w.ctx.store, offerOf(w)).acceptFace).toBe(F(50e3));
    executeExchange(w.ctx, 'EUN', offerOf(w), false);
    const n8 = `ast_SOV_EUN_N8Y_RS_${Math.floor(w.ctx.tick / D) + 8 * 364}`;
    expect([w.qty[`hh_EUN:${n8}`], w.qty[`usr_zz:${n8}`]]).toEqual([F(105e3), F(159e3)]);
  });
});

describe('mkt.sov.exchangeVote', () => {
  it('closed window, non-holder, later buyer exchanged, vote replaced, borrower votes not lender, tally has no holder ids', () => {
    const w = restructuring({ usr_a: 800e3, usr_borrower: 200e3 }), o = offerOf(w);
    expect(validate(w, 'usr_a', 'nope')).toEqual({ code: 'SOV_AUCTION_CLOSED' });
    expect(validate(w, 'usr_lender')).toEqual({ code: 'SOV_LICENSE' });
    expect(validate(w, 'usr_borrower')).toBeNull();
    w.qty[`usr_late:${L1}`] = F(10e3); w.qty[`usr_a:${L1}`] = F(790e3);
    expect(validate(w, 'usr_late')).toEqual({ code: 'SOV_LICENSE' });
    vote(w, 'usr_a', 'REJECT'); vote(w, 'usr_a', 'ACCEPT');
    expect(w.rows(macroTables.vote.name).filter((v) => (v as { holderId: string }).holderId === 'usr_a').map((v) => (v as { vote: string }).vote)).toEqual(['ACCEPT']);
    w.setTick(o.openTick + D - (o.openTick % D)); stepDefaultCase(w.ctx, 'EUN', ports);
    const tally = w.events.filter((e) => e.kind === 'macro.sov.exchange.tally');
    expect(tally.map((e) => Object.keys(e.payload as object))).toEqual([['offerId', 'consentSoFar']]);
    w.setTick(o.closeTick);
    expect(validate(w, 'usr_a')).toEqual({ code: 'SOV_AUCTION_CLOSED' });
    stepDefaultCase(w.ctx, 'EUN', ports);
    expect(w.qty[`usr_late:${L1}`]).toBe(0n);
    expect(w.qty[`usr_late:ast_SOV_EUN_N8Y_RS_${Math.floor(o.closeTick / D) + 8 * 364}`]).toBeGreaterThan(0n);
  });
});
