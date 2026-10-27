import { SortedMap } from './det';
import { isCcy, type Ccy, type Id } from './money';
import type { BlocCode, EntityKind } from './types';

export type AccountClass = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' | 'MEMO';
export const SYS_ID = 'sys_SYSTEM';
export const cbkId = (ccy: Ccy): Id => `cbk_${ccy}`;

/** Pure memo of kindOfId (ids are immutable strings); holds no world state. */
const KIND: Record<string, EntityKind | null> = Object.create(null);
export function kindOfId(id: Id): EntityKind | undefined {
  const hit = KIND[id];
  if (hit !== undefined) return hit ?? undefined;
  const r = kindUncached(id); KIND[id] = r ?? null; return r;
}
function kindUncached(id: Id): EntityKind | undefined {
  const k = id.split('_')[0];
  return (['sys', 'cbk', 'gov', 'reg', 'crt', 'exc', 'ccp', 'rat', 'bnk', 'ins', 'fnd', 'spv', 'cmp', 'biz', 'prop', 'ali', 'npc', 'hh', 'frm', 'row', 'chr'] as const)
    .find((x) => x === k);
}

/** '<entityId>:<code>[:<sub>]:<ccy>'; the sub may itself contain ':' (e.g. RESTRICTED:51840:AD_GRANT). */
export function accountKey(entityId: Id, code: number, ccy: Ccy, sub?: string): string {
  return sub === undefined ? `${entityId}:${code}:${ccy}` : `${entityId}:${code}:${sub}:${ccy}`;
}
export interface ParsedKey { entityId: Id; code: number; sub?: string; ccy: Ccy }
/** Pure memo of parseAccountKey (keys are immutable strings); holds no world state. */
const PARSED: Record<string, ParsedKey | null> = Object.create(null);
export function parseAccountKey(key: string): ParsedKey | undefined {
  const hit = PARSED[key];
  if (hit !== undefined) return hit ?? undefined;
  const r = parseUncached(key);
  PARSED[key] = r ?? null;
  return r;
}
function parseUncached(key: string): ParsedKey | undefined {
  const parts = key.split(':');
  if (parts.length < 3) return undefined;
  const ccy = parts[parts.length - 1];
  const code = Number(parts[1]);
  if (!isCcy(ccy) || !/^\d{4}$/.test(parts[1]) || parts[0] === '' || kindOfId(parts[0]) === undefined) return undefined;
  const sub = parts.length > 3 ? parts.slice(2, -1).join(':') : undefined;
  return { entityId: parts[0], code, sub, ccy };
}
export const entityOfKey = (key: string): Id => key.split(':')[0];

/** Class by first digit (T03-01): contra 1309/1839 stay ASSET, 3150 EQUITY; 6xxx income taxes are EXPENSE; 9xxx MEMO. */
export function classOfCode(code: number): AccountClass | undefined {
  const d = Math.floor(code / 1000);
  return (['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE', 'EXPENSE', undefined, undefined, 'MEMO'] as const)[d - 1];
}
/** Base-money accounts (BMA, spec §2.5) and deposits. 1009 is virtual elastic money (never M0/M2). */
export const BMA_CODES = [1001, 1002, 1003] as const;
export function isMoneyCode(code: number, kind: EntityKind | undefined): boolean {
  return code === 1001 || code === 1002 || code === 1003 || code === 1010 || (code === 1009 && (kind === 'hh' || kind === 'frm' || kind === 'row'));
}
/** T03-06 defaultMoneyCode: bnk, ccp -> 1002 reserves; gov -> 1003 treasury; others 1001 settlement cash. */
export function defaultMoneyCode(kind: EntityKind | undefined): 1001 | 1002 | 1003 {
  return kind === 'bnk' || kind === 'ccp' ? 1002 : kind === 'gov' ? 1003 : 1001;
}
/** cbk holder liability mirroring a holder BMA (03 §3.5.3). */
export const cbMirrorCode = (bma: 1001 | 1002 | 1003): 2001 | 2002 | 2003 => (bma + 1000) as 2001 | 2002 | 2003;
export const RESTRICTED_PREFIX = 'RESTRICTED:';
export const restrictedSub = (releaseTick: number, tag: string): string => `${RESTRICTED_PREFIX}${releaseTick}:${tag}`;

