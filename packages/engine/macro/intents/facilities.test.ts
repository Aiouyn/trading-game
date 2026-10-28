import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Id, SealedIntent } from '@tycoon/engine-core';
import { macroTables, type DepositFacilityBalance, type FacilityLoan } from '../schema';
import { cbRow, cbWorld, M, stubPorts, type StubOpts } from '../testkit/cbWorld';
import { accrueFacilities, postDepositFacilityInterest } from '../rules/facilities';
import { bindFacilityPorts, cbDepositIntent, cbDepositWithdrawIntent, cbElaRequestIntent, cbRepoIntent, cbRepoRepayIntent, ELA_REQUEST_MSG, processElaRequests } from './facilities';
import { defaultMacroPorts } from '../ports';

vi.mock('../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
const T0 = 41 * 720 + 700, Y = 364 * 720;
const assets: StubOpts['assets'] = { gov10: { cls: 'GOV', issuerBloc: 'FDL', maturityTick: T0 + 10 * Y, px: M(0.98) }, eq: { cls: 'EQUITY', issuerBloc: null, maturityTick: null, px: M(10) } };
const bind = (o: StubOpts = {}) => bindFacilityPorts(stubPorts({ assets, chartered: ['bnk_x'], players: ['bnk_x', 'chr_me'], ...o }));
afterEach(() => bindFacilityPorts(defaultMacroPorts()));
let k = 0;
const si = <P>(payload: P, actorId: Id = 'bnk_x'): SealedIntent<P> => ({ intentId: `int_${k++}`, actorId, payload, tick: T0 } as SealedIntent<P>);
const repo = (amount: number, o: { assetId?: string; termDays?: number; bankId?: string } = {}) =>
  ({ bloc: 'FDL' as const, bankId: o.bankId ?? 'bnk_x', amount: M(amount).toString(), termDays: o.termDays ?? 7, collateral: [{ assetId: o.assetId ?? 'gov10', qty: M(100e6).toString() }] });
function world() { const w = cbWorld([cbRow('FDL')]); w.qty['bnk_x:gov10'] = M(100e6); w.qty['bnk_x:eq'] = M(100e6); w.cash['bnk_x:FDL'] = M(1e9); return w; }
const loans = (w: ReturnType<typeof world>) => w.rows(macroTables.facility.name) as FacilityLoan[];

describe('bank.cb.repo (04#42)', () => {
  it('04#42 repo eligibility and haircut: equity INELIGIBLE, company NOT_ELIGIBLE, 95M SHORT, 94M accepted; no ids in PUBLIC events', () => {
    bind(); const w = world();
    expect(cbRepoIntent.validate(w.ctx, si(repo(94e6, { assetId: 'eq' })))).toEqual({ code: 'CBK_COLLATERAL_INELIGIBLE' });
    expect(cbRepoIntent.validate(w.ctx, si(repo(94e6, { bankId: 'cmp_1' })))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    expect(cbRepoIntent.validate(w.ctx, si(repo(95e6)))).toEqual({ code: 'CBK_HAIRCUT_SHORT' });
    expect(cbRepoIntent.validate(w.ctx, si(repo(94e6)))).toBeNull();
    expect(w.holds).toEqual([]);
    const i = si(repo(94e6));
    expect(cbRepoIntent.apply(w.ctx, i)).toBeNull();
    expect(w.holds).toEqual([{ id: 'hold_0', owner: 'bnk_x', assetId: 'gov10', amt: M(100e6), expires: T0 + 8 * 720, ref: i.intentId, open: true }]);
    expect(loans(w)[0]).toMatchObject({ kind: 'REPO', amount: M(94e6), holdIds: ['hold_0'], rate: 0.0325 });
    expect(w.posts.map((p) => p.op)).toEqual(['cbCredit']);
    expect(w.events.filter((e) => e.vis === 'PUBLIC')).toEqual([]);
    expect(cbRepoIntent.schema.safeParse(repo(94e6)).success).toBe(true);
    expect(cbRepoIntent.schema.safeParse({ ...repo(94e6), extra: 1 }).success).toBe(false);
  });
  it('held actor / credit null / unknown bloc → NOT_ELIGIBLE; terms 0, 8 and 91 without LTRO rejected; 91 with an open LTRO at i', () => {
    bind({ held: ['bnk_x'] }); const w = world();
    expect(cbRepoIntent.validate(w.ctx, si(repo(1e6)))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    bind({ credit: false });
    expect(cbRepoIntent.validate(w.ctx, si(repo(1e6)))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    bind();
    expect(cbRepoIntent.validate(w.ctx, si({ ...repo(1e6), bloc: 'EUN' as never }))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    for (const t of [0, 8, 91]) expect(cbRepoIntent.validate(w.ctx, si(repo(1e6, { termDays: t })))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    expect(cbRepoIntent.validate(w.ctx, si(repo(1e6, { termDays: 1 })))).toBeNull();
    const l = cbWorld([cbRow('FDL', { ltroOpenUntilTick: T0 + 1 })]); l.qty['bnk_x:gov10'] = M(100e6);
    expect(cbRepoIntent.apply(l.ctx, si(repo(1e6, { termDays: 91 })))).toBeNull();
    expect(loans(l)[0]).toMatchObject({ kind: 'LTRO', rate: 0.03 });
    const c = cbWorld([cbRow('FDL', { ltroOpenUntilTick: T0 })]); c.qty['bnk_x:gov10'] = M(100e6);
    expect(cbRepoIntent.validate(c.ctx, si(repo(1e6, { termDays: 91 })))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
  });
  it('free quantity = available − pledged; a failed hold releases the ones already placed', () => {
    bind({ chartered: ['bnk_x'] }); const w = world();
    w.qty['bnk_x:gov10'] = M(99e6);
    expect(cbRepoIntent.validate(w.ctx, si(repo(1e6)))).toEqual({ code: 'CBK_COLLATERAL_INELIGIBLE' });
    w.qty['bnk_x:gov10'] = M(100e6);
    const base = stubPorts({ assets, chartered: ['bnk_x'] });
    bindFacilityPorts({ ...base, credit: { ...base.credit!, pledgedQty: () => 1n } });
    expect(cbRepoIntent.validate(w.ctx, si(repo(1e6)))).toEqual({ code: 'CBK_COLLATERAL_INELIGIBLE' });
    bind();
    const two = { ...repo(1e6), collateral: [{ assetId: 'gov10', qty: M(50e6).toString() }, { assetId: 'gov10', qty: M(100e6).toString() }] };
    w.qty['bnk_x:gov10'] = M(100e6);
    expect(cbRepoIntent.validate(w.ctx, si(two))).toEqual({ code: 'CBK_COLLATERAL_INELIGIBLE' });
    w.qty['bnk_x:gov10'] = M(150e6);
    const hb = w.ctx.holds as unknown as { placeQty: (...a: unknown[]) => unknown }, real = hb.placeQty;
    let calls = 0; hb.placeQty = (...a: unknown[]) => (++calls === 2 ? { code: 'LED_INSUFFICIENT_QTY' } : real(...a));
    expect(cbRepoIntent.apply(w.ctx, si(two))).toEqual({ code: 'CBK_COLLATERAL_INELIGIBLE' });
    expect(w.holds.map((h) => h.open)).toEqual([false]);
    expect(loans(w)).toEqual([]);
  });
});

describe('bank.cb.repoRepay', () => {
  it('early repay by the bank or its owner group pays interest to date and releases the holds; others / short cash NOT_ELIGIBLE', () => {
    bind(); const w = world();
    cbRepoIntent.apply(w.ctx, si(repo(50e6)));
    w.setTick(T0 + 720); accrueFacilities(w.ctx, 'FDL');
    const id = loans(w)[0]!.id;
    expect(cbRepoRepayIntent.validate(w.ctx, si({ repoId: id }, 'cmp_other'))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    expect(cbRepoRepayIntent.validate(w.ctx, si({ repoId: 'nope' }))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    w.cash['bnk_x:FDL'] = M(50e6) + 4_464_285_713n;
    expect(cbRepoRepayIntent.validate(w.ctx, si({ repoId: id }))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    w.cash['bnk_x:FDL'] = M(50e6) + 4_464_285_714n;
    expect(cbRepoRepayIntent.validate(w.ctx, si({ repoId: id }, 'chr_me'))).toBeNull();
    expect(cbRepoRepayIntent.apply(w.ctx, si({ repoId: id }))).toBeNull();
    expect(w.posts.slice(1).map((p) => [p.op, p.amt, p.code])).toEqual([['cbCreditUnwind', M(50e6), 'CBK_STANDING_FACILITY_REPAY'], ['pay', 4_464_285_714n, 'CBK_FACILITY_INTEREST']]);
    expect(w.holds[0]!.open).toBe(false);
    expect(cbRepoRepayIntent.validate(w.ctx, si({ repoId: id }))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    bind({ credit: false });
    expect(cbRepoRepayIntent.validate(w.ctx, si({ repoId: id }))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
  });
});

describe('deposit facility', () => {
  const dep = (amount: number) => ({ bloc: 'FDL' as const, bankId: 'bnk_x', amount: M(amount).toString() });
  const row = (w: ReturnType<typeof world>) => w.rows(macroTables.depositFacility.name)[0] as DepositFacilityBalance;
  it('deposit 10M → interest 755.494505; withdraw 4M reduces the hold; full withdrawal releases it; unchartered / over-cash / over-row NOT_ELIGIBLE', () => {
    bind(); const w = world();
    w.cash['cmp_1:FDL'] = M(1e6);
    expect(cbDepositIntent.validate(w.ctx, si({ ...dep(1), bankId: 'cmp_1' }))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    expect(cbDepositIntent.validate(w.ctx, si(dep(1001e6)))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    expect(cbDepositIntent.validate(w.ctx, si(dep(1000e6)))).toBeNull();
    expect(cbDepositIntent.apply(w.ctx, si(dep(6e6)))).toBeNull();
    expect(cbDepositIntent.apply(w.ctx, si(dep(4e6)))).toBeNull();
    expect(w.holds.map((h) => [h.amt, h.open, h.expires, h.ref])).toEqual([[M(6e6), false, Number.MAX_SAFE_INTEGER, 'FDL:bnk_x'], [M(10e6), true, Number.MAX_SAFE_INTEGER, 'FDL:bnk_x']]);
    expect(row(w)).toEqual({ id: 'FDL:bnk_x', bloc: 'FDL', bankId: 'bnk_x', amount: M(10e6), holdId: 'hold_1' });
    postDepositFacilityInterest(w.ctx, 'FDL', stubPorts({ players: ['bnk_x'] }));
    expect(w.posts).toEqual([{ op: 'mint', to: 'bnk_x', amt: 755_494_505n, ccy: 'FDL', code: 'CBK_DEPOSIT_INTEREST_P' }]);
    expect(cbDepositWithdrawIntent.validate(w.ctx, si(dep(10e6 + 1e-6)))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    expect(cbDepositWithdrawIntent.apply(w.ctx, si(dep(4e6)))).toBeNull();
    expect([row(w).amount, w.holds[1]!.amt, w.holds[1]!.open]).toEqual([M(6e6), M(6e6), true]);
    expect(cbDepositWithdrawIntent.apply(w.ctx, si(dep(6e6)))).toBeNull();
    expect([row(w).amount, row(w).holdId, w.holds[1]!.open]).toEqual([0n, undefined, false]);
    bind({ credit: false });
    expect(cbDepositWithdrawIntent.validate(w.ctx, si(dep(0.000001)))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    expect(cbDepositIntent.validate(w.ctx, si(dep(1)))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
  });
  it('exploit 7: borrowing at the lending rate to park at the deposit rate loses money (net postings < 0)', () => {
    bind(); const w = world();
    cbRepoIntent.apply(w.ctx, si(repo(50e6, { termDays: 1 })));
    cbDepositIntent.apply(w.ctx, si(dep(50e6)));
    w.setTick(T0 + 720);
    postDepositFacilityInterest(w.ctx, 'FDL', stubPorts({ players: [] }));
    accrueFacilities(w.ctx, 'FDL');
    let net = 0n;
    for (const p of w.posts) if (p.code !== 'CBK_STANDING_FACILITY' && p.code !== 'CBK_STANDING_FACILITY_REPAY') net += p.to === 'bnk_x' ? p.amt : p.from === 'bnk_x' ? -p.amt : 0n;
    expect(net).toBe(3_777_472_527n - 4_464_285_714n);
    expect(net < 0n).toBe(true);
  });
});

describe('bank.cb.elaRequest', () => {
  const ela = (amount: number, assetId = 'eq') => ({ bloc: 'FDL' as const, bankId: 'bnk_x', amount: M(amount).toString(), collateral: [{ assetId, qty: M(1e6).toString() }] });
  it('ELA accepts equity at 0.40; holds now, facility next tick at 0.0475 for 90 days; insolvent → CBK_ELA_INSOLVENT; refusal releases holds', () => {
    bind(); const w = world();
    expect(cbElaRequestIntent.validate(w.ctx, si(ela(6e6)))).toBeNull();
    expect(cbElaRequestIntent.validate(w.ctx, si(ela(6e6 + 1)))).toEqual({ code: 'CBK_HAIRCUT_SHORT' });
    expect(cbElaRequestIntent.apply(w.ctx, si(ela(6e6)))).toBeNull();
    expect(w.holds.map((h) => [h.assetId, h.amt, h.expires])).toEqual([['eq', M(1e6), T0 + 92 * 720]]);
    expect(w.sent.map((s) => [s.to, s.kind])).toEqual([['cbk_FDL', ELA_REQUEST_MSG]]);
    expect(loans(w)).toEqual([]);
    w.deliver(); processElaRequests(w.ctx);
    expect(loans(w)[0]).toMatchObject({ kind: 'ELA', rate: 0.0475, amount: M(6e6), maturityTick: T0 + 90 * 720, holdIds: ['hold_0'],
      collateral: [{ assetId: 'eq', qty: M(1e6), haircut: 0.4, valueAtOpen: M(10e6) }] });
    expect(w.events.map((e) => e.vis)).toEqual(['PARTIES', 'SEALED']);
    bind({ insolvent: ['bnk_x'] });
    expect(cbElaRequestIntent.validate(w.ctx, si(ela(1)))).toEqual({ code: 'CBK_ELA_INSOLVENT' });
    expect(cbElaRequestIntent.validate(w.ctx, si({ ...ela(1), bankId: 'cmp_1' }))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    bind(); const r = world();
    cbElaRequestIntent.apply(r.ctx, si(ela(1e6)));
    bind({ insolvent: ['bnk_x'] }); r.deliver(); processElaRequests(r.ctx);
    expect([loans(r), r.holds[0]!.open, r.events]).toEqual([[], false, []]);
    bind({ credit: false });
    expect(cbElaRequestIntent.validate(r.ctx, si(ela(1)))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
  });
});
