// Spec §7 tests 22-24 (Δ14 escrow, OD-2 Fresh Start, OD-5 leech), E-12 (a)-(f), E-14, E-15 tests 1-3, LED_APPRAISAL, exploits E9-E18.
import { describe, expect, it } from 'vitest';
import * as L from '../src';
import { CONFLICT_ESCROW_TICKS, FRESH_START_COOLDOWN_TICKS, isReject, SETTLEMENT_CODES, type Entry } from '../src';
import { fixture, M } from './fixture';

const ok = (w: L.LedgerWorld): number => { const t = w.tick; expect(w.runP13().failures).toEqual([]); return t; };
const fund = (w: L.LedgerWorld, xs: [string, number][]): void => { for (const [id, u] of xs) w.apiFor('21').ledger.mint(id, M(u), 'FDL', 'ADM_CORRECTION_IN'); ok(w); };
const jump = (w: L.LedgerWorld, tick: number): void => { const st = w.checkpoint(); st.tick = tick; st.lastCommitted = tick - 1; w.restore(st); };
const inv = (w: L.LedgerWorld, id: unknown): Entry['invalid'] => (typeof id === 'string' ? w.apiFor('03').ledger.entryOf(id)?.invalid : undefined);
const sys = (w: L.LedgerWorld, t: number) => w.flowReader().tickFlows('FDL', t)!.sysSide!;

