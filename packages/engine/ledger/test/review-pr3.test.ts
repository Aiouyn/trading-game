// PR #3 review fixes F1-F5 (/workspace/specs/ledger-ref/pr3-review.md).
import { describe, expect, it } from 'vitest';
import * as L from '../src';
import { SortedMap, type CheckView, type Entry, type Posting } from '../src';
import { fixture } from './fixture';

type Acc = SortedMap<string, { balance: bigint; qty: bigint }>;
function applied(entries: readonly Entry[], pre: Acc = new SortedMap()): Acc {
  const a = new SortedMap(pre.entries().map(([k, v]) => [k, { ...v }]));
  for (const e of entries) for (const p of e.postings) L.applyPosting(a, p);
  return a;
}
function view(entries: Entry[], post?: Acc): CheckView {
  const w = fixture(); const pre: Acc = new SortedMap(); const p = post ?? applied(entries);
  return {
    tick: 10, isDayClose: false, catalog: w.catalog, entries, pre, post: p, entity: w.entity,
    facts: { overdraftLimit: () => 0n, intradayLimit: () => 0n }, alarm: { mult: 10, floorMicro: 1_000_000_000_000n },
    flows: L.tickFlowsOf(entries, w.catalog, 10, (c) => L.computeM0sys(p, c) - L.computeM0sys(pre, c)),
  };
}
const env = (mod: string) => fixture().env(mod, 'P12');
const obs = (f: L.Failure[], id: string) => f.filter((x) => x.invariantId === id).map((x) => x.observed);
const extra = (e: Entry, p: Partial<Posting>): Entry => ({ ...e, postings: [...e.postings, { ...e.postings[0], postingSeq: e.postings.length, flowLeg: undefined, ...p }] });

