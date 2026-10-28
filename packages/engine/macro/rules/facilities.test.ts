import { describe, expect, it, vi } from 'vitest';
import { cbkId } from '@tycoon/engine-ledger';
import { macroTables, type BlocId, type CentralBank, type FacilityLoan } from '../schema';
import { cbRow, cbWorld, M, stubPorts, type StubOpts } from '../testkit/cbWorld';
import { accrueFacilities, classifyCollateral, closeFacility, collateralValue, facilityDaily, gradeBucket, haircutFor, isCounterparty, MACRO_EXTENSION_CODES_CBK,
  openFacility, postDepositFacilityInterest, repayAutomaticFacilities } from './facilities';
import { accountsOfEntity, committedBalance, effectiveMark } from './t03Stubs';

vi.mock('./t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
const T0 = 41 * 720 + 700, Y = 364 * 720;
const assets: StubOpts['assets'] = {
  gov10: { cls: 'GOV', issuerBloc: 'FDL', maturityTick: T0 + 10 * Y, px: M(0.98) }, gov2: { cls: 'GOV', issuerBloc: 'FDL', maturityTick: T0 + 2 * Y, px: M(1) },
  corp7: { cls: 'CORP', issuerBloc: null, maturityTick: T0 + 7 * Y, grade: 'BBB', px: M(1) }, corpNR: { cls: 'CORP', issuerBloc: null, maturityTick: T0 + Y, grade: null, px: M(1) },
  eunGov: { cls: 'GOV', issuerBloc: 'EUN', maturityTick: T0 + Y, px: M(1) }, eq: { cls: 'EQUITY', issuerBloc: null, maturityTick: null, px: M(10) },
  abs: { cls: 'ABS_SENIOR', issuerBloc: null, maturityTick: T0 + Y, grade: 'A', px: null } };
const P = (o: StubOpts = {}) => stubPorts({ assets, chartered: ['bnk_x'], ...o });
const cbOf = (w: ReturnType<typeof cbWorld>, b: BlocId = 'FDL'): CentralBank => w.rows(macroTables.cb.name).find((c) => (c as CentralBank).id === cbkId(b)) as CentralBank;
const loans = (w: ReturnType<typeof cbWorld>) => w.rows(macroTables.facility.name) as FacilityLoan[];
const csfFor = (b: string) => ({ id: 'npc_CSF', quotas: {}, lendingCapacity: 0n, programs: [{ bloc: b, size: 0n, drawn: 0n, rate: 0, startTick: 0, endTick: T0 + 10,
  conditions: { primaryBalanceStepPerYear: 0, cbIndependence: true, capitalControlsPhaseOutDays: 0 } }] });

describe('§3.8.3 haircuts', () => {
  it('grade buckets', () => {
    expect(['AAA', 'AA-', 'A+', 'A-', 'BBB+', 'BBB-', 'BB+', 'BB-', 'B+', 'XX', null].map(gradeBucket)).toEqual(['AAA_AA', 'AAA_AA', 'A', 'A', 'BBB', 'BBB', 'BB', 'BB', 'BELOW', null, null]);
  });
  it('table + 0.005 per year above 5; BB own only with the waiver; CREDIT_CLAIM / EQUITY ELA-only', () => {
    expect(haircutFor('OWN_GOV', 'AAA_AA', 10, 'REPO', false)).toBe(0.035);
    expect(haircutFor('OWN_GOV', 'AAA_AA', 4, 'REPO', false)).toBe(0.01);
    expect(haircutFor('CORP', 'BBB', 7, 'REPO', false)).toBe(0.13);
    expect(haircutFor('OWN_GOV', 'BB', 1, 'REPO', false)).toBeNull();
    expect(haircutFor('OWN_GOV', 'BB', 1, 'REPO', true)).toBe(0.15);
    expect(haircutFor('OTHER_GOV', 'BB', 1, 'REPO', true)).toBeNull();
    expect(haircutFor('EQUITY', null, null, 'REPO', false)).toBeNull();
    expect(haircutFor('EQUITY', null, null, 'ELA', false)).toBe(0.4);
    expect(haircutFor('CREDIT_CLAIM', 'BB', null, 'ELA', false)).toBe(0.3);
    expect(haircutFor('CORP', null, 1, 'REPO', false)).toBeNull();
    expect(haircutFor('CORP', 'BELOW', 1, 'ELA', true)).toBeNull();
  });
  it('classifyCollateral: own / other gov at the sovereign (lowest of two best), corp by grade, ABS, equity, loan claim, other', () => {
    const w = cbWorld([cbRow('FDL')]), p = P({ loanClaims: { ln_1: M(5e6) } });
    expect(classifyCollateral(w.ctx.store, p, 'FDL', 'gov10', T0)).toEqual({ kind: 'OWN_GOV', grade: 'AA', yearsToMaturity: 10 });
    expect(classifyCollateral(w.ctx.store, p, 'FDL', 'eunGov', T0).kind).toBe('OTHER_GOV');
    expect(classifyCollateral(w.ctx.store, p, 'FDL', 'corp7', T0)).toEqual({ kind: 'CORP', grade: 'BBB', yearsToMaturity: 7 });
    expect(classifyCollateral(w.ctx.store, p, 'FDL', 'abs', T0).kind).toBe('ABS_COVERED');
    expect(classifyCollateral(w.ctx.store, p, 'FDL', 'eq', T0)).toEqual({ kind: 'EQUITY', grade: null, yearsToMaturity: null });
    expect(classifyCollateral(w.ctx.store, p, 'FDL', 'ln_1', T0).kind).toBe('CREDIT_CLAIM');
    expect(classifyCollateral(w.ctx.store, p, 'FDL', 'zz', T0).kind).toBe('OTHER');
    expect(classifyCollateral(w.ctx.store, P({ sovGrades: ['AAA', 'BB', 'B'] }), 'FDL', 'gov2', T0).grade).toBe('BB');
  });
  it('collateralValue: 98M of AA own 10y → 94,570,000 post-haircut; effectiveMark fallback; ineligible lines listed', () => {
    const w = cbWorld([cbRow('FDL')]);
    vi.mocked(effectiveMark).mockReturnValueOnce(M(0.5));
    const v = collateralValue(w.ctx.store, P(), 'FDL', [{ assetId: 'gov10', qty: M(100e6) }, { assetId: 'abs', qty: M(2e6) }, { assetId: 'eq', qty: M(1) }, { assetId: 'corpNR', qty: M(1) }], 'REPO', T0);
    expect(v.gross).toBe(M(98e6 + 1e6));
    expect(v.postHaircut).toBe(M(94_570_000 + 880_000));
    expect(v.lines).toEqual([{ assetId: 'gov10', qty: M(100e6), haircut: 0.035, valueAtOpen: M(98e6) }, { assetId: 'abs', qty: M(2e6), haircut: 0.12, valueAtOpen: M(1e6) }]);
    expect(v.ineligible).toEqual(['eq', 'corpNR']);
    const e = collateralValue(w.ctx.store, P({ loanClaims: { ln_1: M(5e6) } }), 'FDL', [{ assetId: 'eq', qty: M(1000) }, { assetId: 'ln_1', qty: 1n }], 'ELA', T0);
    expect([e.gross, e.postHaircut, e.ineligible]).toEqual([M(5_010_000), M(6000 + 3.5e6), []]);
  });
  it('edge: own BB is eligible only while a CSF program for the bloc is active', () => {
    const w = cbWorld([cbRow('FDL')]), p = P({ sovGrades: ['BB', 'BB'] }), it1 = [{ assetId: 'gov2', qty: M(1e6) }];
    expect(collateralValue(w.ctx.store, p, 'FDL', it1, 'REPO', T0).ineligible).toEqual(['gov2']);
    w.put(macroTables.csf.name, csfFor('EUN'));
    expect(collateralValue(w.ctx.store, p, 'FDL', it1, 'REPO', T0).ineligible).toEqual(['gov2']);
    w.put(macroTables.csf.name, csfFor('FDL'));
    expect(collateralValue(w.ctx.store, p, 'FDL', it1, 'REPO', T0).lines[0]!.haircut).toBe(0.15);
    expect(collateralValue(w.ctx.store, p, 'FDL', it1, 'REPO', T0 + 10).ineligible).toEqual(['gov2']);
  });
  it('counterparties: chartered bank or ACTIVE dealer of the bloc', () => {
    const w = cbWorld([cbRow('FDL')]);
    w.put(macroTables.dealer.name, { id: 'FDL:dlr_a', status: 'ACTIVE' } as never); w.put(macroTables.dealer.name, { id: 'FDL:dlr_r', status: 'REVOKED' } as never);
    expect(['bnk_x', 'dlr_a', 'dlr_r', 'cmp_1'].map((e) => isCounterparty(w.ctx.store, P(), 'FDL', e))).toEqual([true, true, false, false]);
  });
});

describe('§3.8.3 facilities', () => {
  const col = [{ assetId: 'gov10', qty: M(100e6), haircut: 0.035, valueAtOpen: M(98e6) }];
  it('repo 50M 7d at 0.0325: 4,464.285714/day, 31,249.999998 at maturity; unwind, interest, holds released; balance sheet', () => {
    const w = cbWorld([cbRow('FDL')]);
    const l = openFacility(w.ctx, 'REPO', 'FDL', 'bnk_x', M(50e6), 7, col, ['h1', 'h2']);
    w.holds.push({ id: 'h1', owner: 'bnk_x', amt: 1n, expires: 0, ref: 'r', open: true });
    expect(l).toMatchObject({ kind: 'REPO', rate: 0.0325, ccy: 'FDL', openTick: T0, maturityTick: T0 + 7 * 720, accrued: 0n, status: 'OPEN' });
    expect(w.posts).toEqual([{ op: 'cbCredit', from: 'cbk_FDL', to: 'bnk_x', amt: M(50e6), ccy: 'FDL', code: 'CBK_STANDING_FACILITY', sub: l.id }]);
    expect(cbOf(w).balanceSheet.loansToBanks).toBe(M(50e6));
    expect(w.events).toEqual([{ kind: 'macro.cb.repo', subjectIds: ['bnk_x'], vis: 'PARTIES', partyIds: ['bnk_x'],
      payload: { bloc: 'FDL', bankId: 'bnk_x', loanId: l.id, amount: '50000000000000', ccy: 'FDL', termDays: 7, collateral: [{ assetId: 'gov10', qty: '100000000000000', haircut: 0.035 }] } }]);
    for (let d = 1; d <= 6; d++) { w.setTick(T0 + d * 720); accrueFacilities(w.ctx, 'FDL'); }
    expect(loans(w)[0]!.accrued).toBe(6n * 4_464_285_714n);
    w.setTick(T0 + 7 * 720); accrueFacilities(w.ctx, 'FDL');
    expect(w.posts.slice(1)).toEqual([{ op: 'cbCreditUnwind', from: 'bnk_x', to: 'cbk_FDL', amt: M(50e6), ccy: 'FDL', code: 'CBK_STANDING_FACILITY_REPAY', sub: l.id },
      { op: 'pay', from: 'bnk_x', to: 'cbk_FDL', amt: 31_249_999_998n, ccy: 'FDL', code: 'CBK_FACILITY_INTEREST' }]);
    expect(loans(w)[0]).toMatchObject({ status: 'REPAID', accrued: 31_249_999_998n });
    expect(w.holds[0]!.open).toBe(false);
    expect(cbOf(w).balanceSheet.loansToBanks).toBe(0n);
    closeFacility(w.ctx, l.id, 'EARLY'); accrueFacilities(w.ctx, 'FDL');
    expect(w.posts).toHaveLength(3);
  });
  it('ELA at lendingRate + 0.015 = 0.0475, PARTIES + SEALED to reg; LTRO at i; elaOutstanding; early close with zero accrued pays no interest', () => {
    const w = cbWorld([cbRow('FDL')]);
    const e = openFacility(w.ctx, 'ELA', 'FDL', 'bnk_x', M(1e6), 90, col, []);
    expect([e.rate, e.maturityTick]).toEqual([0.0475, T0 + 90 * 720]);
    expect(w.posts[0]!.code).toBe('CBK_EMERGENCY_LIQUIDITY');
    expect(w.events.map((x) => [x.kind, x.vis, x.partyIds])).toEqual([['macro.cb.ela', 'PARTIES', ['bnk_x']], ['macro.cb.ela', 'SEALED', ['reg_FDL']]]);
    expect(cbOf(w).balanceSheet).toMatchObject({ elaOutstanding: M(1e6), loansToBanks: 0n });
    expect(openFacility(w.ctx, 'LTRO', 'FDL', 'bnk_x', M(1e6), 91, col, []).rate).toBe(0.03);
    facilityDaily(w.ctx, 'FDL');
    expect(w.events.at(-1)!.payload).toEqual({ bloc: 'FDL', repoOutstanding: '1000000000000', elaOutstanding: '1000000000000', deposits: '0' });
    closeFacility(w.ctx, e.id, 'EARLY');
    expect(w.posts.slice(-1)).toEqual([{ op: 'cbCreditUnwind', from: 'bnk_x', to: 'cbk_FDL', amt: M(1e6), ccy: 'FDL', code: 'CBK_EMERGENCY_LIQUIDITY_REPAY', sub: e.id }]);
    expect(cbOf(w).balanceSheet).toMatchObject({ elaOutstanding: 0n, loansToBanks: M(1e6) });
    facilityDaily(w.ctx, 'FDL');
    expect(w.events.at(-1)).toEqual({ kind: 'macro.cb.facility.daily', subjectIds: ['cbk_FDL'], vis: 'PUBLIC', payload: { bloc: 'FDL', repoOutstanding: '1000000000000', elaOutstanding: '0', deposits: '0' } });
  });
  it('automatic facility sf:bnk_x:FDL:41 at 2M → repaid next DAY_OPEN with 178.571429; other days, codes and zero balances skipped', () => {
    const w = cbWorld([cbRow('FDL')], 42 * 720);
    vi.mocked(accountsOfEntity).mockReturnValueOnce([{ key: 'k1', code: 1307, ccy: 'FDL', sub: 'sf:bnk_x:FDL:41' }, { key: 'k2', code: 1307, ccy: 'FDL', sub: 'sf:bnk_y:FDL:40' },
      { key: 'k3', code: 1306, ccy: 'FDL', sub: 'sf:bnk_z:FDL:41' }, { key: 'k4', code: 1307, ccy: 'FDL', sub: 'sf:bnk_w:FDL:41' }, { key: 'k5', code: 1307, ccy: 'FDL', sub: 'xx:bnk_v:FDL:41' }]);
    vi.mocked(committedBalance).mockImplementation((_s, k) => (k === 'k4' ? 0n : M(2e6)));
    repayAutomaticFacilities(w.ctx, 'FDL');
    expect(w.posts).toEqual([{ op: 'cbCreditUnwind', from: 'bnk_x', to: 'cbk_FDL', amt: M(2e6), ccy: 'FDL', code: 'CBK_STANDING_FACILITY_REPAY', sub: 'sf:bnk_x:FDL:41' },
      { op: 'pay', from: 'bnk_x', to: 'cbk_FDL', amt: 178_571_429n, ccy: 'FDL', code: 'CBK_FACILITY_INTEREST' }]);
  });
  it('deposit facility interest 10M at 0.0275 → 755.494505 (player mint / world pay); negative rate → charge; daily aggregate', () => {
    const w = cbWorld([cbRow('FDL')]);
    w.put(macroTables.depositFacility.name, { id: 'FDL:bnk_p', bloc: 'FDL', bankId: 'bnk_p', amount: M(10e6) } as never);
    w.put(macroTables.depositFacility.name, { id: 'FDL:bnk_w', bloc: 'FDL', bankId: 'bnk_w', amount: M(10e6) } as never);
    w.put(macroTables.depositFacility.name, { id: 'EUN:bnk_w', bloc: 'EUN', bankId: 'bnk_w', amount: M(10e6) } as never);
    postDepositFacilityInterest(w.ctx, 'FDL', P({ players: ['bnk_p'] }));
    expect(w.posts).toEqual([{ op: 'mint', to: 'bnk_p', amt: 755_494_505n, ccy: 'FDL', code: 'CBK_DEPOSIT_INTEREST_P' }, { op: 'pay', from: 'cbk_FDL', to: 'bnk_w', amt: 755_494_505n, ccy: 'FDL', code: 'CBK_DEPOSIT_INTEREST_W' }]);
    facilityDaily(w.ctx, 'FDL');
    expect((w.events.at(-1)!.payload as { deposits: string }).deposits).toBe('20000000000000');
    const n = cbWorld([cbRow('EUN', { facilities: { lendingRate: 0, depositRate: -0.005, collateralHaircuts: {}, elaPenaltySpread: 0.015, maxTermDays: 7 } })]);
    n.put(macroTables.depositFacility.name, { id: 'EUN:bnk_w', bloc: 'EUN', bankId: 'bnk_w', amount: M(10e6) } as never);
    postDepositFacilityInterest(n.ctx, 'EUN');
    expect(n.posts).toEqual([{ op: 'pay', from: 'bnk_w', to: 'cbk_EUN', amt: 137_362_637n, ccy: 'EUN', code: 'CBK_NEGATIVE_RATE_CHARGE_W' }]);
  });
  it('extension codes: four rows, penalty rows requestable by 07', () => {
    expect(MACRO_EXTENSION_CODES_CBK.map((r) => [r.code, r.cls, r.template, r.mayRequest ?? null])).toEqual([
      ['CBK_NEGATIVE_RATE_CHARGE_P', 'SINK', 'BURN', null], ['CBK_NEGATIVE_RATE_CHARGE_W', 'TRANSFER', 'PAY', null],
      ['CBK_RESERVE_PENALTY_P', 'SINK', 'BURN', [4, 7]], ['CBK_RESERVE_PENALTY_W', 'TRANSFER', 'PAY', [4, 7]]]);
  });
});