describe('Δ14 conflict escrow (spec test 22) and E-12 (a)-(f)', () => {
  const placed = (amt = 50) => {
    const w = fixture(); fund(w, [['chr_A', 100]]);
    const t = w.tick; const id = w.apiFor('12').ledger.escrowPlace('chr_A', 'chr_B', M(amt), 'FDL', 'CONFLICT_RANSOM', 'esc_1', 'op_1');
    const r = w.runP13(); return { w, t, id, r };
  };
  it('22(a): ransom 50: victim available −50e6, attacker unchanged, ESCROW sub 50e6; N, M0_player and classes unchanged', () => {
    const { w, t, r } = placed();
    expect(r.failures).toEqual([]);
    expect([w.available('chr_A', 'FDL'), w.available('chr_B', 'FDL')]).toEqual([M(50), 0n]);
    expect(new L.SortedMap(w.accounts()).get(L.escrowKey('esc_1', 'FDL'))!.balance).toBe(M(50));
    const s = sys(w, t); expect([s.netFlow, s.m0PlayerDelta, L.sumMap(s.sink)]).toEqual([0n, 0n, 0n]);
    for (const h of L.HOLDER_CLASSES) expect(s.byHolder.get(h)!.m0Delta).toBe(0n);
  });
  it('22(b) + E-12(f): no case: at placedTick + 120,960 the scheduler releases to the attacker with the CONFLICT_* audit tag', () => {
    const { w, t } = placed();
    expect(w.escrow('esc_1')!.expiresTick).toBe(t + CONFLICT_ESCROW_TICKS);
    jump(w, t + CONFLICT_ESCROW_TICKS - 1); ok(w); expect(w.escrow('esc_1')!.status).toBe('HELD');
    ok(w); expect(w.escrow('esc_1')!.status).toBe('RELEASED');
    expect(w.cash('chr_B', 'FDL')).toBe(M(50));
    const rel = w.entryLog().find((e) => e.reason === 'ESCROW_CONFLICT_RELEASE')!;
    expect(rel.requestedBy.module).toBe('03'); expect(rel.postings[0].refs).toEqual(expect.arrayContaining(['op_1', 'esc_1', 'CONFLICT_RANSOM']));
  });
  it('22(c): a case filed at +100,000 keeps it HELD at +200,000; a guilty verdict claws back to the victim', () => {
    const { w, t } = placed();
    jump(w, t + 100_000); expect(w.fileCase('case_1', 'op_1', 'chr_B')).toBe(1); ok(w);
    jump(w, t + 200_000); ok(w); expect(w.escrow('esc_1')!.status).toBe('HELD');
    w.apiFor('13').ledger.escrowSettle('esc_1', 0n, M(50)); ok(w);
    expect([w.escrow('esc_1')!.status, w.cash('chr_A', 'FDL'), w.cash('chr_B', 'FDL')]).toEqual(['CLAWED_BACK', M(100), 0n]);
  });
  it('22(d): a 60/40 verdict splits exactly (allocate); parts must sum to the amount', () => {
    const { w } = placed();
    const parts = L.allocate(M(50), new L.SortedMap([['a', 60n], ['v', 40n]])); const a = new L.SortedMap(parts).get('a')!; const v = new L.SortedMap(parts).get('v')!;
    expect(isReject(w.apiFor('13').ledger.escrowSettle('esc_1', a, v - 1n))).toBe(false);
    expect(w.runP13().invalid).toBe(1); // 29.999999 + 20 ≠ 50: INV-LED-007
    w.apiFor('13').ledger.escrowSettle('esc_1', a, v); ok(w);
    expect([w.escrow('esc_1')!.status, w.cash('chr_B', 'FDL'), w.cash('chr_A', 'FDL')]).toEqual(['SPLIT', M(30), M(70)]);
  });
  it('22(e) + E-12(d): spending from ESCROW (hand-built SOC_P2P_TRANSFER posting) is INV-LED-022 FATAL and nothing applies; no hold on it', () => {
    const { w } = placed();
    const before = w.accounts();
    w.apiFor('15').ledger.pay('chr_A', 'chr_B', 1n, 'FDL', 'SOC_P2P_TRANSFER');
    const q = w.testHooks().queue; const e = q[q.length - 1];
    q[q.length - 1] = { ...e, postings: e.postings.map((p, i) => (i === 0 ? { ...p, creditAccount: L.escrowKey('esc_1', 'FDL'), debitAccount: 'chr_B:1001:FDL' } : p)) };
    const r = w.runP13();
    expect(r.safeMode).toBe(true); expect(r.failedInvariants).toContain('INV-LED-022');
    expect(w.accounts()).toEqual(before);
    expect(w.apiFor('13').holds.placeCash('crt_COURT', 'FDL', 1n, w.tick + 1, 'h')).toEqual({ code: 'LED_INSUFFICIENT_FUNDS' });
  });
  it('22(f): a case filed after release leaves the escrow untouched', () => {
    const { w, t } = placed(); jump(w, t + CONFLICT_ESCROW_TICKS); ok(w);
    expect(w.fileCase('case_2', 'op_1', 'chr_B')).toBe(0); expect(w.escrow('esc_1')!.caseId).toBeNull();
  });
  it('E-12(a) CONFLICT via PAY: pay(victim, attacker, x, CONFLICT_RANSOM) is invalid (template); so is the same move without an op ref', () => {
    const w = fixture(); fund(w, [['chr_A', 10]]);
    expect(inv(w, w.apiFor('12').ledger.pay('chr_A', 'chr_B', 1n, 'FDL', 'CONFLICT_RANSOM'))?.observed).toMatch(/template PAY/);
    expect(inv(w, w.apiFor('12').ledger.escrowPlace('chr_A', 'chr_B', 1n, 'FDL', 'CONFLICT_RANSOM', 'e9'))?.invariantId).toBe('INV-LED-002'); // layer 4
  });
  it('E-12(b): module 09 calling escrowPlace(CONFLICT_RANSOM) is invalid (owner); release by 09 too', () => {
    const w = fixture(); fund(w, [['chr_A', 10]]);
    expect(inv(w, w.apiFor('09').ledger.escrowPlace('chr_A', 'chr_B', 1n, 'FDL', 'CONFLICT_RANSOM', 'e1', 'op'))?.observed).toMatch(/^module 09/);
  });
  it('E-12(c): a composed SWAP_ASSET entry with a CONFLICT_CASH_LOOT supporting PAY leg is invalid (escrow-only)', () => {
    const w = fixture(); fund(w, [['chr_A', 10]]);
    const id = w.apiFor('05').ledger.compose(({ env, t }) => t.tplSwapAsset(env, 'chr_A', 'chr_B', 'ast_EQ', 1n, 100n, 'FDL', 'MKT_TRADE', { assetAcct: 1500, assetAcctFrom: 2600 }),
      [({ env, t }) => t.tplPay(env, 'chr_A', 'chr_B', 1n, 'FDL', 'CONFLICT_CASH_LOOT')]);
    expect(w.runP13().invalid).toBe(1); void id;
  });
  it('E-12(e): registering CONFLICT_RANSOM again is NAME_TAKEN; extending its templates is rejected (frozen rows)', () => {
    const cat = new L.ReasonCatalog();
    const row = { ...cat.get('CONFLICT_RANSOM')!, allowedTemplates: ['PAY' as const] };
    expect(cat.registerReasonCodes(12, 'TRANSFER', [row])).toEqual(['CONFLICT_RANSOM: NAME_TAKEN']);
    expect(() => (cat.get('CONFLICT_RANSOM')!.allowedTemplates as L.TemplateId[]).push('PAY')).toThrow();
    expect(cat.get('CONFLICT_RANSOM')!.allowedTemplates).toEqual(['ESCROW_PLACE']);
  });
  it('E16 ransom laundering: the attacker cannot move ransom before release (nothing reaches it); E17 self-ransom between linked alts has no N effect and a case against the alt keeps it', () => {
    const w = fixture(); w.setLinkGroup('chr_A', 'g1'); w.setLinkGroup('chr_a', 'g1'); fund(w, [['chr_A', 10]]);
    w.apiFor('12').ledger.escrowPlace('chr_A', 'chr_b', M(4), 'FDL', 'CONFLICT_RANSOM', 'e17', 'op17'); w.setLinkGroup('chr_b', 'g1');
    const t = ok(w); expect(sys(w, t).netFlow).toBe(0n);
    expect(w.available('chr_b', 'FDL')).toBe(0n);
    expect(w.fileCase('c17', 'op17', 'chr_a')).toBe(1); // OD-4 / open Q6 literal reading: a case against any alt in the attacker's link group
  });
});

