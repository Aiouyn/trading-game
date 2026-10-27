// T03-01 step 6: zod 4 payload schemas for every 03 §5 engine event (E-79: the one new file of the mapping).
import { z } from 'zod';
import type { Visibility } from '@tycoon/engine-core';
import type { ClaimRank, TaxType } from './types';

/** Money as a decimal integer string (micro units). */
const money = z.string().regex(/^-?\d+$/);
const id = z.string();
const tick = z.number().int();
const TAX_TYPES = ['PERSONAL_INCOME', 'CAPITAL_GAINS', 'CORPORATE', 'PROPERTY', 'VAT', 'SEC_TX', 'STAMP', 'P2P', 'WHT', 'EXIT', 'FRANCHISE'] as const satisfies readonly TaxType[];
const CLAIM_RANKS = ['SECURED', 'ADMIN', 'TAX', 'WAGES', 'DEPOSITS_INSURED', 'SENIOR_UNSECURED', 'SUBORDINATED', 'PREFERRED_EQUITY', 'COMMON_EQUITY'] as const satisfies readonly ClaimRank[];
const taxObligation = z.object({ taxAccountId: id, amount: money, dueTick: tick });
const insolvency = z.object({ caseId: id, debtorId: id, procedure: z.string(), recoveriesByRank: z.record(z.enum(CLAIM_RANKS), money) });
/** T03-24 `Levers` (03 §3.7). */
const levers = z.object({ L1_demand: z.number(), L2_lifestyle_price: z.number(), L3_levy_bp: z.number(), L4_upkeep: z.number() });

export const LEDGER_EVENTS = {
  'ledger.entry.committed': z.object({ entryId: id, reason: z.string(), amount: money, ccy: z.string(), counterpartyLabel: z.string() }),
  'ledger.statement.ready': z.object({ entityId: id, period: z.object({ kind: z.string(), index: z.number().int() }), scope: z.string() }),
  'ledger.tax.estimate': z.object({ entityId: id, ytdByType: z.record(z.enum(TAX_TYPES), money) }),
  'ledger.tax.due': taxObligation,
  'ledger.tax.paid': taxObligation,
  'ledger.tax.late': taxObligation,
  'ledger.tax.audit.selected': z.object({ entityId: id, scope: z.enum(['PERSONAL', 'CORPORATE']) }),
  'ledger.tax.audit.finding': z.object({
    entityId: id, findingKind: z.enum(['UNEXPLAINED_WEALTH', 'FALSE_SUBSTANCE']), amount: money, codes: z.array(z.string()), evidencePoints: z.number(),
  }),
  'ledger.default': z.object({ debtorId: id, obligationRef: z.string(), amount: money }),
  'ledger.insolvency.review': z.object({ entityId: id, equity: money }),
  'ledger.insolvency.opened': insolvency,
  'ledger.insolvency.distribution': insolvency,
  'ledger.insolvency.closed': insolvency,
  'ledger.freshStart': z.object({ chrId: id, amount: money }),
  'ledger.related_party.flag': z.object({ entryId: id, deviationPct: z.number() }),
  /** 03 §3.7.7 Money Supply Report; field names and types are T03-24 `MoneySupplyReport`. */
  'stab.daily.report': z.object({
    dayIndex: z.number().int(), byCcy: z.record(z.string(), z.object({ M0: money, M0_sys: money, M2: money })), pem: money, pew: money,
    na: z.number(), e: z.number(), u: z.number(), levers, leverChange: levers,
    familiesDay: z.record(z.string(), money), familiesYear: z.record(z.string(), z.number()), rho: z.number(), msi: z.number(),
    mode: z.enum(['OBSERVE', 'ACTIVE']),
  }),
  'stab.lever.changed': z.object({ lever: z.enum(['L1', 'L2', 'L3', 'L4']), from: z.number(), to: z.number() }),
  'stab.alert': z.object({ alert: z.enum(['STRUCTURAL_IMBALANCE', 'INFLATION', 'RHO_BAND']), value: z.number() }),
  'msi.updated': z.object({ msi: z.number(), raw: z.number() }),
  'ledger.invariant.failed': z.object({ invariantId: z.string(), entryId: id.optional(), entityId: id.optional(), module: z.string() }),
} as const satisfies Record<string, z.ZodType>;
export type LedgerEventKind = keyof typeof LEDGER_EVENTS;

/**
 * 03 §5 visibility. Two rows carry a default the emitter may raise: ledger.statement.ready is PRIVATE to the owner (PUBLIC when the
 * statement is published) and the insolvency events are PRIVATE (the emitter chooses PUBLIC for non-chr debtors). stab.alert is
 * PRIVATE, addressed to sys_SYSTEM as the ops channel.
 */
export const LEDGER_EVENT_VISIBILITY: Readonly<Record<LedgerEventKind, Visibility>> = Object.freeze({
  'ledger.entry.committed': 'PARTIES',
  'ledger.statement.ready': 'PRIVATE',
  'ledger.tax.estimate': 'PRIVATE',
  'ledger.tax.due': 'PRIVATE',
  'ledger.tax.paid': 'PRIVATE',
  'ledger.tax.late': 'PRIVATE',
  'ledger.tax.audit.selected': 'PRIVATE',
  'ledger.tax.audit.finding': 'SEALED',
  'ledger.default': 'PARTIES',
  'ledger.insolvency.review': 'PRIVATE',
  'ledger.insolvency.opened': 'PRIVATE',
  'ledger.insolvency.distribution': 'PRIVATE',
  'ledger.insolvency.closed': 'PRIVATE',
  'ledger.freshStart': 'PRIVATE',
  'ledger.related_party.flag': 'PRIVATE',
  'stab.daily.report': 'PUBLIC',
  'stab.lever.changed': 'PUBLIC',
  'stab.alert': 'PRIVATE',
  'msi.updated': 'PUBLIC',
  'ledger.invariant.failed': 'SEALED',
});
