# 03 — Ledger and Accounting

Owner module: **03**. Binding contracts it implements: 00 §5.3 (entity kinds), §5.4 (ledger API, reason-code classes), §3.1 (units). Phase: **P13 ledger** (commit and invariants), plus day-close hooks in P2 (accruals, mark-to-market, Stabilizer, MSI) per 02 §3.4.
Depends on: 02 (clock, fixed-point helpers, determinism, partitions and holds), 04 (macro, fiscal behaviour of treasuries, central-bank credit), 05 (marks for listed instruments, ADV and volatility), 06–11 (valuation models of their assets), 13 (penalties, audits as cases), 14 (ranks read NW), 15 (boards read NW and NWI), 19 (storage), 20 (invariant harness).

---

## §1 Purpose

The ledger is the game's first law: **every unit of money and every unit of every asset exists on exactly one balance sheet, and moves only by a posting with a reason code**. This module defines:

1. the entity kinds and the balance sheet each one carries;
2. the full chart of accounts;
3. the double-entry posting model, its standard templates (pay, mint, burn, lend, revalue, FX) and the payment rail across settlement cash, bank deposits and partitions;
4. the complete reason-code catalog of the game, each code in exactly one class (FAUCET, SINK, TRANSFER, CREDIT_CREATE, CREDIT_DESTROY, REVALUE);
5. money aggregates (M0, M2, player-economy money and wealth), the faucet and sink inventory with target ratios, the **Stabilizer** PI controller, the **Money Supply Index (MSI)** and the **Net Worth Index (NWI)**;
6. valuation (marking) rules for every asset type, including illiquid ones;
7. consolidation of ownership chains, minority interests and intercompany elimination;
8. taxes in the five blocs and the Isla Serena free zone;
9. financial statements generated for every entity;
10. insolvency and bankruptcy accounting;
11. the invariants asserted every tick.

Design stance: real accounting where it creates gameplay (balance sheets, consolidation, taxes, credit creation, insolvency), simplification only where it would be invisible (no accrual-vs-cash tax timing nuances beyond those listed, no lease accounting standards). The ledger is also the evidence base for courts (13), the explanation base for "Why it moved" (18) and the data base for the Truth Machine (20).

---

## §2 Entities

### §2.1 Entity kinds (00 §5.3) and their balance-sheet templates

```ts
type EntityKind =
  | 'sys' | 'cbk' | 'gov' | 'reg' | 'crt' | 'exc' | 'ccp' | 'rat'
  | 'bnk' | 'ins' | 'fnd' | 'spv' | 'cmp' | 'biz' | 'prop' | 'ali'
  | 'npc' | 'hh'  | 'frm' | 'row' | 'chr';   // canonical order used for iteration (02 §3.7.3)

interface Entity {
  id: string;                    // '<kind>_<ulid>' (02 §3.13) or authored id e.g. 'cbk_FDL'
  kind: EntityKind;
  nameKey: string;               // display name (22 for authored entities; player-chosen for player entities)
  ownerId: string | null;        // direct parent for control purposes; chain ends at chr, npc, gov or sys (00 §5.3)
  rootOwnerId: string;           // cached end of the control chain
  perimeter: 'PLAYER' | 'NPC' | 'ELASTIC' | 'SYSTEM';   // §3.5.1
  homeBloc: BlocCode | 'SERENA'; // jurisdiction of residency/incorporation (§3.12.2)
  reportingCcy: Ccy;             // chr: 'FDL' always; others: home bloc currency (SERENA: 'FDL')
  partitionId: string;           // 02 §3.14.1
  status: EntityStatus;
  createdTick: Tick;
  closedTick?: Tick;
}
type EntityStatus =
  | 'ACTIVE' | 'FROZEN'            // court freeze (13) or ENGINE_REVIEW (02 §3.15)
  | 'INSOLVENCY_REVIEW'            // negative equity or missed payment detected (§3.14.1)
  | 'IN_INSOLVENCY'                // case open (§3.14)
  | 'DISSOLVED';
```

Perimeter and balance-sheet template by kind:

| Kind | Perimeter | Typical assets | Typical liabilities | Equity form |
|---|---|---|---|---|
| `sys` system accounts (one) | SYSTEM | elastic advances (1909) | issuance owed to central banks (2900), owed to elastic sectors (2909), interpartition suspense (9900) | net issuance (negative equity = cumulative net faucet) |
| `cbk` central bank (one per currency) | NPC | claim on Stabilizer (1910), loans to banks (1307), bonds bought (1520), FX reserves (1001 in other ccy), gold (1210) | settlement cash issued (2001), reserves (2002), treasury account (2003) | capital, retained earnings |
| `gov` treasury (one per bloc) | NPC | treasury account (1003), tax receivables, holdings, deposit-insurance fund (1003 sub-account) | sovereign debt (2310), payables | accumulated deficit (often negative equity, allowed: §3.14.6) |
| `reg` regulator, `crt` court system (one each per bloc) | NPC | escrowed seized assets (1070), victim compensation fund and whistleblower pool cash (1001 sub-accounts) | amounts owed to victims/whistleblowers | nil (pass-through) |
| `exc` exchange (one per bloc; concession may be player-held, §3.11.6) | NPC or PLAYER | cash, fee receivables | rebates payable | capital |
| `ccp` clearing house (one, the Clearing House; also escrow agent for contracts, 15) | NPC | reserves (1002), member default-fund (cash), collateral | margin received (2140), default fund received (2150), escrow held (2160) | CCP capital ("skin in the game") |
| `rat` rating agency | NPC | cash, receivables | payables | capital |
| `bnk` bank (NPC or player-chartered) | NPC or PLAYER | reserves (1002), loans (1300–1306), securities (1520), interbank (1304) | deposits (2100), interbank (2110), cbk borrowing (2120), repo (2130), bonds issued (2300) | capital (regulatory capital per 07) |
| `ins` insurer | NPC or PLAYER | investments, cash, reinsurance recoverables (1140) | claims reserves (2700), unearned premium (2710) | capital |
| `fnd` fund (incl. ETFs, SWFs) | NPC or PLAYER | portfolio, cash | redemptions payable, borrowing | fund capital (3700) = NAV |
| `spv` securitization vehicle | NPC or PLAYER | loan pool (1300 sub), reserve account | tranches issued (2320) | equity tranche (3100) |
| `cmp` company (legal entity, may be listed) | NPC or PLAYER | everything a company can own, incl. investments in `biz`, `prop`, subsidiaries | loans, bonds, payables, taxes | share capital, retained earnings |
| `biz` business unit (always 100% of one `cmp` or `chr`) | follows owner | operating cash (1001), inventory (1200), equipment and upgrades (1830), receivables | payables, wages payable | owner's current account (2950) |
| `prop` property (always 100% of one owner; shares in property are via a `cmp`) | follows owner | property (1800), receivables, operating cash | tenant deposits (2570), payables, mortgage (2201, when the property itself is the borrower) | owner's current account (2950) |
| `ali` alliance treasury | PLAYER | cash, holdings | payables to members | members' equity |
| `npc` named NPC actor (person or institution, incl. NPC liquidity providers) | NPC | per type | per type | per type |
| `hh` household sector (one per city), `frm` firm sector (one per bloc), `row` rest of world (one) | ELASTIC | real claims: deposits at core banks (1010), bonds (1520), shares (1500), fund units (1530), property (1800), loans to/from core (1300/2200), plus **elastic money** (1009, virtual) | loans from core banks (2200) | derived |
| `chr` character | PLAYER | everything a person can own | personal loans, taxes, fines | owner's equity (3900) |

### §2.2 Accounts

```ts
type AccountClass = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' | 'MEMO';
interface Account {
  key: string;                   // '<entityId>:<code>[:<sub>]:<ccy>' e.g. 'chr_01H..:1500:ast_EQ_HALC:FDL'
  entityId: string;
  code: number;                  // chart of accounts (§3.2)
  sub?: string;                  // asset id, counterparty id, contract id, lot id, segment id
  ccy: Ccy;
  class: AccountClass;
  balance: Money;                // signed: debit-positive for ASSET/EXPENSE, credit-positive stored as negative (§3.3.1)
  qty?: Qty;                     // for asset accounts holding quantities (shares, bonds face, tokens, commodities, compute)
  assetId?: string;
  isMoney: boolean;              // true for 1001, 1002, 1003, 1010 (and 1009 for elastic sectors, virtual)
  openedTick: Tick;
}
```

### §2.3 Posting and entry (00 §5.4 plus allowed detail)

```ts
interface Posting {
  tick: Tick;
  entryId: string;               // groups the postings of one economic event; all balanced together
  postingSeq: number;            // order inside the entry
  debitAccount: string;          // account key
  creditAccount: string;         // account key
  amount: Money;                 // > 0n
  ccy: Ccy;                      // equals both accounts' ccy
  reason: ReasonCode;            // §3.4
  refs: string[];                // intentId, eventId, contractId, caseId, lotId, scheduled-process id
  qty?: Qty;                     // when an asset quantity moves with the value (both accounts must hold the same assetId)
  assetId?: string;
  legOf?: { legId: string; side: 'A' | 'B' };  // cross-partition legs (02 §3.14.2)
}
interface Entry {
  entryId: string;
  tick: Tick;
  template: TemplateId;          // §3.3.3
  reason: ReasonCode;            // primary reason (postings may use supporting codes, e.g. a tax leg)
  postings: Posting[];
  requestedBy: { module: string; phase: PhaseId; entityId?: string; intentId?: string };
}
```

### §2.4 Reason-code definition

```ts
type FlowClass = 'FAUCET' | 'SINK' | 'TRANSFER' | 'CREDIT_CREATE' | 'CREDIT_DESTROY' | 'REVALUE';
type CashFlowClass = 'OP' | 'INV' | 'FIN' | 'NC';   // operating, investing, financing, non-cash
interface ReasonCodeDef {
  code: string;                  // 'BIZ_SALES_HH'
  cls: FlowClass;                // exactly one (00 §5.4)
  owner: number;                 // module number that may request it
  cf: CashFlowClass;             // cash-flow statement category (§3.13.4)
  allowedTemplates: TemplateId[];
  taxTag?: TaxTag;               // §3.12: which tax base it feeds
  stabilizerFamily?: string;     // §3.6 family for the money report
  descriptionKey: string;
}
```

### §2.5 Tax lots (for capital gains)

```ts
interface TaxLot {
  lotId: string;
  entityId: string;
  assetId: string;
  qty: Qty;                      // remaining
  costBasis: Money;              // in entity's reporting ccy, including fees
  acquiredTick: Tick;
  washSaleAdjust: Money;         // disallowed loss added to basis (§3.12.6)
}
```

Lots are consumed **FIFO** by default; a character or company may elect **specific identification** per sale (payload field `lotIds`) for LIC2 and above. DEFAULT (Mathis may override).

### §2.6 Valuation marks

```ts
interface Mark {
  assetId: string;               // or entity-specific asset (bizId, propId, modelId, itemId)
  tick: Tick;
  price: Price;                  // per unit, in ccy
  ccy: Ccy;
  source: MarkSource;            // §3.9
  confidence: 'LIQUID' | 'MODEL' | 'APPRAISAL' | 'STALE';
  validUntilTick: Tick;
}
type MarkSource = 'CLEAR' | 'CLOSE' | 'NAV' | 'MODEL_FUND' | 'MODEL_CURVE' | 'MODEL_OPTION' | 'APPRAISAL' | 'INDEX' | 'COST_LESS_AMORT' | 'RECOVERY' | 'ZERO';
```

### §2.7 Ownership and groups

```ts
interface OwnershipEdge {
  holderId: string;              // entity holding the shares
  issuerId: string;              // cmp, fnd (units), spv (equity tranche), bnk, ins, exc
  shareClass: string;            // 'COMMON' | 'PREF_A' | ...
  qty: Qty;
  votingPct: number;             // float, holder's share of voting rights in issuer (derived)
  economicPct: number;           // float, share of residual economics (derived, after preferences)
}
interface Group {
  groupId: string;               // = id of the ultimate controlling parent
  parentId: string;
  members: { entityId: string; effectiveOwnership: number; controlPath: string[] }[];
  nci: Record<string, number>;   // memberId -> non-controlling share
}
```

### §2.8 Money aggregates, Stabilizer, indices

```ts
interface MoneyAggregates {             // per currency, computed in P13 every tick, published daily
  tick: Tick; ccy: Ccy;
  M0: Money;                            // cbk 2001 + 2002 + 2003
  M0_sys: Money;                        // outside money = sys:2900 = cbk:1910
  M0_cb: Money;                         // M0 - M0_sys (central-bank credit, net)
  M2: Money;                            // §3.5.3
  PEM: Money;                           // player-economy money (§3.5.4)
  flowsToday: Record<FlowClass, Money>;
  flowsByCode: Record<string, Money>;   // today's totals by reason code
}
interface StabilizerState {
  mode: 'OBSERVE' | 'ACTIVE';
  integral: number;                     // I(t)
  lastError: number;                    // e(t)
  levers: { L1_demand: number; L2_lifestyle_price: number; L3_levy_bp: number; L4_upkeep: number };
  history: { dayIndex: number; e: number; u: number; levers: StabilizerState['levers'] }[]; // last 364 days in state, older in event store
}
interface MsiState { dayIndex: number; raw: number; msi: number; }   // §3.8
```

### §2.9 Tax entities

```ts
interface TaxRegime {
  jurisdiction: BlocCode | 'SERENA';
  personalBrackets: { upTo: Money | null; rateE6: number }[];     // annual taxable income, reporting ccy of bloc
  cgtShortRateE6: number; cgtLongRateE6: number; longHoldTicks: number;
  corporateRateE6: number;
  propertyTaxAnnualE6: number;           // % of assessed value per game year
  vatRateE6: number;
  securitiesTxTaxE6: number;             // on buyer notional, equities and ETFs listed in the bloc
  stampDutyPropertyE6: number;           // on purchase price, buyer
  wht: { dividendE6: number; interestE6: number; royaltyE6: number }; // non-treaty rates
  interestCapPctEbitda: number;          // thin-cap rule
  lossCarryForwardYears: number;
}
interface TaxAccount {                    // one per (entity, jurisdiction, taxType, year)
  entityId: string; jurisdiction: string; taxType: TaxType; year: number;
  base: Money; liability: Money; paid: Money; withheld: Money; lossCF: Money;
  status: 'OPEN' | 'ASSESSED' | 'SETTLED' | 'UNDER_AUDIT';
}
type TaxType = 'PERSONAL_INCOME' | 'CAPITAL_GAINS' | 'CORPORATE' | 'PROPERTY' | 'VAT' | 'SEC_TX' | 'STAMP' | 'P2P' | 'WHT' | 'EXIT' | 'FRANCHISE';
```

### §2.10 Statements and insolvency

```ts
interface FinancialStatement {
  entityId: string; scope: 'SOLO' | 'CONSOLIDATED';
  period: { kind: 'DAY'|'MONTH'|'QUARTER'|'YEAR'|'CHAPTER'|'FLASH'; index: number; fromTick: Tick; toTick: Tick };
  ccy: Ccy;
  income: StatementLine[]; balance: StatementLine[]; cashFlow: StatementLine[]; equityChanges: StatementLine[];
  kpis: Record<string, number>;          // margins, ROE, leverage, interest cover, liquidity ratios
  audited: boolean; publishedTick?: Tick;
}
interface StatementLine { lineId: string; labelKey: string; amount: Money; children?: StatementLine[] }
interface InsolvencyCase {
  caseId: string; debtorId: string; openedTick: Tick;
  trigger: 'PAYMENT_DEFAULT' | 'BALANCE_SHEET' | 'VOLUNTARY' | 'CREDITOR_PETITION' | 'REGULATOR';
  procedure: 'LIQUIDATION' | 'RESTRUCTURING' | 'BANK_RESOLUTION' | 'PERSONAL';
  claims: Claim[]; estateValue: Money; status: 'OPEN' | 'PLAN_PROPOSED' | 'DISTRIBUTING' | 'CLOSED';
}
interface Claim {
  claimId: string; creditorId: string; rank: ClaimRank; amount: Money; securedBy?: string[];
  admitted: boolean; recovered: Money;
}
type ClaimRank = 'SECURED' | 'ADMIN' | 'TAX' | 'WAGES' | 'DEPOSITS_INSURED' | 'SENIOR_UNSECURED' | 'SUBORDINATED' | 'PREFERRED_EQUITY' | 'COMMON_EQUITY';
```

---

## §3 Rules and formulas

### §3.1 Entity lifecycle

1. Authored entities (all `cbk`, `gov`, `reg`, `crt`, `exc`, `ccp`, `rat`, `sys`, the elastic sectors, NPC banks, funds, insurers, listed NPC companies, named NPC actors) are created at genesis from 22 with genesis balance sheets. Their opening money is posted with `MAC_GENESIS_ENDOWMENT` (FAUCET) so that `M0_sys` starts at the genesis total and every later change is a recorded flow.
2. Player entities are created by intents of the owning module (chr by 14 `acct.create`; cmp by 09; fnd by 08; bnk by 07; ins by 08; ali by 15; biz by 09; prop by 10). Each new entity gets its accounts lazily on first posting.
3. An entity can be dissolved only with all balances at zero except equity accounts closing to zero (or via insolvency §3.14). Dissolution posts `LED_DISSOLUTION` (REVALUE class, amount 0 check record).

### §3.2 Chart of accounts (complete)

Codes are shared by all entities; an entity uses the subset its template allows (§2.1). `[sub]` shows the sub-key. Every account exists per currency.

**1xxx Assets**

| Code | Name | Sub | Notes |
|---|---|---|---|
| 1001 | Settlement cash | — | claim on the central bank of that currency; default money of every non-bank (§3.3.4) |
| 1002 | Reserves at central bank | — | banks, CCP, exchanges' settlement members |
| 1003 | Treasury account at central bank | sub-accounts: GENERAL, DEPOSIT_INSURANCE_FUND | gov only |
| 1009 | Elastic money (virtual) | — | hh, frm, row only; may be negative; not money for M0 (§3.5.2) |
| 1010 | Deposits at bank | bnkId | demand deposits; term deposits use sub `bnkId:termId` |
| 1050 | Margin posted | ccpId or prime-broker bnkId | cash initial margin, excess collateral |
| 1060 | Default-fund contribution | ccpId | clearing members |
| 1070 | Escrow deposited | contractId or caseId | claim on escrow agent (ccp) or court |
| 1100 | Trade receivables | counterpartyId | |
| 1110 | Interest receivable | instrument or loanId | daily accruals |
| 1120 | Dividends receivable | assetId | between ex-date and pay date |
| 1130 | Tax receivable (refunds) | jurisdiction:taxType | |
| 1140 | Insurance and reinsurance recoverables | policyId | |
| 1150 | Due from related parties | entityId | intercompany |
| 1160 | Judgments and restitution receivable | caseId | |
| 1190 | Other receivables | ref | |
| 1200 | Inventory (goods) | sku | businesses (09) |
| 1210 | Physical commodities | commodityId (qty) | incl. gold reserves of cbk |
| 1220 | Compute balance | 'OWNED' / 'RESERVED' (qty in PFLOP-day×1000) | 11 |
| 1221 | Restricted compute (hijack loot) | sessionId (qty) | usable only on own runs, non-resellable, expires 1 game day (RESOLVED C3b); marked 0 |
| 1230 | Prepaid expenses | ref | licenses, subscriptions |
| 1300 | Loans receivable | loanId | amortized cost |
| 1301 | Mortgages receivable | loanId | |
| 1302 | Margin loans receivable | accountId | prime brokerage and broker margin (07) |
| 1303 | Credit lines drawn | lineId | |
| 1304 | Interbank loans | loanId | |
| 1305 | Reverse repo (cash lent) | repoId | |
| 1306 | P2P loans receivable | contractId | 15 contract engine |
| 1307 | Central-bank lending to banks | facilityId | cbk only |
| 1309 | Allowance for credit losses (contra-asset) | portfolioId | |
| 1500 | Listed equities | assetId (qty) | |
| 1510 | ETFs | assetId (qty) | |
| 1520 | Bonds | assetId (face qty) | sovereign, corporate, bank bonds |
| 1530 | Fund units | fndId (qty) | |
| 1540 | Crypto tokens | tokenId (qty) | incl. stablecoins |
| 1541 | DeFi liquidity positions | poolId (qty LP tokens) | |
| 1542 | DeFi lending deposits | protocolId:tokenId (qty) | |
| 1560 | Structured tranches | trancheId (qty) | |
| 1570 | Private equity and venture stakes | cmpId:shareClass (qty) | unlisted companies not controlled |
| 1580 | Investments in controlled entities | entityId | subsidiaries, biz, prop; solo books at look-through value (§3.11) |
| 1600 | Derivative assets | positionId | positive fair value of uncleared derivatives; cleared ones are marked via VM |
| 1700 | AI models | modelId | 11 |
| 1710 | Datasets | datasetId | |
| 1720 | Purchased licenses (model, data) | licenseId | |
| 1730 | Goodwill | acquisitionId | |
| 1740 | Concession rights | concessionId | 10 |
| 1800 | Property | propId | land and buildings |
| 1810 | Construction in progress | projectId | |
| 1830 | Equipment and upgrades | bizId:axis | 09 upgrade axes |
| 1839 | Accumulated depreciation (contra) | matching sub | |
| 1840 | Computing hardware | clusterId | GPUs, data centers |
| 1850 | Vehicles, vessels, aircraft | assetId | fleets (09), yachts and jets (14) |
| 1860 | Lifestyle durables | itemId | cars, watches, yachts held as personal assets |
| 1870 | Collectibles | itemId | art, rare watches, wine (06) |
| 1880 | Storage and logistics infrastructure | assetId | tank farms, warehouses |
| 1900 | Deferred tax assets | jurisdiction | |
| 1909 | Elastic sector advances | sectorId | sys only |
| 1910 | Claim on the Stabilizer | — | cbk only; equals outside money issued in that currency |
| 1950 | Due from owner / group current account | entityId | biz, prop and group members |
| 1999 | Suspense | — | must be zero at P13 (I15) |