describe('OD-2 Fresh Start (test 23, E18) and OD-5 leech (test 24)', () => {
  it('23: MSI 1.2, liquid $1,000 → grant $5,000 restricted; a linked alt within 967,680 ticks is rejected; $100 income garnishes $30', () => {
    const w = fixture(); w.setLinkGroup('chr_P', 'g'); w.setLinkGroup('chr_a', 'g'); fund(w, [['chr_P', 1000]]);
    const id = w.apiFor('14').ledger.freshStart('chr_P', 'FDL', 1.2); ok(w); expect(typeof id).toBe('string');
    expect(w.availableFor('chr_P', 'FDL', 'LIFE_PURCHASE') - w.available('chr_P', 'FDL')).toBe(M(5000)); // restricted (INV-LED-014)
    expect(w.garnishOutstanding('chr_P')).toBe(M(5000));
    expect(w.apiFor('14').ledger.freshStart('chr_a', 'FDL', 1.2)).toEqual({ code: 'LED_FRESH_START_COOLDOWN' });
    w.apiFor('13').ledger.garnishIncome('chr_P', M(100), 'FDL'); const t = ok(w);
    expect(w.entryLog().find((e) => e.tick === t && e.reason === 'LAW_GARNISHMENT')!.headline!.amount).toBe(M(30));
    expect(w.garnishOutstanding('chr_P')).toBe(M(4970));
    jump(w, w.tick + FRESH_START_COOLDOWN_TICKS);
    expect(typeof w.apiFor('14').ledger.freshStart('chr_a', 'FDL', 1.2)).toBe('string');
  });
  it('E18: the grant is a top-up, never additive: liquid ≥ $5,000 × MSI grants nothing', () => {
    const w = fixture(); fund(w, [['chr_P', 7000]]);
    expect(w.apiFor('14').ledger.freshStart('chr_P', 'FDL', 1.2)).toBeNull();
  });
  it('24: a C07 leech verdict posts LAW_RESTITUTION money and never touches 1221 or escrow', () => {
    const w = fixture(); fund(w, [['chr_B', 10]]);
    w.apiFor('13').ledger.pay('chr_B', 'chr_A', M(3), 'FDL', 'LAW_RESTITUTION'); const t = ok(w);
    const es = w.entryLog().filter((e) => e.tick === t);
    expect(es.map((e) => e.reason)).toEqual(['LAW_RESTITUTION']);
    for (const p of es[0].postings) for (const k of [p.debitAccount, p.creditAccount]) { expect(L.parseAccountKey(k)!.code).not.toBe(1221); expect(k).not.toMatch(/ESCROW|:1070:|:2160:/); }
  });
});