describe('F1 INV-LED-004 per-entry M2 rules (T03-11 step 7)', () => {
  it('a REVALUE posting on 1001 fails', () => {
    // legPolicy (E-11) now rejects a 1001 leg at the template; the forged posting reaches the invariant directly.
    const ok = L.tplAccrue(env('03'), 'chr_A', 5n, 'FDL', 'LED_MTM_DAILY', 1500, 4070);
    const e = { ...ok, postings: [{ ...ok.postings[0], debitAccount: 'chr_A:1001:FDL' }] };
    expect(obs(L.INV_LED_004(view([e])), 'INV-LED-004').some((o) => /REVALUE LED_MTM_DAILY moves M2/.test(o))).toBe(true);
  });
  it('a chr -> chr pay passes; the same pay with a forged extra 2100 leg fails (non-bank TRANSFER moves M2)', () => {
    const pay = L.tplPay(env('21'), 'chr_A', 'chr_B', 10n, 'FDL', 'ADM_CORRECTION_TRANSFER');
    expect(obs(L.INV_LED_004(view([pay])), 'INV-LED-004')).toEqual([]);
    const forged = extra(pay, { debitAccount: 'bnk_N:2100:chr_B:FDL', creditAccount: 'bnk_N:5000:FDL', amount: 7n });
    expect(obs(L.INV_LED_004(view([forged])), 'INV-LED-004').some((o) => /non-bank TRANSFER ADM_CORRECTION_TRANSFER moves M2 by -7/.test(o))).toBe(true);
  });
  it('a SINK whose postings raise M2 fails', () => {
    const burn = L.tplBurn(env('21'), 'chr_A', 10n, 'FDL', 'ADM_CORRECTION_OUT');
    expect(obs(L.INV_LED_004(view([burn])), 'INV-LED-004')).toEqual([]);
    const bad = extra(burn, { debitAccount: 'chr_B:1001:FDL', creditAccount: 'chr_B:4190:FDL', amount: 50n });
    expect(obs(L.INV_LED_004(view([bad])), 'INV-LED-004').some((o) => /SINK ADM_CORRECTION_OUT M2 sign 40/.test(o))).toBe(true);
  });
  it('CB_CREDIT into a fund: M2 = non-bank cash moved passes; a forged deposit leg makes M2 differ from it and fails (kills the CB-credit-rule mutant)', () => {
    const qe = L.tplCbCredit(env('04'), 'cbk_FDL', 'fnd_F', 1_000n, 'FDL', 'CBK_ASSET_PURCHASE', { assetId: 'ast_B', qty: 1n, assetAcct: 1520 });
    expect(obs(L.INV_LED_004(view([qe])), 'INV-LED-004')).toEqual([]);
    const forged = extra(qe, { debitAccount: 'bnk_N:2100:fnd_F:FDL', creditAccount: 'bnk_N:3100:FDL', amount: 40n }); // M2 −40, non-bank 1001 unchanged
    expect(obs(L.INV_LED_004(view([forged])), 'INV-LED-004')).toContain(`I4: ${qe.entryId} CB credit CBK_ASSET_PURCHASE M2 960`);
  });
  it('CB_CREDIT into bank reserves gives ΔM2 = 0n and passes; bank LEND to a chr moves M2 by +amount (borrower from meta)', () => {
    const cb = L.tplCbCredit(env('04'), 'cbk_FDL', 'bnk_N', 9n, 'FDL', 'CBK_STANDING_FACILITY');
    expect(L.computeM2(applied([cb]), 'FDL')).toBe(0n);
    expect(obs(L.INV_LED_004(view([cb])), 'INV-LED-004')).toEqual([]);
    const lend = L.tplLend(env('07'), 'bnk_N', 'chr_A', 1_000n, 'FDL', 'BNK_LOAN_DRAWDOWN', 'loan_1');
    expect(lend.meta).toEqual({ parties: ['bnk_N', 'chr_A'], borrowerId: 'chr_A' });
    expect(obs(L.INV_LED_004(view([lend])), 'INV-LED-004')).toEqual([]);
    const reordered = { ...lend, postings: [lend.postings[1], lend.postings[0]].map((p, i) => ({ ...p, postingSeq: i })) };
    expect(obs(L.INV_LED_004(view([reordered])), 'INV-LED-004')).toEqual([]); // X-4: no dependence on postings[0]
    const cut = { ...lend, headline: { ...lend.headline!, amount: 999n } };
    expect(obs(L.INV_LED_004(view([cut])), 'INV-LED-004').some((o) => /bank credit BNK_LOAN_DRAWDOWN M2 1000/.test(o))).toBe(true);
  });
});

describe('F2 elastic bridge (INV-LED-005, I17 mirror)', () => {
  it('ELASTIC_IN passes 005 and the 2909/1009 mirror; a PAY touching X:1009 fails 005', () => {
    const e = L.tplElasticIn(env('09'), 'hh_C1', 'biz_B', 100n, 'FDL', 'BIZ_SALES_HH');
    expect(L.INV_LED_005(view([e]))).toEqual([]);
    expect(obs(L.INV_LED_003(view([e])), 'INV-LED-003')).toEqual([]);
    const pay = extra(L.tplPay(env('21'), 'chr_A', 'chr_B', 10n, 'FDL', 'ADM_CORRECTION_TRANSFER'), { debitAccount: 'hh_C1:1009:FDL', creditAccount: 'hh_C1:4000:FDL', amount: 3n });
    expect(obs(L.INV_LED_005(view([pay])), 'INV-LED-005')).toContain('ADM_CORRECTION_TRANSFER touches hh_C1:1009:FDL');
  });
  it('a broken sys:2909:X vs X:1009 mirror fails INV-LED-003', () => {
    const e = L.tplElasticIn(env('09'), 'hh_C1', 'biz_B', 100n, 'FDL', 'BIZ_SALES_HH');
    const post = applied([e]); post.set('hh_C1:1009:FDL', { balance: -99n, qty: 0n });
    expect(obs(L.INV_LED_003(view([e], post)), 'INV-LED-003')).toContain('I17 2909 mirror hh_C1 (FDL) off by 1');
  });
});

