// T03-01 step 6: every 03 §5 event kind has a zod schema and a visibility.
import { describe, expect, it } from 'vitest';
import { emitLedger, LEDGER_EVENT_VISIBILITY, LEDGER_EVENTS, type LedgerEventKind, type Levers, type MoneySupplyReport } from '../src';

const ranks = { SECURED: '1', ADMIN: '0', TAX: '0', WAGES: '0', DEPOSITS_INSURED: '0', SENIOR_UNSECURED: '0', SUBORDINATED: '0', PREFERRED_EQUITY: '0', COMMON_EQUITY: '0' };
const taxes = { PERSONAL_INCOME: '1', CAPITAL_GAINS: '0', CORPORATE: '0', PROPERTY: '0', VAT: '0', SEC_TX: '0', STAMP: '0', P2P: '0', WHT: '0', EXIT: '0', FRANCHISE: '0' };
const levers = { L1_demand: 1, L2_lifestyle_price: 1, L3_levy_bp: 0, L4_upkeep: 1 };
const tax = { taxAccountId: 'chr_A:2400:FDL:PERSONAL_INCOME:1:FDL', amount: '-5', dueTick: 10 };
const ins = { caseId: 'case_1', debtorId: 'cmp_1', procedure: 'LIQUIDATION', recoveriesByRank: ranks };
/** [valid sample, wrong-typed field]: the money field set to a number, or (no money field) a number field set to a string. */
const SAMPLES: Record<LedgerEventKind, [Record<string, unknown>, string, unknown]> = {
  'ledger.entry.committed': [{ entryId: 'e1', reason: 'PAY_TRADE', amount: '100', ccy: 'FDL', counterpartyLabel: 'cmp_1' }, 'amount', 100],
  'ledger.statement.ready': [{ entityId: 'chr_A', period: { kind: 'QUARTER', index: 3 }, scope: 'SOLO' }, 'period', { kind: 'QUARTER', index: '3' }],
  'ledger.statement.published': [{ entityId: 'cmp_1', period: { kind: 'QUARTER', index: 3 }, scope: 'CONSOLIDATED' }, 'period', { kind: 'QUARTER', index: '3' }],
  'ledger.tax.estimate': [{ entityId: 'chr_A', ytdByType: taxes }, 'ytdByType', { ...taxes, VAT: 1 }],
  'ledger.tax.due': [tax, 'amount', 5],
  'ledger.tax.paid': [tax, 'amount', 5],
  'ledger.tax.late': [tax, 'amount', 5],
  'ledger.tax.audit.selected': [{ entityId: 'chr_A', scope: 'PERSONAL' }, 'scope', 'OTHER'],
  'ledger.tax.audit.finding': [{ entityId: 'chr_A', findingKind: 'UNEXPLAINED_WEALTH', amount: '7', codes: ['C1'], evidencePoints: 2 }, 'amount', 7],
  'ledger.default': [{ debtorId: 'chr_A', obligationRef: 'loan_1', amount: '9' }, 'amount', 9],
  'ledger.insolvency.review': [{ entityId: 'cmp_1', equity: '-3' }, 'equity', -3],
  'ledger.insolvency.opened': [ins, 'recoveriesByRank', { ...ranks, TAX: 0 }],
  'ledger.insolvency.distribution': [ins, 'recoveriesByRank', { ...ranks, TAX: 0 }],
  'ledger.insolvency.closed': [ins, 'recoveriesByRank', { ...ranks, TAX: 0 }],
  'ledger.insolvency.personal.opened': [{ ...ins, debtorId: 'chr_A' }, 'recoveriesByRank', { ...ranks, TAX: 0 }],
  'ledger.insolvency.personal.distribution': [{ ...ins, debtorId: 'chr_A' }, 'recoveriesByRank', { ...ranks, TAX: 0 }],
  'ledger.insolvency.personal.closed': [{ ...ins, debtorId: 'chr_A' }, 'recoveriesByRank', { ...ranks, TAX: 0 }],
  'ledger.freshStart': [{ chrId: 'chr_A', amount: '50' }, 'amount', 50],
  'ledger.related_party.flag': [{ entryId: 'e1', deviationPct: 0.3 }, 'deviationPct', '0.3'],
  'stab.daily.report': [{
    dayIndex: 4, byCcy: { FDL: { M0: '1', M0_sys: '0', M2: '2' } }, pem: '1', pew: '2', na: 3, e: 0.1, u: 0.05, levers, leverChange: levers,
    familiesDay: { START_CASH: '5' }, familiesYear: { START_CASH: 5 }, rho: 1, msi: 1, mode: 'OBSERVE',
  }, 'pem', 1],
  'stab.lever.changed': [{ lever: 'L2', from: 1, to: 1.1 }, 'from', '1'],
  'stab.alert': [{ alert: 'RHO_BAND', value: 1.4 }, 'value', '1.4'],
  'msi.updated': [{ msi: 1.01, raw: 1.02 }, 'msi', '1.01'],
  'ledger.invariant.failed': [{ invariantId: 'INV_LED_001', entryId: 'e1', module: '03' }, 'invariantId', 1],
};
/** 03 §5 kinds with the conditional rows split per E-81 (iii). */
const KINDS_03_5 = [
  'ledger.entry.committed', 'ledger.statement.ready', 'ledger.statement.published', 'ledger.tax.estimate', 'ledger.tax.due', 'ledger.tax.paid', 'ledger.tax.late',
  'ledger.tax.audit.selected', 'ledger.tax.audit.finding', 'ledger.default', 'ledger.insolvency.review', 'ledger.insolvency.opened',
  'ledger.insolvency.distribution', 'ledger.insolvency.closed', 'ledger.insolvency.personal.opened', 'ledger.insolvency.personal.distribution',
  'ledger.insolvency.personal.closed', 'ledger.freshStart', 'ledger.related_party.flag', 'stab.daily.report',
  'stab.lever.changed', 'stab.alert', 'msi.updated', 'ledger.invariant.failed',
];