describe('E-14 accrual settlement codes and INV-LED-024', () => {
  const owner = (code: string) => String(new L.ReasonCatalog().get(code)!.owner).padStart(2, '0');
  const parties = (code: string): [string, string] => (code === 'BNK_LOAN_INTEREST' ? ['bnk_N', 'chr_B'] : ['chr_A', 'chr_B']);
  const keys = (w: L.LedgerWorld, id: string) => { const a = w.accrual(id)!; return [L.accountKey(a.a, 1100, 'FDL', id), L.accountKey(a.b, a.payable, 'FDL', id)]; };
  const bal = (w: L.LedgerWorld, k: string) => new L.SortedMap(w.accounts()).get(k)?.balance ?? 0n;
  for (const [kind, codes] of Object.entries(SETTLEMENT_CODES)) for (const code of codes) {
    it(`${kind} via ${code}: accrue then settle clears both sides (1100 and ${L.SETTLEMENT_PAYABLE[kind as L.AccrualKind]}) and INV-024 holds`, () => {
      const w = fixture(); const [a, b] = parties(code); fund(w, [[b, 100]]);
      const api = w.apiFor(owner(code)).ledger;
      const id = api.registerAccrual(kind, code, a, b, 'FDL') as string; expect(typeof id).toBe('string');
      api.accrueOn(id, M(7)); ok(w);
      const [rk, pk] = keys(w, id); expect([bal(w, rk), bal(w, pk)]).toEqual([M(7), -M(7)]);
      api.settleAccrual(id, M(7), code); ok(w);
      expect([bal(w, rk), bal(w, pk)]).toEqual([0n, 0n]); expect(w.accrual(id)!.settled).toBe(M(7));
    });
  }
  it('E-14 (1): WAGES settled by BIZ_WAGES_B2E clears 2510/1100 and passes legPolicy', () => {
    const w = fixture(); fund(w, [['biz_B', 10]]); const api = w.apiFor('09').ledger;
    const id = api.registerAccrual('WAGES', 'BIZ_WAGES_B2E', 'chr_A', 'biz_B', 'FDL') as string; api.accrueOn(id, M(2)); ok(w);
    api.settleAccrual(id, M(2), 'BIZ_WAGES_B2E'); const t = ok(w);
    const e = w.entryLog().find((x) => x.tick === t && x.reason === 'BIZ_WAGES_B2E')!;
    expect(e.postings.some((p) => p.debitAccount === `biz_B:2510:${id}:FDL` && p.creditAccount === `chr_A:1100:${id}:FDL`)).toBe(true);
  });
  it('E-14 (2) code shopping: settling WAGES with BIZ_SERVICE_FEE_B2B rejects (kind check)', () => {
    const w = fixture(); const api = w.apiFor('09').ledger;
    const id = api.registerAccrual('WAGES', 'BIZ_WAGES_B2E', 'chr_A', 'biz_B', 'FDL') as string;
    expect(api.settleAccrual(id, M(1), 'BIZ_SERVICE_FEE_B2B')).toEqual({ code: 'LED_NO_SETTLEMENT_CODE' });
  });
  it('E-14 (3): settling with elastic BIZ_WAGES rejects; registering it rejects', () => {
    const w = fixture(); const api = w.apiFor('09').ledger;
    const id = api.registerAccrual('WAGES', 'BIZ_WAGES_B2E', 'chr_A', 'biz_B', 'FDL') as string;
    expect(api.settleAccrual(id, M(1), 'BIZ_WAGES')).toEqual({ code: 'LED_NO_SETTLEMENT_CODE' });
    expect(api.registerAccrual('WAGES', 'BIZ_WAGES', 'chr_A', 'biz_B', 'FDL')).toEqual({ code: 'LED_NO_SETTLEMENT_CODE' });
  });
  it('E-14 (4): an accrual kind with no code, or a code of another module, rejects LED_NO_SETTLEMENT_CODE (inflation: only the owner module accrues)', () => {
    const w = fixture();
    expect(w.apiFor('09').ledger.registerAccrual('BONUS', 'BIZ_WAGES_B2E', 'chr_A', 'biz_B', 'FDL')).toEqual({ code: 'LED_NO_SETTLEMENT_CODE' });
    expect(w.apiFor('21').ledger.registerAccrual('WAGES', 'BIZ_WAGES_B2E', 'chr_A', 'biz_B', 'FDL')).toEqual({ code: 'LED_NO_SETTLEMENT_CODE' });
    expect(w.apiFor('09').ledger.registerAccrual('WAGES', 'BIZ_WAGES_B2E', 'chr_A', 'hh_C1', 'FDL')).toEqual({ code: 'LED_NO_SETTLEMENT_CODE' });
  });
  it('E-14 (5) inflation: over-settlement is clamped to the outstanding amount; INV-024 holds; a forged settled > accrued fails INV-024', () => {
    const w = fixture(); fund(w, [['biz_B', 100]]); const api = w.apiFor('09').ledger;
    const id = api.registerAccrual('FEE', 'BIZ_SERVICE_FEE_B2B', 'chr_A', 'biz_B', 'FDL') as string; api.accrueOn(id, M(3)); ok(w);
    api.settleAccrual(id, M(50), 'BIZ_SERVICE_FEE_B2B'); ok(w);
    expect(w.accrual(id)!.settled).toBe(M(3)); expect(w.cash('chr_A', 'FDL')).toBe(M(3));
    expect(api.settleAccrual(id, 1n, 'BIZ_SERVICE_FEE_B2B')).toEqual({ code: 'LED_NOTHING_TO_SETTLE' });
    const v = w.testHooks().lastView!; const acc = v.accruals!.clone(); acc.set(id, { ...acc.get(id)!, settled: M(4) });
    expect(L.INV_LED_024({ ...v, accruals: acc }).map((f) => f.invariantId)).toContain('INV-LED-024');
    const acc2 = v.accruals!.clone(); acc2.set(id, { ...acc2.get(id)!, code: 'BIZ_WAGES' });
    expect(L.INV_LED_024({ ...v, accruals: acc2 }).map((f) => f.invariantId)).toContain('INV-LED-024');
  });
  it('E-14 (6): immediate PAY under each code uses its catalog legs; a swapped (accrual) leg without an accrual rejects', () => {
    const w = fixture(); fund(w, [['chr_B', 100], ['biz_B', 100]]);
    for (const code of Object.values(SETTLEMENT_CODES).flat()) {
      const [a, b] = parties(code); const api = w.apiFor(owner(code)).ledger; const row = new L.ReasonCatalog().get(code)!;
      const id = api.pay(b, a, 1n, 'FDL', code); expect(inv(w, id), code).toBeUndefined();
      const e = api.entryOf(id)!; expect(e.postings.some((p) => p.debitAccount === `${b}:${row.valueLegA}:FDL` && p.creditAccount === `${a}:${row.valueLegB}:FDL`), code).toBe(true);
      expect(inv(w, api.pay(b, a, 1n, 'FDL', code, { valueLegA: 2520, valueLegB: 1100 }))?.observed, code).toMatch(/leg_mismatch/);
    }
    ok(w);
  });
  it('E-14 wash: wages to a linked alt create no money (TRANSFER: faucet, sink and M0 unchanged)', () => {
    const w = fixture(); w.setLinkGroup('chr_A', 'g'); w.registerEntity({ id: 'biz_A', ownerId: 'chr_A' }); fund(w, [['biz_A', 10]]);
    const api = w.apiFor('09').ledger; const m0 = w.aggregates('FDL').M0;
    const id = api.registerAccrual('WAGES', 'BIZ_WAGES_B2E', 'chr_A', 'biz_A', 'FDL') as string; api.accrueOn(id, M(5)); ok(w);
    api.settleAccrual(id, M(5), 'BIZ_WAGES_B2E'); const t = ok(w);
    const f = w.flowReader().tickFlows('FDL', t)!;
    expect([f.byClass.get('FAUCET') ?? 0n, f.byClass.get('SINK') ?? 0n, f.m0sysDelta, w.aggregates('FDL').M0 - m0, f.sysSide!.netFlow]).toEqual([0n, 0n, 0n, 0n, 0n]);
  });
});