describe('F3 INV-LED-002 supporting legs (T03-05 step 8 exactly)', () => {
  const trade = () => L.tplSwapAsset(env('05'), 'chr_A', 'chr_B', 'ast_EQ', 1n, 100n, 'FDL', 'MKT_TRADE', { assetAcct: 1500, assetAcctFrom: 2600 });
  it('a SINK fee leg (BURN) inside a SWAP_ASSET trade fails: class SINK does not admit SWAP_ASSET (card rule, no template-stamp branch)', () => {
    const fee = L.tplBurn(env('21'), 'chr_A', 1n, 'FDL', 'ADM_CORRECTION_OUT');
    const c = L.composeEntries(env('05'), trade(), [fee]);
    expect(obs(L.INV_LED_002(view([c])), 'INV-LED-002')).toContain('I1: supporting leg code=ADM_CORRECTION_OUT template=SWAP_ASSET');
  });
  it('a supporting TRANSFER leg inside a TRANSFER entry passes (class admits the template)', () => {
    const fee = L.tplPay(env('21'), 'chr_A', 'chr_B', 1n, 'FDL', 'ADM_CORRECTION_TRANSFER');
    expect(L.INV_LED_002(view([L.composeEntries(env('05'), trade(), [fee])]))).toEqual([]);
  });
  it('a TAX_* TRANSFER leg in a TRANSFER entry passes by the card rule', () => {
    const tax = L.tplPay(env('03'), 'chr_A', 'gov_FDL', 2n, 'FDL', 'TAX_SECURITIES_TX');
    const c = L.composeEntries(env('05'), trade(), [tax]);
    expect(L.INV_LED_002(view([c]))).toEqual([]);
  });
  it('FT4: a TAX_* TRANSFER leg on a SINK main entry passes by the TAX branch; a non-TAX TRANSFER leg there fails', () => {
    const burn = () => L.tplBurn(env('21'), 'chr_A', 10n, 'FDL', 'ADM_CORRECTION_OUT');
    const tax = L.tplPay(env('03'), 'chr_A', 'gov_FDL', 2n, 'FDL', 'TAX_SECURITIES_TX');
    expect(L.INV_LED_002(view([L.composeEntries(env('21'), burn(), [tax])]))).toEqual([]);
    const pay = L.tplPay(env('21'), 'chr_A', 'chr_B', 2n, 'FDL', 'ADM_CORRECTION_TRANSFER');
    expect(obs(L.INV_LED_002(view([L.composeEntries(env('21'), burn(), [pay])])), 'INV-LED-002')).toContain('I1: supporting leg code=ADM_CORRECTION_TRANSFER template=BURN');
  });
});