**2xxx Liabilities**

| Code | Name | Sub | Notes |
|---|---|---|---|
| 2001 | Settlement cash issued | holderId | cbk only |
| 2002 | Reserves owed | bnkId / ccpId | cbk only |
| 2003 | Treasury account owed | govId | cbk only |
| 2100 | Customer deposits | holderId | banks only; term deposits sub `holderId:termId` |
| 2110 | Interbank borrowing | lenderId | |
| 2120 | Central-bank borrowing | facilityId | |
| 2130 | Repo borrowing | repoId | |
| 2140 | Margin received | memberId | ccp, prime brokers |
| 2150 | Default fund received | memberId | ccp |
| 2160 | Escrow held | contractId | ccp as escrow agent; courts for case escrow |
| 2200 | Loans payable | loanId | |
| 2201 | Mortgages payable | loanId | |
| 2202 | Margin loans payable | accountId | |
| 2203 | Credit lines payable | lineId | |
| 2206 | P2P loans payable | contractId | |
| 2300 | Bonds issued | assetId | |
| 2310 | Sovereign debt issued | assetId | gov |
| 2320 | Tranches issued | trancheId | spv |
| 2330 | Stablecoins issued | tokenId | issuing protocol entity (npc or cmp) |
| 2400 | Taxes payable | jurisdiction:taxType:year | |
| 2410 | VAT payable | jurisdiction | |
| 2420 | Withholding tax payable | jurisdiction | |
| 2430 | Deferred tax liabilities | jurisdiction | |
| 2500 | Trade payables | counterpartyId | |
| 2510 | Wages payable | — | to hh of the business's city |
| 2520 | Interest payable | instrument or loanId | |
| 2530 | Dividends payable | assetId | |
| 2540 | Rent payable | propId | |
| 2550 | Fines and judgments payable | caseId | |
| 2560 | Restitution payable | caseId | |
| 2570 | Tenant deposits held | tenantId | |
| 2580 | Unearned revenue | ref | |
| 2590 | Accrued expenses | ref | |
| 2600 | Derivative liabilities | positionId | |
| 2700 | Claims reserves (case + IBNR) | lineId | ins |
| 2710 | Unearned premium reserve | lineId | ins |
| 2800 | Due to related parties | entityId | intercompany |
| 2900 | Issuance owed to central bank | ccy | sys only |
| 2909 | Owed to elastic sectors | sectorId | sys only |
| 2950 | Owner's current account | ownerId | biz, prop |
| 2990 | Persistent claims after discharge | creditorId | §3.14.5 |
| 2999 | Suspense | — | must be zero at P13 |

**3xxx Equity**

| Code | Name | Notes |
|---|---|---|
| 3100 | Share capital | sub shareClass |
| 3110 | Share premium | |
| 3150 | Treasury shares (contra) | |
| 3200 | Retained earnings | year-end close of 3300 |
| 3300 | Current-period result | parent of all 4xxx–6xxx accounts; not posted directly |
| 3400 | Revaluation surplus | property and intangibles revaluations above cost (§3.9.4) |
| 3500 | FX translation reserve | consolidated statements only |
| 3600 | Non-controlling interests | consolidated statements only |
| 3700 | Fund capital | fnd: NAV = 3700 + 3300 |
| 3800 | Currency trading accounts | sub ccy; keeps every entity balanced per currency (§3.3.6) |
| 3900 | Owner's equity | chr, ali |
| 3990 | Net issuance | sys only: running total of faucets minus sinks (debit balance when net faucet) |

**4xxx Income** (sub-accounts of 3300; sub = segment, counterparty class or asset)

4000 Sales revenue · 4010 Rental income · 4020 Interest income · 4030 Dividend income · 4040 Fees and commissions income · 4050 Insurance premiums earned · 4060 Realized trading gains · 4070 Unrealized gains (fair value) · 4080 FX gains (realized) · 4090 Gains on disposal of non-financial assets · 4100 Subsidies and grants · 4110 Faucet income (start cash, grants, ads, rewards, compensation) · 4120 Judgments, restitution and settlements received · 4130 Gains on debt extinguishment · 4140 Royalties and licence income · 4150 Investment income from controlled entities (look-through result) · 4190 Other income · 4900 System burn income (sys only)

**5xxx Expenses** (sub-accounts of 3300)

5000 Cost of goods sold · 5010 Wages and staff · 5020 Rent · 5030 Energy · 5040 Upkeep and maintenance · 5050 Marketing · 5060 Compute and data · 5070 Professional and legal fees · 5080 Fees, commissions and levies paid · 5090 Interest expense · 5100 Insurance premiums · 5110 Claims incurred · 5120 Depreciation · 5130 Amortization · 5140 Impairment and write-downs · 5150 Credit-loss expense · 5160 Realized trading losses · 5170 Unrealized losses (fair value) · 5180 FX losses (realized) · 5190 Losses on disposal · 5200 Lifestyle consumption (chr) · 5210 Fines and penalties · 5220 Restitution and settlements paid · 5230 Security, defence and operations · 5240 Lobbying, donations, hosting · 5250 Licences, charters, registrations · 5260 Property and other non-income taxes · 5270 Irrecoverable VAT · 5280 Transaction taxes · 5900 Net issuance expense (sys only)

**6xxx Income taxes**: 6000 Current income tax · 6010 Deferred tax · 6020 Withholding tax suffered (non-creditable part)

**9xxx Memo and system** (MEMO class, not part of balance sheet totals)

9100 Collateral received (title retained by giver: pledges) · 9110 Securities lent out (flag on the 15xx lot) · 9200 Encumbrances register · 9300 Holds mirror (02 holds) · 9900 Interpartition suspense (`sys`, sub `A->B`, ASSET/LIABILITY by sign, must net to zero globally) · 9910 Challenge-event books (ring-fenced portfolios of 15 are kept in a separate book id; never connected to the main book)

### §3.3 Postings, templates and the payment rail

#### §3.3.1 Sign convention and balances

Every account has a signed `balance`: a debit adds `amount`, a credit subtracts `amount`. ASSET and EXPENSE accounts normally have positive balances; LIABILITY, EQUITY and INCOME accounts normally negative. Display flips the sign for credit-normal classes.

For every entity and currency: `Σ balance over all its non-MEMO accounts = 0` (the books balance). Net worth (book) = `Σ assets − Σ liabilities` = `−Σ (equity + income + expense balances)`.

#### §3.3.2 Posting rules

1. `amount > 0n`; `debitAccount != creditAccount`; both accounts in `ccy`.
2. If `qty` is present: both accounts hold the same `assetId`; the debit account's `qty += qty`, the credit account's `qty -= qty`.
3. A posting may join accounts of two different entities (cross-entity). The **entry** must balance every entity it touches per currency (I2). This is guaranteed by building entries only through templates.
4. Only the ledger service in P13 applies postings. Modules call template functions in their phase; the functions validate eagerly (cheap checks), return an `entryId`, and queue the entry.
5. An entry is all-or-nothing: if any posting fails at P13 (e.g. insufficient balance after all holds settle), the whole entry fails and the tick aborts into safe mode (02 §3.15). Modules must therefore place holds for every amount that can fail.

#### §3.3.3 Templates (the only way to build entries)

Notation: `E:code` = account of entity E. `cb` = central bank of the currency. "Value leg" = the account that records what the payer gets and the payee gives (expense, income, asset, liability), chosen by the reason code's mapping table (each code lists its default value-leg accounts in the code catalog generator, 22/23 data; examples below).