describe('T03-01 LEDGER_EVENTS', () => {
  const kinds = Object.keys(LEDGER_EVENTS) as LedgerEventKind[];
  it('covers exactly the 03 §5 kinds, each with a visibility', () => {
    expect([...kinds].sort()).toEqual([...KINDS_03_5].sort());
    expect(Object.keys(LEDGER_EVENT_VISIBILITY).sort()).toEqual([...KINDS_03_5].sort());
  });
  it('AC-03-01-VIS-FIXED (a): one constant visibility per kind, per 03 §5 and the E-81 (iii) table', () => {
    expect(Object.isFrozen(LEDGER_EVENT_VISIBILITY)).toBe(true);
    expect(LEDGER_EVENT_VISIBILITY).toEqual({
      'ledger.entry.committed': 'PARTIES', 'ledger.statement.ready': 'PRIVATE', 'ledger.statement.published': 'PUBLIC', 'ledger.tax.estimate': 'PRIVATE', 'ledger.tax.due': 'PRIVATE',
      'ledger.tax.paid': 'PRIVATE', 'ledger.tax.late': 'PRIVATE', 'ledger.tax.audit.selected': 'PRIVATE', 'ledger.tax.audit.finding': 'SEALED',
      'ledger.default': 'PARTIES', 'ledger.insolvency.review': 'PRIVATE', 'ledger.insolvency.opened': 'PUBLIC',
      'ledger.insolvency.distribution': 'PUBLIC', 'ledger.insolvency.closed': 'PUBLIC', 'ledger.insolvency.personal.opened': 'PRIVATE',
      'ledger.insolvency.personal.distribution': 'PRIVATE', 'ledger.insolvency.personal.closed': 'PRIVATE', 'ledger.freshStart': 'PRIVATE',
      'ledger.related_party.flag': 'PRIVATE', 'stab.daily.report': 'PUBLIC', 'stab.lever.changed': 'PUBLIC', 'stab.alert': 'PRIVATE',
      'msi.updated': 'PUBLIC', 'ledger.invariant.failed': 'SEALED',
    });
  });
  for (const kind of KINDS_03_5 as LedgerEventKind[]) {
    it(`${kind}: parses a valid sample, rejects a wrong-typed field`, () => {
      const [valid, field, bad] = SAMPLES[kind];
      const schema = LEDGER_EVENTS[kind];
      expect(schema.safeParse(valid).success).toBe(true);
      expect(schema.safeParse({ ...valid, [field]: bad }).success).toBe(false);
      if ('amount' in valid) expect(schema.safeParse({ ...valid, amount: 1 }).success).toBe(false);
      expect(schema.safeParse({}).success).toBe(false);
    });
  }
  it('stab.lever.changed lever is one of L1..L4 (T03-24 Levers)', () => {
    const s = LEDGER_EVENTS['stab.lever.changed'];
    for (const lever of ['L1', 'L2', 'L3', 'L4']) expect(s.safeParse({ lever, from: 1, to: 2 }).success).toBe(true);
    expect(s.safeParse({ lever: 'L5', from: 1, to: 2 }).success).toBe(false);
  });
  it('money strings are decimal integers', () => {
    const s = LEDGER_EVENTS['ledger.freshStart'];
    expect(s.safeParse({ chrId: 'chr_A', amount: '-12' }).success).toBe(true);
    for (const a of ['1.5', '1e3', '', ' 1', '0x10']) expect(s.safeParse({ chrId: 'chr_A', amount: a }).success).toBe(false);
  });
  it('invariant.failed entryId and entityId are optional', () => {
    expect(LEDGER_EVENTS['ledger.invariant.failed'].safeParse({ invariantId: 'I', module: '03' }).success).toBe(true);
  });
  it('AC-03-01-VIS-FIXED (b): emitLedger passes LEDGER_EVENT_VISIBILITY[kind] and takes no visibility argument', () => {
    const calls: unknown[][] = [];
    const ctx = { emit: (...a: unknown[]) => { calls.push(a); } };
    expect(emitLedger.length).toBe(5); // (ctx, kind, subjectIds, payload, partyIds?)
    const [ins] = SAMPLES['ledger.insolvency.opened'];
    for (const kind of ['ledger.statement.ready', 'ledger.statement.published', 'ledger.insolvency.opened', 'ledger.insolvency.personal.opened'] as const) {
      emitLedger(ctx, kind, ['x'], kind.startsWith('ledger.statement') ? SAMPLES[kind][0] as never : ins as never);
    }
    emitLedger(ctx, 'ledger.default', ['chr_A'], { debtorId: 'chr_A', obligationRef: 'loan_1', amount: '9' }, ['chr_A', 'bnk_1']);
    expect(calls.map((c) => [c[0], c[3]])).toEqual([
      ['ledger.statement.ready', 'PRIVATE'], ['ledger.statement.published', 'PUBLIC'], ['ledger.insolvency.opened', 'PUBLIC'],
      ['ledger.insolvency.personal.opened', 'PRIVATE'], ['ledger.default', 'PARTIES'],
    ]);
    expect(calls[0]).toHaveLength(4);
    expect(calls[4]![4]).toEqual(['chr_A', 'bnk_1']);
  });
  it('E-81 (ii): MoneySupplyReport is z.infer of stab.daily.report, with Levers from T03-01', () => {
    const [sample] = SAMPLES['stab.daily.report'];
    const r: MoneySupplyReport = LEDGER_EVENTS['stab.daily.report'].parse(sample);
    const l: Levers = r.levers;
    expect(l).toEqual(levers);
    expect(Object.keys(LEDGER_EVENTS['stab.daily.report'].shape).sort()).toEqual(
      ['dayIndex', 'byCcy', 'pem', 'pew', 'na', 'e', 'u', 'levers', 'leverChange', 'familiesDay', 'familiesYear', 'rho', 'msi', 'mode'].sort());
    expect(LEDGER_EVENTS['stab.daily.report'].safeParse({ ...sample, mode: 'PASSIVE' }).success).toBe(false);
  });
});