describe('QA blocker: INV-LED-004 bank/cbk/gov exemption is per reason-code group', () => {
  const trade = () => L.tplSwapAsset(env('05'), 'chr_A', 'chr_B', 'ast_EQ', 1n, 100n, 'FDL', 'MKT_TRADE', { assetAcct: 1500, assetAcctFrom: 2600 });
  it('a taxed trade (gov_ tax leg) passes; the same trade with a forged M2 leg under MKT_TRADE fails', () => {
    const tax = L.tplPay(env('03'), 'chr_A', 'gov_FDL', 2n, 'FDL', 'TAX_SECURITIES_TX');
    const c = L.composeEntries(env('05'), trade(), [tax]);
    expect(obs(L.INV_LED_004(view([c])), 'INV-LED-004')).toEqual([]);
    const forged = extra(c, { debitAccount: 'bnk_N:2100:chr_B:FDL', creditAccount: 'bnk_N:5000:FDL', amount: 7n, reason: 'MKT_TRADE', qty: undefined, assetId: undefined });
    expect(obs(L.INV_LED_004(view([forged])), 'INV-LED-004')).toContain(`I4: ${c.entryId} non-bank TRANSFER MKT_TRADE moves M2 by -7`);
    expect(L.exemptM2(c.postings.filter((p) => p.reason === 'TAX_SECURITIES_TX'))).toBe(-2n); // 2 micro of chr cash moved to gov by rail
    expect(L.exemptM2(c.postings.filter((p) => p.reason === 'MKT_TRADE'))).toBe(0n);
  });
  const forge = { debitAccount: 'bnk_N:2100:chr_B:FDL', creditAccount: 'bnk_N:5000:FDL', amount: 7n, qty: undefined, assetId: undefined };
  const taxed = () => L.composeEntries(env('05'), trade(), [L.tplPay(env('03'), 'chr_A', 'gov_FDL', 2n, 'FDL', 'TAX_SECURITIES_TX')]);
  it('P5: a balanced same-entity gov self-posting (gov_FDL:5000 / gov_FDL:4000, 1 micro) in the MKT_TRADE group grants no exemption', () => {
    const c = taxed();
    const smuggled = extra(extra(c, { debitAccount: 'gov_FDL:5000:FDL', creditAccount: 'gov_FDL:4000:FDL', amount: 1n, reason: 'MKT_TRADE', qty: undefined, assetId: undefined }), { ...forge, reason: 'MKT_TRADE' });
    expect(obs(L.INV_LED_004(view([smuggled])), 'INV-LED-004')).toContain(`I4: ${c.entryId} non-bank TRANSFER MKT_TRADE moves M2 by -7`);
  });
  it('P6: a same-entity bank self-posting (bnk_N:5000 / bnk_N:4000) in the MKT_TRADE group grants no exemption', () => {
    const c = taxed();
    const smuggled = extra(extra(c, { debitAccount: 'bnk_N:5000:FDL', creditAccount: 'bnk_N:4000:FDL', amount: 1n, reason: 'MKT_TRADE', qty: undefined, assetId: undefined }), { ...forge, reason: 'MKT_TRADE' });
    expect(obs(L.INV_LED_004(view([smuggled])), 'INV-LED-004')).toContain(`I4: ${c.entryId} non-bank TRANSFER MKT_TRADE moves M2 by -7`);
  });
  it('P2: a TAX_* group carrying a forged M2 leg fails (the gov exemption does not cover M2 legs)', () => {
    const c = taxed();
    expect(obs(L.INV_LED_004(view([c])), 'INV-LED-004')).toEqual([]);
    const forged = extra(c, { ...forge, reason: 'TAX_SECURITIES_TX' });
    expect(obs(L.INV_LED_004(view([forged])), 'INV-LED-004')).toContain(`I4: ${c.entryId} TAX group TAX_SECURITIES_TX carries an M2 leg`);
  });
});

describe('F5 catalog v2 (catalog.csv v2 + aliases.csv)', () => {
  const cat = new L.ReasonCatalog();
  it('35 restrictedOk codes, 28 aliases, 8 illicit-or-inherited rows load', () => {
    expect(L.RESTRICTED_OK_CODES.length).toBe(35);
    expect(L.RESTRICTED_OK_CODES).toContain('TAX_SECURITIES_TX');
    expect(L.ALIASES.length).toBe(28);
    expect(cat.resolveAlias('BIZ_REVENUE_NPC')).toBe('BIZ_SALES_HH BIZ_SALES_FRM BIZ_SALES_ROW');
    expect(cat.get('CONFLICT_RANSOM')?.illicit).toBe(true);
    for (const [a] of L.ALIASES) expect(cat.get(a)).toBeUndefined(); // no ALIAS_SHADOWS_CODE
  });
  it('requestableBy widens mayRequest beyond the owner', () => {
    const r = cat.all().find((x) => Array.isArray(x.requestableBy) && x.requestableBy.length > 0)!;
    const other = (r.requestableBy as number[])[0];
    expect(cat.mayRequest(r.code, other)).toBe(true);
    expect(cat.mayRequest(r.code, 99)).toBe(false);
    expect(cat.mayRequest(r.code, r.owner)).toBe(true);
  });
  it('catalog legA/legB are the default value legs (PAY, MINT); a FIXED-leg override is rejected (legpolicy.csv, E-11)', () => {
    const pay = L.tplPay(env('07'), 'chr_A', 'chr_B', 10n, 'FDL', 'BNK_LOAN_FEE');
    expect(pay.postings.at(-1)).toMatchObject({ debitAccount: 'chr_A:5080:FDL', creditAccount: 'chr_B:4040:FDL' });
    const over = L.tplPay(env('07'), 'chr_A', 'chr_B', 10n, 'FDL', 'BNK_LOAN_FEE', { valueLegA: 5000 });
    expect(over.invalid).toMatchObject({ invariantId: 'INV-LED-007', observed: 'leg_mismatch A observed=5000', expected: 'expected=5080' });
    const mint = L.tplMint(env('21'), 'chr_A', 10n, 'FDL', 'ADM_CORRECTION_IN');
    expect(mint.postings.at(-1)?.creditAccount).toBe('chr_A:4190:FDL');
  });
  it('ELASTIC_IN/OUT enforce sector ∈ elasticSectors', () => {
    expect(L.tplElasticIn(env('09'), 'hh_C1', 'biz_B', 100n, 'FDL', 'BIZ_SALES_HH').invalid).toBeUndefined();
    const bad = L.tplElasticIn(env('09'), 'frm_FDL', 'biz_B', 100n, 'FDL', 'BIZ_SALES_HH');
    expect(bad.invalid).toEqual({ invariantId: 'INV-LED-002', observed: 'sector frm for BIZ_SALES_HH', expected: 'one of hh' });
  });
});