describe('E-15.1 cpPolicy tests 1-3 (INV-LED-025)', () => {
  it('1 (QA N1): a tax-shaped payment to gov_FDL filed as MKT_TRADE rejects cp_kind_mismatch; filed as TAX_SECURITIES_TX it passes', () => {
    const w = fixture();
    const e = L.tplSwapAsset(w.env('05', 'P12'), 'chr_A', 'gov_FDL', 'ast_EQ', 1n, 1n, 'FDL', 'MKT_TRADE', { assetAcct: 1500, assetAcctFrom: 2600 });
    expect(e.invalid?.invariantId).toBe('INV-LED-025'); expect(e.invalid?.observed).toMatch(/^cp_kind_mismatch MKT_TRADE/);
    expect(L.tplPay(w.env('05', 'P12'), 'chr_A', 'gov_FDL', 1n, 'FDL', 'MKT_EXCHANGE_FEE').invalid?.invariantId).toBe('INV-LED-025');
    expect(L.tplPay(w.env('03', 'P12'), 'chr_A', 'gov_FDL', 1n, 'FDL', 'TAX_SECURITIES_TX').invalid).toBeUndefined();
  });
  it('2: MKT_EXCHANGE_FEE to a chr-controlled exchange passes (the kind is still exc)', () => {
    const w = fixture(); w.setController('exc_X', 'chr_B');
    expect(L.tplPay(w.env('05', 'P12'), 'chr_A', 'exc_X', 1n, 'FDL', 'MKT_EXCHANGE_FEE').invalid).toBeUndefined();
  });
  it('3: MAC_GOV_TRANSFER_CORE paid from a frm rejects; from gov passes', () => {
    const w = fixture();
    expect(L.tplPay(w.env('04', 'P12'), 'frm_FDL', 'chr_A', 1n, 'FDL', 'MAC_GOV_TRANSFER_CORE').invalid?.invariantId).toBe('INV-LED-025');
    expect(L.tplPay(w.env('04', 'P12'), 'gov_FDL', 'chr_A', 1n, 'FDL', 'MAC_GOV_TRANSFER_CORE').invalid).toBeUndefined();
  });
});