| Template | Use | Postings |
|---|---|---|
| `PAY(A → B, amt, code, valueLegA, valueLegB)` | core-to-core payment for goods, services, fees, taxes, dividends (TRANSFER codes) | (1) cash leg via the payment rail (§3.3.4); (2) `Dr A:valueLegA / Cr B:valueLegB` |
| `SWAP_ASSET(A ⇄ B, asset, qty, price, code)` | purchase/sale of an asset for money | (1) cash leg buyer→seller via rail; (2) `Dr Buyer:assetAcct / Cr Seller:assetAcct` with `qty` and `amount = notional`; (3) seller's book adjustment: if seller's book value of the qty ≠ notional, `Dr Seller:assetAcct / Cr Seller:4060|4090` (gain) or `Dr Seller:5160|5190 / Cr Seller:assetAcct` (loss) |
| `MINT(sys → E, amt, code, valueLegE)` | FAUCET with no elastic counterparty (start cash, grants, ads, compensation) | (1) `Dr E:1001 / Cr cb:2001`; (2) `Dr cb:1910 / Cr sys:2900`; (3) `Dr sys:5900 / Cr E:valueLegE` (default 4110) |
| `BURN(E → sys, amt, code, valueLegE)` | SINK with no elastic counterparty (fines' sink share, levies, licence fees) | (1) `Dr cb:2001 / Cr E:1001`; (2) `Dr sys:2900 / Cr cb:1910`; (3) `Dr E:valueLegE / Cr sys:4900` |
| `ELASTIC_IN(X → E, amt, code, valueLegX, valueLegE)` | FAUCET: an elastic sector X (hh, frm, row) pays a core entity | (1) `Dr E:1001 / Cr cb:2001` (or reserves if E is a bank); (2) `Dr cb:1910 / Cr sys:2900`; (3) `Dr sys:2909:X / Cr X:1009`; (4) `Dr X:valueLegX / Cr E:valueLegE` |
| `ELASTIC_OUT(E → X, amt, code, valueLegE, valueLegX)` | SINK: a core entity pays an elastic sector | mirror of `ELASTIC_IN` |
| `LEND(bank B → borrower C, amt, code)` | CREDIT_CREATE | (1) `Dr C:1010:B / Cr B:2100:C` (new deposit; if C's receiving account is settlement cash, the rail then moves it out of B as a TRANSFER payment); (2) `Dr B:13xx:loanId / Cr C:22xx:loanId` |
| `REPAY(C → B, principal, code)` | CREDIT_DESTROY | (1) `Dr B:2100:C / Cr C:1010:B` (deposit extinguished; if C pays from settlement cash, the rail first moves it into B); (2) `Dr C:22xx / Cr B:13xx` |
| `CB_CREDIT(cb → bank B, amt, code)` | CREDIT_CREATE at the central bank (M0_cb up) | (1) `Dr B:1002 / Cr cb:2002:B`; (2) `Dr cb:1307|1520 / Cr B:2120|asset sold` |
| `CB_CREDIT_UNWIND` | CREDIT_DESTROY at the central bank | mirror |
| `ACCRUE(E, amt, code, dr, cr)` | REVALUE, intra-entity non-cash: accrual, depreciation, provision, MTM, impairment, revaluation | `Dr E:dr / Cr E:cr` (one posting, same entity) |
| `ACCRUE_PAIR(A, B, amt, code)` | REVALUE accrual of a bilateral amount (interest accrued on a loan) | `ACCRUE(A, receivable/income)` + `ACCRUE(B, expense/payable)` in one entry |
| `FX(A ⇄ B, ccy1 amt1, ccy2 amt2, code)` | currency exchange | (1) ccy1 cash A→B via rail; (2) `Dr A:3800:ccy1 / Cr B:3800:ccy1`; (3) ccy2 cash B→A via rail; (4) `Dr B:3800:ccy2 / Cr A:3800:ccy2` |
| `MOVE_QTY(A → B, asset, qty, bookValue, code)` | asset transfer without consideration (gift, in-kind dividend, collateral title transfer, seizure, inheritance) | `Dr B:assetAcct / Cr A:assetAcct` with qty and amount = book value; plus value legs (`Dr A:expense or equity / Cr B:income or equity`) per code |
| `RECLASS(E, amt, code, fromAcct, toAcct)` | REVALUE, intra-entity moves with no value change (period close, current↔non-current) | one posting |

Every template returns the list of postings it generated; the code catalog defines which templates a code may use (`allowedTemplates`). A FAUCET code can only use `MINT` or `ELASTIC_IN`; a SINK code only `BURN` or `ELASTIC_OUT`; CREDIT codes only `LEND`, `REPAY`, `CB_CREDIT`, `CB_CREDIT_UNWIND`; REVALUE codes only `ACCRUE`, `ACCRUE_PAIR`, `RECLASS`; TRANSFER codes `PAY`, `SWAP_ASSET`, `FX`, `MOVE_QTY`. This is how "each reason code belongs to exactly one class" (00 §5.4) is enforced mechanically.

#### §3.3.4 The payment rail (cash legs)

Each entity has a **default paying account** and a **default receiving account**, both DEFAULT `1001 Settlement cash` in its reporting currency; an entity can set a bank deposit as default (`acct.payment.setAccounts`, §4). The rail turns "A pays B amount X in ccy c" into postings:

| A pays from | B receives into | Postings |
|---|---|---|
| A:1001 | B:1001 | `Dr B:1001 / Cr A:1001` (and cbk reassigns holder sub-accounts: `Dr cb:2001:A / Cr cb:2001:B`) |
| A:1010:X (bank X) | B:1001 | `Dr X:2100:A / Cr A:1010:X`; `Dr B:1001 / Cr X:1002`; `Dr cb:2002:X / Cr cb:2001:B` |
| A:1001 | B:1010:Y | `Dr Y:1002 / Cr A:1001`; `Dr cb:2001:A / Cr cb:2002:Y`; `Dr B:1010:Y / Cr Y:2100:B` |
| A:1010:X | B:1010:Y, X ≠ Y | `Dr X:2100:A / Cr A:1010:X`; `Dr Y:1002 / Cr X:1002` (+ cbk holder reassignment); `Dr B:1010:Y / Cr Y:2100:B` |
| A:1010:X | B:1010:X (same bank) | `Dr X:2100:A / Cr X:2100:B` and `Dr B:1010:X / Cr A:1010:X` (book transfer, no reserves move) |
| A is a bank paying from its reserves | — | treat A's paying account as A:1002 |

If A's paying account lacks funds but A has another money account with funds, the rail draws in this order: default paying account, then 1001, then deposits in order of bank id. Holds always reserve against the account the rail will use (02 §3.14.3).

Bank reserve constraint: a bank's 1002 may go negative intraday down to its **intraday credit limit** at the central bank (07 sets it, DEFAULT = 100% of eligible collateral pledged); at day close any negative 1002 is converted automatically into an overnight standing-facility loan (`CBK_STANDING_FACILITY`, CREDIT_CREATE) at the facility rate (04). This keeps I10 satisfiable.

#### §3.3.5 Cross-partition cash legs

When the two accounts of a rail posting are in different partitions, it is split into legs through `sys:9900` (02 §3.14.2). The central bank (FIN partition) holds its holder sub-accounts per holder; to avoid a FIN round trip for every payment, each PLAYER and CITY partition keeps a **local mirror** of its entities' 1001 balances and the cbk holder sub-accounts are updated from the legs at B3. The authoritative holder balance is the entity's own 1001; the cbk's 2001 total is checked against the sum of all 1001 balances in COORD (I5).

#### §3.3.6 Multi-currency

Each posting is in one currency. An entity's books balance **per currency** thanks to the currency trading accounts 3800 (template `FX`). Net worth in a reporting currency R:

```
NW_R(E) = Σ_ccy fx(ccy→R) · NW_ccy(E)     where NW_ccy(E) = Σ assets_ccy − Σ liabilities_ccy (including 3800 as equity)
```

The translated sum of the 3800 accounts is the entity's cumulative FX result; statements show it as FX gains/losses (§3.13.2). FX rates for translation are the official day-close marks of FX spot (05), intraday the latest clearing mid.

#### §3.3.7 Accrual conventions

- Day count **Act/364** for every interest-bearing item (game year = 364 days). Daily accrual at day close via `accrue()` (02 §3.9.3), every calendar day.
- Rent, wages, upkeep and subscriptions accrue daily by their per-day rate; cash moves on the schedule the owning module defines (hourly operations for businesses settle cash immediately with hh/frm; monthly for leases; at maturity or coupon dates for bonds).
- Bonds trade with accrued interest: buyer pays seller clean price plus accrued (`BOND_ACCRUED_INTEREST`).

#### §3.3.8 Mark-to-market postings

At day close (P2 hook, postings in P13) every position in a marketable asset (1500, 1510, 1520, 1530, 1540, 1541, 1542, 1560, 1600/2600 uncleared derivatives, 1210, 1220 OWNED excluded (cost), 1870 when index-marked) is revalued to the day-close mark: `ACCRUE(E, |Δ|, LED_MTM_DAILY, dr=asset, cr=4070)` for gains or `dr=5170, cr=asset` for losses. After this, the account's book value equals `qty × close mark`. Intraday, NW uses `book + qty × (mark_now − mark_close)` without postings. Illiquid assets revalue on their own cadence (§3.9).

Tax basis is independent of book value (tax lots, §2.5).

### §3.4 Reason codes (complete catalog)

Columns: **Code** · **Owner** · **Description** · **CF** (cash-flow class). The class is the table's heading. 23 lists the default value-leg accounts for each code in machine-readable form. "Elastic" means hh, frm or row. "Core" means any other entity. A module may request only codes it owns; 20 checks the totals by class every tick.

#### §3.4.1 FAUCET (system or elastic sector creates base money in the core economy)

| Code | Owner | Description | CF |
|---|---|---|---|
| `MAC_GENESIS_ENDOWMENT` | 04 | opening money of authored entities at world genesis | FIN |
| `ACCT_START_CASH` | 14 | $5,000 start cash for a new character (00 §5.9) | OP |
| `ACCT_ONBOARD_GRANT` | 18 | one-time $250 Retail-broker grant on first licence (RESOLVED-NUMBERS, 00 §5.9) | OP |
| `ACCT_REWARDED_AD` | 21 | $250 real (× MSI, 21 Rule 3.14.3) per rewarded ad, max 10 per local day, only under $1,000 real NW; credited as restricted cash (§3.5.6) with lot tag `AD_GRANT` (L12; ruling in 24) | OP |
| `ACCT_FRESH_START` | 14 | bankruptcy comeback top-up to $5,000 liquid, at most once per chapter (§3.14.5) | OP |
| `ACCT_QUEST_REWARD` | 18 | Academy and quest cash rewards (18 caps total per character) | OP |
| `ADM_COMPENSATION` | 21 | support compensation, two approvals | OP |
| `ADM_CORRECTION_IN` | 21 | compensating entry that returns money removed by a bug | OP |
| `BIZ_SALES_HH` | 09 | household purchases from businesses (B2C), incl. VAT collected | OP |
| `BIZ_SALES_FRM` | 09 | firm-sector purchases and NPC customer contracts (B2B with the aggregate sector) | OP |
| `BIZ_SALES_ROW` | 09 | exports to the rest of the world | OP |
| `BIZ_CONTRACT_BONUS_NPC` | 09 | performance bonus paid by NPC (elastic) customers under contract | OP |
| `BIZ_SALE_TO_NPC_MARKET` | 09 | sale of a business to the NPC buyer market (at 85% of value, 01 §4.6) | INV |
| `CMP_NPC_REVENUE` | 09 | modelled revenue of named NPC companies from the elastic economy, posted hourly from fundamentals (05/09) | OP |
| `PROP_RENT_ELASTIC` | 10 | rent from household and firm-sector tenants | OP |
| `PROP_SALE_TO_ELASTIC` | 10 | sale of a property to household or firm buyers | INV |
| `PROP_TENANT_DEPOSIT_IN` | 10 | security deposit received from an elastic tenant | OP |
| `COLL_SALE_TO_NPC` | 06 | sale of a collectible to NPC collectors (elastic) | INV |
| `LIFE_RESALE_TO_NPC` | 14 | resale of a lifestyle item to the NPC second-hand market at its resale curve | INV |
| `CMDTY_SALE_TO_ELASTIC` | 06 | physical commodity sold to the firm sector or row (physical desk, 06) | OP |
| `LAB_MODEL_LICENSE_ELASTIC` | 11 | operational-model licences sold to the firm sector | OP |
| `LAB_COMPUTE_SALE_ELASTIC` | 11 | compute capacity sold to NPC demand (data-center businesses) | OP |
| `LAB_DATA_SALE_ELASTIC` | 11 | datasets licensed to NPC demand | OP |
| `BNK_ELASTIC_DEPOSIT_IN` | 07 | households/firms place deposits at a core bank | FIN |
| `BNK_ELASTIC_LOAN_REPAY` | 07 | households/firms repay principal to a core bank | INV |
| `BNK_ELASTIC_LOAN_INTEREST` | 07 | households/firms pay interest to a core bank | OP |
| `BNK_ELASTIC_FEES` | 07 | account and service fees paid by households/firms | OP |
| `FND_ELASTIC_SUBSCRIPTION` | 08 | household savings subscribe to a core fund ("hedge fund fees on NPC capital", 01 §8.1) | FIN |
| `INS_ELASTIC_PREMIUM` | 08 | households/firms buy insurance from a core insurer | OP |
| `SOV_DEBT_ELASTIC_PLACEMENT` | 04 | sovereign bonds placed with households/row | FIN |
| `MAC_TAX_FROM_ELASTIC` | 04 | taxes paid by households and firms to treasuries | OP |
| `LP_REFILL_FROM_ROW` | 05 | day-close rebalancing: rest of world funds NPC liquidity providers back to their cash target | FIN |
| `LP_INVENTORY_SELL_ROW` | 05 | NPC liquidity provider sells excess inventory to row at mark | INV |
| `SPV_ELASTIC_TRANCHE_SALE` | 08 | tranches placed with NPC (row) investors | FIN |
| `ETF_ELASTIC_CREATION` | 08 | NPC investor flows create ETF units (cash leg) | FIN |
| `OPS_FENCE_SALE_NPC` | 12 | stolen goods sold to the NPC fence (The Back Room) at a discount | OP |
| `WLD_NPC_PURCHASE` | 16 | named-actor demand bought from a core entity when the actor is modelled as elastic-funded (rare; 16 flags it) | OP |

#### §3.4.2 SINK (base money leaves the core economy)

| Code | Owner | Description | CF |
|---|---|---|---|
| `ADM_CLAWBACK` | 21 | removal of exploit gains (two approvals) | OP |
| `ADM_CORRECTION_OUT` | 21 | compensating entry removing money created by a bug | OP |
| `ACCT_TERMINAL_SUBSCRIPTION` | 14 | Terminal and data-tier subscriptions to NPC information vendors (01 §6.2) | OP |
| `ACCT_LICENSE_FEE` | 13 | trading licences LIC1–LIC4 | OP |
| `ACCT_CHARTER_FEE` | 13 | institution charters CH_BANK, CH_FUND, CH_INSURER, CH_EXCHANGE_MEMBER, CH_CUSTODIAN | OP |
| `BIZ_PURCHASE_NEW` | 09 | buying a new business from the catalog (setup paid to the firm sector) | INV |
| `BIZ_COGS_FRM` | 09 | inputs bought from the firm sector | OP |
| `BIZ_WAGES` | 09 | wages to households | OP |
| `BIZ_RENT_ELASTIC` | 09 | rent paid to household/firm landlords | OP |
| `BIZ_ENERGY_NPC` | 09 | energy bought from the NPC grid | OP |
| `BIZ_UPKEEP` | 09 | maintenance and condition upkeep | OP |
| `BIZ_MARKETING` | 09 | marketing spend | OP |
| `BIZ_UPGRADE_CAPEX` | 09 | upgrades bought from the firm sector (capitalized in full, then 30% impaired at once with `LED_IMPAIRMENT`, so valuation reflects 70% of cost, 01 §9) | INV |
| `BIZ_MANAGER_FEE_NPC` | 09 | NPC managers (offline extension, 01 §1) | OP |
| `BIZ_CONTRACT_PENALTY_NPC` | 09 | penalties owed to NPC customers for missed deliveries | OP |
| `BIZ_PERMIT_FEE` | 09 | operating permits | OP |
| `CMP_INCORPORATION_FEE` | 09 | company formation fee | FIN |
| `CMP_NPC_COSTS` | 09 | modelled costs of named NPC companies paid to the elastic economy | OP |
| `CMP_AUDIT_FEE_NPC` | 09 | statutory audit by NPC audit firms | OP |
| `CMP_DEAL_COSTS_NPC` | 09 | NPC advisers in M&A, proxy fights, defences | OP |
| `CMP_FRANCHISE_FEE_SERENA` | 03 | annual Isla Serena free-zone franchise fee (§3.12.2) | OP |
| `PROP_PURCHASE_FROM_ELASTIC` | 10 | buying property from household/firm sellers | INV |
| `PROP_UPKEEP` | 10 | maintenance, condition | OP |
| `PROP_MANAGEMENT_FEE_NPC` | 10 | NPC property managers | OP |
| `PROP_DEVELOPMENT_CAPEX` | 10 | construction by the firm sector | INV |
| `PROP_PERMIT_FEE` | 10 | building permits | INV |
| `PROP_TENANT_DEPOSIT_OUT` | 10 | security deposit returned to an elastic tenant | OP |
| `COLL_BUY_FROM_NPC` | 06 | collectible bought from NPC dealers | INV |
| `COLL_AUCTION_FEE` | 06 | NPC auction-house fees (01 §8.1) | OP |
| `CMDTY_PURCHASE_FROM_ELASTIC` | 06 | physical commodity bought from producers (frm, row) | OP |
| `CMDTY_STORAGE_FEE_NPC` | 06 | storage at NPC facilities | OP |
| `CMDTY_FREIGHT_NPC` | 06 | freight with NPC carriers | OP |
| `DEFI_NETWORK_FEE` | 06 | on-chain network fee (burned) | OP |
| `MKT_TRANSACTION_LEVY` | 05 | Stabilizer lever L3: levy on exchange notional above the daily threshold (§3.7.4) | OP |
| `LAB_COMPUTE_RENT_NPC` | 11 | spot compute from NPC clouds | OP |
| `LAB_COMPUTE_RESERVED_NPC` | 11 | reserved compute contracts with NPC clouds | OP |
| `LAB_HARDWARE_PURCHASE_NPC` | 11 | GPUs and data-center hardware from vendors (capitalized) | INV |
| `LAB_DATA_PURCHASE_NPC` | 11 | datasets from NPC vendors | OP |
| `LAB_RESEARCHER_SALARY` | 11 | research staff wages (hh) | OP |
| `LAB_RESEARCHER_SIGNING` | 11 | signing bonuses (hh) | OP |
| `LAB_REGISTRATION_FEE` | 11 | AI model registration with regulators | OP |
| `LAB_AUDIT_FEE_NPC` | 11 | mandatory model audits | OP |
| `LAB_INCIDENT_COST` | 11 | remediation of AI incidents | OP |
| `OPS_COST_NPC` | 12 | op preparation costs (tooling, crews) | OP |
| `OPS_DEFENSE_NPC` | 12 | cyber defence from NPC vendors, SOC subscriptions | OP |
| `OPS_HONEYPOT_COST` | 12 | honeypot models ($30k/$120k/$400k, RESOLVED B3) | OP |
| `OPS_QUARANTINE_FEE` | 12 | quarantine one model ($2,000 + 0.01% NW, 03-conflict §4.6) | OP |
| `OPS_INFORMANT_FEE` | 12 | informants in The Back Room | OP |
| `OPS_FORENSIC_AUDIT_NPC` | 12 | NPC forensic audit (Northgate Forensics) | OP |
| `OPS_NPC_CREW_THEFT` | 12 | theft by NPC criminal crews (01/03 conflict: a sink) | OP |
| `OPS_BRIBE_NPC` | 12 | bribe paid to an NPC official (a crime; evidence for 13) | OP |
| `LAW_FINE_SINK` | 13 | 85% share of every fine (03-conflict §1) | OP |
| `LAW_DISGORGEMENT_NO_VICTIM` | 13 | disgorgement with no identifiable victim | OP |
| `LAW_COURT_FEE` | 13 | court fees (1% of claim, min $500) | OP |
| `LAW_NPC_LEGAL_FEE` | 13 | fees to NPC law firms | OP |
| `LAW_MONITOR_FEE` | 13 | consent-decree monitors | OP |
| `LIFE_PURCHASE` | 14 | lifestyle purchases (price × Stabilizer lever L2, incl. VAT) | OP |
| `LIFE_UPKEEP` | 14 | upkeep, insurance excess, storage of lifestyle items (× L4) | OP |
| `LIFE_STAFF` | 14 | household staff | OP |
| `LIFE_HOSTING` | 14 | hosting events | OP |
| `LIFE_CLUB_DUES` | 14 | NPC club memberships and dues | OP |
| `LIFE_CHARITY` | 14 | donations (Prestige) | OP |
| `SOC_CONTRACT_REG_FEE` | 15 | 0.5% contract registration fee (02-multiplayer §8.2) | OP |
| `SOC_ALLIANCE_FOUNDING_FEE` | 15 | alliance charter fee | FIN |
| `WLD_LOBBYING_SPEND` | 16 | lawful lobbying via NPC firms | OP |
| `WLD_CAMPAIGN_DONATION` | 16 | political donations | OP |
| `WLD_ARCHIVE_PURCHASE` | 16 | purchase of archives and records from NPC holders | OP |
| `BNK_ELASTIC_DEPOSIT_OUT` | 07 | households/firms withdraw deposits from a core bank (incl. run outflows) | FIN |
| `BNK_ELASTIC_DEPOSIT_INTEREST` | 07 | interest paid to household/firm depositors | OP |
| `BNK_ELASTIC_LOAN_DISBURSE` | 07 | a core bank lends to households/firms (money leaves the core) | INV |
| `BNK_OPEX_ELASTIC` | 07 | bank operating costs (staff, branches, systems) | OP |
| `FND_ELASTIC_REDEMPTION` | 08 | household investors redeem from a core fund | FIN |
| `FND_ELASTIC_DISTRIBUTION` | 08 | distributions paid to household unit holders | FIN |
| `INS_ELASTIC_CLAIM` | 08 | claims paid to household/firm policyholders | OP |
| `INS_OPEX_ELASTIC` | 08 | insurer operating costs | OP |
| `SOV_DEBT_ELASTIC_SERVICE` | 04 | coupons and redemptions paid to household/row bondholders | FIN |
| `MAC_GOV_SPENDING_ELASTIC` | 04 | government purchases and transfers to households and firms | OP |
| `LP_SWEEP_TO_ROW` | 05 | day-close rebalancing: NPC liquidity providers' excess cash returns to row | FIN |
| `LP_INVENTORY_BUY_ROW` | 05 | NPC liquidity provider buys inventory from row at mark | INV |
| `SPV_ELASTIC_TRANCHE_SERVICE` | 08 | tranche payments to NPC holders | FIN |
| `ETF_ELASTIC_REDEMPTION` | 08 | NPC investor ETF redemptions (cash leg) | FIN |
| `CCP_OPEX_ELASTIC` | 07 | Clearing House and exchange operating costs | OP |
| `CCP_INS_FUND_SWEEP` | 07 | weekly sweep of the retail insurance fund balance above its cap to SINK (07 §3.16.5; added for 07, ruling in 24) | OP |
| `EXC_OPEX_ELASTIC` | 05 | exchange operating costs (NPC exchanges and concession holders' mandated costs) | OP |
| `RAT_OPEX_ELASTIC` | 08 | rating agency operating costs | OP |
| `NPC_ACTOR_CONSUMPTION` | 16 | named actors' personal spending (lifestyle, staff) | OP |

#### §3.4.3 TRANSFER (between core entities; M0-neutral)

| Code | Owner | Description | CF |
|---|---|---|---|
| `LED_FX_CONVERSION` | 03 | FX conversion between two core entities outside the markets (e.g. treasury sweeps) | OP |
| `LED_INTRAGROUP_SWEEP` | 03 | cash sweep between a biz/prop and its owner, or within a group | FIN |
| `LED_ESTATE_TRANSFER` | 03 | transfer of assets on dissolution to the owner | FIN |
| `ACCT_ESTATE_AUCTION_PROCEEDS` | 14 | proceeds of a dormant estate auction paid to the owner (02-multiplayer §3.7) | INV |
| `TAX_PERSONAL_INCOME` | 03 | personal income tax payment | OP |
| `TAX_CAPITAL_GAINS` | 03 | capital gains tax payment | OP |
| `TAX_CORPORATE` | 03 | corporate income tax payment | OP |
| `TAX_PROPERTY` | 03 | property tax payment | OP |
| `TAX_VAT_REMIT` | 03 | VAT remitted by businesses and collected on lifestyle purchases | OP |
| `TAX_SECURITIES_TX` | 03 | securities transaction tax | OP |
| `TAX_STAMP_DUTY` | 03 | property stamp duty | INV |
| `TAX_P2P_TRANSFER` | 03 | 2% tax on P2P value moved (01 §9) | OP |
| `TAX_WITHHOLDING` | 03 | withholding on dividends, interest, royalties to non-residents | OP |
| `TAX_EXIT` | 03 | exit tax on change of residency | OP |
| `TAX_REFUND` | 03 | refund of overpaid tax | OP |
| `TAX_LATE_INTEREST` | 03 | interest on late tax | OP |
| `TAX_AUDIT_ASSESSMENT` | 03 | additional tax assessed by audit | OP |
| `TAX_PENALTY` | 03 | tax penalty (20% of shortfall, §3.12.10) | OP |
| `MKT_TRADE` | 05 | cash and asset legs of an exchange fill (via `SWAP_ASSET`) | INV |
| `MKT_EXCHANGE_FEE` | 05 | exchange trading fee to the exchange (or its concession holder) | OP |
| `MKT_MAKER_REBATE` | 05 | maker rebates paid by the exchange | OP |
| `MKT_LISTING_FEE` | 05 | listing fees | FIN |
| `MKT_BLOCK_TRADE` | 05 | negotiated block at the closing price (roadmap N11) | INV |
| `OTC_TRADE` | 06 | OTC/RFQ fill | INV |
| `EQ_DIVIDEND` | 06 | cash dividend | FIN |
| `EQ_STOCK_DIVIDEND` | 06 | stock dividend (qty) | NC |
| `EQ_BUYBACK` | 06 | share buyback | FIN |
| `EQ_ISSUE_PRIMARY` | 06 | IPO, secondary offering, rights issue proceeds | FIN |
| `EQ_SPINOFF` | 06 | spin-off distribution (qty) | NC |
| `EQ_MERGER_CASH` | 06 | cash consideration in a merger | INV |
| `EQ_MERGER_STOCK` | 06 | stock consideration (qty) | NC |
| `EQ_DELIST_CASHOUT` | 06 | squeeze-out or delisting cash-out | INV |
| `EQ_WARRANT_EXERCISE` | 06 | warrant or convertible exercise | FIN |
| `BOND_ISSUE` | 06 | corporate or bank bond issuance | FIN |
| `BOND_COUPON` | 06 | coupon payment | OP |
| `BOND_REDEMPTION` | 06 | principal at maturity or call | FIN |
| `BOND_ACCRUED_INTEREST` | 06 | accrued interest paid on secondary trades | OP |
| `BOND_DEFAULT_RECOVERY` | 06 | recovery distribution after default | INV |
| `SOV_BOND_ISSUE` | 04 | sovereign issuance to core buyers | FIN |
| `SOV_COUPON` | 04 | sovereign coupons to core holders | OP |
| `SOV_REDEMPTION` | 04 | sovereign principal to core holders | FIN |
| `SOV_RESTRUCTURING_EXCHANGE` | 04 | debt exchange in a sovereign restructuring | NC |
| `FX_SPOT` | 06 | spot FX legs (via `FX`) | OP |
| `FX_FORWARD_SETTLE` | 06 | forward settlement | OP |
| `FX_SWAP_LEG` | 06 | FX swap near/far legs | FIN |
| `CMDTY_PHYSICAL_DELIVERY` | 06 | delivery of physical commodity under a future | INV |
| `CMDTY_STORAGE_FEE_B2B` | 06 | storage at a player-owned facility | OP |
| `CMDTY_FREIGHT_B2B` | 06 | freight with a player-owned fleet | OP |
| `DEFI_AMM_SWAP` | 06 | AMM swap legs | INV |
| `DEFI_LP_DEPOSIT` | 06 | deposit into a pool | INV |
| `DEFI_LP_WITHDRAW` | 06 | withdrawal from a pool | INV |
| `DEFI_LP_FEE` | 06 | swap fees to liquidity providers | OP |
| `DEFI_LEND_DEPOSIT` | 06 | deposit to a lending protocol | INV |
| `DEFI_LEND_WITHDRAW` | 06 | withdrawal | INV |
| `DEFI_LEND_INTEREST` | 06 | protocol interest | OP |
| `DEFI_BORROW` | 06 | borrowing from a protocol (tokens are not money: TRANSFER) | FIN |
| `DEFI_REPAY` | 06 | repayment to a protocol | FIN |
| `DEFI_LIQUIDATION` | 06 | protocol liquidation of a borrower | INV |
| `DEFI_STABLE_MINT` | 06 | stablecoin minted against collateral | FIN |
| `DEFI_STABLE_REDEEM` | 06 | stablecoin redeemed for collateral | FIN |
| `DEFI_BRIDGE_FEE` | 06 | bridge fee to bridge operator | OP |
| `CRY_TOKEN_MINT` | 06 | protocol token issuance or staking rewards (qty) | NC |
| `DRV_OPTION_PREMIUM` | 06 | option premium | INV |
| `DRV_OPTION_EXERCISE` | 06 | exercise/assignment settlement | INV |
| `DRV_FUTURES_FINAL_SETTLE` | 06 | final cash settlement | INV |
| `DRV_PERP_FUNDING` | 06 | perpetual funding payments | OP |
| `DRV_SWAP_PAYMENT` | 06 | interest-rate, total-return, inflation swap payments | OP |
| `DRV_CDS_PREMIUM` | 06 | CDS running premium and upfront | OP |
| `DRV_CDS_CREDIT_EVENT` | 06 | CDS protection payment after a credit event | INV |
| `COLL_AUCTION_SETTLE` | 06 | P2P auction-house settlement | INV |
| `BNK_DEPOSIT_IN` | 07 | core entity moves settlement cash into a deposit | FIN |
| `BNK_DEPOSIT_OUT` | 07 | core entity withdraws a deposit into settlement cash | FIN |
| `BNK_DEPOSIT_INTEREST` | 07 | interest to core depositors | OP |
| `BNK_LOAN_INTEREST` | 07 | interest paid by core borrowers | OP |
| `BNK_LOAN_FEE` | 07 | arrangement, commitment, covenant waiver fees | OP |
| `BNK_INTERBANK_LEND` | 07 | overnight and term interbank loan (reserves move) | FIN |
| `BNK_INTERBANK_REPAY` | 07 | interbank repayment | FIN |
| `BNK_INTERBANK_INTEREST` | 07 | interbank interest | OP |
| `BNK_DEPOSIT_INSURANCE_PREMIUM` | 07 | premiums to the deposit insurance fund (gov sub-account) | OP |
| `BNK_DEPOSIT_INSURANCE_PAYOUT` | 07 | payout to insured depositors of a failed bank | FIN |
| `BNK_BAILIN_CONVERSION` | 07 | deposits/bonds converted to equity in resolution (qty) | NC |
| `BNK_CAPITAL_INJECTION` | 07 | capital raised by a bank (from owners or the state) | FIN |
| `BNK_COLLATERAL_SEIZE` | 07 | collateral taken by a lender on default (qty) | INV |
| `INSOLV_DEBT_DISCHARGE` | 03 | extinguishment of a debt in insolvency (gain for debtor, loss for creditor) | NC |
| `INSOLV_CLAIM_TRADE` | 03 | sale of an admitted insolvency claim to another core entity (distressed investing) | INV |
| `INSOLV_DISTRIBUTION` | 03 | distribution of an estate to creditors | FIN |
| `REPO_LEND` | 07 | non-bank repo cash leg (MMF, fund, corporate) | FIN |
| `REPO_UNWIND` | 07 | non-bank repo close | FIN |
| `REPO_INTEREST` | 07 | repo interest | OP |
| `REPO_COLLATERAL` | 07 | collateral leg (qty, title transfer) | NC |
| `REPO_DEFAULT_COLLATERAL_SEIZE` | 07 | lender keeps collateral on default | INV |
| `SECLEND_FEE` | 07 | securities lending fee | OP |
| `SECLEND_COLLATERAL` | 07 | collateral against borrowed securities | FIN |
| `SECLEND_MANUFACTURED_DIVIDEND` | 07 | dividend equivalent paid by borrower | OP |
| `SECLEND_BUYIN` | 07 | buy-in after a failed recall | INV |
| `PB_MARGIN_INTEREST` | 07 | prime-broker/broker margin interest | OP |
| `PB_FEE` | 07 | prime-brokerage fees | OP |
| `PB_CUSTODY_FEE` | 07 | custody fees | OP |
| `CCP_INITIAL_MARGIN` | 07 | IM posted or returned | FIN |
| `CCP_VARIATION_MARGIN` | 07 | VM paid or received | OP |
| `CCP_DEFAULT_FUND` | 07 | default-fund contribution or return | FIN |
| `CCP_FEE` | 07 | clearing fees | OP |
| `CCP_INTEREST_ON_MARGIN` | 07 | interest paid on cash margin | OP |
| `CCP_WATERFALL_ALLOCATION` | 07 | mutualized loss allocation to surviving members | OP |
| `CCP_ASSESSMENT` | 07 | assessment call after default fund exhaustion | OP |
| `CCP_LIQUIDATION_PROCEEDS` | 07 | proceeds of a defaulter's portfolio auction | INV |
| `CCP_LIQUIDATION_PENALTY` | 07 | liquidation penalty (1% of liquidated notional) paid to the retail or product insurance fund or to the clearing member (07 §3.16.4; added for 07) | OP |
| `BNK_FX_MARGIN` | 07 | a bank's FX conversion margin charged to its client on a deposit-account FX payment (07 §3.1.2; added for 07) | OP |
| `BNK_ENFORCEMENT_FEE` | 07 | enforcement fee (1% of collateral proceeds) paid from enforced collateral proceeds to the lender (07 §3.3.5; added for 07) | OP |
| `CLR_DEBT_REPAY` | 07 | repayment of a ClearingDebt (principal and interest) to the clearing member or TCH, incl. the 30% auto-applied income share (07 §3.16.5; added for 07) | FIN |
| `ESCROW_DEPOSIT` | 15 | contract escrow placement at the Clearing House | FIN |
| `ESCROW_RELEASE` | 15 | release to the beneficiary | FIN |
| `ESCROW_REFUND` | 15 | refund to depositor | FIN |
| `FND_SUBSCRIPTION` | 08 | core investor subscribes | FIN |
| `FND_REDEMPTION` | 08 | core investor redeems | FIN |
| `FND_MGMT_FEE` | 08 | management fee to manager | OP |
| `FND_PERF_FEE` | 08 | performance fee (high-water mark) | OP |
| `FND_DISTRIBUTION` | 08 | distribution to core holders | FIN |
| `FND_FIRST_LOSS` | 08 | manager first-loss stake absorbs losses (Q6 resolution) | NC |
| `ETF_CREATE` | 08 | in-kind creation by an authorized participant (qty) | INV |
| `ETF_REDEEM` | 08 | in-kind redemption (qty) | INV |
| `ETF_AP_FEE` | 08 | creation/redemption fee | OP |
| `SPV_POOL_PURCHASE` | 08 | SPV buys a loan pool from the originator | INV |
| `SPV_TRANCHE_ISSUE` | 08 | tranches sold to core investors | FIN |
| `SPV_WATERFALL_INTEREST` | 08 | interest waterfall payment | OP |
| `SPV_WATERFALL_PRINCIPAL` | 08 | principal waterfall payment | FIN |
| `SPV_SERVICING_FEE` | 08 | servicer fee | OP |
| `RAT_RATING_FEE` | 08 | issuer-paid rating fee | OP |
| `INS_PREMIUM` | 08 | premium from a core policyholder | OP |
| `INS_CLAIM_PAYOUT` | 08 | claim paid to a core policyholder | OP |
| `INS_REINSURANCE_PREMIUM` | 08 | ceded premium | OP |
| `INS_REINSURANCE_RECOVERY` | 08 | recovery from reinsurer | OP |
| `INS_CAT_BOND_COUPON` | 08 | cat-bond coupon | OP |
| `INS_CAT_BOND_LOSS` | 08 | cat-bond principal reduction paid to cedant | INV |
| `INS_COMMISSION` | 08 | broker commissions | OP |
| `BIZ_SALES_B2B` | 09 | sales to a core entity (player or NPC company) | OP |
| `BIZ_SALES_GOV` | 09 | sales to a treasury (public contracts) | OP |
| `BIZ_COGS_B2B` | 09 | inputs bought from a core entity | OP |
| `BIZ_ENERGY_B2B` | 09 | energy from a player or NPC-company energy business | OP |
| `BIZ_UPGRADE_CAPEX_B2B` | 09 | upgrades built by a player construction business | INV |
| `BIZ_SALE_P2P` | 09 | business sold to another player (via contract) | INV |
| `BIZ_SUBSIDY_GOV` | 09 | subsidies from a treasury | OP |
| `CMP_CAPITAL_CONTRIBUTION` | 09 | owner contributes capital | FIN |
| `CMP_CAPITAL_RETURN` | 09 | capital returned to owners | FIN |
| `CMP_INTERCOMPANY_LOAN` | 09 | loan between group companies | FIN |
| `CMP_INTERCOMPANY_INTEREST` | 09 | interest on intercompany loans | OP |
| `CMP_INTRAGROUP_SERVICE` | 09 | management fees, royalties, services within a group (transfer-pricing tested, §3.12.9) | OP |
| `CMP_UNDERWRITING_FEE` | 09 | IPO/bond underwriting fee to a bank | FIN |
| `CMP_ADVISORY_FEE_B2B` | 09 | M&A advisory by a player or NPC-bank adviser | INV |
| `CMP_STARTUP_ROUND` | 09 | venture round (cash for preferred shares) | FIN |
| `CMP_LIQ_PREF_PAYOUT` | 09 | liquidation-preference waterfall payout | FIN |
| `CMP_DEBT_EQUITY_SWAP` | 09 | restructuring swap (qty) | NC |
| `CMP_AUDIT_FEE_B2B` | 09 | audit by a player audit firm | OP |
| `PROP_RENT_CORE` | 10 | rent from a core tenant | OP |
| `PROP_SALE_P2P` | 10 | property sold to another core entity | INV |
| `PROP_MANAGEMENT_FEE_B2B` | 10 | player property manager | OP |
| `PROP_DEVELOPMENT_CAPEX_B2B` | 10 | construction by a player builder | INV |
| `PROP_LAND_AUCTION` | 10 | city land sold by the treasury at auction | INV |
| `PROP_CONCESSION_BID` | 10 | concession winning bid paid to the treasury | INV |
| `PROP_CONCESSION_BUYOUT` | 10 | outbid incumbent receives built asset's book value from the treasury (01 §14.2) | INV |
| `CON_CONCESSION_PROFIT` | 10 | daily net fee income of a concession (exchange, port, utility) paid by the operated entity to the concession holder (§3.11.7) | OP |
| `CITY_DEVELOPMENT_LEVY` | 10 | development levies to the treasury | INV |
| `LAB_COMPUTE_RENT_B2B` | 11 | compute from a player or NPC-company data center | OP |
| `LAB_HARDWARE_PURCHASE_B2B` | 11 | hardware from a core vendor | INV |
| `LAB_DATA_LICENSE_B2B` | 11 | dataset licence between core entities | OP |
| `LAB_MODEL_LICENSE_FEE` | 11 | model API/licence fees (licence only, weights never sold, Bible decision 6) | OP |
| `LAB_COMPUTE_HIJACK` | 12 | compute moved by an op-7 hidden session (qty into 1221, C3b) | NC |
| `OPS_LOOT_CASH` | 12 | cash taken by a successful op between players | OP |
| `OPS_RANSOM` | 12 | ransom paid | OP |
| `OPS_DEFENSE_B2B` | 12 | defence bought from a player security firm | OP |
| `OPS_LOCKDOWN_RECONNECT` | 12 | $500 paid to each legitimate counterparty after a lockdown | OP |
| `OPS_PI_FEE_B2B` | 12 | private-intelligence or forensic work by a player firm | OP |
| `OPS_BRIBE_CORE` | 12 | bribe to a core entity (a crime) | OP |
| `LAW_FINE_VICTIM_FUND` | 13 | 10% of a fine to the Victim Compensation Fund | OP |
| `LAW_FINE_WHISTLE_POOL` | 13 | 5% of a fine to the whistleblower pool | OP |
| `LAW_RESTITUTION` | 13 | restitution to a victim | OP |
| `LAW_DISGORGEMENT_VICTIM` | 13 | disgorgement paid to identifiable victims | OP |
| `LAW_SETTLEMENT` | 13 | civil settlement | OP |
| `LAW_LEGAL_FEE_B2B` | 13 | fees to a player law firm | OP |
| `LAW_ARBITRATION_FEE_B2B` | 13 | fees to a player arbiter | OP |
| `LAW_GARNISHMENT` | 13 | garnished income paid to a creditor | OP |
| `LAW_WHISTLE_REWARD` | 13 | whistleblower reward (5% of fine, cap $50M) | OP |
| `LAW_BOUNTY_PAYOUT` | 13 | legal bounty paid on conviction | OP |
| `LAW_VICTIM_FUND_PAYOUT` | 13 | payout to unpaid victims | OP |
| `LAW_ASSET_SEIZURE` | 13 | seized assets moved to court escrow (qty) | NC |
| `LAW_FORCED_DIVESTITURE` | 13 | antitrust forced sale | INV |
| `LAW_CLASS_ACTION_AWARD` | 13 | class/derivative action award | OP |
| `LIFE_GIFT_P2P` | 14 | gift to another player (P2P tax applies) | OP |
| `LIFE_INHERITANCE` | 14 | dynasty succession transfer | NC |
| `LIFE_PURCHASE_P2P` | 14 | lifestyle item bought from another player | INV |
| `SOC_P2P_TRANSFER` | 15 | direct money transfer between players (caps, 2% tax) | FIN |
| `SOC_CONTRACT_PAYMENT` | 15 | scheduled contract payment | OP |
| `SOC_CONTRACT_PENALTY` | 15 | penalty clause | OP |
| `SOC_LOAN_P2P_ADVANCE` | 15 | P2P loan principal (no money creation) | FIN |
| `SOC_LOAN_P2P_REPAY` | 15 | P2P loan repayment | FIN |
| `SOC_LOAN_P2P_INTEREST` | 15 | P2P loan interest | OP |
| `SOC_REVENUE_SHARE` | 15 | revenue-share payout | OP |
| `SOC_LEASE_PAYMENT` | 15 | P2P lease | OP |
| `SOC_OPTION_PREMIUM_P2P` | 15 | P2P option premium | INV |
| `SOC_ALLIANCE_DUES` | 15 | member dues to an alliance treasury | FIN |
| `SOC_ALLIANCE_PAYOUT` | 15 | alliance payout to members | FIN |
| `SOC_EMBEZZLEMENT` | 15 | treasurer embezzlement (a crime, permanently on record) | FIN |
| `CBK_INTEREST_ON_RESERVES` | 04 | interest on reserves and settlement cash where paid | OP |
| `CBK_FACILITY_INTEREST` | 04 | interest on central-bank facilities | OP |
| `CBK_PROFIT_REMITTANCE` | 04 | central-bank profit to the treasury | FIN |
| `MAC_GOV_TRANSFER_CORE` | 04 | treasury grants, bailouts, relief to core entities | OP |
| `MAC_TREASURY_SWEEP` | 04 | treasury account movements between sub-accounts | FIN |
| `ADM_CORRECTION_TRANSFER` | 21 | compensating transfer between two entities after a bug | OP |
| `WLD_NPC_ACTOR_DEAL` | 16 | named-actor transactions with core entities (investments, loans, gifts) | INV |

#### §3.4.4 CREDIT_CREATE (bank or central-bank lending; M2 rises, M0 unchanged for commercial banks, M0_cb rises for the central bank)

| Code | Owner | Description | CF |
|---|---|---|---|
| `BNK_LOAN_DRAWDOWN` | 07 | term loan drawdown by a core borrower (incl. LBO debt) | FIN |
| `BNK_MORTGAGE_DRAWDOWN` | 07 | mortgage drawdown | FIN |
| `BNK_CREDIT_LINE_DRAW` | 07 | revolving credit draw | FIN |
| `BNK_OVERDRAFT_DRAW` | 07 | overdraft usage (automatic when a deposit would go negative under an overdraft facility) | FIN |
| `BNK_SECURITY_PURCHASE` | 07 | bank buys a security from a core non-bank, paying by creating a deposit | INV |
| `REPO_BANK_LEND` | 07 | bank lends cash in repo to a core non-bank | FIN |
| `PB_MARGIN_LOAN` | 07 | margin loan by a bank (prime broker or retail broker). Only banks may lend on margin (DEFAULT) | FIN |
| `CBK_STANDING_FACILITY` | 04 | overnight lending facility to banks (incl. automatic day-close conversion, §3.3.4) | FIN |
| `CBK_OPEN_MARKET_LEND` | 04 | central-bank repo / open-market operations | FIN |
| `CBK_ASSET_PURCHASE` | 04 | QE purchases | INV |
| `CBK_EMERGENCY_LIQUIDITY` | 04 | lender-of-last-resort assistance | FIN |
| `CBK_FX_INTERVENTION_BUY` | 04 | central bank buys foreign currency, creating domestic base money | INV |

#### §3.4.5 CREDIT_DESTROY (repayment; M2 falls, M0 unchanged for commercial banks, M0_cb falls for the central bank)

| Code | Owner | Description | CF |
|---|---|---|---|
| `BNK_LOAN_REPAY` | 07 | principal repayment of term loans | FIN |
| `BNK_MORTGAGE_REPAY` | 07 | mortgage principal | FIN |
| `BNK_CREDIT_LINE_REPAY` | 07 | revolver repayment | FIN |
| `BNK_OVERDRAFT_REPAY` | 07 | overdraft cleared | FIN |
| `BNK_SECURITY_SALE` | 07 | bank sells a security to a core non-bank, extinguishing a deposit | INV |
| `REPO_BANK_UNWIND` | 07 | bank repo close | FIN |
| `PB_MARGIN_REPAY` | 07 | margin loan repaid (incl. liquidation proceeds applied) | FIN |
| `BNK_COLLATERAL_PROCEEDS_APPLY` | 07 | proceeds of collateral sale applied to a bank loan | FIN |
| `CBK_STANDING_FACILITY_REPAY` | 04 | facility repaid | FIN |
| `CBK_OPEN_MARKET_UNWIND` | 04 | OMO unwound | FIN |
| `CBK_ASSET_SALE` | 04 | QT sales and run-off | INV |
| `CBK_EMERGENCY_LIQUIDITY_REPAY` | 04 | ELA repaid | FIN |
| `CBK_FX_INTERVENTION_SELL` | 04 | central bank sells foreign currency, destroying domestic base money | INV |

Clarification of 00 §5.4: "CREDIT_CREATE / CREDIT_DESTROY change M2 but not M0" holds for **commercial-bank** codes (`BNK_*`, `REPO_BANK_*`, `PB_*`). The **central-bank** codes (`CBK_*` in these two tables) are credit creation by the monetary authority: they change `M0_cb` (and therefore M0) but never `M0_sys`, the outside money that only FAUCET and SINK change. The Stabilizer acts only on FAUCET and SINK flows (00 §5.4) and therefore never on central-bank credit, which belongs to 04.

Note on commercial-bank income and spending: when a bank receives interest or fees paid from deposits it holds, or pays interest/opex into deposits, broad money M2 changes although the code is TRANSFER (or SINK). This is real banking behaviour; the money report shows it as the line "bank own-account flows" so the M2 identity reconciles (§3.5.3).

#### §3.4.6 REVALUE (non-cash value changes inside one entity's books, or bilateral accruals)

| Code | Owner | Description | CF |
|---|---|---|---|
| `LED_MTM_DAILY` | 03 | day-close fair-value revaluation of marketable positions (§3.3.8) | NC |
| `LED_FX_TRANSLATION` | 03 | translation of foreign-currency books for consolidated statements | NC |
| `LED_PERIOD_CLOSE` | 03 | closing 3300 into 3200 at year end | NC |
| `LED_ACCRUAL` | 03 | daily accrual of interest, rent, wages, fees (bilateral via `ACCRUE_PAIR`) | NC |
| `LED_DEPRECIATION` | 03 | depreciation of equipment, hardware, vehicles, buildings | NC |
| `LED_AMORTIZATION` | 03 | amortization of AI models, datasets, licences, concessions | NC |
| `LED_IMPAIRMENT` | 03 | impairment of any asset (incl. 30% of upgrade capex, model obsolescence) | NC |
| `LED_APPRAISAL` | 03 | property, business, private-stake, collectible revaluation on its cadence (§3.9) | NC |
| `LED_ECL_PROVISION` | 03 | expected credit loss provisions on loans and receivables | NC |
| `LED_TAX_PROVISION` | 03 | tax expense accrual against tax payable | NC |
| `LED_RECLASS` | 03 | reclassification between accounts | NC |
| `LED_DISSOLUTION` | 03 | closing record of a dissolved entity | NC |
| `LED_INTERCO_PROFIT_RESERVE` | 03 | deferral of intra-group profit until sale outside the group (consolidated books) | NC |
| `LED_CONDITION_DECAY` | 03 | value loss from condition decay of businesses and properties (09/10 provide %) | NC |
| `LED_LIFESTYLE_DEPRECIATION` | 14 | resale-curve depreciation of lifestyle durables | NC |
| `LED_INVENTORY_WRITEDOWN` | 09 | spoilage, obsolescence of inventory | NC |
| `EQ_SPLIT` | 06 | stock split / reverse split (qty and price per unit change, value unchanged) | NC |
| `DRV_MTM` | 06 | fair value of uncleared derivatives | NC |
| `BNK_LOAN_CHARGEOFF` | 07 | loan written off against the allowance | NC |
| `CCP_SKIN_IN_GAME_LOSS` | 07 | CCP capital absorbs a default loss | NC |
| `SPV_LOSS_ALLOCATION` | 08 | pool losses allocated to tranches bottom-up | NC |
| `INS_RESERVE_CHANGE` | 08 | change in claims and premium reserves | NC |
| `CMDTY_SPOILAGE` | 06 | physical loss of stored commodities | NC |
| `OPS_SABOTAGE_DAMAGE` | 12 | impairment of a victim's asset by sabotage | NC |
| `LAB_POISON_LOSS` | 12 | honeypot poison loss on a thief's student model (03-conflict §6.6, capped 10% AUM/day) | NC |
| `LAB_MODEL_DECAY` | 11 | capability decay of deployed models | NC |
| `LAB_COMPUTE_EXPIRY` | 11 | expiry of unused restricted compute (1221) | NC |

Total: 37 FAUCET, 86 SINK, 209 TRANSFER, 12 CREDIT_CREATE, 13 CREDIT_DESTROY, 27 REVALUE codes (384, including the five codes added for 07 by the reconciliation in 24). New codes require a catalog entry (23) and CI checks that every code requested by code exists and that its template matches its class.

### §3.5 Money: perimeters and aggregates

#### §3.5.1 Perimeters

Every entity belongs to exactly one perimeter, recomputed in P13 of any tick in which control changes (§3.11.2):

| Perimeter | Members | Role |
|---|---|---|
| **PLAYER** (the "player economy", P) | every `chr`, every `ali`, and every entity whose ultimate controller (§3.11.2) is a `chr` or an `ali` (their companies, funds, banks, insurers, businesses, properties, SPVs) | what the Stabilizer targets and what boards rank |
| **NPC core** | every other non-elastic, non-system entity: central banks, treasuries, regulators, courts, exchanges, the CCP, rating agencies, NPC banks, funds, insurers, NPC companies, named NPC actors, NPC liquidity providers | real balance sheets with conserved money |
| **ELASTIC** | `hh` (one per city), `frm` (one per bloc), `row` (one) | the aggregate economy at the edge of the ledger (§3.5.2) |
| **SYSTEM** | `sys` | issuer of outside money, suspense, burn |

"Core" = PLAYER ∪ NPC core. Money is conserved inside the core except through FAUCET, SINK and CREDIT flows.

#### §3.5.2 Elastic sectors (how the aggregate economy plugs into an exact ledger)

The aggregate economy (Layer 1 of the living world: households, small firms, the rest of the world, V3 Part 7) is modelled by 04 (macro) and by 09/10 (demand pools, rents) with float models. Its spending is a **model output**, not a constrained cash balance. In the ledger:

1. Elastic sectors hold **real claims** booked exactly like any entity: deposits at core banks, bonds, shares (the free float not held by core entities), fund units, properties, loans to and from core banks. This keeps quantity conservation exact (I8) and lets bank runs, defaults and restructurings hit real balance sheets.
2. Their spending money is **virtual**: account `1009 Elastic money`, which may be negative, backed by `sys:2909`. When an elastic sector pays a core entity, the payment is a FAUCET (template `ELASTIC_IN`): outside money is minted at the central bank for the payee. When a core entity pays an elastic sector, it is a SINK (`ELASTIC_OUT`): the money is burned.
3. Consequence: the core economy is closed except at two kinds of edges, the `sys` issuer and the elastic sectors, and both are FAUCET/SINK codes. This resolves the old ambiguity (01 §8.1 called "NPC customers pay players" a faucet, while a full balance-sheet world would call it a transfer): **payments from the aggregate economy are faucets; payments between named balance sheets are transfers.**
4. Loans between core banks and elastic sectors: disbursement is a SINK (`BNK_ELASTIC_LOAN_DISBURSE`), repayment and interest are FAUCETs; they are not CREDIT codes, because the deposit created would sit in the elastic sector. The macro model (04) accounts for household credit growth in its own float state.

#### §3.5.3 Aggregates (per currency, every tick)

```
M0[c]      = cbk_c:2001 + cbk_c:2002 + cbk_c:2003                       (all base money)
M0_sys[c]  = sys:2900[c] = cbk_c:1910                                     (outside money)
M0_cb[c]   = M0[c] - M0_sys[c]                                            (central-bank credit, net of its capital)
M2[c]      = Σ_{e not bank, not cbk, not gov} e:1001[c]  +  Σ_{banks} bnk:2100[c]   (incl. deposits of elastic sectors)
PEM[c]     = Σ_{e in PLAYER} (e:1001 + e:1010 + e:1050 cash + e:1070)[c]  (player-economy money)
PEW        = Σ_{roots r in chr ∪ ali} NWrank_FDL(r)                      (player-economy wealth, §3.10)
N_a        = Σ_players exp(-days_since_last_active / 7)                    (02-multiplayer §1; days = real days, wall clock)
```

Identities checked every tick (I4, §3.16):

```
ΔM0_sys = Σ FAUCET − Σ SINK
ΔM0_cb  = Σ CBK_* CREDIT_CREATE − Σ CBK_* CREDIT_DESTROY + Δ(cbk own-account flows: interest received/paid, FX revaluation of reserves)
ΔM2     = Σ BNK/REPO_BANK/PB CREDIT_CREATE − CREDIT_DESTROY + ΔM0 held by non-banks + bank own-account flows
```

"Bank own-account flows" = net of all postings that debit or credit a bank's 2100 against the bank's own income/expense/equity (interest, fees, opex, dividends paid into deposits). The money report shows this line explicitly.

#### §3.5.4 Effect of each class

| Class | M0_sys | M0_cb | M2 | PEM | Core NW total |
|---|---|---|---|---|---|
| FAUCET | + | 0 | + (if payee non-bank) | + if payee in P | + |
| SINK | − | 0 | − | − if payer in P | − |
| TRANSFER | 0 | 0 | 0, except bank own-account flows | ± if one side in P and the other NPC core | 0 |
| CREDIT_CREATE (bank) | 0 | 0 | + | + if borrower in P | 0 |
| CREDIT_CREATE (cbk) | 0 | + | 0 to + | 0 | 0 |
| CREDIT_DESTROY | mirror | | | | 0 |
| REVALUE | 0 | 0 | 0 | 0 | ± |

#### §3.5.5 Player-perimeter flow accounting

Because a TRANSFER between P and the NPC core (e.g. a dividend from an NPC company to a player, a fee from a player to an NPC bank) also changes PEM, the daily money report (§3.7.7) shows two views: (a) world classes by reason code; (b) **P-crossing flows**: every posting with one side in P and the other outside P, grouped by family (§3.6), as inflows and outflows of P. The Stabilizer's error is computed from wealth (§3.7.2) and needs neither view as an input; both views are for transparency and balancing (20).

#### §3.5.6 Restricted cash

Some faucet cash must not fund certain actions immediately (L12; roadmap conflict C5, decided 2026-10-09):
- `ACCT_REWARDED_AD` and `ACCT_FRESH_START` credit `1001` sub-account `RESTRICTED:<releaseTick>` with `releaseTick = tick + 51,840` (72 real hours of world time, 02 §3.1.3).
- Restricted cash can pay for: businesses, property, licences, market trades in cash products, lifestyle items, taxes, upkeep. It cannot pay for: ops (12), insider-tier information or tips (16), margin or collateral (07), P2P transfers or contract payments to other players (15), alliance dues.
- `ledger.available(E, purpose)` excludes restricted sub-accounts for the forbidden purposes. Spending draws restricted cash first for allowed purposes. At `releaseTick`, a `LED_RECLASS` moves the remainder to unrestricted.

### §3.6 Faucet and sink inventory, with target ratios

Targets are for the PLAYER perimeter over a rolling game year, expressed as a share of **gross inflows to P** (faucets with payee in P plus P-crossing transfers into P). They are the bands 20's balance harness asserts on simulated populations (01 §8.4 curve) and that the money report shows live. All values DEFAULT (Mathis may override); 20 may retune within the stated range.

| Family | Codes (main) | Direction | Target (share of gross inflows to P) | Range |
|---|---|---|---|---|
| F1 Operating revenue from the aggregate economy | `BIZ_SALES_HH/FRM/ROW`, `BIZ_CONTRACT_BONUS_NPC`, `PROP_RENT_ELASTIC`, `LAB_*_ELASTIC`, `CMDTY_SALE_TO_ELASTIC` | in | 70% | 60–80% |
| F2 Investment income from the NPC core | `EQ_DIVIDEND`, `BOND_COUPON`, `SOV_COUPON`, `BNK_DEPOSIT_INTEREST`, fund distributions from NPC funds | in | 8% | 4–12% |
| F3 Trading gains against NPC liquidity | P-crossing `MKT_TRADE` net, `LP_*` refills (indirect) | in (net, can be negative) | 6% | −5–12% |
| F4 Asset sales to the aggregate economy | `BIZ_SALE_TO_NPC_MARKET`, `PROP_SALE_TO_ELASTIC`, `COLL_SALE_TO_NPC`, `LIFE_RESALE_TO_NPC` | in | 6% | 2–10% |
| F5 Institutional inflows from households | `BNK_ELASTIC_*` in, `FND_ELASTIC_SUBSCRIPTION`, `INS_ELASTIC_PREMIUM` | in | 8% | 0–15% |
| F6 One-time and support faucets | `ACCT_START_CASH`, `ACCT_ONBOARD_GRANT`, `ACCT_REWARDED_AD`, `ACCT_FRESH_START`, `ACCT_QUEST_REWARD`, `ADM_COMPENSATION` | in | < 0.5% after the first chapter | 0–1% |
| S1 Operating costs to the aggregate economy | `BIZ_COGS_FRM`, `BIZ_WAGES`, `BIZ_RENT_ELASTIC`, `BIZ_ENERGY_NPC`, `BIZ_UPKEEP`, `BIZ_MARKETING`, `PROP_UPKEEP`, `PROP_MANAGEMENT_FEE_NPC` | out | 45% | 35–60% (gives business margins of 30–45%) |
| S2 Capital spending | `BIZ_PURCHASE_NEW`, `BIZ_UPGRADE_CAPEX`, `PROP_DEVELOPMENT_CAPEX`, `PROP_PURCHASE_FROM_ELASTIC`, `LAB_HARDWARE_PURCHASE_NPC` | out | 15% | 8–25% |
| S3 Lifestyle | `LIFE_*` sinks | out | 8% (R0–R2 ~3%, R5–R6 ~15%) | 4–15% |
| S4 AI and compute | `LAB_COMPUTE_*_NPC`, `LAB_DATA_PURCHASE_NPC`, `LAB_RESEARCHER_*` | out | 5% (late-game run sizes C3 make this 1–3% of NW per frontier run) | 2–10% |
| S5 Taxes (TRANSFER to treasuries, then sunk by government spending) | `TAX_*` | out | 12% | 8–20% |
| S6 Fees and levies | `ACCT_TERMINAL_SUBSCRIPTION`, `ACCT_LICENSE_FEE`, `ACCT_CHARTER_FEE`, `MKT_TRANSACTION_LEVY`, `MKT_EXCHANGE_FEE` (to NPC exchanges), `SOC_CONTRACT_REG_FEE`, `COLL_AUCTION_FEE` | out | 2% | 1–4% |
| S7 Legal and crime | `LAW_FINE_SINK`, `LAW_COURT_FEE`, `LAW_NPC_LEGAL_FEE`, `LAW_DISGORGEMENT_NO_VICTIM`, `OPS_NPC_CREW_THEFT` | out | 0.5–1.5% of PEM per game year (03-conflict §1) | 0.3–2% |
| S8 Security and ops | `OPS_DEFENSE_NPC`, `OPS_COST_NPC`, `OPS_HONEYPOT_COST`, `OPS_FORENSIC_AUDIT_NPC` | out | 2% | 1–5% |
| S9 Interest to the NPC core | `BNK_LOAN_INTEREST` (to NPC banks), `PB_MARGIN_INTEREST`, `REPO_INTEREST` | out | 4% | 1–8% |
| S10 Institutional outflows to households | `BNK_ELASTIC_*` out, `FND_ELASTIC_*` out, `INS_ELASTIC_CLAIM` | out | 7% | 0–15% |

Headline ratio: `ρ = gross outflows of P / gross inflows to P`, target **0.80–0.95** over a rolling game year once the world is past its first chapter (net growth comes from new players and the designed wealth curve). Below 0.75 or above 1.0 for 28 game days raises a balance alert (20, 21).

### §3.7 The Stabilizer (PI controller on faucets and sinks)

#### §3.7.1 What it is

A diegetic institution, the **Stabilizer Board of the Exchange**, implemented as a deterministic controller that runs once per game day in the day-close hook (P2 at t = 719; lever changes take effect from t = 0 of the next day). It acts **only** on FAUCET and SINK flows (00 §5.4) through four levers. It never touches market prices or the price model, interest rates (04), taxes and tax brackets (04 fiscal; 01 §8.2 lever 2 is therefore removed), fines (13), start cash, ads or grants (fixed by L12 and 18), the compute spot price (single floating price, RESOLVED C3) or any individual player. Equity drift (01 §8.2 lever 1, second half) is also removed: the price model stays explainable (01 §0.1).

#### §3.7.2 Input: the wealth-tracking error

```
For each character i with engaged(i) (below) and accountAgeRealDays(i) >= 1:
   q_i = NWrank_i / W_target(age_i)                // NWrank in nominal FDL, §3.10
e = ln( weightedMedian(q_i, weight = w_i) )        // w_i = exp(-days_since_last_active/7)
```

- `engaged(i)`: at least `PARAM.stab_engaged_min_active_days` (DEFAULT 7) distinct game days with an accepted human (UI or API) intent in the last 168 game days (7 real days). Computed from state, so deterministic.
- `W_target(age)` is the designed median-engaged wealth curve from 01 §8.4 and §14.3, interpolated log-linearly in age (real days since the character's creation, measured in world time = ticks / 17,280):

| Age (real days) | 0 | 1 | 7 | 21 | 56 | 180 | 365 | > 365 |
|---|---|---|---|---|---|---|---|---|
| W_target (FDL) | 5,000 | 15,000 | 500,000 | 20,000,000 | 300,000,000 | 2,000,000,000 | 6,000,000,000 | × (1 + `PARAM.stab_target_growth_after_year` (DEFAULT 0.001)) per real day |

- If fewer than `PARAM.stab_min_sample` (DEFAULT 200) engaged characters exist, the Stabilizer is in OBSERVE mode.

#### §3.7.3 Controller

```
deadband: e_eff = 0                       if |e| <= db            (db = PARAM.stab_deadband = 0.05)
          e_eff = e - sign(e) * db        otherwise
integral: if not (saturated in the direction of e_eff) or sign(e_eff) != sign(I):
              I = clamp(I + e_eff, -Imax, Imax)                    (one game day per step; Imax = PARAM.stab_integral_max = 10)
output:   u = clamp(Kp * e_eff + Ki * I, -1, 1)                    (Kp = PARAM.stab_kp = 0.5, Ki = PARAM.stab_ki = 0.02)
```

`u > 0` means players are richer than designed: tighten (less demand, higher lifestyle prices, higher levy, higher upkeep). `u < 0`: loosen.

#### §3.7.4 Levers

| Lever | Neutral | Target formula | Range | Max change per game day | Applies to (owner reads it) |
|---|---|---|---|---|---|
| L1 NPC demand multiplier | 1.00 | `1 − 0.10·u` | 0.90–1.10 | 0.005 | demand pools of every city sector (09) and, at half strength `1 + 0.5·(L1 − 1)`, elastic rent demand (10). Not applied to listed NPC companies' modelled revenue (05/09), so share prices are not steered |
| L2 Lifestyle and NPC-service price index | 1.00 | `1 + 0.25·u` | 0.90–1.25 | 0.005 | catalog prices of lifestyle items (14), NPC club dues and hosting (14), Terminal/data-tier subscriptions (16), NPC auction fees (06), NPC service prices paid by businesses (09), the catalog price `c0` of new businesses (09) and NPC property services (10) (scope merged from 04's former `priceLevelAdj` lever; ruling in 24). Shown to players as the "Luxury CPI" (world inflation flavour, 01 §5.5) |
| L3 Transaction levy | 0.5 bp | `0.5 + 1.5·u` bp | 0–3.0 bp | 0.1 bp | exchange notional of a character's (consolidated group's) trading above `PARAM.levy_free_daily_notional` (DEFAULT $10,000,000 per game day) (01 §8.2 lever 4: "fees on high-volume trading"). This is the only high-volume trading lever: 04's former `highVolumeFeeMult` is merged into it and no separate fee multiplier exists (ruling in 24) |
| L4 Upkeep index | 1.00 | `1 + 0.15·u` | 0.95–1.15 | 0.003 | upkeep of businesses (09), properties (10), lifestyle items (14) |

Each lever moves from its current value toward its target by at most its daily step. "Saturated in the direction of e" in §3.7.3 = every lever is at the bound it would move toward.

Single definition (ruling in 24): this section is the only definition of the Stabilizer, its levers and its controller; 04 §3.17 references it. 04's former levers were reconciled as follows: `demandMult` = L1; `priceLevelAdj` = L2 (scope merged above); `highVolumeFeeMult` = L3; `equityDriftAdj` (a REVALUE effect on prices) and `topBracket` (taxes are TRANSFERs to the treasury, §3.12) are not levers because 00 §5.4 lets the Stabilizer act only on FAUCET and SINK flows.

#### §3.7.5 Modes

- **OBSERVE** for the first `PARAM.stab_observe_game_days` (DEFAULT 168 game days = 7 real days) after world launch, and whenever the sample is too small: computes and publishes `e` and lever targets, holds levers at neutral, `I` stays 0.
- **ACTIVE** otherwise.

#### §3.7.6 Guards

- If `|e| > 0.5` for 28 consecutive game days, the Stabilizer keeps acting within its ranges but raises a structural-imbalance alert (21, 20): it means the design curve or a system is off and needs a reviewed parameter change, not a bigger lever.
- If `M0_sys` per active player (`M0_sys / N_a`, FDL) grows more than 2× faster than `Σ w_i·W_target(age_i) / N_a` over a chapter, an inflation alert is raised.
- Lever values are state (not parameters); parameter changes to gains or ranges follow 02 §3.18.

#### §3.7.7 Publication (diegetic, V3 Part 8 "public integrity report")

Every game day at close: the **Money Supply Report** (public): M0, M0_sys, M2 per currency; PEM and PEW; N_a; `e`; `u`; the four lever values and their change; faucets and sinks by family (§3.6) for the day and rolling game year; ρ. Every chapter: the **Stabilizer and Exchange Report**: the chapter's series, crises, CCP default-fund usage (07), systemic indicators (07/08), exploit-fix history (21), integrity data (02 §7). Individual players are never named.

### §3.8 Money Supply Index (MSI) and Net Worth Index (NWI)

The NWI is the ranking metric (00 §4): net worth in **real** terms, so that "a dollar in year 3 is worth the same as on launch day" (01 §0.6).

```
design_money(t) = κ · Σ_i w_i · W_target(age_i)          over all characters (not only engaged), κ = PARAM.msi_money_share = 0.20
raw(t)          = PEM_FDL(t) / design_money(t)            (actual player money relative to designed money for this population)
ema(t)          = ema(t-1) + α · (raw(t) − ema(t-1)),     α = 1 − 2^(−1/28)  (half-life 28 game days), daily at day close
MSI(t)          = clamp( ema(t) / ema_base, MSI(t-1)·(1 − 0.005), MSI(t-1)·(1 + 0.005) )
ema_base        = mean of ema over the world's first 168 game days; MSI = 1.000 during that period
NWI_i(t)        = NWrank_i(t) / MSI(t)
```

- Reading: MSI = 1.10 means players hold 10% more money than the design path for a population of this age profile; every nominal dollar of net worth then counts as 0.909 "real" dollars on the boards.
- MSI is published daily with 4 decimals. Boards show NWI in "real $" with the label `real`; personal screens show nominal NW first and NWI second (17).
- Seasonal ladders (15) use NWI deltas exactly as 01 §14.4 defines.

### §3.9 Valuation (marking) rules for every asset type

#### §3.9.1 General rules (mark governance)

1. Marks come only from engine sources: market clearing, engine models, engine appraisals, NAV strikes. **Never** from a price a player declares, from a P2P or related-party transaction price, or from a contract term.
2. **Thin-print guard** for exchange-traded assets: the intraday mark after a tick with clearing volume `V` at price `P` is `mark = (V·P + V_min·mark_prev) / (V + V_min)` where `V_min = PARAM.mark_min_volume_frac (DEFAULT 0.002) × ADV20` (05 provides ADV). A single tiny print cannot move the mark much (anti-ramping for NW).
3. **Stale marks**: a mark older than its `validUntilTick` is flagged `STALE`; NW still uses it, but boards apply the illiquidity haircut of §3.10.3; collateral systems (07) apply their own haircuts.
4. **Halted instruments** keep the last mark flagged `STALE` until the reopening auction.
5. All marks are in the asset's currency; translation per §3.3.6.

#### §3.9.2 Table of marks

| Asset (account) | Mark source | Cadence | Fallback | Notes |
|---|---|---|---|---|
| Settlement cash, reserves (1001–1003) | face | — | — | risk-free |
| Deposits (1010) | face | — | expected recovery if the bank is IN_INSOLVENCY: insured part at face, uninsured at the resolution authority's announced recovery (07) | |
| Margin posted, default fund, escrow (1050–1070) | face less any called losses | tick | — | belongs to the depositor until released or applied |
| Receivables (11xx) | face less ECL (§3.9.3) | day | — | intercompany at face (eliminated in consolidation) |
| Inventory (1200) | lower of cost and net realizable value (09) | hour | cost | |
| Physical commodities (1210) | spot mark of the commodity (05) less location basis (06) | tick | front future | |
| Compute OWNED/RESERVED (1220) | spot $/GPUh × qty (×10 for PFLOP-day, RESOLVED C1) for RESERVED and for OWNED compute credits; hardware is 1840 | tick | — | restricted compute 1221 marked **0** |
| Loans (13xx) | amortized cost less ECL allowance (1309) | day | — | not fair-valued (banks' trading books excepted, 07) |
| Listed equities, ETFs (1500, 1510) | intraday mark per §3.9.1, official close at t = 540 | tick | V_i fundamental value (05) if no trade for 5 game days | |
| Bonds (1520) | clean price from clearing (thin-print guarded) + accrued interest | tick | model: issuer curve + spread (04/06, `MODEL_CURVE`) | sovereign bonds of a defaulted issuer at recovery mark |
| Fund units (1530) | last NAV strike (day close) adjusted intraday by the fund's reported exposure (08) | tick (estimate), day (strike) | last NAV | gated funds: NAV × (1 − gate discount 08) |
| Crypto, stablecoins (1540) | clearing mark | tick | — | depegged stablecoins at market, never at peg |
| DeFi LP and lending positions (1541, 1542) | pool reserves × marks of the underlying tokens (06) | tick | — | |
| Structured tranches (1560) | model price (08: pool expected loss, correlation, waterfall), or clearing if traded | day (model), tick (if traded) | last model | |
| Private equity and venture stakes (1570) | last arm's-length round price per share for the same class, adjusted by: time decay `−PARAM.pe_mark_decay_per_quarter (DEFAULT 5%)` per game quarter without a new round, and the company's 09 valuation if lower; preference-adjusted via liquidation waterfall at the 09 value | quarter | 09 valuation × (1 − 25% illiquidity) | arm's length = no related parties, ≥ 2 unrelated investors (09) |
| Investments in controlled entities (1580) | look-through NAV (§3.11.4) | hour | — | eliminated in consolidation |
| Derivatives (1600/2600) | cleared: settlement/mark price from CCP (VM moves cash, position value 0 after VM); uncleared: `MODEL_OPTION` (Black–Scholes with 06's vol surface), swap curves (04/06), CDS hazard model (06) | tick (cleared), day (uncleared) | | |
| AI models (1700) | cost less amortization over `PARAM.model_useful_life_game_days` (DEFAULT 364), less impairment when the model's capability falls below the frontier band of its tier (11 provides the impairment %); capped at replacement cost (11) | day | | internally trained models are capitalized at the cost of compute, data and staff of their training runs (11 flags capitalizable costs); stolen/distilled students are capitalized at the thief's own incurred cost only |
| Datasets (1710), licences (1720) | cost less amortization (datasets 182 game days, licences over their term) | day | | |
| Goodwill (1730) | cost, impaired annually if the acquired group's look-through value falls below carrying value | year | | |
| Concession rights (1740) | bid cost amortized straight-line over the concession term (8 real weeks = 1 chapter, 01 §14.2) | day | | |
| Property (1800) | 10's appraisal model: `NOI / cap rate` with district index (01 §3.8); owner-occupied homes at the same appraisal (01 §13) | week (`PARAM.prop_appraisal_cadence_game_days` = 7), plus on events (district shock, renovation completion, condition change > 10 points) | last appraisal | appraisal change per cadence capped at ±15% unless an event triggers it; revaluation above cost goes to 3400 for property held for use by companies, to P&L for investment property and for characters (DEFAULT: all characters' property through P&L, so NW reflects it) |
| Construction in progress (1810) | cost incurred | — | | |
| Businesses (1580 for the owner; the biz's own assets at book) | 09 valuation model (earnings-based, including the "upgrades only 70% reflected" rule, 01 §9) | game hour (with the business's staggered operation) | | |
| Equipment, hardware, vehicles, storage (1830–1880) | cost less depreciation (09/11 useful lives) less impairment | day | | |
| Lifestyle durables (1860) | 14's resale curve × L2 price index at purchase time | day | | depreciating sinks (01 §8.1) |
| Collectibles (1870) | category index (06) × item's last appraisal multiple; arm's-length auction results re-base the item multiple | day | | |
| Deferred tax (1900, 2430) | tax rate × temporary difference | quarter | | |
| Liabilities (2xxx) | face/amortized cost; own bonds issued are **not** fair-valued (an entity cannot gain from its own credit deterioration). Derivative liabilities at fair value | | | |

#### §3.9.3 Expected credit loss (loans, receivables)

`allowance = Σ_loans EAD × PD_12m × LGD` for performing loans and `EAD × LGD` for defaulted ones; PD from the borrower's rating or 07's scorecard, LGD from collateral (07). Updated daily with `LED_ECL_PROVISION`. Charge-off on default resolution with `BNK_LOAN_CHARGEOFF`.

#### §3.9.4 Revaluation surplus vs P&L

Companies holding property for their own use and intangibles carried above cost book the excess in 3400 (OCI) and recycle it to P&L on disposal. Everything else revalues through P&L. Characters have no OCI: every revaluation is P&L. Net worth includes both.

### §3.10 Net worth (NW) and ranking net worth (NWrank)

#### §3.10.1 Definitions

- **NW (book, marked)** of an entity in currency R: `Σ marked assets − Σ liabilities` of its own books (solo), translated to R.
- **NW (consolidated)** of a group parent: §3.11.4 look-through.
- **NWrank** of a character or alliance, in FDL, used by ranks (14), boards (15), the Stabilizer (§3.7) and NWI (§3.8): consolidated look-through NW with the board adjustments of §3.10.3.

#### §3.10.2 What counts

| Item | Treatment |
|---|---|
| Restricted cash (§3.5.6) | counts at face |
| Restricted compute (1221) | 0 |
| Escrow deposited | counts for the depositor until release |
| Assets under court freeze | count (ownership unchanged) |
| Seized assets (court escrow) | do not count for the former owner; count for the victim only after the award |
| Final judgments, fines, restitution owed | liabilities from the verdict tick |
| Pending lawsuits, investigations | not counted (no contingent liabilities on boards) |
| Persistent claims after discharge (2990) | liabilities |
| Shares in own listed company | see §3.10.3 control cap |
| Challenge-event portfolios (15) | never (separate book) |

#### §3.10.3 Board adjustments

1. **Concentration (impact) haircut** for any exchange-traded holding with `qty / ADV20 > 0.05`:
   `haircut = min(0.5, PARAM.nw_impact_y (DEFAULT 0.5) × σ_daily × sqrt(qty / ADV20))`, consistent with 05's square-root impact law. Value = mark × qty × (1 − haircut). A whale's 40% stake in a thin name cannot be counted at the screen price.
2. **Control cap**: a listed company controlled by the character's group is counted at `min(haircut market value of the stake, effectiveOwnership × NAV_lookthrough × PARAM.nw_control_listed_cap (DEFAULT 2.0))`. Pumping one's own listed company does not pump one's rank beyond twice its underlying value.
3. **Stale illiquid haircut**: STALE marks on exchange-traded assets take an extra 10% haircut until a valid mark returns.

#### §3.10.4 Cadence

NWrank is computed for every character and alliance in P13 of ticks with `t mod 30 == 29` (once per game hour, aligned with board refreshes, 15) and at day close (for the Stabilizer and MSI). A character's own screens show a flash NW recomputed every tick from the latest marks (17).

### §3.11 Ownership chains, consolidation, minority interests, elimination

#### §3.11.1 The ownership graph

The graph has an edge for every holding of voting shares (1500 of a listed cmp, 1570 of an unlisted cmp, 1580 controlled entities, fund units carry no votes, bank and insurer shares as cmp shares). `biz` and `prop` are always 100% owned by one entity (`ownerId`), so they are leaves. Voting rights per share class come from 09 (common 1 vote; preferred 0 unless converted; dual-class allowed for player IPOs within 09's limits).

#### §3.11.2 Control

Entity H **controls** issuer X if, counting votes held directly by H plus votes held by entities H controls (recursively, evaluated to a fixed point in sorted order), H has:
1. more than 50% of votes; or
2. at least `PARAM.control_defacto_min` (DEFAULT 30%) of votes and at least twice the votes of the next largest holder group, and board control under 09's governance rules (DEFAULT de facto control rule, Mathis may override); or
3. control by contract: fund managers do **not** control their funds for consolidation (custody rule, 08); SPV sponsors control their SPV only if they hold the majority of the equity tranche.

Every entity has at most one controller. `ownerId` = direct controller (or the largest holder when no one controls, for display only); `rootOwnerId` = end of the control chain. An entity with no controller has itself as root and belongs to the NPC core unless it is a chr or ali.

#### §3.11.3 Effective ownership

`eff(H, X)` = sum over all ownership paths from H to X of the product of economic shares along the path (economic share = holder's fraction of the issuer's residual economics after preferences, 09). Computed with the same linear system as §3.11.4.

#### §3.11.4 Look-through NAV (the anti-duplication algorithm)

For a set of entities `G` (all entities reachable from a root through any holdings that are not valued at market):

```
For each e in G (sorted by canonical order):
   a_e = Σ marked external assets of e  − Σ liabilities of e
         where "external" excludes holdings of shares in other members of G
         and excludes intercompany receivables/payables with members of G (they are included through the members' own books)
   listed holdings in entities outside G are included in a_e at board value (§3.10.3)
Solve  x = a + S · x   where S[e][j] = economic share of j held by e (unlisted holdings within G)
   by Gauss–Seidel in canonical order for exactly PARAM.lookthrough_iterations (DEFAULT 64) sweeps
NAV(e) = x_e
```

Intercompany balances: a loan from member A to member B appears as an asset in `a_A` and a liability in `a_B`; because B's NAV flows to A in proportion to ownership, the loan nets correctly (minority holders of B bear their share). This is why internal payments transfer money between owned entities but never create group value (Bible I06).

Validity rule (enforced by 09 on any share acquisition): an acquisition that would create an ownership cycle whose product of economic shares is ≥ `PARAM.cycle_max_product` (DEFAULT 0.95) is rejected (`REJECT_CIRCULAR_OWNERSHIP`). This keeps `S` strictly contractive so the iteration converges well inside 64 sweeps.

Shares of a member held by another member of the same group (cross-holdings within a group) are **treasury shares** for the group's consolidated statements; the look-through system handles their value without double counting.

#### §3.11.5 Consolidated financial statements

For a group parent P with controlled members:
1. Aggregate line by line all members' statements, translated into P's reporting currency (balance sheet at closing rate, income statement at the period's average daily rate; differences to 3500 FX translation reserve, `LED_FX_TRANSLATION`).
2. **Eliminate**: (a) the parent's investment in each subsidiary against the subsidiary's equity, creating goodwill (1730) for the excess paid at acquisition; (b) intercompany receivables and payables; (c) intercompany sales, purchases, interest, fees, dividends; (d) unrealized intercompany profit on assets still held in the group (inventory, property, businesses, models sold within the group) via `LED_INTERCO_PROFIT_RESERVE`, released when the asset leaves the group; (e) cross-held shares as treasury shares; (f) intragroup guarantees (memo only).
3. **Non-controlling interests**: NCI share of each subsidiary's net assets and result = `1 − eff(P, X)`; shown in 3600 and as "attributable to NCI" in the income statement.
4. Associates (20–50% without control) are carried at equity-method value (share of NAV) in the parent's solo and consolidated books.

#### §3.11.6 Related parties and minority protection (Bible I07)

Two entities are related if they share a root owner, or one controls the other, or they are linked accounts (15 anti-cheat). For transactions between related parties where at least one side has outside minority holders (NCI > 0 or listed):
- The price must lie within ±`PARAM.related_party_band` (DEFAULT 10%) of the engine fair value of the asset or service (the band 01 §9 uses for anti-funneling).
- Outside the band the transaction still executes (the engine never blocks a lawful choice), but: it is flagged in the next filing (15); minority holders gain a derivative claim (13) with damages = minority share of the value transferred; tax uses the arm's-length price (§3.12.9); the transaction never sets a mark.
- Internal capacity used for a related entity (Bible I02: a data-center business serving its owner's lab) is booked at the business's list price as `BIZ_SALES_B2B`/`LAB_COMPUTE_RENT_B2B` so the opportunity cost is visible in both statements.

#### §3.11.7 Concessions

A concession (stock exchange, port terminal, utility, chip fab, nuclear plant, 01 §14.2; 10 runs the auctions) is a right (1740) held by the winning entity for one chapter. The operated entity (e.g. the bloc's `exc`) stays an NPC-core entity owned by the treasury; each day at close it pays its net fee income (fees − operating costs − mandated reserves) to the holder with `CON_CONCESSION_PROFIT`. When the holder is outbid, the treasury pays it the built asset's book value (`PROP_CONCESSION_BUYOUT`) and the right is derecognized.

### §3.12 Taxes

#### §3.12.1 Principles

1. Taxes are TRANSFERs from the taxpayer to the treasury (`gov`) of the jurisdiction; treasuries spend through 04's fiscal rules, mostly into the elastic economy (`MAC_GOV_SPENDING_ELASTIC`, SINK). Taxes are therefore a delayed sink for the player economy, but **not** a Stabilizer lever (§3.7.1).
2. The engine computes every tax exactly from postings (each reason code carries a `taxTag`). There is no self-assessment and no way to under-declare; "planning" means choosing structures, timing and jurisdictions, and "evasion" means moving money through illicit reason codes, which the Revenue Office can find (§3.12.14).
3. Tax year = game year. Amounts in the jurisdiction's currency (Serena: FDL).
4. Answers V3 Part 13 Q5 ("how deep should tax be?"): **five bloc regimes plus one free zone, a treaty matrix, CFC rules, transfer pricing, participation exemption, tax groups, exit tax and audits**: a planning game with real trade-offs, bounded so that every rule is computable each tick. DEFAULT (Mathis may override).

#### §3.12.2 Jurisdictions and residency

- **Characters** are tax-resident in the bloc of their home city (00 §5.9: start in an FDL city, so FDL). They may change residency to another bloc where they own or lease a home (10) with `acct.tax.changeResidency` (§4), at most once per 91 game days, paying exit tax (§3.12.13). Characters cannot be resident in Isla Serena (DEFAULT: Serena has no personal tax authority; this stops the top of the board from simply leaving the tax system).
- **Companies, banks, insurers** are resident where incorporated (09). Incorporation in the **Isla Serena Free Zone** is allowed for companies (`homeBloc = 'SERENA'`, currency FDL): 0% corporate tax, annual franchise fee `max($250,000, 0.1% of total assets)` (`CMP_FRANCHISE_FEE_SERENA`, SINK), no treaties, subject to the home blocs' CFC rules (§3.12.11).
- **Funds and SPVs** are tax-transparent (no entity-level tax; holders taxed on distributions and gains).
- **Alliances** are transparent: income is attributed to members pro rata to dues paid in the year.
- **NPC entities**: NPC companies' modelled tax is `corporate rate × modelled profit` posted with `TAX_CORPORATE` from their fundamentals (05/09); NPC banks, insurers and funds follow the same rules as player ones.

#### §3.12.3 Rates by jurisdiction (DEFAULT, Mathis may override; 04's fiscal policy may move rates within the ranges in 23)

| | FDL (Federal Union) | EUN (Euran Compact) | PYN (Pacific League) | NKR (Nordic Alliance) | SRL (Southern Coalition) | SERENA free zone |
|---|---|---|---|---|---|---|
| Personal income: 0% up to | $40,000 | 30,000 | 50,000 | 30,000 | 20,000 | n/a |
| … then up to $1M | 12% | 18% | 10% | 20% | 8% | |
| … up to $50M | 20% | 28% | 15% | 30% | 15% | |
| … up to $1B | 28% | 36% | 22% | 38% | 20% | |
| … above $1B (top bracket, within 25–45%, 01 §14.2) | 35% | 45% | 30% | 45% | 25% | |
| Capital gains short (< 91 game days held) | 20% | 28% | 15% | 30% | 15% | n/a |
| Capital gains long (≥ 91 game days) | 10% | 25% | 8% | 25% | 10% | |
| Corporate | 21% | 27% | 20% | 24% | 30% | 0% |
| Property tax (per game year, of appraised value) | 1.0% | 0.8% | 0.6% | 1.2% | 1.5% | 0.5% |
| VAT on final consumption | 7% | 20% | 10% | 25% | 16% | 0% |
| Securities transaction tax (buyer, bloc-listed equities and ETFs) | 0 | 0.10% | 0.05% | 0 | 0.20% | 0 |
| Stamp duty on property (buyer) | 1.0% | 4.0% | 3.0% | 2.5% | 5.0% | 8.0% |
| Interest deduction cap (share of EBITDA) | 30% | 30% | 40% | 30% | 25% | n/a |
| Loss carry-forward | 5 game years | 5 | 5 | 5 | 3 | n/a |

Thresholds are in the bloc's currency at the nominal amounts shown (thresholds are not indexed; MSI does not apply to taxes).

#### §3.12.4 Personal income tax (characters)

```
taxable_income(year) =   dividends received (non-exempt)              (4030, taxTag DIV)
                       + interest received                            (4020, INT)
                       + net rental income of directly owned property (4010 − 5020/5040/5260 property costs − mortgage interest 5090 on that property − depreciation 5120)
                       + profit of directly owned businesses          (sole proprietorship: revenue − costs − depreciation of the biz; losses offset other income of the year)
                       + royalties and licence income                 (4140)
                       + other taxable income (fees for services, revenue shares, alliance attributions)
                       − allowable deductions (interest on loans used to buy income-producing assets, 5090 tagged INVESTMENT)
not taxable: faucet income 4110 (start cash, grants, ads, quest rewards, compensation), gifts and inheritances received (taxed at the giver via P2P tax), restitution and damages received (4120), gains on debt discharge in insolvency
tax = Σ over brackets of rate × income in bracket (progressive), in the residency bloc's currency
```

Losses: a net negative taxable income carries forward (5 game years) against future taxable income.

#### §3.12.5 Capital gains tax (characters; companies include gains in corporate profit)

- Realized gain per disposal = proceeds (net of fees) − cost basis of the lots consumed (FIFO or specific identification, §2.5), in the residency currency (translated at the disposal-day rate and the acquisition-day rate respectively, so FX gains on foreign assets are part of the gain).
- Assets: securities, ETFs, fund units (on redemption or sale), crypto and tokens, DeFi positions on withdrawal, collectibles, property, businesses sold, private stakes, AI models and datasets sold or licensed as assignment, concession rights. Derivatives, perps and FX trading positions: gains always taxed at the short rate.
- **Main home exemption:** gain on a home owner-occupied for ≥ 91 game days before sale is exempt up to $10,000,000 of gain per sale (DEFAULT).
- **Lifestyle durables**: gains taxable, losses not deductible.
- Netting: gains and losses of the same year net within short and within long; a net short loss offsets net long gain and vice versa; a remaining net loss carries forward 5 game years (only against gains).

#### §3.12.6 Wash-sale rule

A loss on the disposal of an asset is disallowed if the same entity or a related party (§3.11.6) acquires the same asset within `PARAM.wash_sale_window_game_days` (DEFAULT 5) before or after the disposal; the disallowed loss is added to the basis of the replacement lot (`washSaleAdjust`). Applies to exchange-traded assets, crypto and fund units.

#### §3.12.7 Corporate income tax (companies, banks, insurers, exchanges, rating agencies, NPC companies)

```
taxable_profit = profit before tax (solo statement, §3.13)
               − unrealized fair-value gains (4070) + unrealized fair-value losses (5170)    (taxed only on realization)
               − exempt participation income (dividends and gains on shares of companies held ≥ 10% for ≥ 91 game days)
               + non-deductible items: fines and penalties (5210), bribes (OPS_BRIBE_*), lobbying donations (5240 tagged DONATION), 30% of hosting/entertainment
               + interest expense above the cap: net interest > cap% × tax-EBITDA → excess added back and carried forward indefinitely
               − loss carry-forward used (oldest first, up to the jurisdiction's limit)
tax = corporate rate × max(0, taxable_profit)
```

Deferred tax (1900/2430) records the timing difference of unrealized gains and losses at the corporate rate (`LED_TAX_PROVISION`).

**Tax groups**: companies resident in the same bloc where one holds ≥ 75% of the others (directly or through members) may elect (`acct.tax.election GROUP_FORM`) to be taxed as one: profits and losses pooled, intra-group transactions ignored. Election effective from the next game year; leaving takes effect at year end.

**Tax-planning credit** (01 §4.4 "Accounting firm reduces owner's tax by up to 5%"): an entity that owns, or has a service contract with, an Accounting-firm business (09) receives a credit = `min(5%, 1% × firm tier above T1 + 2%)` of its computed income tax (corporate or personal). DEFAULT.

#### §3.12.8 Property tax

Daily accrual `rate / 364 × appraised value at the start of the month` (`LED_ACCRUAL`), paid at month end (`TAX_PROPERTY`). Owner-occupied homes pay it (01 §13). Isla Serena islands pay the Serena rate (collected by the FDL treasury on behalf of the free-zone authority, DEFAULT).

#### §3.12.9 VAT

- Applies only to **final consumption**: business sales to households (`BIZ_SALES_HH`: the posted price includes VAT; the business accrues `price × v/(1+v)` in 2410 and remits at month end with `TAX_VAT_REMIT`) and lifestyle purchases by characters (`LIFE_PURCHASE`: price shown includes VAT; the VAT part goes to the purchaser's residency treasury at purchase, and the rest is the sink). The lifestyle price shown is `catalog price × L2 × (1 + v)`.
- B2B, B2G and exports: no VAT (DEFAULT simplification: no input-credit bookkeeping).

#### §3.12.10 Transaction taxes

| Tax | Base | Payer | Rate | When |
|---|---|---|---|---|
| Securities transaction tax (`TAX_SECURITIES_TX`) | buyer notional of equities and ETFs listed in the bloc | buyer | §3.12.3 | at the fill (part of the trade entry) |
| Stamp duty (`TAX_STAMP_DUTY`) | property purchase price | buyer | §3.12.3 | at completion |
| P2P transfer tax (`TAX_P2P_TRANSFER`) | value of `SOC_P2P_TRANSFER`, `LIFE_GIFT_P2P`, `BIZ_SALE_P2P`, `PROP_SALE_P2P`, `LIFE_PURCHASE_P2P`, P2P collectible sales outside the auction house, `SOC_REVENUE_SHARE` where the recipient is a related party | payer/buyer | 2% (01 §9), to the payer's residency treasury | at settlement |

Not subject to P2P tax: exchange trades, auction-house sales (which pay auction fees), P2P loan principal and repayments, escrow placements and releases, court-ordered payments, contract registration.

#### §3.12.11 Withholding, treaties and controlled foreign companies

- **Withholding** on cross-border dividends, interest and royalties paid by a resident of jurisdiction A to a resident of B ≠ A: withheld by the payer at source (`TAX_WITHHOLDING`, to A's treasury) at the treaty rate; the recipient's residence gives a foreign tax credit up to its own tax on that income (excess is lost, 6020).
- **Treaty matrix** (DEFAULT): every pair of blocs: dividends 10%, interest 0%, royalties 5%, **except** SRL–NKR (no treaty): 25% / 15% / 15%. Payments **to** Serena companies from any bloc: 30% / 30% / 30%. Payments **from** Serena companies: 0%.
- **CFC rule**: if a character or company resident in bloc A controls (§3.11.2) a company resident where the effective tax on its passive income is < 50% of A's corporate rate (always true for Serena), the company's **passive income** (interest, dividends, royalties, rents, trading and capital gains, intra-group service fees) is attributed each year to the controlling resident and taxed at A's rates, with credit for taxes the company paid. **Active business income** (operating businesses, properties operated with staff) is not attributed.
- **Serena substance test**: a Serena company is treated as having active income (not attributed) only if in the tax year it paid at least `PARAM.serena_substance_opex` (DEFAULT $2,000,000) of operating costs in Isla Serena (to the Serena city's hh/frm sectors) and holds or leases a property on Isla Serena (10). A Serena company failing the test while claiming active status is an audit finding (§3.12.14).

#### §3.12.12 Transfer pricing

For tax, every related-party transaction (§3.11.6) is valued at the engine's arm's-length price: if the transaction price lies outside ±10% of fair value, the assessment automatically uses the nearest band edge (the 10% band is the legal planning margin). Because the engine knows fair value, no transfer-pricing evasion is possible; aggressive pricing inside the band is lawful planning. The adjustment is shown in the Tax Center line by line.

#### §3.12.13 Exit tax

On a character's change of residency: deemed disposal of every asset at its mark; if the total unrealized gain exceeds $1,000,000, the excess is taxed at the departing bloc's long-term CGT rate (`TAX_EXIT`). Payable at once or, by election, in 4 equal quarterly installments with late interest. Lot bases are stepped up to the marks.

#### §3.12.14 Assessment, payment, late payment and audits

| Step | When | Rule |
|---|---|---|
| Running estimate | every day close | Tax Center shows year-to-date liability per tax type (estimates are state) |
| Quarterly installment | quarter end | `installment = max(0, YTD estimated liability × (q/4) − paid so far)` for personal income, CGT and corporate; payable within 7 game days (`TAX_*`) |
| Annual assessment | year end | final liability; balance due within 7 game days; overpayment refunded (`TAX_REFUND`) |
| Monthly taxes | month end | property tax, VAT remittance |
| At source | each payment | withholding, securities tax, stamp duty, P2P tax |
| Late payment | after the due tick | `TAX_LATE_INTEREST` accrues daily at the bloc policy rate + 3% (annual, Act/364); after 28 game days unpaid, the treasury files a garnishment (13) |

**Audits** (Revenue Office, 13 owns the case process; 03 computes the findings):
- Personal audit odds per game quarter (03-conflict §10.3, kept): `p = 0.02 × (1 + min(3, lifestyle_spend / declared_income)) × (1 + 0.5 × tips)` where `declared_income` = taxable income + realized gains of the trailing 4 game quarters (floor $10,000).
- Corporate audit odds per game year: `p = min(0.30, 0.03 × (1 + 2 × serena_share + related_party_share + 3 × illicit_flag))`, where `serena_share` = share of the group's assets in Serena companies, `related_party_share` = share of revenue from related parties, `illicit_flag` = 1 if any illicit reason code touched the group in the year.
- Selection: Bernoulli draw from stream `ledger.audit_sample:<bloc>` at quarter end (02 §3.10.4).
- Findings (deterministic from the ledger): (a) **unexplained wealth**: inflows tagged with illicit reason codes (`OPS_LOOT_CASH`, `OPS_RANSOM`, `OPS_FENCE_SALE_NPC`, `OPS_BRIBE_*`, `SOC_EMBEZZLEMENT`) → evidence for 13 (20–40 points on every open triple involving those funds, 03-conflict §10.3) plus tax on the amount at the top personal rate + 20% penalty (`TAX_AUDIT_ASSESSMENT`, `TAX_PENALTY`); (b) **false substance claim** of a Serena company → CFC reassessment for every year claimed + 20% penalty; (c) nothing else, because every other tax is computed exactly by the engine. A clean audit costs nothing and gives +2 Reputation (14).

### §3.13 Financial statements (every entity)

#### §3.13.1 Generation

- Every entity's books are always complete, so statements are a projection of account balances and postings; nothing is entered by hand.
- Running totals per account and per (account, period) are maintained incrementally in P13; statements are materialized at period close in P14 (as derived records, 19) and on demand (FLASH) from the running totals.
- Solo statements for every entity; consolidated statements (§3.11.5) for every group parent and for every character (the character's consolidated view of everything it controls).

#### §3.13.2 Income statement lines (mapping from accounts)

| Line | Accounts |
|---|---|
| Revenue | 4000, 4010, 4040, 4050, 4140 |
| Cost of sales | 5000 |
| **Gross profit** | |
| Operating expenses | 5010, 5020, 5030, 5040, 5050, 5060, 5070, 5080, 5100, 5110, 5230, 5240, 5250, 5260, 5270, 5280 |
| **EBITDA** | |
| Depreciation and amortization | 5120, 5130 |
| **Operating profit (EBIT)** | |
| Net interest | 4020 − 5090 |
| Investment result | 4030, 4060 − 5160, 4070 − 5170, 4150, FX (4080 − 5180 + translated 3800 movement) |
| Other items | 4090 − 5190, 4100, 4110, 4120, 4130, 4190, − 5140, − 5150, − 5200, − 5210, − 5220 |
| **Profit before tax** | |
| Income tax | 6000, 6010, 6020 |
| **Net income** | attributable to owners / to NCI (consolidated) |

Characters' statements are titled "Personal statement" and show lifestyle consumption (5200) as its own line.

#### §3.13.3 Balance sheet

Current assets (1001–1230 except long-dated items, loans < 364 game days, marketable securities) · non-current assets (other loans, 1570–1880, 1900) · current liabilities (2001–2160, 2400–2590, loans due < 364 game days) · non-current liabilities · equity (3100–3990, NCI separately). Banks and insurers use the liquidity-order presentation (07/08 specify).

#### §3.13.4 Cash flow statement (direct method)

Every posting on a money account (1001, 1002, 1003, 1010; 1050 cash margin is shown as "cash pledged" under financing) is classified by its reason code's `cf` (OP, INV, FIN). The statement lists inflows and outflows per reason code family under the three headings and reconciles to the change in money accounts. `NC` codes do not appear (non-cash).

#### §3.13.5 KPIs

Gross, EBITDA and net margin; ROE, ROA; debt/equity; net debt/EBITDA; interest cover (EBIT / net interest); current ratio; free cash flow (OP − capex in INV). Banks: capital ratio and liquidity coverage (07 computes), net interest margin, cost/income. Insurers: loss, expense and combined ratios, solvency ratio (08). Funds: NAV per unit, returns, drawdown, gross/net leverage (08). Characters: savings rate, lifestyle share of income, NW and NWI change.

#### §3.13.6 Cadence, visibility and publication

| Period | Who | Visibility |
|---|---|---|
| FLASH (any tick) | any entity, on request | owner only |
| DAY | every entity (kept 28 game days) | owner only |
| MONTH | every entity | owner; chartered institutions file with their regulator (private to the regulator) |
| QUARTER | every entity | owner; **listed** companies, banks, insurers, exchanges and public funds publish (15 filings, on their earnings date set by 09); NPC listed companies publish |
| YEAR | every entity; audited for listed companies and chartered institutions (audit fee `CMP_AUDIT_FEE_NPC` or `_B2B`) | as QUARTER |
| CHAPTER | characters and groups | owner; feeds Legacy (14) |

Characters' statements are never public (L11). Published statements are engine-generated and therefore true; misleading **commentary** (guidance, press releases written by players) is a disclosure offence handled by 15/13.

### §3.14 Insolvency and bankruptcy accounting

#### §3.14.1 Detection (day close, every core entity)

1. **Payment default**: any scheduled obligation (loan instalment, coupon, tax, wages, rent, contract payment, VM call, judgment) not paid at its due tick enters a grace of 720 ticks (1 game day); unpaid at grace end → `ledger.default` event, creditor remedies (07/15/13) and `INSOLVENCY_REVIEW`.
2. **Balance-sheet test**: marked solo equity < 0 at day close → `INSOLVENCY_REVIEW`. A company under review for 5 consecutive game days without curing (recapitalization, debt waiver) and with any creditor unpaid after grace → case opened automatically (`trigger = BALANCE_SHEET`). Characters: § 3.14.5.
3. **Voluntary filing** (`acct.insolvency.file`), **creditor petition** (13 filing by a creditor with an unpaid admitted claim ≥ $10,000), **regulator** action for chartered institutions (07 resolution triggers).
4. Treasuries and central banks are exempt (§3.14.6). Funds cannot have negative unit-holder equity: losses beyond fund capital fall on the fund's lenders (§3.14.7).

V3 Part 8 invariant "no negative equity without a recorded event" is implemented by step 2: negative equity always comes with an `INSOLVENCY_REVIEW` status and event at the same day close (I19).

#### §3.14.2 Procedures

| Procedure | Owner of the decisions | Ledger role (03) |
|---|---|---|
| LIQUIDATION | 09 (companies), 10 (property sales), 06 (auction of holdings) | claims register, estate account, APR distribution, discharge |
| RESTRUCTURING (plan with creditor classes voting, cram-down respecting absolute priority, debt-for-equity swaps) | 09 | claims register, plan execution postings, `CMP_DEBT_EQUITY_SWAP` |
| BANK_RESOLUTION (bail-in, sale or merger, bridge bank, deposit-insurance payout) | 07 | `BNK_BAILIN_CONVERSION`, `BNK_DEPOSIT_INSURANCE_PAYOUT`, transfer of books |
| PERSONAL (characters) | 03 (this file) with 13 for persistent claims | §3.14.5 |

A bankrupt company is a market (V3 Part 3.7): its bonds keep trading (06); admitted claims can be sold (`INSOLV_CLAIM_TRADE`); shares trade until cancelled.

#### §3.14.3 Claims register and absolute-priority waterfall

```
on case open: freeze the debtor (no new liabilities, no payments except by the estate);
  claims = all liabilities at face + accrued interest to the opening tick; contingent claims admitted when crystallized;
  rank each claim:
    SECURED            (to the extent of collateral value; deficiency becomes SENIOR_UNSECURED)
    ADMIN              (court fees, estate costs, post-petition wages)
    TAX                (taxes due)
    WAGES              (unpaid wages, capped at 28 game days)
    DEPOSITS_INSURED   (banks only: covered by deposit insurance, which then subrogates)
    SENIOR_UNSECURED   (bonds, loans, trade payables, uninsured deposits, judgments)
    SUBORDINATED       (subordinated bonds, shareholder loans)
    PREFERRED_EQUITY, COMMON_EQUITY
distribution (each time the estate realizes cash, at day close):
  1. secured creditors: proceeds of their own collateral, up to their claim; excess to the estate
  2. estate cash by rank in the order above; inside a rank pro rata with allocate() (02 §3.9.3)
  3. a rank is paid in full before any lower rank receives anything (absolute priority)
at case close: every unpaid admitted claim is discharged with INSOLV_DEBT_DISCHARGE
  (creditor: loss through the allowance or 5190; debtor: gain 4130, tax-exempt)
  except persistent claims (§3.14.5), which survive
```

#### §3.14.4 Postings of a case

Asset sales by the estate use normal codes (`MKT_TRADE`, `PROP_SALE_*`, `BIZ_SALE_*`) with the estate as seller; distributions use `INSOLV_DISTRIBUTION`; equity cancellation uses `MOVE_QTY` to the issuer (shares cancelled) with `LED_DISSOLUTION` at the end.

#### §3.14.5 Personal insolvency and the fresh start (L13 "bankruptcy comeback")

1. **Trigger**: a character cannot meet a due obligation after the grace and its available money is exhausted, or its marked NW < 0 at day close.
2. **Protected floor** for debts arising from crime or court (fines, restitution, judgments): the character always keeps $5,000 of liquid money plus one T1 business (03-conflict §13.5); anything beyond becomes garnishment. This floor does not protect against trading or borrowing losses.
3. **Liquidation**: all non-protected assets are sold by the estate (exchange assets at market through normal orders with fair-value bands, 05; property and businesses through estate sales, 09/10; collectibles through the auction house).
4. **Discharge**: remaining unsecured claims are discharged, **except persistent claims**: Clearing House deficits (01 §9 "debt to clearing house persists"), restitution owed to victims, fines, taxes. These move to `2990 Persistent claims` and are collected by garnishing `PARAM.comeback_garnish_rate` (DEFAULT 25%) of every future income inflow (business sweeps, dividends, interest, rent, realized trading gains) until paid, with no interest.
5. **Fresh start** (01 §8.3; at most once per rolling `PARAM.fresh_start_cooldown_real_days = 56` real days, one chapter length, owned by 14 §3.13.5; ruling in 24): if after discharge the character's money is below $5,000, `ACCT_FRESH_START` tops it up to $5,000 as restricted cash (§3.5.6). Reputation hit and the comeback perk are 14's; the record is permanent (Legacy, 14). Licences are not suspended (14 §3.13 keeps rank, titles and licences); the credit and leverage blocks of 14 §3.13.5 apply instead (ruling in 24).
6. A second insolvency inside the 56-real-day cooldown gets no top-up.

#### §3.14.6 Sovereigns and central banks

Treasuries may run negative equity indefinitely; sovereign distress is handled by 04 (downgrades, restructuring via `SOV_RESTRUCTURING_EXCHANGE`). Central banks may run negative equity; 04 decides recapitalization.

#### §3.14.7 Funds and SPVs

A fund's unit holders cannot lose more than their units. If a fund's liabilities exceed its assets, the fund is liquidated; lenders (prime brokers, repo counterparties) take the shortfall as creditors. SPV losses are allocated bottom-up to tranches (`SPV_LOSS_ALLOCATION`, 08); an SPV never enters insolvency while its waterfall can allocate losses.

### §3.15 Period close procedure

At the end hook of each period (02 §3.4), in this order: (1) accruals of the day; (2) mark-to-market; (3) ECL provisions; (4) appraisals due; (5) depreciation and amortization; (6) tax provisions; (7) for MONTH: property tax and VAT remittance due; (8) for QUARTER: tax installments due, published statements queued; (9) for YEAR: annual tax assessment, loss carry-forwards rolled, `LED_PERIOD_CLOSE` moving every 4xxx/5xxx/6xxx balance into 3200 (3900 for characters and alliances), group tax elections take effect; (10) statements materialized in P14. All postings of steps (1)–(9) commit in P13 of the closing tick.

### §3.16 Invariants asserted every tick (P13)

"L" = checked by each partition locally in R4; "G" = checked by COORD in R5 (02 §3.15.1). Any failure aborts the tick into safe mode (02 §3.15.3).

| ID | Invariant | Scope |
|---|---|---|
| I0 | no uncaught error, no NaN/Infinity written to state (02 §3.7.2) | L |
| I1 | every posting is well formed: amount > 0, registered reason code, template allowed for the code's class, accounts exist, same currency, quantities on matching assets | L |
| I2 | every entry balances per entity per currency (Σ debits = Σ credits for each entity it touches, including 3800 accounts) | L |
| I3 | global trial balance: for each currency, the sum of all account balances of all entities is 0 | G |
| I4 | money identities of §3.5.3 hold exactly (ΔM0_sys = FAUCET − SINK; ΔM0_cb per CBK codes; ΔM2 reconciliation) | G |
| I5 | `cbk:2001 + 2002 + 2003` equals the sum of all holders' 1001 + 1002 + 1003 balances, per currency | G |
| I6 | for each bank, `Σ 2100` = Σ of holders' 1010 balances at that bank | G |
| I7 | every bilateral instrument (loan, repo, deposit, P2P loan, intercompany balance, derivative) has equal and opposite balances on both sides | G |
| I8 | quantity conservation: for every asset, Σ qty held across all entities (incl. elastic sectors and issuers' treasury) equals outstanding supply (shares outstanding, bond face, token supply, units issued; 1 for each property, business, item); for every derivative series, Σ long = Σ short | G |
| I9 | short positions exist only with a matching securities-borrow record (07) or as derivative positions | L |
| I10 | no settlement cash or deposit balance below 0 (overdrafts are loans, `BNK_OVERDRAFT_DRAW`); bank reserves ≥ −intraday credit limit; at day close reserves ≥ 0 after facility conversion | L |
| I11 | Σ active holds on an account ≤ its committed balance; every expired hold released | L |
| I12 | no collateral lot pledged more than once (Σ encumbrances ≤ qty) | L |
| I13 | interpartition suspense nets to zero for every partition pair and currency | G |
| I14 | Σ escrow held by the CCP (2160) = Σ escrow deposited (1070) = Σ open contract escrow obligations (15) | G |
| I15 | suspense accounts 1999 and 2999 are zero; for every entity, `Σ assets − Σ liabilities = −Σ (equity + income + expense)` | L |
| I16 | all amounts are bigint integers; no money computed from floats except through `toMoney` (enforced statically, spot-checked by tagging) | L |
| I17 | `sys:3990` equals cumulative net FAUCET − SINK since genesis, and `sys:2900` = Σ cbk 1910, per currency | G |
| I18 | today's flow totals by class equal the sum of the day's postings by class (the money report cannot drift from the ledger) | G (day close) |
| I19 | every core entity with marked equity < 0 at day close has status INSOLVENCY_REVIEW or IN_INSOLVENCY (except gov, cbk) | L (day close) |
| I20 | ownership consistency: every entity has one root owner; control is unique; perimeter matches the root; voting shares sum to shares outstanding | G (when ownership changed) |
| I21 | restricted cash is never debited by a forbidden purpose (§3.5.6) | L |
| I22 | tax accounts: Σ liabilities − paid − withheld = 2400/2410/2420 balances per (entity, jurisdiction) | L (day close) |

Cost control: all checks are incremental over the entries of the tick (touched accounts only), except I8 and I20 which are maintained as running sums per asset and per issuer updated by every quantity posting.

---

## §4 Player intents

All intents follow the 00 §5.5 envelope; namespaces `acct.*` (ledger and tax). Validation failures return `core.intent.rejected` with the codes listed.

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `acct.payment.setAccounts` | `{ entityId, payFrom: '1001' | {bank: bnkId}, receiveInto: same }` | actor controls entity; bank exists and has an account for the entity (07) | changes default rail accounts from the next tick |
| `acct.tax.changeResidency` | `{ toBloc }` | character only; owns or leases a home in `toBloc` (10); last change ≥ 91 game days ago; not Held, not IN_INSOLVENCY; `toBloc != 'SERENA'` (`REJECT_NO_HOME`, `REJECT_COOLDOWN`, `REJECT_SERENA_PERSON`) | computes exit tax (§3.12.13), posts it (or schedules installments), changes residency from the next tick |
| `acct.tax.election` | `{ type: 'GROUP_FORM' | 'GROUP_LEAVE' | 'EXIT_TAX_INSTALLMENTS' | 'LOT_METHOD', params }` | eligibility per §3.12; lot method SPECIFIC requires LIC2 | recorded; effective per rule |
| `acct.tax.payEarly` | `{ entityId, jurisdiction, taxType, amount }` | amount ≤ outstanding estimate; available money | `TAX_*` posting now (avoids late interest) |
| `acct.tax.dispute` | `{ assessmentId, groundsKey }` | assessment exists and is ≤ 28 game days old | opens a tax-tribunal case (13); payment suspended only if 13 grants it |
| `acct.statement.request` | `{ entityId, period, scope }` | actor controls entity (or entity is listed and period published) | returns FLASH or stored statement (read-only, no rate-limit cost beyond the API quota) |
| `acct.ledger.export` | `{ entityId, fromTick, toTick }` | actor controls entity; range ≤ 1 game year | CSV/JSON export of postings (read-only, 19) |
| `acct.insolvency.file` | `{ entityId, procedure: 'LIQUIDATION' | 'RESTRUCTURING' | 'PERSONAL' }` | actor controls entity; entity not already in a case | opens case (§3.14) |
| `acct.insolvency.claim.sell` | `{ claimId, buyerId, price }` | claim admitted and owned by actor; buyer accepts through 15's contract flow | `INSOLV_CLAIM_TRADE` |
| `acct.lots.select` | `{ saleIntentId, lotIds[] }` | LIC2+; lots exist and cover the qty | sale consumes those lots |

Intents of other modules that move money (orders, purchases, contracts) are validated against `ledger.available(...)` and place holds (02 §3.14.3); their postings are generated by templates of this file.

---

## §5 Engine events

| Kind | Visibility | When | Payload |
|---|---|---|---|
| `ledger.entry.committed` | PARTIES (each side sees its own postings) | P13 | `{ entryId, reason, amount, ccy, counterpartyLabel }` (counterparty identity per the owning module's visibility rules, L11) |
| `ledger.statement.ready` | PRIVATE (owner) / PUBLIC (published statements) | period close | `{ entityId, period, scope }` |
| `ledger.tax.estimate` | PRIVATE | day close | `{ entityId, ytdByType }` |
| `ledger.tax.due` / `ledger.tax.paid` / `ledger.tax.late` | PRIVATE | per §3.12.14 | `{ taxAccountId, amount, dueTick }` |
| `ledger.tax.audit.selected` | PRIVATE (taxpayer) + SEALED (findings until 13 discloses) | quarter end | `{ entityId, scope }` |
| `ledger.default` | PARTIES | grace end | `{ debtorId, obligationRef, amount }` |
| `ledger.insolvency.review` | PRIVATE + regulator | day close | `{ entityId, equity }` |
| `ledger.insolvency.opened` / `.distribution` / `.closed` | PUBLIC for companies and institutions; PRIVATE for characters | case events | `{ caseId, debtorId, procedure, recoveriesByRank }` |
| `ledger.freshStart` | PRIVATE (+ public Legacy record per 14) | top-up | `{ chrId, amount }` |
| `ledger.related_party.flag` | PRIVATE + regulator; disclosed in next filing | P13 | `{ entryId, deviationPct }` |
| `stab.daily.report` | PUBLIC | day close | §3.7.7 contents |
| `stab.lever.changed` | PUBLIC | when a lever moves | `{ lever, from, to }` |
| `stab.alert` | internal (ops) | §3.7.6 | |
| `msi.updated` | PUBLIC | day close | `{ msi, raw }` |
| `ledger.invariant.failed` | SEALED + ops | P13 abort | `{ invariantId, entryId?, entityId?, module }` |

---

## §6 NPC behaviour

1. NPC core entities use the same accounts, templates, taxes and insolvency rules as players. NPC companies' operations are modelled in aggregate (05/09 fundamentals) and posted hourly as `CMP_NPC_REVENUE` (FAUCET) and `CMP_NPC_COSTS` (SINK) plus their taxes, interest and dividends as normal codes, so their statements are real and drive their share prices through 05's fundamental value.
2. NPC banks lend to core and elastic borrowers per 07's credit cycle; NPC funds rebalance per 08; NPC liquidity providers are rebalanced at day close against `row` (`LP_REFILL_FROM_ROW`, `LP_SWEEP_TO_ROW`, `LP_INVENTORY_*`) to target cash and inventory levels set by 05, which is how "the NPC side of player trades" (01 §8.1) is accounted for.
3. Elastic sectors never decide anything in the ledger: their flows are outputs of 04/09/10 models; the ledger books them.
4. Named NPC actors (16) have personal balance sheets; their decisions must respect them (V3 W04): 16 checks `ledger.available` like any actor.
5. NPC entities can be audited, can default and can go bankrupt; their failures generate news (16) from ledger events.

---

## §7 Screens

(Layouts in 17.)

| Screen | Shows |
|---|---|
| **Books** (per entity; character's default view is consolidated) | income statement, balance sheet, cash flow, equity changes, KPIs; period selector (flash, day, month, quarter, year, chapter); solo/consolidated toggle; drill-down from any line to the postings (Ledger explorer) |
| **Ledger explorer** | postings filtered by account, reason code, counterparty label, period; each posting links to its cause (intent, event, contract, case) and tick citation (`T…`) |
| **Group structure** | ownership tree with control and effective ownership, NCI, perimeter, cycles warning, look-through NAV per node |
| **Net worth panel** | NW (nominal), NWrank (with haircut breakdown: concentration, control cap, stale), NWI and MSI, rank threshold progress (14) |
| **Tax Center** | residency, YTD estimate per tax type, installments due, withholding and credits, CFC attributions, transfer-pricing adjustments, loss carry-forwards, elections, audit status, residency planner (simulate a move: exit tax and future rates) |
| **Money Supply Report** (public, diegetic "Stabilizer Board") | §3.7.7 daily and chapter contents, lever history charts, faucet/sink families, ρ, M0/M2 per currency, MSI |
| **Insolvency** | case view: claims by rank, estate realizations, distributions, claim trading; for characters the fresh-start explanation and persistent claims with garnishment progress |
| **Restricted cash badge** | on balances: restricted amount, release time, what it can and cannot pay for |

---

## §8 Edge cases

1. **Payment rail with insufficient default account but funds elsewhere**: rail order §3.3.4; holds were placed on the actual source in P1.
2. **Bank fails while a player's payment from its deposit is in flight**: the bank's status changes at day close (07); payments already held in P1 of tick N settle in N; from N+1 deposits are frozen until resolution (07) and holds on them are rejected.
3. **FX translation of a character's books when a currency crashes**: NWrank falls immediately with the intraday FX mark; tax bases use the acquisition-day rates.
4. **A dividend split among 1,000,001 holders**: `allocate` guarantees exact totals; holders with zero rounding receive nothing; the issuer pays exactly the declared total.
5. **Stock split during an open order**: 05 adjusts orders; ledger posts `EQ_SPLIT` changing qty, lots split proportionally (basis per share divided).
6. **Wash sale across a character and its own company**: related parties, rule applies.
7. **Ownership cycle attempt** (A buys 60% of B while B owns 70% of A): product 0.42 < 0.95, allowed; look-through converges. A attempt to reach 100%/100% is rejected by 09 using `cycle_max_product`.
8. **A biz whose owner cannot fund its cash shortfall**: biz accrues payables; if unpaid past grace it enters review; a biz itself cannot enter insolvency separately (it is part of its owner): its default is the owner's default.
9. **Elastic sector 1009 very negative**: allowed by design; 04 monitors sector budgets; no invariant on 1009.
10. **Tax due while assets are frozen by a court**: tax accrues; late interest suspended while a court freeze blocks payment (13 provides the freeze flag).
11. **Year end inside a halt**: the year ends at its game-day boundary after resume (02 §3.19.4).
12. **Restricted cash and a fresh start in the same tick as a fine**: fines cannot be paid from restricted cash; they become payable (and garnishable later).
13. **Character changes residency mid-year**: income before the change taxed by the old bloc, after by the new one; brackets prorated by days of residency.
14. **NWrank of a character who controls a listed company with no trades for 5 game days**: mark falls back to fundamental value, STALE haircut, control cap still applies.
15. **Escrow held for a contract when the depositor goes bankrupt**: escrow remains with the CCP; contract terms decide release (15); the estate's claim on the escrow is subject to the contract.
16. **Central-bank QE buying bonds from a player fund**: `CBK_ASSET_PURCHASE` with the fund receiving settlement cash; M0_cb rises; PEM rises (the fund is in P) while M0_sys is unchanged.
17. **Rounding of percentage fees on tiny trades**: `mulRate` half-even; a fee may round to 0 on a $0.10 trade; minimum fees are 05's decision.
18. **Negative interest rates** (04 may set them): accrual codes handle negative amounts by swapping debit and credit (amounts are always positive in postings).

---

## §9 Exploits and counters

| Exploit | Counter |
|---|---|
| Duplicating NW through holding structures (sell assets to own company at inflated price, circular holdings) | marks never come from related-party prices (§3.9.1); look-through NAV (§3.11.4); intercompany profit reserve in consolidation; cycle limit |
| Pumping own listed company to climb the board | concentration haircut and control cap (§3.10.3); thin-print guard; surveillance (05/13) |
| Ramping a thin market at the hourly board snapshot | thin-print guard (§3.9.1) weights marks by volume; board NW uses the hour's mark history, not one print |
| Alt-account funnelling via off-market P2P sales | P2P tax 2%, related-party flags, 15's caps and linked-account detection, marks unaffected |
| Transfer-pricing profits into Serena | engine applies arm's-length prices for tax (§3.12.12); CFC rules; substance test; audit odds rise with Serena share |
| Becoming a Serena tax exile | characters cannot be Serena residents (§3.12.2) |
| Harvesting losses and rebuying immediately | wash-sale rule including related parties (§3.12.6) |
| Exit before tax bill (change residency) | exit tax with step-up (§3.12.13) |
| Spending down before a fine | fines are % of NW at the higher of offense and verdict ticks (03-conflict §1); protected floor only for crime/court debts |
| Going bankrupt to escape the Clearing House or victims | persistent claims survive discharge and are garnished (§3.14.5) |
| Repeated fresh starts | once per 56 real days, restricted cash, reputation hit, 1× leverage and credit blocks (14 §3.13.5) |
| Using ad or fresh-start cash to fund ops | restricted cash (§3.5.6, I21) |
| Printing money via a player bank | bank lending creates deposits and an equal loan asset (no NW created); capital and liquidity rules (07); loans to alts are related-party and 15-flagged; defaults hit the bank's own equity |
| Exploiting the Stabilizer (e.g. hoarding cash to trigger loosening) | input is median wealth ratio of engaged players, robust to a few actors; levers act world-wide, never per player; deadband, step limits and ranges |
| Gaming tax timing at year end | installments based on YTD; deemed rules (exit tax); unrealized gains taxed only on realization for everyone equally |
| Hiding illicit inflows | reason codes are set by the engine from the actual mechanism, never by the player; Revenue Office audits read them |
| Reading other players' finances | statements private (L11); published only for listed/chartered entities; ledger events visible to parties only |
| Bug that creates money | I3/I4/I17 abort the tick; compensating entries via `ADM_CORRECTION_*` with two approvals; replay finds beneficiaries |

---

## §10 Acceptance tests

1. Every reason code in §3.4 has exactly one class and its allowed templates match that class; CI fails on a code used by a module that is not in the catalog or used with a template of another class.
2. A `MINT` of $5,000 to a new character increases `M0_sys[FDL]`, `M0[FDL]`, `M2[FDL]` and `PEM[FDL]` by exactly 5,000,000,000 micro and `sys:3990` by the same; the three entities touched (character, central bank, sys) each balance (I2).
3. An `ELASTIC_IN` household purchase of $100 from a player business produces four postings, keeps every entity balanced, raises `M0_sys` by $100 and lowers `hh:1009` by $100.
4. A `PAY` of $50 from a player to an NPC company (both on settlement cash) changes no aggregate except PEM (−$50) and leaves `M0` unchanged.
5. A bank loan of $1M (`BNK_LOAN_DRAWDOWN`) to a player raises M2 by $1M, leaves M0 and M0_sys unchanged, and leaves the player's and the bank's NW unchanged.
6. Repayment of that loan (`BNK_LOAN_REPAY`) restores M2; interest paid from the borrower's deposit at the lending bank lowers M2 and appears in the "bank own-account flows" line; I4 holds.
7. A central-bank QE purchase of $10M of bonds from a player fund raises `M0_cb` by $10M, leaves `M0_sys` unchanged, and the Stabilizer's inputs are unaffected by the class itself.
8. Cross-currency payment via `FX` keeps each entity balanced per currency through 3800; the translated sum of 3800 at the trade rate is 0; after a 10% move of the FX mark the entity's FX result equals 10% of the foreign leg.
9. The payment rail for deposit-to-deposit across two banks moves reserves between the banks and keeps I5 and I6 true.
10. A bank whose reserves are negative at day close receives an automatic `CBK_STANDING_FACILITY` loan making reserves ≥ 0 (I10).
11. A dividend of $1,000,000.000001 to 3 equal holders is allocated so the parts sum exactly to the total and the extra micro-unit goes to the lowest holder id.
12. Day-close MTM sets the book value of every marketable position to qty × close mark; the day's unrealized P&L equals the sum of `LED_MTM_DAILY` postings.
13. A single 1-share print at +50% on a stock with ADV20 = 1,000,000 shares moves the mark by less than 0.1% (thin-print guard).
14. A character holding 30% of a stock whose ADV20 is 1% of shares outstanding with σ_daily = 2% gets a board haircut of `min(0.5, 0.5·0.02·sqrt(30)) ≈ 5.5%`.
15. A character who controls a listed company trading at 5× its look-through NAV is counted on the board at 2× NAV × effective ownership.
16. Selling a property from a character to its own 100% company at 150% of fair value changes neither the character's NWrank nor the property's mark; the related-party flag fires; the tax assessment uses the band edge (110%).
17. Look-through NAV with A owning 60% of B and B owning 30% of A converges within 64 sweeps to the analytic solution within 1e-9 relative, and the group's NAV equals external net assets attributable (no duplication).
18. An acquisition creating a cycle with product ≥ 0.95 is rejected `REJECT_CIRCULAR_OWNERSHIP`.
19. Consolidated statements of a parent with a 75% subsidiary show NCI of 25% of the subsidiary's net assets and eliminate all intercompany balances and revenue; group profit on an asset sold within the group is deferred until sold outside.
20. Personal income tax for an FDL resident with $2,000,000 taxable income equals 0 on the first $40,000 + 12% on $960,000 + 20% on $1,000,000 = $315,200.
21. A capital gain on a stock held 100 game days is taxed at the long rate; held 50 game days at the short rate.
22. Selling a stock at a loss and buying it back 3 game days later disallows the loss and adds it to the new lot's basis; buying it back 6 game days later does not.
23. A Serena company controlled by an FDL resident with $10M interest income and no substance has the $10M attributed to the resident and taxed at FDL rates with credit for taxes paid; with substance ($2M Serena opex + a Serena property) and active business income, nothing is attributed.
24. A dividend from an EUN company to an FDL resident is withheld at 10%; to a Serena company at 30%; between SRL and NKR at 25%.
25. A character cannot change residency to Serena, nor to a bloc without a home, nor twice within 91 game days.
26. Exit tax on leaving FDL with $5M unrealized gains equals 10% × $4M = $400,000, and lot bases are stepped up.
27. An unpaid quarterly installment accrues late interest daily at policy rate + 3% and triggers a garnishment filing at 28 game days.
28. An audit of a character with `OPS_RANSOM` inflows produces an unexplained-wealth finding, tax at the top rate + 20% penalty, and an evidence event for 13; an audit of a clean character produces no finding.
29. A company with marked equity < 0 at day close is in INSOLVENCY_REVIEW in the same commit (I19); after 5 game days uncured with an unpaid creditor, a case opens automatically.
30. A liquidation with total realizations of $100 (of which $20 from the secured creditor's collateral) and claims SECURED $30 (collateral realized $20), TAX $10, SENIOR $100, COMMON equity distributes: secured $20 from collateral (deficiency $10 → senior), tax $10, senior $70 shared pro rata over $110 of senior claims, equity $0; unpaid claims discharged except persistent ones.
31. A character's personal insolvency keeps Clearing House deficits, restitution, fines and taxes as persistent claims, garnishes 25% of later income, and grants a fresh start top-up to $5,000 at most once per 56 real days (14 §3.13.5), as restricted cash that cannot fund ops, margin or P2P for 51,840 ticks.
32. A rewarded-ad credit cannot pay an op cost (`REJECT_RESTRICTED_FUNDS`) but can buy a T1 business.
33. The Stabilizer in OBSERVE mode publishes `e` and lever targets but levers stay neutral; in ACTIVE mode with `e = +0.25` for 10 game days, L1 decreases by exactly 0.005 per day until its target, and no lever ever moves more than its daily step or leaves its range.
34. The Stabilizer never changes taxes, market prices, interest rates, compute spot price, start cash or ad values (static check of its outputs).
35. MSI stays 1.000 for the first 168 game days; afterwards it changes by at most 0.5% per game day; NWI = NWrank / MSI on every board row.
36. I3 (global trial balance) holds after every tick of a 20-chapter harness run with the adversarial bot swarm (20).
37. I8 quantity conservation holds for every asset after every tick of the same run, including elastic-sector holdings and cancelled shares.
38. Corrupting one posting amount in a test tick aborts the tick with I2 or I3 and nothing of that tick is visible after safe mode.
39. The money report's daily totals by class equal the ledger's sums (I18) for every day of a 2-chapter run.
40. Statements for every entity reconcile: Δmoney accounts = cash flow statement total; balance sheet balances; net income = Δretained earnings + dividends at year end.
41. A character's statements are never returned to another player by any API (L11), while a listed company's quarterly statements are public on its earnings date.
42. Faucet/sink family shares of a 1,000-player simulated population over one game year fall inside the §3.6 ranges, and ρ is within 0.80–0.95 after the first chapter (20 balance gate).