describe('E-15(3) amount-based INV-LED-004 exemption: QA probes N1, N3-N6, N11, N12', () => {
  const trade = () => L.tplSwapAsset(env('05'), 'chr_A', 'chr_B', 'ast_EQ', 1n, 100n, 'FDL', 'MKT_TRADE', { assetAcctFrom: 2600 });
  const FORGE = { debitAccount: 'bnk_N:2100:chr_B:FDL', creditAccount: 'bnk_N:5000:FDL', amount: 7n, qty: undefined, assetId: undefined };
  const add = (e: Entry, ps: Partial<Posting>[]): Entry => ps.reduce((a, p) => extra(a, { qty: undefined, assetId: undefined, ...p }), e);
  const triplet = (payer: string, gov: string, reason: string, n = 1n): Partial<Posting>[] => [
    { debitAccount: `${gov}:1003:GENERAL:FDL`, creditAccount: `${payer}:1001:FDL`, amount: n, reason },
    { debitAccount: `cbk_FDL:2001:${payer}:FDL`, creditAccount: `cbk_FDL:2003:${gov}:FDL`, amount: n, reason },
    { debitAccount: `${payer}:5280:FDL`, creditAccount: `${gov}:4190:FDL`, amount: n, reason }];
  const vo = (a: string, b: string, reason: string): Partial<Posting> => ({ debitAccount: `${a}:5280:FDL`, creditAccount: `${b}:4190:FDL`, amount: 1n, reason });
  const i4 = (e: Entry) => obs(L.INV_LED_004(view([e])), 'INV-LED-004');
  it('N1: a full tax-shaped triplet (1 micro to gov) tagged MKT_TRADE plus a forged 7-micro M2 leg fails: M2 -8 vs exempt -1', () => {
    const t = trade();
    expect(i4(add(t, [...triplet('chr_A', 'gov_FDL', 'MKT_TRADE'), { ...FORGE, reason: 'MKT_TRADE' }]))).toContain(`I4: ${t.entryId} non-bank TRANSFER MKT_TRADE moves M2 by -8`);
    // The bare triplet (no forge) still passes INV-LED-004: its M2 equals the cash moved to gov. E-15.1 cpPolicy (task 3) closes it.
    expect(i4(add(t, triplet('chr_A', 'gov_FDL', 'MKT_TRADE')))).toEqual([]);
  });
  it('N3: a balanced value pair gov <-> unregistered shell (no cash) grants nothing; the forge fails', () => {
    const t = trade();
    expect(i4(add(t, [vo('chr_ZZ', 'gov_FDL', 'MKT_TRADE'), vo('gov_FDL', 'chr_ZZ', 'MKT_TRADE'), { ...FORGE, reason: 'MKT_TRADE' }]))).toContain(`I4: ${t.entryId} non-bank TRANSFER MKT_TRADE moves M2 by -7`);
  });
  it('N4: a balanced value pair gov <-> the forger itself grants nothing', () => {
    const t = trade();
    expect(i4(add(t, [vo('chr_A', 'gov_FDL', 'MKT_TRADE'), vo('gov_FDL', 'chr_A', 'MKT_TRADE'), { ...FORGE, reason: 'MKT_TRADE' }]))).toContain(`I4: ${t.entryId} non-bank TRANSFER MKT_TRADE moves M2 by -7`);
  });
  it('N5: the reversed-direction pair (gov first) grants nothing', () => {
    const t = trade();
    expect(i4(add(t, [vo('gov_FDL', 'chr_A', 'MKT_TRADE'), vo('chr_A', 'gov_FDL', 'MKT_TRADE'), { ...FORGE, reason: 'MKT_TRADE' }]))).toContain(`I4: ${t.entryId} non-bank TRANSFER MKT_TRADE moves M2 by -7`);
  });
  it('N6: a cbk sub-account value pair grants nothing', () => {
    const t = trade();
    expect(i4(add(t, [{ debitAccount: 'cbk_FDL:5000:x:FDL', creditAccount: 'chr_A:4190:FDL', amount: 1n, reason: 'MKT_TRADE' },
      { debitAccount: 'chr_A:5280:FDL', creditAccount: 'cbk_FDL:4000:x:FDL', amount: 1n, reason: 'MKT_TRADE' }, { ...FORGE, reason: 'MKT_TRADE' }]))).toContain(`I4: ${t.entryId} non-bank TRANSFER MKT_TRADE moves M2 by -7`);
  });
  it('N11: a gov pair plus a forge inside a plain chr -> chr PAY fails', () => {
    const p = L.tplPay(env('21'), 'chr_A', 'chr_B', 10n, 'FDL', 'ADM_CORRECTION_TRANSFER');
    expect(i4(add(p, [vo('chr_A', 'gov_FDL', 'ADM_CORRECTION_TRANSFER'), vo('gov_FDL', 'chr_A', 'ADM_CORRECTION_TRANSFER'), { ...FORGE, reason: 'ADM_CORRECTION_TRANSFER' }])))
      .toContain(`I4: ${p.entryId} non-bank TRANSFER ADM_CORRECTION_TRANSFER moves M2 by -7`);
  });
  it('N12: a bank value pair (bnk_N <-> chr_B) grants nothing', () => {
    const t = trade();
    expect(i4(add(t, [vo('chr_B', 'bnk_N', 'MKT_TRADE'), vo('bnk_N', 'chr_B', 'MKT_TRADE'), { ...FORGE, reason: 'MKT_TRADE' }]))).toContain(`I4: ${t.entryId} non-bank TRANSFER MKT_TRADE moves M2 by -7`);
  });
  it('only rail moves to or from bnk/cbk/gov count: a rail posting draining chr cash into a non-bank rail account (chr_A:1002) grants nothing', () => {
    const t = trade();
    expect(i4(add(t, [{ debitAccount: 'chr_A:1002:FDL', creditAccount: 'chr_B:1001:FDL', amount: 5n, reason: 'MKT_TRADE' }]))).toContain(`I4: ${t.entryId} non-bank TRANSFER MKT_TRADE moves M2 by -5`);
  });
  it('E-15 test 5: a rail payment to bnk passes exactly (cash and deposit rails); 1 more micro of other M2 fails', () => {
    const fee = L.tplPay(env('07'), 'chr_A', 'bnk_N', 2n, 'FDL', 'BNK_LOAN_FEE');
    expect(i4(fee)).toEqual([]);
    expect(i4(add(fee, [{ ...FORGE, amount: 1n, reason: 'BNK_LOAN_FEE' }]))).toContain(`I4: ${fee.entryId} non-bank TRANSFER BNK_LOAN_FEE moves M2 by -3`);
    const w = fixture(); w.setRail('chr_A', { payFrom: { kind: 'BANK', bankId: 'bnk_N' }, receiveInto: { kind: 'BANK', bankId: 'bnk_N' } });
    const dep = L.tplPay(w.env('07', 'P12'), 'chr_A', 'bnk_X', 2n, 'FDL', 'BNK_LOAN_FEE');
    expect(i4(dep)).toEqual([]);
    expect(i4(add(dep, [{ ...FORGE, amount: 1n, reason: 'BNK_LOAN_FEE' }]))).toContain(`I4: ${dep.entryId} non-bank TRANSFER BNK_LOAN_FEE moves M2 by -3`);
  });
});