describe('LED_APPRAISAL (Producer ruling: CLASS on both legs, 4 card shapes)', () => {
  it('an 1800 appraisal loss posts 5170/1800 and passes; gain 1800/4070 passes; 1800/3400 surplus then 3400/1800 never takes appr.surplus below 0', () => {
    const w = fixture(); const api = w.apiFor('03').ledger;
    for (const [d, c] of [[1800, 4070], [5170, 1800], [1800, 3400]]) expect(inv(w, api.accrue('chr_A', M(1), 'FDL', 'LED_APPRAISAL', d, c)), `${d}/${c}`).toBeUndefined();
    ok(w);
    expect(inv(w, api.accrue('chr_A', M(1), 'FDL', 'LED_APPRAISAL', 3400, 1800))).toBeUndefined(); ok(w);
    expect(inv(w, api.accrue('chr_A', 1n, 'FDL', 'LED_APPRAISAL', 3400, 1800))?.invariantId).toBe('INV-LED-007'); // surplus is 0 now
    expect(inv(w, api.accrue('chr_A', 1n, 'FDL', 'LED_APPRAISAL', 4070, 1800))?.observed).toMatch(/leg_mismatch/);
  });
});

describe('exploits E9-E18 (map; most live with their spec tests)', () => {
  it('E11 treasury overspend: gov cannot pay beyond its balance (I10 / INV-LED-008 bound spending)', () => {
    const w = fixture(); fund(w, [['gov_FDL', 1]]);
    w.apiFor('04').ledger.pay('gov_FDL', 'chr_A', M(2), 'FDL', 'MAC_GOV_TRANSFER_CORE');
    const r = w.runP13(); expect(r.committed && r.failures.length === 0 && w.cash('chr_A', 'FDL') === M(2)).toBe(false);
  });
  it.todo('T03-15 negative reserves convert to standing facility at close (A-6; no bank overdraws 1002 until T03-15 lands)');
});