/** The 03 §3.2 chart of accounts as data (T03-01, E-79: lives in accounts.ts). */
export interface ChartEntry {
  code: number; name: string; cls: AccountClass; subMeaning: string | null; isMoney: boolean;
  kinds: readonly EntityKind[] | 'ALL'; qtyBearing: boolean; contra: boolean; mustBeZeroAtP13: boolean; consolidatedOnly: boolean;
}
/** [code, exact 03 §3.2 name, sub-key meaning ('—' = null)]. 9xxx names drop the parenthesised notes of the memo list. */
const CHART_ROWS: readonly (readonly [number, string, string | null])[] = [
  [1001, 'Settlement cash', null],
  [1002, 'Reserves at central bank', null],
  [1003, 'Treasury account at central bank', 'sub-accounts: GENERAL, DEPOSIT_INSURANCE_FUND'],
  [1009, 'Elastic money (virtual)', null],
  [1010, 'Deposits at bank', 'bnkId'],
  [1050, 'Margin posted', 'ccpId or prime-broker bnkId'],
  [1060, 'Default-fund contribution', 'ccpId'],
  [1070, 'Escrow deposited', 'contractId or caseId'],
  [1100, 'Trade receivables', 'counterpartyId'],
  [1110, 'Interest receivable', 'instrument or loanId'],
  [1120, 'Dividends receivable', 'assetId'],
  [1130, 'Tax receivable (refunds)', 'jurisdiction:taxType'],
  [1140, 'Insurance and reinsurance recoverables', 'policyId'],
  [1150, 'Due from related parties', 'entityId'],
  [1160, 'Judgments and restitution receivable', 'caseId'],
  [1190, 'Other receivables', 'ref'],
  [1200, 'Inventory (goods)', 'sku'],
  [1210, 'Physical commodities', 'commodityId (qty)'],
  [1220, 'Compute balance', "'OWNED' / 'RESERVED' (qty in PFLOP-day×1000)"],
  [1221, 'Restricted compute (hijack loot)', 'sessionId (qty)'],
  [1230, 'Prepaid expenses', 'ref'],
  [1300, 'Loans receivable', 'loanId'],
  [1301, 'Mortgages receivable', 'loanId'],
  [1302, 'Margin loans receivable', 'accountId'],
  [1303, 'Credit lines drawn', 'lineId'],
  [1304, 'Interbank loans', 'loanId'],
  [1305, 'Reverse repo (cash lent)', 'repoId'],
  [1306, 'P2P loans receivable', 'contractId'],
  [1307, 'Central-bank lending to banks', 'facilityId'],
  [1309, 'Allowance for credit losses (contra-asset)', 'portfolioId'],
  [1500, 'Listed equities', 'assetId (qty)'],
  [1510, 'ETFs', 'assetId (qty)'],
  [1520, 'Bonds', 'assetId (face qty)'],
  [1530, 'Fund units', 'fndId (qty)'],
  [1540, 'Crypto tokens', 'tokenId (qty)'],
  [1541, 'DeFi liquidity positions', 'poolId (qty LP tokens)'],
  [1542, 'DeFi lending deposits', 'protocolId:tokenId (qty)'],
  [1560, 'Structured tranches', 'trancheId (qty)'],
  [1570, 'Private equity and venture stakes', 'cmpId:shareClass (qty)'],
  [1580, 'Investments in controlled entities', 'entityId'],
  [1600, 'Derivative assets', 'positionId'],
  [1700, 'AI models', 'modelId'],
  [1710, 'Datasets', 'datasetId'],
  [1720, 'Purchased licenses (model, data)', 'licenseId'],
  [1730, 'Goodwill', 'acquisitionId'],
  [1740, 'Concession rights', 'concessionId'],
  [1800, 'Property', 'propId'],
  [1810, 'Construction in progress', 'projectId'],
  [1830, 'Equipment and upgrades', 'bizId:axis'],
  [1839, 'Accumulated depreciation (contra)', 'matching sub'],
  [1840, 'Computing hardware', 'clusterId'],
  [1850, 'Vehicles, vessels, aircraft', 'assetId'],
  [1860, 'Lifestyle durables', 'itemId'],
  [1870, 'Collectibles', 'itemId'],
  [1880, 'Storage and logistics infrastructure', 'assetId'],
  [1900, 'Deferred tax assets', 'jurisdiction'],
  [1909, 'Elastic sector advances', 'sectorId'],
  [1910, 'Claim on the Stabilizer', null],
  [1950, 'Due from owner / group current account', 'entityId'],
  [1999, 'Suspense', null],
  [2001, 'Settlement cash issued', 'holderId'],
  [2002, 'Reserves owed', 'bnkId / ccpId'],
  [2003, 'Treasury account owed', 'govId'],
  [2100, 'Customer deposits', 'holderId'],
  [2110, 'Interbank borrowing', 'lenderId'],
  [2120, 'Central-bank borrowing', 'facilityId'],
  [2130, 'Repo borrowing', 'repoId'],
  [2140, 'Margin received', 'memberId'],
  [2150, 'Default fund received', 'memberId'],
  [2160, 'Escrow held', 'contractId'],
  [2200, 'Loans payable', 'loanId'],
  [2201, 'Mortgages payable', 'loanId'],
  [2202, 'Margin loans payable', 'accountId'],
  [2203, 'Credit lines payable', 'lineId'],
  [2206, 'P2P loans payable', 'contractId'],
  [2300, 'Bonds issued', 'assetId'],
  [2310, 'Sovereign debt issued', 'assetId'],
  [2320, 'Tranches issued', 'trancheId'],
  [2330, 'Stablecoins issued', 'tokenId'],
  [2400, 'Taxes payable', 'jurisdiction:taxType:year'],
  [2410, 'VAT payable', 'jurisdiction'],
  [2420, 'Withholding tax payable', 'jurisdiction'],
  [2430, 'Deferred tax liabilities', 'jurisdiction'],
  [2500, 'Trade payables', 'counterpartyId'],
  [2510, 'Wages payable', null],
  [2520, 'Interest payable', 'instrument or loanId'],
  [2530, 'Dividends payable', 'assetId'],
  [2540, 'Rent payable', 'propId'],
  [2550, 'Fines and judgments payable', 'caseId'],
  [2560, 'Restitution payable', 'caseId'],
  [2570, 'Tenant deposits held', 'tenantId'],
  [2580, 'Unearned revenue', 'ref'],
  [2590, 'Accrued expenses', 'ref'],
  [2600, 'Derivative liabilities', 'positionId'],
  [2700, 'Claims reserves (case + IBNR)', 'lineId'],
  [2710, 'Unearned premium reserve', 'lineId'],
  [2800, 'Due to related parties', 'entityId'],
  [2900, 'Issuance owed to central bank', 'ccy'],
  [2909, 'Owed to elastic sectors', 'sectorId'],
  [2950, "Owner's current account", 'ownerId'],
  [2990, 'Persistent claims after discharge', 'creditorId'],
  [2999, 'Suspense', null],
  [3100, 'Share capital', 'shareClass'],
  [3110, 'Share premium', null],
  [3150, 'Treasury shares (contra)', null],
  [3200, 'Retained earnings', null],
  [3300, 'Current-period result', null],
  [3400, 'Revaluation surplus', null],
  [3500, 'FX translation reserve', null],
  [3600, 'Non-controlling interests', null],
  [3700, 'Fund capital', null],
  [3800, 'Currency trading accounts', 'ccy'],
  [3900, "Owner's equity", null],
  [3990, 'Net issuance', null],
  [4000, 'Sales revenue', 'segment, counterparty class or asset'],
  [4010, 'Rental income', 'segment, counterparty class or asset'],
  [4020, 'Interest income', 'segment, counterparty class or asset'],
  [4030, 'Dividend income', 'segment, counterparty class or asset'],
  [4040, 'Fees and commissions income', 'segment, counterparty class or asset'],
  [4050, 'Insurance premiums earned', 'segment, counterparty class or asset'],
  [4060, 'Realized trading gains', 'segment, counterparty class or asset'],
  [4070, 'Unrealized gains (fair value)', 'segment, counterparty class or asset'],
  [4080, 'FX gains (realized)', 'segment, counterparty class or asset'],
  [4090, 'Gains on disposal of non-financial assets', 'segment, counterparty class or asset'],
  [4100, 'Subsidies and grants', 'segment, counterparty class or asset'],
  [4110, 'Faucet income (start cash, grants, ads, rewards, compensation)', 'segment, counterparty class or asset'],
  [4120, 'Judgments, restitution and settlements received', 'segment, counterparty class or asset'],
  [4130, 'Gains on debt extinguishment', 'segment, counterparty class or asset'],
  [4140, 'Royalties and licence income', 'segment, counterparty class or asset'],
  [4150, 'Investment income from controlled entities (look-through result)', 'segment, counterparty class or asset'],
  [4190, 'Other income', 'segment, counterparty class or asset'],
  [4900, 'System burn income (sys only)', 'segment, counterparty class or asset'],
  [5000, 'Cost of goods sold', null],
  [5010, 'Wages and staff', null],
  [5020, 'Rent', null],
  [5030, 'Energy', null],
  [5040, 'Upkeep and maintenance', null],
  [5050, 'Marketing', null],
  [5060, 'Compute and data', null],
  [5070, 'Professional and legal fees', null],
  [5080, 'Fees, commissions and levies paid', null],
  [5090, 'Interest expense', null],
  [5100, 'Insurance premiums', null],
  [5110, 'Claims incurred', null],
  [5120, 'Depreciation', null],
  [5130, 'Amortization', null],
  [5140, 'Impairment and write-downs', null],
  [5150, 'Credit-loss expense', null],
  [5160, 'Realized trading losses', null],
  [5170, 'Unrealized losses (fair value)', null],
  [5180, 'FX losses (realized)', null],
  [5190, 'Losses on disposal', null],
  [5200, 'Lifestyle consumption (chr)', null],
  [5210, 'Fines and penalties', null],
  [5220, 'Restitution and settlements paid', null],
  [5230, 'Security, defence and operations', null],
  [5240, 'Lobbying, donations, hosting', null],
  [5250, 'Licences, charters, registrations', null],
  [5260, 'Property and other non-income taxes', null],
  [5270, 'Irrecoverable VAT', null],
  [5280, 'Transaction taxes', null],
  [5900, 'Net issuance expense (sys only)', null],
  [6000, 'Current income tax', null],
  [6010, 'Deferred tax', null],
  [6020, 'Withholding tax suffered (non-creditable part)', null],
  [9100, 'Collateral received', null],
  [9110, 'Securities lent out', null],
  [9200, 'Encumbrances register', null],
  [9300, 'Holds mirror', null],
  [9900, 'Interpartition suspense', 'A->B'],
  [9910, 'Challenge-event books', null],
];
const KINDS: Readonly<Record<number, readonly EntityKind[]>> = {
  1003: ['gov'], 1009: ['hh', 'frm', 'row'], 1307: ['cbk'], 1910: ['cbk'],
  1909: ['sys'], 2900: ['sys'], 2909: ['sys'], 3990: ['sys'], 4900: ['sys'], 5900: ['sys'], 9900: ['sys'],
  2001: ['cbk'], 2002: ['cbk'], 2003: ['cbk'], 2100: ['bnk'], 2140: ['ccp', 'bnk'], 2150: ['ccp', 'crt'], 2160: ['ccp', 'crt'],
  2310: ['gov'], 2320: ['spv'], 2700: ['ins'], 2710: ['ins'], 2950: ['biz', 'prop'], 3700: ['fnd'], 3900: ['chr', 'ali'],
};
const QTY_BEARING: readonly number[] = [1200, 1210, 1220, 1221, 1500, 1510, 1520, 1530, 1540, 1541, 1542, 1560, 1570, 1580, 1800, 1850, 1860, 1870, 1880,
  2300, 2310, 2320, 2330, 3100, 3150, 9100, 9110];