describe('E-15.2 INV-LED-026: every leg entity registered and not DISSOLVED', () => {
  it('posting to an unregistered id rejects with unknown_entity at posting and fails at P13 (QA N2 / chr_ZZ)', () => {
    const e = L.tplPay(env('21'), 'chr_A', 'chr_ZZ', 1n, 'FDL', 'ADM_CORRECTION_TRANSFER');
    expect(e.invalid?.invariantId).toBe('INV-LED-026'); expect(e.invalid?.observed).toMatch(/^unknown_entity chr_ZZ/);
    const p = L.tplPay(env('21'), 'chr_A', 'chr_B', 1n, 'FDL', 'ADM_CORRECTION_TRANSFER');
    const ghost = extra(p, { debitAccount: 'chr_ZZ:1001:FDL', creditAccount: 'chr_B:1001:FDL', amount: 1n });
    expect(obs(L.INV_LED_026(view([ghost])), 'INV-LED-026')).toEqual([`unknown_entity chr_ZZ in ${p.entryId} ADM_CORRECTION_TRANSFER`]);
    expect(obs(L.INV_LED_026(view([p])), 'INV-LED-026')).toEqual([]);
  });
  it('a DISSOLVED entity takes no posting (template and P13); LED_DISSOLUTION passes; INV-LED-026 runs in TICK_INVARIANTS', () => {
    const w = fixture();
    w.apiFor('21').ledger.mint('chr_A', 10n, 'FDL', 'ADM_CORRECTION_IN'); expect(w.runP13().failures).toEqual([]);
    w.markDissolved('chr_B');
    const e = L.tplPay(w.env('21', 'P12'), 'chr_A', 'chr_B', 1n, 'FDL', 'ADM_CORRECTION_TRANSFER');
    expect(e.invalid?.observed).toBe('unknown_entity chr_B (DISSOLVED)');
    const p = L.tplPay(env('21'), 'chr_A', 'chr_P', 1n, 'FDL', 'ADM_CORRECTION_TRANSFER');
    const v = (es: Entry[]): CheckView => ({ ...view(es), entity: w.entity });
    const toDead = extra(p, { debitAccount: 'chr_B:5000:FDL', creditAccount: 'chr_B:4000:FDL', amount: 1n });
    expect(obs(L.INV_LED_026(v([toDead])), 'INV-LED-026')).toEqual(Array(2).fill(`unknown_entity chr_B (DISSOLVED) in ${p.entryId} ADM_CORRECTION_TRANSFER`)); // debit and credit leg
    const diss = extra(p, { debitAccount: 'chr_B:5000:FDL', creditAccount: 'chr_B:4000:FDL', amount: 1n, reason: 'LED_DISSOLUTION' });
    expect(obs(L.INV_LED_026(v([diss])), 'INV-LED-026')).toEqual([]);
    expect(L.TICK_INVARIANTS.map(([id]) => id)).toContain('INV-LED-026');
  });
});