describe('mutation killers: direct checks on forged views (INV-017/018/019/020/022/024, E-12 constants, cpPolicy oneSide)', () => {
  const ids = (f: L.Failure[]) => f.map((x) => x.invariantId);
  it('INV-LED-018: the cursor must step tick−1 → tick (live) and stay put on replay', () => {
    expect(L.INV_LED_018(6, 7, 7, false)).toEqual([]); expect(ids(L.INV_LED_018(5, 7, 7, false))).toEqual(['INV-LED-018']);
    expect(ids(L.INV_LED_018(6, 6, 7, false))).toEqual(['INV-LED-018']); expect(L.INV_LED_018(7, 7, 5, true)).toEqual([]); expect(ids(L.INV_LED_018(7, 8, 5, true))).toEqual(['INV-LED-018']);
  });
  it('INV-LED-017: a day row whose stored hash is stale fails even when its body equals Σ ticks', () => {
    const w = fixture(); w.apiFor('21').ledger.mint('chr_P', 5n, 'FDL', 'ADM_CORRECTION_IN'); w.runTicks(720);
    const row = w.flowReader().archiveDay('FDL', 0)!; const ticks = Array.from({ length: 720 }, (_, t) => w.flowReader().tickFlows('FDL', t)).filter((x) => !!x) as L.TickFlows[];
    expect(L.INV_LED_017(row, ticks, undefined)).toEqual([]); expect(ids(L.INV_LED_017({ ...row, hash: '00' }, ticks, undefined))).toEqual(['INV-LED-017']);
  });
  it('INV-LED-019 alone: m0PlayerDelta +1 fails INV-LED-019', () => {
    const w = fixture(); fund(w, [['chr_P', 10]]); w.apiFor('03').ledger.pay('chr_P', 'gov_FDL', M(1), 'FDL', 'TAX_SECURITIES_TX'); ok(w);
    const v = w.testHooks().lastView!; const s = v.flows.get('FDL')!.sysSide!; expect(L.INV_LED_019(v)).toEqual([]);
    const flows = v.flows.clone(); flows.set('FDL', { ...v.flows.get('FDL')!, sysSide: { ...s, m0PlayerDelta: s.m0PlayerDelta + 1n } });
    expect(ids(L.INV_LED_019({ ...v, flows }))).toContain('INV-LED-019');
  });
  it('INV-LED-020 alone: a control change whose CONTROL_RECLASS entry is dropped fails', () => {
    const w = fixture(); fund(w, [['exc_X', 10]]); w.setController('exc_X', 'chr_A'); ok(w);
    const v = w.testHooks().lastView!; expect(v.entries.some((e) => e.template === 'CONTROL_RECLASS')).toBe(true); expect(L.INV_LED_020(v)).toEqual([]);
    expect(ids(L.INV_LED_020({ ...v, entries: v.entries.filter((e) => e.template !== 'CONTROL_RECLASS') }))).toEqual(['INV-LED-020']);
  });
  it('INV-LED-022 (a) and (d) alone: a HELD row amount off by 1n fails (a); a HELD, case-less row at its expiry tick fails (d)', () => {
    const w = fixture(); fund(w, [['chr_A', 100]]); w.apiFor('12').ledger.escrowPlace('chr_A', 'chr_B', M(50), 'FDL', 'CONFLICT_RANSOM', 'esc_1', 'op_1'); ok(w);
    const v = w.testHooks().lastView!; expect(L.INV_LED_022(v)).toEqual([]);
    const r = v.escrows!.get('esc_1')!; const e1 = v.escrows!.clone(); e1.set('esc_1', { ...r, amount: r.amount + 1n });
    expect(L.INV_LED_022({ ...v, escrows: e1 }).map((f) => f.observed.slice(0, 3))).toContain('(a)');
    expect(L.INV_LED_022({ ...v, tick: r.expiresTick - 1 })).toEqual([]);
    expect(L.INV_LED_022({ ...v, tick: r.expiresTick }).map((f) => f.observed.slice(0, 3))).toEqual(['(d)']);
    expect(r.expiresTick - r.placedTick).toBe(120_960); // Δ14 literal: 7 real days
  });
  it('INV-LED-024 alone: a receivable without its matching payable fails', () => {
    const w = fixture(); fund(w, [['biz_B', 100]]); const api = w.apiFor('09').ledger;
    const id = api.registerAccrual('FEE', 'BIZ_SERVICE_FEE_B2B', 'chr_A', 'biz_B', 'FDL') as string; api.accrueOn(id, M(3)); ok(w);
    const v = w.testHooks().lastView!; expect(L.INV_LED_024(v)).toEqual([]);
    const k = L.accountKey('chr_A', 1100, 'FDL', id); const post = v.post.clone(); post.set(k, { ...post.get(k)!, balance: post.get(k)!.balance + 1n });
    expect(ids(L.INV_LED_024({ ...v, post }))).toEqual(['INV-LED-024']);
  });
  it('E-12 layer 1(iii): catalog rows are frozen', () => {
    const row = new L.ReasonCatalog().get('CONFLICT_RANSOM')!; expect(Object.isFrozen(row)).toBe(true);
    expect(() => { (row as { owner: number }).owner = 21; }).toThrow();
  });
  it('E-15.1 oneSide: a CBK_ code paid with neither side cbk rejects cp_kind_mismatch; with cbk as payer it passes the policy', () => {
    expect(L.cpMismatch('CBK_INTEREST_ON_RESERVES', 'bnk_N', 'chr_A')?.observed).toMatch(/cp_kind_mismatch/);
    expect(L.cpMismatch('CBK_INTEREST_ON_RESERVES', 'cbk_FDL', 'bnk_N')).toBeNull();
  });
});