const CONTRA: readonly number[] = [1309, 1839, 3150];
const ZERO_AT_P13: readonly number[] = [1999, 2999];
const CONSOLIDATED_ONLY: readonly number[] = [3500, 3600];
/** Static money flag; 1009 is money only for elastic kinds and never in M0 (03 §3.5.2), see isMoneyCode. */
const MONEY: readonly number[] = [1001, 1002, 1003, 1010];
export const CHART: SortedMap<string, ChartEntry> = new SortedMap<string, ChartEntry>(CHART_ROWS.map(([code, name, subMeaning]) => [
  String(code).padStart(4, '0'),
  Object.freeze({
    code, name, cls: classOfCode(code) as AccountClass, subMeaning, isMoney: MONEY.includes(code),
    kinds: KINDS[code] ?? 'ALL', qtyBearing: QTY_BEARING.includes(code), contra: CONTRA.includes(code),
    mustBeZeroAtP13: ZERO_AT_P13.includes(code), consolidatedOnly: CONSOLIDATED_ONLY.includes(code),
  }),
] as const));
export function chartEntry(code: number): ChartEntry | undefined {
  return Number.isInteger(code) && code >= 0 ? CHART.get(String(code).padStart(4, '0')) : undefined;
}
export function kindMayUse(code: number, kind: EntityKind): boolean {
  const e = chartEntry(code);
  return e !== undefined && (e.kinds === 'ALL' || e.kinds.includes(kind));
}
/** 03 §3.3.8 marketable positions (1220 OWNED compute excluded). */
export const MARKETABLE_CODES: readonly number[] = [1500, 1510, 1520, 1530, 1540, 1541, 1542, 1560, 1600, 2600, 1210, 1870];

/** Authored system entity ids (T03-01 ids; authored ids in 22 must use these). */
export const govId = (bloc: BlocCode): Id => `gov_${bloc}`;
export const frmId = (bloc: BlocCode): Id => `frm_${bloc}`;
export const hhId = (cityId: string): Id => `hh_${cityId}`;
export const ROW_ID = 'row_WORLD';
/** The Clearing House. */
export const CCP_ID = 'ccp_TCH';
/** 03 §3.12.8: the FDL treasury collects for the free zone. */
export const SERENA_AUTHORITY_GOV: Id = govId('FDL');
/** 9900 interpartition suspense sub `A->B`. */
export const suspenseSub = (fromPartition: string, toPartition: string): string => `${fromPartition}->${toPartition}`;
