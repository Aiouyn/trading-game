// T03-01 step 6: zod 4 payload schemas for every 03 §5 engine event (E-79: the one new file of the mapping).
import { z } from 'zod';
import type { Id, PhaseCtx, Visibility } from '@tycoon/engine-core';
import type { ClaimRank, TaxType } from './types';

/** Money as a decimal integer string (micro units). */
const money = z.string().regex(/^-?\d+$/);
const id = z.string();
const tick = z.number().int();
const TAX_TYPES = ['PERSONAL_INCOME', 'CAPITAL_GAINS', 'CORPORATE', 'PROPERTY', 'VAT', 'SEC_TX', 'STAMP', 'P2P', 'WHT', 'EXIT', 'FRANCHISE'] as const satisfies readonly TaxType[];
const CLAIM_RANKS = ['SECURED', 'ADMIN', 'TAX', 'WAGES', 'DEPOSITS_INSURED', 'SENIOR_UNSECURED', 'SUBORDINATED', 'PREFERRED_EQUITY', 'COMMON_EQUITY'] as const satisfies readonly ClaimRank[];
const taxObligation = z.object({ taxAccountId: id, amount: money, dueTick: tick });
const insolvency = z.object({ caseId: id, debtorId: id, procedure: z.string(), recoveriesByRank: z.record(z.enum(CLAIM_RANKS), money) });
/** T03-24 `Levers` (03 §3.7); defined here, T03-24 imports it (E-81 (ii)). */
const levers = z.object({ L1_demand: z.number(), L2_lifestyle_price: z.number(), L3_levy_bp: z.number(), L4_upkeep: z.number() });
export type Levers = z.infer<typeof levers>;
const statement = z.object({ entityId: id, period: z.object({ kind: z.string(), index: z.number().int() }), scope: z.string() });

export const LEDGER_EVENTS = {
  'ledger.entry.committed': z.object({ entryId: id, reason: z.string(), amount: money, ccy: z.string(), counterpartyLabel: z.string() }),
  'ledger.statement.ready': statement,
  /** E-81 (iii): emitted at the earnings date for each statement 03 §3.13.6 publishes; never for chr. */
  'ledger.statement.published': statement,
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
  /** E-81 (iii): the debtor is a character (kind chr); same payload as ledger.insolvency.*. */
  'ledger.insolvency.personal.opened': insolvency,
  'ledger.insolvency.personal.distribution': insolvency,
  'ledger.insolvency.personal.closed': insolvency,
  'ledger.freshStart': z.object({ chrId: id, amount: money }),
  'ledger.related_party.flag': z.object({ entryId: id, deviationPct: z.number() }),
  /** 03 §3.7.7 Money Supply Report with T03-24's field names plus msi and mode (E-81 (ii)); T03-24 `MoneySupplyReport` is z.infer of it.
   *  familiesDay and familiesYear are both money strings (E-83 (2)). */
  'stab.daily.report': z.object({
    dayIndex: z.number().int(), byCcy: z.record(z.string(), z.object({ M0: money, M0_sys: money, M2: money })), pem: money, pew: money,
    na: z.number(), e: z.number(), u: z.number(), levers, leverChange: levers,
    familiesDay: z.record(z.string(), money), familiesYear: z.record(z.string(), money), rho: z.number(), msi: z.number(),
    mode: z.enum(['OBSERVE', 'ACTIVE']),
  }),
  'stab.lever.changed': z.object({ lever: z.enum(['L1', 'L2', 'L3', 'L4']), from: z.number(), to: z.number() }),
  'stab.alert': z.object({ alert: z.enum(['STRUCTURAL_IMBALANCE', 'INFLATION', 'RHO_BAND']), value: z.number() }),
  'msi.updated': z.object({ msi: z.number(), raw: z.number() }),
  'ledger.invariant.failed': z.object({ invariantId: z.string(), entryId: id.optional(), entityId: id.optional(), module: z.string() }),
} as const satisfies Record<string, z.ZodType>;
export type LedgerEventKind = keyof typeof LEDGER_EVENTS;
/** T03-24 Money Supply Report: z.infer of the stab.daily.report schema, not a second interface (E-81 (ii)). */
export type MoneySupplyReport = z.infer<(typeof LEDGER_EVENTS)['stab.daily.report']>;

/**
 * 03 §5 visibility, one constant per kind (E-81 (iii), AC-03-01-VIS-FIXED): the conditional rows are split into kinds and the
 * emitter cannot raise or lower a visibility. stab.alert is PRIVATE, addressed to sys_SYSTEM as the ops channel.
 */
export const LEDGER_EVENT_VISIBILITY: Readonly<Record<LedgerEventKind, Visibility>> = Object.freeze({
  'ledger.entry.committed': 'PARTIES',
  'ledger.statement.ready': 'PRIVATE',
  'ledger.statement.published': 'PUBLIC',
  'ledger.tax.estimate': 'PRIVATE',
  'ledger.tax.due': 'PRIVATE',
  'ledger.tax.paid': 'PRIVATE',
  'ledger.tax.late': 'PRIVATE',
  'ledger.tax.audit.selected': 'PRIVATE',
  'ledger.tax.audit.finding': 'SEALED',
  'ledger.default': 'PARTIES',
  'ledger.insolvency.review': 'PRIVATE',
  'ledger.insolvency.opened': 'PUBLIC',
  'ledger.insolvency.distribution': 'PUBLIC',
  'ledger.insolvency.closed': 'PUBLIC',
  'ledger.insolvency.personal.opened': 'PRIVATE',
  'ledger.insolvency.personal.distribution': 'PRIVATE',
  'ledger.insolvency.personal.closed': 'PRIVATE',
  'ledger.freshStart': 'PRIVATE',
  'ledger.related_party.flag': 'PRIVATE',
  'stab.daily.report': 'PUBLIC',
  'stab.lever.changed': 'PUBLIC',
  'stab.alert': 'PRIVATE',
  'msi.updated': 'PUBLIC',
  'ledger.invariant.failed': 'SEALED',
});

/** The emit half of T02-11's PhaseCtx (`ctx.emit(kind, subjectIds, payload, visibility, partyIds?)`), now that #46 is on main. */
type EmitCtx = Pick<PhaseCtx, 'emit'>;

/**
 * The ledger's only emit path (E-81 (iii)): the visibility is always LEDGER_EVENT_VISIBILITY[kind]; there is no visibility parameter.
 */
export function emitLedger<K extends LedgerEventKind>(ctx: EmitCtx, kind: K, subjectIds: Id[], payload: z.input<(typeof LEDGER_EVENTS)[K]>, partyIds?: Id[]): void {
  if (partyIds === undefined) ctx.emit(kind, subjectIds, payload, LEDGER_EVENT_VISIBILITY[kind]);
  else ctx.emit(kind, subjectIds, payload, LEDGER_EVENT_VISIBILITY[kind], partyIds);
}