describe('QA G9 / K1 / K2: per-(bank, holder) deposit mirror and amount-rule killers', () => {
  const trade = () => L.tplSwapAsset(env('05'), 'chr_A', 'chr_B', 'ast_EQ', 1n, 100n, 'FDL', 'MKT_TRADE', { assetAcctFrom: 2600 });
  const add = (e: Entry, ps: Partial<Posting>[]): Entry => ps.reduce((a, p) => extra(a, { qty: undefined, assetId: undefined, ...p }), e);
  const triplet = (n: bigint): Partial<Posting>[] => [
    { debitAccount: 'gov_FDL:1003:GENERAL:FDL', creditAccount: 'chr_A:1001:FDL', amount: n, reason: 'MKT_TRADE' },
    { debitAccount: 'cbk_FDL:2001:chr_A:FDL', creditAccount: 'cbk_FDL:2003:gov_FDL:FDL', amount: n, reason: 'MKT_TRADE' },
    { debitAccount: 'chr_A:5280:FDL', creditAccount: 'gov_FDL:4190:FDL', amount: n, reason: 'MKT_TRADE' }];
  it('G9: a forged bnk_N:2100:chr_A → bnk_N:2100:chr_B deposit move (bank total unchanged) fails I6 per pair, at the tick and at day close', () => {
    const g9 = add(trade(), [{ debitAccount: 'bnk_N:2100:chr_A:FDL', creditAccount: 'bnk_N:2100:chr_B:FDL', amount: 5n, reason: 'MKT_TRADE' }]);
    const v = view([g9]);
    expect(obs(L.INV_LED_010_I6_TICK(v), 'INV-LED-010').sort()).toEqual(['I6: bnk_N|chr_A|FDL deposit off by 5 at tick 10', 'I6: bnk_N|chr_B|FDL deposit off by -5 at tick 10']);
    expect(obs(L.INV_LED_010({ ...v, isDayClose: true }), 'INV-LED-010').filter((o) => o.startsWith('I6')).sort())
      .toEqual(['I6: bnk_N|chr_A deposit off by 5 (FDL)', 'I6: bnk_N|chr_B deposit off by -5 (FDL)']);
    expect(L.TICK_INVARIANTS.some(([, c]) => c === L.INV_LED_010_I6_TICK)).toBe(true);
    // the honest bank-rail payment (2100 and 1010 move together) passes both
    const w = fixture(); w.setRail('chr_A', { payFrom: { kind: 'BANK', bankId: 'bnk_N' }, receiveInto: { kind: 'BANK', bankId: 'bnk_N' } });
    w.setRail('chr_B', { payFrom: { kind: 'BANK', bankId: 'bnk_N' }, receiveInto: { kind: 'BANK', bankId: 'bnk_N' } });
    const p = L.tplPay(w.env('21', 'P12'), 'chr_A', 'chr_B', 5n, 'FDL', 'ADM_CORRECTION_TRANSFER');
    const vp = view([p]);
    expect(L.INV_LED_010_I6_TICK(vp)).toEqual([]); expect(obs(L.INV_LED_010({ ...vp, isDayClose: true }), 'INV-LED-010').filter((o) => o.startsWith('I6'))).toEqual([]);
  });
  it('K1 (kills AR3 |M2| = |exempt|): a real 7-micro rail to gov plus a forged +14 deposit leg fails: M2 +7 vs exempt −7', () => {
    const t = trade();
    expect(obs(L.INV_LED_004(view([add(t, [...triplet(7n), { debitAccount: 'bnk_N:5000:FDL', creditAccount: 'bnk_N:2100:chr_B:FDL', amount: 14n, reason: 'MKT_TRADE' }])])), 'INV-LED-004'))
      .toContain(`I4: ${t.entryId} non-bank TRANSFER MKT_TRADE moves M2 by 7`);
  });
  it('K2 (kills AR7 any-rail): a non-rail chr_A:1001 ↔ gov value posting grants no exemption and fails', () => {
    const t = trade();
    expect(obs(L.INV_LED_004(view([add(t, [{ debitAccount: 'gov_FDL:5280:FDL', creditAccount: 'chr_A:1001:FDL', amount: 7n, reason: 'MKT_TRADE' },
      { debitAccount: 'chr_A:5280:FDL', creditAccount: 'gov_FDL:4190:FDL', amount: 7n, reason: 'MKT_TRADE' }])])), 'INV-LED-004'))
      .toContain(`I4: ${t.entryId} non-bank TRANSFER MKT_TRADE moves M2 by -7`);
  });
});
