# 21 — Live Operations, Admin, Monetization and Compliance

Owner module: 21. Status: complete specification, 2026-10-18.
Scope (00 §1): admin console, live events, patches, support, moderation, cosmetics store and pass, rewarded ads, privacy, age rating, store compliance. Also owned here: staff roles and the two-person rule, world-control procedures, compensation and clawback policy, account enforcement and appeals, incident management, hosting and data residency policy, player communications policy, and the sandbox and offline product policy.
Depends on: 00 (L5, L7, L8, L11, L12, L14), 03 (ledger, reason codes, MSI), 14 (account, character, restricted cash lots, cosmetics fields, Fresh Start, handle rules), 15 (chat, boards, linked accounts, anti-cheat detections, chapters), 16 (world events and news templates), 17 (screens and design system), 19 (`SystemInput`, `adm.*` and `sys.*` kinds, PII separation, export and deletion mechanics, deploys, admin app), 20 (gates, Truth Machine, exposure lists, integrity report). Consumed by: 14 (cosmetics, ad grants), 15 (moderation filter, enforcement actions, patch schedule), 17 (Atelier, ad offer, legal texts), 19 (admin service, commerce paths), 20 (staff roles, compensation by replay), 24 (items needing Mathis's explicit yes).

**Safety and wording rule (binding).** Moderation and enforcement here are described as policy and tooling at the design level: roles, queues, actions, thresholds, timelines and screens. They do not describe how to evade detection or how real abuse is carried out. Anti-cheat detection signals are owned by 15 and are referenced only by name.

**Money rule.** Nothing in this module creates in-game money except two tagged faucets: `ACCT_REWARDED_AD` (rewarded ads, L12; restricted lots tagged `AD_GRANT`) and `ADM_COMPENSATION` (compensation for platform defects, two approvals). Real money never buys in-game money, Prestige, rank, odds or time (L7). Real money can never leave the game: there is no cash-out of any kind (L5).

**Time conventions.** Real-time rules (ads per local day, Held, protection windows, appeal deadlines, data-protection deadlines) use the real calendar in the account's timezone (19 `Account.timezone`) or UTC where stated. 1 real hour = 1 game day = 720 ticks (L9).

---

## §1 Purpose

1. **Run the world safely forever.** One persistent world never resets (L1, L14). Operations must change it without rollbacks: halts are diegetic, fixes are compensating ledger entries, rule changes ship at announced ticks.
2. **Keep staff power bounded and visible.** No staff member alone can create money, change a balance, alter odds or read sealed evidence. Every world-affecting action is a signed, two-approval `adm.*` system input sealed into a tick (19 §4.3) and logged in an append-only audit log.
3. **Help players and repair harm.** Support tickets, bug reports and exploit reports are answered within published targets; harm from platform defects is compensated by replay-based counterfactuals; gains from defects are clawed back fairly.
4. **Keep the community safe.** Chat and player-authored names and texts pass moderation policy tooling; reports, actions, statements of reasons and appeals follow a published process.
5. **Monetize only with cosmetics.** A cosmetics store (the **Atelier**) and a cosmetic **Chapter Pass**, priced in real currency with no premium currency, no loot boxes, no random paid rewards, no tier skips and no timers (L5, L7). Purchase code is structurally unable to touch the economy (20 INV-STR-002).
6. **Give broke players a lifeline.** Rewarded ads at $250 each, at most 10 per local day, only when net worth was under $1,000 at the start of the player's local day, with ad cash restricted for 72 real hours (L12).
7. **Comply.** 16+ age gate (L5), GDPR and EU consumer and digital-services rules for a service hosted in the EU, app-store and platform rules, honest store answers (no simulated gambling, no loot boxes), clear disclaimers.

---

## §2 Entities

Platform entities (PostgreSQL, 19 §11), not engine state, unless stated. Money amounts in real currency use `RealPrice { amountMinor: bigint; currency: 'EUR' | 'USD' | 'GBP' | ... }` (ISO 4217, minor units) and are never `Money` (in-game micro-dollars).

### §2.1 Staff, roles and audit

```ts
type StaffRole =
  | 'SUPPORT_AGENT'     // tickets, read-only player views, propose compensations up to tier C1
  | 'SUPPORT_LEAD'      // approve C1–C2 compensations, propose C3, unlock quarantined kinds
  | 'MODERATOR'         // moderation queue, chat and name actions up to 7-day restrictions
  | 'MODERATION_LEAD'   // longer restrictions, appeals second review, filter rule changes
  | 'INTEGRITY_ANALYST' // anti-cheat cases (15), propose clawbacks and bans
  | 'LIVE_OPS'          // calendar, live events, Wire notices, propose param changes
  | 'ECONOMY_DESIGNER'  // propose param and content changes (23, 22)
  | 'TM_ENGINEER'       // Truth Machine, harness, mirror worlds (20)
  | 'TM_LEAD'           // gate sign-off, waivers (20 §3.9.2)
  | 'ENGINEER_ONCALL'   // world control (halts), deploys, incident commander
  | 'COMMERCE_OPS'      // Atelier catalogue, prices, refunds outside stores
  | 'PRIVACY_OFFICER'   // data-protection requests, retention, breach notification
  | 'SUPERADMIN';       // role grants only; cannot act on players or the world

interface StaffAccount {
  staffId: string;               // 'stf_' + ulid
  displayName: string;
  roles: StaffRole[];
  ssoSubject: string;            // corporate identity provider subject
  hardwareKeyRegistered: boolean;// required for any role beyond SUPPORT_AGENT
  personalAccountIds: string[];  // the staff member's own player accounts (declared, §3.1.4)
  status: 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDED';
  createdAt: Date;
}

interface AuditLogEntry {        // append-only, hash-chained, object-locked copy (19 §3.9)
  auditId: string;               // 'aud_' + ulid
  at: Date;
  staffId: string;
  action: string;                // e.g. 'VIEW_LEDGER', 'PROPOSE_COMPENSATION', 'APPROVE', 'HALT_WORLD'
  subjectIds: string[];          // acc_, chr_, ticket ids
  reason: string;                // free text, required for every action except pure navigation
  ticketId?: string;             // required for any view of a specific player's private data
  requestId?: string;            // ApprovalRequest id when part of a two-person flow
  prevHash: string; hash: string;// SHA-256 chain
}
```

### §2.2 Admin actions and approvals

```ts
type AdminActionClass =
  | 'READ'        // view; single staff; logged; ticket required for private player data
  | 'SOFT'        // platform-only effect (reply, tag, mute in chat ≤ 24 h); single staff with reason
  | 'WORLD'       // anything sealed into a tick (adm.*, sys.param_change, sys.content_change); two approvals
  | 'CRITICAL';   // world halt, compensation tier C3, mass actions (> 100 characters), role grants; two approvals incl. one lead, plus a delay

interface ApprovalRequest {
  requestId: string;             // 'apr_' + ulid
  class: AdminActionClass;
  kind: string;                  // the adm.* / sys.* kind or platform action
  payload: unknown;              // exactly what will be submitted
  payloadHash: string;           // approvers sign this hash
  proposedBy: string;            // staffId
  approvals: { staffId: string; at: Date; signature: string }[];
  requiredApprovals: number;     // 2 for WORLD and CRITICAL
  requiredRoles: StaffRole[][];  // alternatives, e.g. [['SUPPORT_LEAD'],['ECONOMY_DESIGNER']]
  earliestSubmitAt?: Date;       // CRITICAL delay (§3.2.4)
  expiresAt: Date;               // default proposedAt + 72 real hours
  status: 'PENDING' | 'APPROVED' | 'SUBMITTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN';
  submittedInputId?: string;     // SystemInput.inputId once sealed (19 §2.2)
  ticketId?: string;
}
```

### §2.3 Live operations

```ts
type LiveEventType =
  | 'CHAPTER_OPENING' | 'SEASON_FINALS' | 'CRISIS_WEEK' | 'CHALLENGE'
  | 'AI_TOURNAMENT_WEEK' | 'GILT_LIST_ISSUE' | 'CITY_OPENING' | 'CONCESSION_AUCTION'
  | 'COSMETIC_FESTIVAL' | 'ACADEMY_WEEK' | 'MAINTENANCE' | 'EXCHANGE_NOTICE';

interface LiveEvent {
  eventId: string;               // 'lve_' + ulid
  type: LiveEventType;
  titleKey: string;              // i18n key (L8)
  startsAt: Date; endsAt: Date;  // real time, UTC
  startTick?: Tick; endTick?: Tick;   // filled when the event touches the engine
  engineTemplateId?: string;     // 16 world-event or 15 challenge template id when it has world effect
  params: Record<string, unknown>;
  announceAt: Date;              // ≥ startsAt − lead time of §3.5.3
  regionsRotation?: 'EU' | 'AMERICAS' | 'APAC';   // timezone band for start times (ROADMAP §2.8)
  status: 'DRAFT' | 'SCHEDULED' | 'ANNOUNCED' | 'LIVE' | 'DONE' | 'CANCELLED';
  approvalRequestId?: string;
}

interface ChapterCalendar {
  chapter: number;               // 1, 2, …
  startsAt: Date; endsAt: Date;  // 56 real days (00 §5.1)
  theme: string;                 // name key; cosmetic only
  events: string[];              // LiveEvent ids
  patchId?: string;              // rule patch applied at the opening boundary (15 §3.3.2)
}

type PatchClass =
  | 'HOTFIX'      // defect or exploit fix; any tick; no rule change intended
  | 'BALANCE'     // parameter changes within 23 ranges; at day close with notice
  | 'RULES'       // rule or formula changes, new systems; chapter boundary only
  | 'CONTENT'     // new catalog items, cities, cosmetics (22); at day close with notice
  | 'CLIENT';     // presentation only; any time

interface Patch {
  patchId: string;               // 'pch_' + semver, e.g. 'pch_1.14.0'
  class: PatchClass;
  engineVersion?: string; paramsVersion?: number; contentVersion?: number; clientVersion?: string;
  effectiveTick?: Tick;          // for engine-affecting classes
  notesKey: string;              // patch notes, EN and FR
  gateRunIds: string[];          // 20 gate runs that cleared it (G4, and G5 for RULES/BALANCE at boundaries)
  announcedAt: Date;
  status: 'PLANNED' | 'ANNOUNCED' | 'DEPLOYED' | 'ROLLED_BACK';
}

interface FeatureRollout {       // world-affecting flags are params (19 Rule 3.16.3)
  flagKey: string;               // PARAM key
  stage: 'OFF' | 'CHALLENGE_ONLY' | 'ONE_CITY' | 'ONE_COUNTRY' | 'WORLD';
  scopeId?: string;              // city or country for the middle stages
  since: Tick;
}
```

### §2.4 Support, compensation and clawback

```ts
type TicketCategory =
  | 'ACCOUNT_ACCESS' | 'PURCHASE' | 'AD_REWARD' | 'BUG' | 'EXPLOIT' | 'GAME_RULE_QUESTION'
  | 'PLAYER_REPORT' | 'APPEAL' | 'PRIVACY' | 'ACCOUNT_SECURITY' | 'OTHER';

interface SupportTicket {
  ticketId: string;              // 'tkt_' + ulid
  accountId: string;
  category: TicketCategory;
  locale: 'en' | 'fr';
  subject: string; body: string; // player text, moderated for staff-safety only, never edited
  attachments: string[];         // run files, screenshots (scanned, size ≤ 10 MB each)
  tickRange?: { from: Tick; to: Tick };
  status: 'NEW' | 'TRIAGED' | 'WAITING_PLAYER' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  slaDueAt: Date;
  assignee?: string;
  linkedFindingId?: string;      // 20 Finding
  linkedCaseId?: string;         // 20 RegressionCase
  createdAt: Date; updatedAt: Date;
}

type CompensationTier = 'C1' | 'C2' | 'C3';   // §3.6.3

interface CompensationPlan {
  planId: string;                // 'cmp_plan_' + ulid (not an engine cmp_ entity)
  incidentId?: string; findingId?: string;
  method: 'REPLAY_COUNTERFACTUAL' | 'FIXED_SCHEDULE' | 'ITEM_RESTORE';
  counterfactualRunId?: string;  // 20 HarnessRun on a MIRROR world
  lines: { characterId: string; amountReal: Money; kind: 'COMPENSATE' | 'CLAWBACK'; assetIds?: string[] }[];
  tier: CompensationTier;
  totalCompensation: Money; totalClawback: Money;
  approvalRequestId: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'EXECUTING' | 'DONE' | 'CANCELLED';
}
```

### §2.5 Enforcement and moderation

```ts
type EnforcementAction =         // account-level ladder (02 §10.2, 15 action enum)
  | 'WARNING' | 'CLAWBACK' | 'SHADOW_POOL' | 'TEMP_BAN' | 'BAN';

interface EnforcementCase {
  caseId: string;                // 'enf_' + ulid
  accountId: string; characterId: string;
  source: 'ANTI_CHEAT' | 'TM_EXPOSURE' | 'PLAYER_REPORT' | 'MODERATION' | 'PAYMENT_FRAUD' | 'STAFF';
  violation: ViolationCode;      // §3.7.1
  confidence: number;            // 0..1 from 15's link score or analyst judgement
  evidenceRefs: string[];        // event ids, 15 LinkPair ids, 20 Finding ids (never chat text as game evidence, 15 §3.9.2)
  proposedAction: EnforcementAction;
  decidedAction?: EnforcementAction;
  durationRealDays?: number;     // TEMP_BAN
  statementOfReasons?: string;   // sent to the player (§3.7.5)
  approvalRequestId?: string;
  status: 'OPEN' | 'DECIDED' | 'APPEALED' | 'UPHELD' | 'REVERSED' | 'CLOSED';
}

type ViolationCode =
  | 'V01_MULTI_ACCOUNT_FUNNEL' | 'V02_COLLUSION' | 'V03_EXPLOIT_ABUSE' | 'V04_AUTOMATION_OUTSIDE_GAME_AI'
  | 'V05_REAL_MONEY_TRADING' | 'V06_ACCOUNT_SHARING_OR_SALE' | 'V07_HARASSMENT' | 'V08_HATE'
  | 'V09_SEXUAL_CONTENT' | 'V10_PERSONAL_DATA' | 'V11_IMPERSONATION' | 'V12_REAL_BRAND_OR_PERSON_NAME'
  | 'V13_SPAM' | 'V14_PAYMENT_FRAUD' | 'V15_UNDERAGE' | 'V16_THREATS' | 'V17_ILLEGAL_CONTENT';

interface ModerationReport {
  reportId: string;              // 'mrp_' + ulid
  reporterAccountId: string;
  targetKind: 'CHAT_MESSAGE' | 'HANDLE' | 'COMPANY_NAME' | 'FUND_NAME' | 'ALLIANCE_NAME' | 'HOUSE_NAME'
            | 'MODEL_NAME' | 'PROFILE_TEXT' | 'RESEARCH_PUBLICATION' | 'EDITION_NAME' | 'CONTRACT_TEXT';
  targetId: string;
  reason: ViolationCode;
  note?: string;                 // ≤ 500 chars
  createdAt: Date;
  status: 'OPEN' | 'ACTIONED' | 'NO_ACTION' | 'DUPLICATE';
}

interface ModerationAction {
  actionId: string;
  targetKind: ModerationReport['targetKind']; targetId: string;
  action: 'REMOVE_CONTENT' | 'MASK_CONTENT' | 'FORCE_RENAME' | 'CHAT_MUTE' | 'CHAT_BAN' | 'NAME_LOCK' | 'ESCALATE_ENFORCEMENT';
  durationRealHours?: number;
  violation: ViolationCode;
  byStaffId: string | 'AUTOMATED';
  statementOfReasons: string;
  createdAt: Date;
}

interface FilterRule {
  ruleId: string;
  locale: 'en' | 'fr' | 'any';
  class: 'PROFANITY_MASK' | 'SLUR_BLOCK' | 'PII_BLOCK' | 'RMT_BLOCK' | 'LINK_BLOCK' | 'REAL_BRAND_BLOCK' | 'RESERVED_NAME' | 'CLASSIFIER_HOLD';
  pattern: string;               // normalized token list or pattern id; the list content is staff-only data
  action: 'MASK' | 'BLOCK' | 'HOLD_FOR_REVIEW';
  appliesTo: ModerationReport['targetKind'][];
  version: number;
}
```

### §2.6 Commerce: cosmetics, pass, purchases

```ts
type CosmeticSlot =
  | 'SHELL_STYLE' | 'ESTATE_STYLE' | 'AVATAR_OUTFIT' | 'PROFILE_FRAME' | 'NAMEPLATE'
  | 'CHART_THEME' | 'DESKTOP_WALLPAPER' | 'SOUND_PACK' | 'TICKER_STYLE' | 'CREST_PART'
  | 'TOWER_FACADE' | 'STOREFRONT_SIGN' | 'CHAT_STICKER' | 'RECAP_CARD_STYLE';

interface CosmeticItem {
  itemId: string;                // 'cos_' + slug, e.g. 'cos_shell_art_deco_office'
  slot: CosmeticSlot;
  nameKey: string; descKey: string;
  acquisition: 'ATELIER' | 'PASS_FREE' | 'PASS_PREMIUM' | 'EARNED';   // EARNED = from milestones, titles, events (14, 15, 20)
  price?: RealPriceTable;        // ATELIER only
  bundleIds: string[];
  availableFrom?: Date; returnsToAtelierAt?: Date;   // anti-FOMO return (§3.12.6)
  minRankToDisplay?: string;     // never set for ATELIER items (§3.11.4)
  labelPurchased: true | false;  // true for ATELIER and PASS_PREMIUM: shows "Purchased" where 14/17 require
  assetRefs: string[];           // art files (22)
  version: number;
}

interface RealPriceTable { tier: PriceTier; perStorefront: Record<'APPLE' | 'GOOGLE' | 'WEB', RealPrice[]> }
type PriceTier = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6';   // §3.11.6

interface Bundle { bundleId: string; itemIds: string[]; price: RealPriceTable; discountShownPct: number }

interface ChapterPassDef {
  passId: string;                // 'pass_C<chapter>'
  chapter: number;
  tiers: { tier: number; marksRequired: number; freeItemId?: string; premiumItemId?: string }[];   // 50 tiers
  premiumPrice: RealPriceTable;
}

interface PassProgress {         // platform state, written only from engine events (§3.12.3)
  accountId: string; passId: string;
  marks: number;                 // chapter marks earned
  tierReached: number;
  premiumOwned: boolean;
  claimed: number[];             // tiers whose items were granted
  markLedger: { at: Date; source: MarkSource; amount: number; refEventId: string }[];
}
type MarkSource = 'GAME_DAY_ACTIVE' | 'ACADEMY_LESSON' | 'WEEKLY_CHALLENGE_ENTRY' | 'TOURNAMENT_ENTRY' | 'HOSTED_EVENT' | 'MILESTONE' | 'CITY_VISIT';

interface Purchase {
  purchaseId: string;            // 'pur_' + ulid
  accountId: string;
  storefront: 'APPLE' | 'GOOGLE' | 'WEB';
  storeTransactionId: string;    // the store's id, unique per storefront
  sku: string;                   // item, bundle or pass sku
  price: RealPrice; taxIncluded: boolean;
  purchasedAt: Date;
  verifiedAt?: Date;             // server-side receipt verification (§3.13.2)
  status: 'PENDING' | 'VERIFIED' | 'REFUNDED' | 'CHARGED_BACK' | 'REVOKED' | 'FAILED';
  withdrawalWaiverConsentAt?: Date;   // EU 14-day right, waived for immediate delivery with consent (§3.16.4)
}

interface Entitlement {
  entitlementId: string;
  accountId: string;             // account-level, not character-level
  itemId: string;
  source: 'PURCHASE' | 'PASS' | 'EARNED' | 'GIFT_FROM_STAFF' | 'COMPENSATION';
  purchaseId?: string;
  grantedAt: Date; revokedAt?: Date;
}

interface SpendState {           // per account, for minors' limits and transparency (§3.11.7)
  accountId: string;
  monthKey: string;              // 'YYYY-MM' in the account timezone
  spentMinorByCurrency: Record<string, bigint>;
  capMinor?: bigint;             // set for 16_17 band and for self-set limits
}
```

### §2.7 Rewarded ads

```ts
interface AdDayState {           // engine state on the character (14 field set), mirrored to platform
  characterId: string;
  localDate: string;             // 'YYYY-MM-DD' in the account timezone at evaluation
  evaluatedTick: Tick;           // first tick at or after local midnight (§3.14.2)
  eligibleToday: boolean;
  startOfDayNWReal: Money;       // rank-basis NW / MSI at evaluatedTick
  grantsToday: number;           // 0..10
}

interface AdView {               // platform only
  adViewId: string;              // 'adv_' + ulid
  accountId: string; characterId: string;
  networkSessionId: string;
  startedAt: Date; completedAt?: Date;
  serverCallbackVerifiedAt?: Date;   // server-side verification from the ad network (§3.14.3)
  outcome: 'COMPLETED' | 'ABANDONED' | 'NO_FILL' | 'REJECTED_INELIGIBLE' | 'REJECTED_FRAUD';
  grantInputId?: string;         // sys.ad_grant SystemInput id (19 §4.3)
  personalized: false;           // always false (§3.14.8)
}
```

### §2.8 Compliance

```ts
interface AgeGateRecord {
  accountId: string;
  declaredBirthYearMonth: string;   // 'YYYY-MM' (day not collected)
  ageBandAtSignup: 'U16' | '16_17' | '18_PLUS';   // U16 refused (14 AgeBand)
  method: 'SELF_DECLARED' | 'STORE_AGE_SIGNAL' | 'VERIFIED';
  at: Date;
  reconfirmedAt?: Date;
}

interface ConsentRecord {
  accountId: string;
  purpose: 'ESSENTIAL' | 'PRODUCT_ANALYTICS' | 'CRASH_REPORTS' | 'MARKETING_EMAIL' | 'PUSH' | 'ADS_NON_PERSONALIZED';
  granted: boolean;
  textVersion: string;           // LegalDocVersion id shown
  at: Date; source: 'WEB' | 'IOS' | 'ANDROID';
}

interface LegalDocVersion {
  docId: 'TERMS' | 'PRIVACY' | 'COOKIES' | 'COMMUNITY_RULES' | 'ATELIER_TERMS' | 'AD_NOTICE';
  version: string; locale: 'en' | 'fr';
  effectiveAt: Date;
  materialChange: boolean;       // true requires re-acceptance at next login
  textUri: string;
}

interface PrivacyRequest {
  requestId: string;
  accountId: string;
  kind: 'ACCESS_EXPORT' | 'DELETION' | 'RECTIFICATION' | 'OBJECTION' | 'RESTRICTION' | 'PORTABILITY';
  receivedAt: Date; dueAt: Date; // receivedAt + 30 real days (19 PARAM.export_sla_days)
  status: 'RECEIVED' | 'IDENTITY_CHECK' | 'IN_PROGRESS' | 'DONE' | 'REFUSED_WITH_REASON';
}

interface Incident {
  incidentId: string;            // 'inc_' + ulid
  level: 'INC-1' | 'INC-2' | 'INC-3' | 'INC-4';   // §3.17 (not the S1–S6 crime scale)
  title: string;
  startedAt: Date; resolvedAt?: Date;
  commanderStaffId: string;
  worldHaltedTicks?: { from: Tick; to?: Tick };
  publicStatusText?: string;     // status page, EN and FR
  postmortemUri?: string;
  compensationPlanId?: string;
}
```

---

## §3 Rules and formulas

### §3.1 Staff roles and access

**Rule 3.1.1 (the admin app).** `apps/admin` (19) is a separate Next.js deployment reachable only from the staff network through the corporate identity provider with a hardware security key for every role beyond SUPPORT_AGENT. It talks to the world only by submitting signed `SystemInput`s through the admin service (19 §4.3) and reads through read models, the replay service and PII views (19 §3.14.2). It has no direct database write path to engine state.

**Rule 3.1.2 (permission matrix).** `Y` = may do alone (logged); `P` = may propose (needs approval); `A` = may approve another's proposal; blank = never.

| Capability | SUP_AGENT | SUP_LEAD | MOD | MOD_LEAD | INTEGRITY | LIVE_OPS | ECON | TM_ENG | TM_LEAD | ONCALL | COMMERCE | PRIVACY |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| View public profile, boards | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| View a player's private game data (ledger, positions, events) with a ticket | Y | Y | | | Y | | | Y | Y | Y | | Y |
| View PII (email) with a ticket | Y | Y | | | | | | | | | Y | Y |
| Reply to tickets | Y | Y | Y | Y | Y | | | | | | Y | Y |
| Compensation C1 | P | A | | | | | | | | | | |
| Compensation C2 | P | P/A | | | | | | | | | | |
| Compensation C3 (CRITICAL) | | P | | | P | | P | | A | | | |
| Clawback (`adm.clawback`) | | P | | | P | | | | A | | | |
| Chat mute ≤ 24 h | | | Y | Y | | | | | | | | |
| Chat ban, force rename, name lock ≤ 7 days | | | P | A | | | | | | | | |
| Restrictions > 7 days, filter rule changes | | | | P/A | | | | | | | | |
| Enforcement WARNING | | | | | Y | | | | | | | |
| CLAWBACK / SHADOW_POOL / TEMP_BAN / BAN | | | | A | P | | | | A | | | |
| Freeze character (`adm.freeze_character`) | | P | | | P | | | | | A | | |
| Live event schedule / cancel (`adm.inject_event`, `adm.cancel_event`) | | | | | | P | A | | | | | |
| Param change (`sys.param_change`) | | | | | | P | P/A | | A | | | |
| Content change (`sys.content_change`) | | | | | | P | P/A | | | | | |
| Halt market (`adm.halt_market`) | | | | | | | | | | Y then A within 1 h | | |
| Halt or resume world | | | | | | | | | P/A | P/A | | |
| Engine upgrade (`sys.engine_upgrade`) | | | | | | | | P | A | A | | |
| Mirror world access (20 Rule 3.5.7) | | | | | | | | Y | Y | | | |
| Atelier catalogue and prices | | | | | | | | | | | P/A | |
| Out-of-store refunds | | | | | | | | | | | P/A | |
| Privacy requests, deletion override, breach notification | | | | | | | | | | | | Y |
| Grant roles | SUPERADMIN only, with a second SUPERADMIN approval |

A proposer can never approve their own request; two approvals must come from two different people, and for WORLD and CRITICAL classes at least one approver holds a role in the "approve" column for that row.

**Rule 3.1.3 (just-in-time access).** Viewing private player data requires an open ticket, an enforcement case, an incident or a Finding id; the view is logged with that id. Access expires `PARAM.adm_access_window_hours = 8` real hours after it is opened.

**Rule 3.1.4 (staff who play).** Staff may play on personal accounts. Each staff member declares their personal accounts; the admin app refuses any action by a staff member on their own accounts, their alliance, their House, or any character linked to them by 15's link score ≥ 0.5. Personal accounts of staff carry the flag `STAFF` (19 `Account.flags`) visible only to staff; they compete normally on boards. A staff member's personal account never receives compensation without a third approver from another team.

**Rule 3.1.5 (no hidden powers).** There is no admin function that sets a balance, sets a price, sets an odds value, sets a rank, sets Prestige, reads SEALED evidence, reads another player's hidden sessions as "hostile", or impersonates a player in the world. These kinds do not exist in the engine (19 §4.3 last paragraph). Staff never trade, sue, run ops or sign contracts in the production world from staff accounts.

### §3.2 The admin action pipeline and the two-person rule

**Rule 3.2.1 (flow).** For WORLD and CRITICAL actions:
1. The proposer fills the action form; the admin service builds the exact `payload` and computes `payloadHash = SHA-256(canonical(payload))`. Range checks (23 ranges, 22 schemas, ledger reason classes) run now and again in the engine at P1.
2. An `ApprovalRequest` is created and approvers are notified.
3. Each approver views the payload rendered in plain language plus the raw payload, the ticket or case, and (for compensation) the counterfactual report; they sign `payloadHash` with their hardware key.
4. When `requiredApprovals` are present (and `earliestSubmitAt` has passed for CRITICAL), the admin service submits the `SystemInput` with `approvals = [staffIds]` and signatures; the engine verifies the platform signature and the approval count at P1 (19 §4.3).
5. The sealed input id, the tick it took effect and the result are written back to the request and to the audit log.
6. Any edit to the payload after the first approval voids all approvals.

**Rule 3.2.2 (expiry).** A request expires after `PARAM.adm_request_expiry_hours = 72` real hours without enough approvals.

**Rule 3.2.3 (emergency single-signer actions).** Only two actions may start with one signer: `adm.halt_market` (one asset or venue) by ENGINEER_ONCALL, which auto-resumes after `PARAM.adm_halt_market_confirm_minutes = 60` real minutes unless a second approver confirms (19 §4.3); and the automatic Truth Machine halt (20 Rule 3.2.2 step 6), which needs no human at all. A world halt by humans always needs two.

**Rule 3.2.4 (CRITICAL delay).** CRITICAL actions other than halts wait `PARAM.adm_critical_delay_minutes = 30` real minutes after the second approval, during which any approver or any TM_LEAD can cancel.

**Rule 3.2.5 (audit log integrity).** Each `AuditLogEntry` stores `hash = SHA-256(prevHash ‖ canonical(entry))`. The chain head is published daily in the integrity bulletin (19 Rule 3.12.5). The log is written to object storage with object lock (19) and retained `PARAM.audit_retention_years = 10`. A gap or hash mismatch is an INC-2.

**Rule 3.2.6 (mass actions).** Any action affecting more than `PARAM.adm_mass_threshold = 100` characters is CRITICAL and must be expressed as one `CompensationPlan` or one `LiveEvent`, never as a loop of single actions.

### §3.3 World control: halts, kill switches, maintenance

**Rule 3.3.1 (levels of halt).**

| Level | Kind | Who | Effect | Player sees |
|---|---|---|---|---|
| Asset or venue halt | `adm.halt_market` | ONCALL (+ confirm) | 05 halts matching on that asset or venue; orders queue | 17 "Halted" chip, "Trading halted by the Exchange" on that asset |
| Module kill switch | `sys.param_change` of a module flag to `OFF` | 2 approvals (ONCALL + TM_LEAD or ECON) | new intents of that module rejected with `SYS_MODULE_PAUSED`; existing positions keep accruing; scheduled processes of the module pause unless 19/owner says they must run (margin, accruals never pause) | "This service is paused by the Exchange. Your holdings are safe." |
| World halt | `adm.halt_world` | 2 approvals | `WorldStatus = HALTED_EXCHANGE`; ticks stop at a boundary; clients show the overlay | diegetic overlay with reason category |
| Maintenance | scheduled `adm.halt_world` + LiveEvent `MAINTENANCE` | LIVE_OPS proposes, ONCALL approves | as world halt, announced ahead | countdown banner 24 real hours ahead |

**Rule 3.3.2 (fairness during a halt).** While the world is halted no tick runs, so nothing accrues, nothing expires and no protection window or Held timer that is measured in ticks advances. Timers measured in real time (Held, protection windows, restricted-cash windows, ad local days, chapter end) are **extended by the halt duration** for every character, rounded up to whole ticks; chapter boundaries are moved by the halt duration if a halt overlaps the last 48 real hours of a chapter (`PARAM.liveops_boundary_shift_on_halt = true`). Standing orders do not fire on resume until the opening or the next normal auction rules of 05 apply.

**Rule 3.3.3 (maintenance budget).** Planned maintenance halts are avoided by design (19 deploys between ticks). If unavoidable: at most `PARAM.liveops_maintenance_max_minutes = 30` real minutes per event, at most one per real week, scheduled in the low-activity window computed from the last 4 weeks' concurrency (the hour with the lowest CCU, UTC), announced ≥ 24 real hours ahead in the Wire as an Exchange notice and on the status page.

**Rule 3.3.4 (resume checklist).** Resume after an unplanned world halt needs: the incident commander's go, the Truth Machine's hotfix gate (20 Rule 3.9.3) passed if code changed, the shadow verifier in sync, and a public status update. On resume the Wire carries "Trading resumes" with the halt duration.

### §3.4 Parameters, content and patches

**Rule 3.4.1 (patch classes and timing).**

| Class | When it may take effect | Notice | Gate (20) |
|---|---|---|---|
| HOTFIX | any tick (between ticks) | patch note within 24 real hours; "Fix" line in the next integrity report | hotfix path |
| BALANCE | a day close (t = 719) | ≥ `PARAM.liveops_balance_notice_hours = 48` real hours, as an Exchange notice on the Wire and in patch notes | G4 + diff run of the changed params on the touched bands |
| RULES | a chapter boundary only (15 §3.3.2) | ≥ `PARAM.liveops_rules_notice_days = 14` real days | G4 + G5 |
| CONTENT | a day close | ≥ 24 real hours (new cities: ≥ 7 real days) | G4 |
| CLIENT | any time | release notes in Settings › About | G0–G2 client suites |

**Rule 3.4.2 (no retroactivity).** No change applies to ticks before its `effectiveTick`. A change never rewrites history, never re-prices past fills and never re-runs past rolls. Where a defect produced wrong outcomes in the past, the remedy is compensation or clawback (§3.6), never a rewrite.

**Rule 3.4.3 (rate of change).** A BALANCE patch may move each parameter by at most `PARAM.liveops_param_step_max_share = 0.25` of its 23 range per patch and at most one BALANCE patch per parameter per real week, except to stop an active CRITICAL Finding (then any value within range, as a HOTFIX-class param change with two approvals including TM_LEAD).

**Rule 3.4.4 (honest patch notes).** Patch notes state what changed, why, and the effective tick, in EN and FR. Balance notes give the old and new value of any player-visible number. Patch notes never name a player. A nerf of a strategy that some players use says so plainly ("Returns from X were higher than intended at large sizes; the capacity limit now ...").

**Rule 3.4.5 (staged rollouts).** World-affecting features roll out through `FeatureRollout` stages (19 Rule 3.16.3, 02 §11): `CHALLENGE_ONLY` (ring-fenced challenge portfolios), then `ONE_CITY` or `ONE_COUNTRY`, then `WORLD`. Each stage lasts ≥ `PARAM.liveops_rollout_stage_min_days = 7` real days with its bands monitored live (20 Rule 3.11.2). A stage advance is a BALANCE-class param change.

**Rule 3.4.6 (new cities).** When 15/10 report that `N_a` has grown by `PARAM.new_city_na_step = 4000` since the last opening (01 §14.1), LIVE_OPS schedules a CITY_OPENING LiveEvent within the next chapter, announced ≥ 7 real days ahead, content from 22's generator, opening at a day close.

### §3.5 Live events and the chapter calendar

**Rule 3.5.1 (no economic truth from staff).** Live events with world effect are instances of templates owned by 16 (world events) and 15 (challenges, finals). Staff choose a template, its scheduled tick and its parameters within the template's ranges; they cannot invent a price move, a company result or a news fact. `adm.inject_event` accepts only templates flagged `liveOpsSchedulable` in 16's catalogue (crisis week framing, cosmetic festivals, city openings, concession auction openings, challenge events). Natural crises are never injected by staff: they emerge from 16's rules (20 Rule 3.8.4). `adm.cancel_event` may cancel a scheduled live event before it starts; cancelling a live world event in progress is allowed only for a defect, as an incident action, with compensation review.

**Rule 3.5.2 (the chapter calendar template).** Every chapter (56 real days) follows this template; dates are real days from the chapter start; all events are data in `ChapterCalendar`.

| Real day | Event | Notes |
|---|---|---|
| 0 | CHAPTER_OPENING; RULES patch takes effect; concession re-auctions (10); Chapter Pass opens | boundary hooks run in P2 (15 §3.3.2) |
| 0–2 | SEASON_FINALS of the previous chapter (48 real hours, 15 §3.5.4) | spectator page |
| 1 | Gilt List issue (14) for the closing chapter | |
| every 7 | league week rollover (15); weekly Integrity Report (20) | |
| every 7, fixed UTC time | AI_TOURNAMENT_WEEK lock (11): `PARAM.liveops_tournament_lock = "Sun 18:00 UTC"`; results ≤ 24 real hours later | TOURNAMENT seeds committed before lock (20) |
| ~every 3.7 | game quarter: earnings season, central bank meetings (04, 09) | engine calendar, no staff action |
| 14 and 42 | CHALLENGE events (e.g. Crash Course, Pure Markets, Speedrun, 02 §2.4), 48 real hours each, rotating start band EU → AMERICAS → APAC | rewards cosmetic and titles only |
| 7–49 | at most one CRISIS_WEEK (ROADMAP §2.8), drawn by the engine (04 §3.16.1: probability 0.6 per chapter, real weeks 2–7), announced ≥ 48 real hours ahead; staff write its framing copy only and never schedule or force one | ≤ 1 per chapter |
| 28 | ACADEMY_WEEK (18): new lessons, practice worlds | |
| any | COSMETIC_FESTIVAL (Atelier themed items, pass bonus marks capped §3.12.3) | never sells anything with game effect |
| 49 | RULES patch notes for the next chapter published (≥ 14 days before is met by day 42 at the latest) | |
| 54–56 | no new major crisis may start in the final 48 real hours (16, 20 band MAC.no_major_final_48h); no maintenance | |

**Rule 3.5.3 (lead times).** Announcement lead times: CRISIS_WEEK ≥ 48 real hours; CHALLENGE ≥ 72 real hours; CITY_OPENING ≥ 7 real days; MAINTENANCE ≥ 24 real hours; COSMETIC_FESTIVAL ≥ 24 real hours; RULES patch ≥ 14 real days. A LiveEvent cannot move to `SCHEDULED` with `announceAt` later than `startsAt − leadTime`.

**Rule 3.5.4 (timezone fairness).** Events with competitive windows (challenges, finals start, tournament lock) rotate their start band across EU, AMERICAS and APAC by chapter, so every band gets a waking start at least once every 3 chapters (ROADMAP §2.8).

**Rule 3.5.5 (rewards).** Live-event rewards are titles, trophies, cosmetics and Prestige where 14 defines Prestige for that title; never money (01 §14.4, 20 INV-SOC-001). Rewards never depend on real-money purchases.

### §3.6 Support, compensation and clawback

**Rule 3.6.1 (channels and targets).** Players reach support through Help › Report a problem (17 app 28) in game, the web account page, and an email address shown in the store listing. Ticket priorities and first-response targets (real time): P1 account security, payment double-charge, an ongoing exploit, a safety threat: 4 h; P2 lost items or money due to a defect, appeals: 24 h; P3 bugs, ad rewards not received: 72 h; P4 questions: 5 days. Resolution targets are 3× the first-response target. Targets are published.

**Rule 3.6.2 (triage).** Bug and exploit tickets with a reproducible run file or tick range are linked to a 20 RegressionCase (20 Rule 3.10.5) or Finding. An EXPLOIT ticket starts the 20 disclosure clock (20 Rule 3.16.2). A player question about why something happened is answered from the explainability tools (18 ladder, 05 cause vector), never from staff opinion about strategy (no financial advice, §3.16).

**Rule 3.6.3 (compensation tiers).** Compensation is paid only for harm caused by a platform defect (engine bug, server incident, wrong rule implementation), never for losses from play, other players' legal or illegal game actions, or market moves.

| Tier | Size (real dollars, per character) | Approvals | Method |
|---|---|---|---|
| C1 | ≤ max($25,000, 1% of rank-basis NW) | SUPPORT_AGENT proposes, SUPPORT_LEAD approves | fixed schedule or item restore |
| C2 | ≤ max($1,000,000, 10% of rank-basis NW) | SUPPORT_LEAD proposes, a second SUPPORT_LEAD or TM_LEAD approves | replay counterfactual required |
| C3 | above C2, or > 100 characters | CRITICAL: proposer + TM_LEAD + 30-minute delay | replay counterfactual required; incident postmortem attached |

**Rule 3.6.4 (replay counterfactual).** For C2/C3 the amount is computed, never guessed:
1. TM_ENGINEER forks a MIRROR world (20 Rule 3.5.7) at the last snapshot before the defect's first tick `T0`.
2. The mirror re-runs ticks `T0 … T1` (the defect window) with the fixed engine and the same sealed intents and entropy.
3. For each affected character `c`, `Δ_c = NWreal_fixed(c, T1) − NWreal_actual(c, T1)`, using 03's rank-basis valuation at `T1` marks.
4. If `Δ_c > PARAM.comp_min_real = $10` the character is owed `Δ_c` (compensation); if `Δ_c < −$10` the character gained from the defect and the gain is subject to clawback (Rule 3.6.6).
5. Intents a character would plausibly have changed after seeing the correct state are not modelled (the counterfactual replays the same intents); the plan states this limitation in its notes.
6. Assets wrongly lost (an item, a business, a property) are restored in kind when they still exist in the world (`ITEM_RESTORE`) and the cash `Δ_c` is reduced by their value.

**Rule 3.6.5 (posting).** Compensation posts `ADM_COMPENSATION` (FAUCET, 03) through `adm.compensate` (19 §4.3) as **unrestricted** cash (it replaces value the player had), with a PRIVATE event to the player and an in-game message "The Exchange corrected an error affecting your account: +$X. Reference INC-…". Compensation never scales with spending and is never paid in cosmetics instead of money when money was lost (a cosmetic apology item may be added on top for incidents, `source: 'COMPENSATION'`).

**Rule 3.6.6 (clawback).** A defect-gain `G_c = −Δ_c` is clawed back through `adm.clawback` as `ADM_CLAWBACK` (SINK, 03) or, when the gain went to another player, as `ADM_TRANSFER_REVERSAL` (TRANSFER) back to that player. Order: cash first; if cash < `G_c`, the remaining amount becomes a platform claim repaid from `PARAM.clawback_income_share = 0.30` of daily income (the same mechanism as 13's garnishment plan), never forcing a liquidation and never going below 14's Fresh Start line or 13's conflict floor. Good-faith beneficiaries (they did nothing unusual; the defect simply paid them) get clawback only, with no enforcement action and a plain message. Repeated deliberate abuse is handled by §3.7 as V03.

**Rule 3.6.7 (no world rollbacks).** The world is never rolled back to an earlier tick to undo an incident (L1). The only rollback is the Truth Machine's uncommitted-tick rollback (20 Rule 3.2.2), which affects a tick no player has seen committed.

### §3.7 Account enforcement and appeals

**Rule 3.7.1 (violations and the ladder).** Detection signals are 15's (link score, P2P flow graph, input timing, collusion graph) and 20's (Finding exposure lists). Each case names one `ViolationCode`. Default sanctions (first offence → repeat), where "repeat" means within `PARAM.enf_repeat_window_days = 180` real days:

| Violation | First | Second | Third |
|---|---|---|---|
| V01 multi-account funnel | CLAWBACK of funnelled value + WARNING; linked alts frozen | CLAWBACK + TEMP_BAN 14 d on all linked accounts | BAN all linked accounts |
| V02 collusion | voiding (15, 13) + WARNING | CLAWBACK + TEMP_BAN 7 d | BAN |
| V03 exploit abuse (outside the 20 safe harbour) | CLAWBACK + WARNING | CLAWBACK + TEMP_BAN 14 d | BAN |
| V04 automation outside the game's AI and official API | WARNING | TEMP_BAN 3 d | TEMP_BAN 30 d, then BAN |
| V05 real-money trading of accounts, items or in-game cash | CLAWBACK + TEMP_BAN 30 d | BAN | — |
| V06 account sharing or sale | TEMP_BAN 7 d | BAN | — |
| V07 harassment | chat restrictions per §3.8 | TEMP_BAN 7 d | BAN |
| V08 hate, V16 threats | chat ban 30 d + WARNING | BAN | — |
| V09 sexual content, V17 illegal content | content removed + chat ban 30 d; V17 also reported where law requires | BAN | — |
| V10 publishing personal data | content removed + chat ban 7 d | BAN | — |
| V11 impersonation, V12 real brand or person names | FORCE_RENAME + WARNING | NAME_LOCK 30 d | BAN |
| V13 spam | chat mute 24 h | chat ban 7 d | chat ban 90 d |
| V14 payment fraud | entitlements revoked; purchases blocked | BAN | — |
| V15 under 16 | account closed and data deleted (§3.9.5) | — | — |

**Rule 3.7.2 (confidence and shadow pools).** Actions above WARNING need `confidence ≥ PARAM.enf_min_confidence = 0.8` or an analyst's documented review. Between 0.5 and 0.8, the character may be placed in a SHADOW_POOL (02 §10.2): league matching only with other shadow-pooled characters and exclusion from public board top 100 display, for up to 1 chapter, while the case is reviewed. Shadow pools never change the character's game economics.

**Rule 3.7.3 (what bans do in the world).** `sys.account_status` (19) carries SUSPENDED or BANNED to the engine; 15 defines what freezing means in play (no intents accepted; standing orders cancelled; positions keep accruing and margin rules still apply; boards exclude the character). A BANNED character's world footprint is retained for history; its unique assets enter 14/15's estate process after `PARAM.enf_ban_estate_days = 30` real days unless an appeal is pending; proceeds stay on the frozen character (never redistributed as a reward).

**Rule 3.7.4 (no in-game shortcut).** Account enforcement is separate from in-game justice (13). Being convicted in game is never an account violation; account enforcement is never shown as an in-game verdict.

**Rule 3.7.5 (statement of reasons).** Every action above a chat mute sends the player a statement of reasons: the violation code in plain words, the rule of the Community Rules it breaks, the action and its duration, the main kind of evidence (never revealing other players' private data or the detection method's details), whether the decision was automated, and how to appeal (DSA-style notice, `DEFAULT (Mathis may override)`).

**Rule 3.7.6 (appeals).** One appeal per decision within `PARAM.enf_appeal_window_days = 30` real days, through Help. The appeal is reviewed by a person who did not take the original decision, at lead level for TEMP_BAN ≥ 7 days and BAN, within 7 real days. Outcomes: UPHELD, REVERSED (all effects reversed; clawbacks reposted as `ADM_TRANSFER_REVERSAL` or `ADM_COMPENSATION`; a cosmetic apology item), or REDUCED. Banned players can appeal from the web account page without logging into the game.

### §3.8 Moderation policy tooling

**Rule 3.8.1 (what is moderated).** All player-authored text: chat (15 §3.9), handles (14 §3.1.3), company, fund, alliance, House, model, edition and storefront names, profile text, research publications (opt-in), contract free-text notes, support ticket text (staff safety only). Typed contract clauses and engine-generated text are not moderated (they are not free text).

**Rule 3.8.2 (the filter pipeline).** Every text passes, in order:
1. **Normalize:** Unicode NFKC, case fold, strip zero-width characters, map look-alike characters to their base letters, collapse repeated characters beyond 2.
2. **Block classes** (`FilterRule` BLOCK): slurs, personal data patterns (emails, phone numbers, street addresses, payment card-like numbers), real-money-trading offers (selling accounts or cash, outside links to marketplaces), external links (15 §3.9.2: no links), reserved names (staff, "Exchange", "Moderator", institutions and NPC actor names in 22), real brand and real person names (L6, V12). A blocked chat message is not sent; the author sees "This message can't be sent: it contains [category]." A blocked name is refused at the intent (`MOD_NAME_REFUSED` with category).
3. **Mask class:** profanity is masked with `•••` for recipients whose "Mask strong language" setting is on (default on; 16_17 accounts cannot turn it off).
4. **Classifier hold:** a text classifier for harassment, threats and sexual content scores the text; above `PARAM.mod_hold_threshold = 0.85` the message is `HELD_FOR_REVIEW` (visible only to the author, 15 §3.9.2) and enters the queue; between 0.6 and 0.85 it is delivered and sampled into the queue at `PARAM.mod_sample_share = 0.1`.
The filter runs in the platform, not the engine; the engine receives names only after they pass (names enter via intents, so a refused name never reaches a tick).

**Rule 3.8.3 (lists).** Block lists exist per locale (en, fr) plus `any`. The real-brand list contains real company, product and financial-institution names and real public figures relevant to finance, sourced and maintained by MODERATION_LEAD; it is also the list 20 INV-STR-009 checks content against. List contents are staff-only data and are not published.

**Rule 3.8.4 (reports and queue).** Every player-authored item has a Report action (17). The queue orders reports by `priority = severityWeight(violation) × (1 + log2(1 + distinctReporters)) × recencyFactor`, with V16 threats and V17 illegal content at the top. Targets: V16/V17 reviewed within 1 real hour (staffing per §3.8.6), others within 24 real hours. Reporting is rate-limited to `PARAM.mod_reports_per_day = 20` per account; reporters whose reports are rejected ≥ 90% over 30 reports lose report priority for 30 days (anti-brigading).

**Rule 3.8.5 (chat actions).** MUTE (cannot post in one channel or all), BAN from chat (all channels except contract threads and support), FORCE_RENAME (the name reverts to a generated placeholder, e.g. "Firm-48211", and the owner must choose a new one; handle-change fees and limits of 14 are waived for a forced rename), NAME_LOCK (cannot rename for the duration). Players can always mute and block others themselves (15).

**Rule 3.8.6 (staffing and hours).** Country and city chat are open at launch (15 §3.9.3 resolves the old 02 Q5). Moderation coverage target: a moderator on duty for every hour in which ≥ 2% of peak CCU is online; at launch `DEFAULT (Mathis may override)`: 16 hours per day of human coverage in EU languages (en, fr), with automated holds covering the remaining hours and slow mode doubled in uncovered hours.

**Rule 3.8.7 (transparency).** A moderation transparency summary is published every 6 months: number of reports, actions by violation class, share automated, appeals and reversals (DSA-style; `DEFAULT`).

**Rule 3.8.8 (16_17 protections).** Accounts in the 16_17 band: strong-language mask forced on; DMs only from players they follow or alliance members (`DEFAULT`); never shown in "nearby" or discovery lists by age; no access to any future voice feature.

### §3.9 Age gate and account eligibility

**Rule 3.9.1 (minimum age 16, L5).** Nobody under 16 may hold an account. The game's content rating target is 16+ everywhere (§3.15).

**Rule 3.9.2 (the age gate).** At account creation (guest or full; 19 `Account.kind`), before any gameplay, the client shows a neutral age screen: "Enter your month and year of birth" with month and year pickers that do not pre-select a qualifying value and do not hint at the threshold. Rules:
1. Age is computed from the 1st of the declared month (conservative). If age < 16: the screen says "Sorry, you need to be 16 or older to play." No account or character is created; a device-local flag blocks retrying on that device for `PARAM.age_gate_retry_block_days = 1` real day; no personal data is stored server-side except an anonymous counter.
2. If 16 ≤ age < 18: `ageBand = '16_17'` (19, 14). If age ≥ 18: `'18_PLUS'`.
3. On iOS and Android, if the platform provides an age-range signal for the user (store age assurance APIs where available), it is requested once; a signal indicating under 16 overrides the declaration and refuses the account; a signal of 16–17 sets `16_17` even if the declaration said 18+. `method = 'STORE_AGE_SIGNAL'`.
4. The band moves from `16_17` to `18_PLUS` automatically on the 18th birthday month (job runs monthly). A player can never lower their band; raising it otherwise needs `VERIFIED`.
5. A credible report that a player is under 16 (V15) leads to a request to confirm age within 7 real days; without confirmation, the account is closed and its data deleted (§3.10.4), its character anonymized (19 Rule 3.14.4). Purchases made by a minor under 16 are refunded on request of a parent or guardian.

**Rule 3.9.3 (what changes for 16–17).** Spending cap (§3.11.7), forced strong-language mask and DM limits (§3.8.8), no marketing email unless consented and only after the age of digital consent in their country (16 in most EU member states; where a member state sets 13–15, 16 still applies because of the game's minimum), ads non-personalized (as for everyone, §3.14.8). Gameplay is identical: no rule of any engine module depends on age band (age enters the engine only for chat rules, 19 Rule 3.14.1).

**Rule 3.9.4 (guests).** Guest play is allowed (19, 15) after the age gate, for at most 30 minutes of play or until any P2P, contract, chat or purchase action (02 §5.1). Guests cannot buy in the Atelier and are not ad-eligible.

### §3.10 Privacy and data protection

**Rule 3.10.1 (roles).** The operator of the game is the data controller. Processors (hosting provider, email provider, crash reporting, ad network, web merchant of record) sign data-processing agreements and process data in the EU or under an approved transfer mechanism. PRIVACY_OFFICER keeps the records of processing.

**Rule 3.10.2 (data inventory and retention).**

| Data | Where (19) | Purpose and legal basis | Retention |
|---|---|---|---|
| Email, auth identifiers | `pii` schema, encrypted | account (contract) | account life + 30 days after deletion completes (fraud and chargeback window) |
| Age band, declared year-month | `pii` | legal obligation (age gate) | account life |
| IP and user-agent hashes | platform, rotated salts | security (legitimate interest) | 30 days (19 PARAM.ip_hash_salt_rotation_days) |
| Character, world history | engine, event store | contract (the game) | forever, pseudonymous; anonymized on deletion (19 Rule 3.14.4) |
| Chat messages | platform | contract | `PARAM.chat_retention_real_days = 90` (15), then deleted |
| Support tickets | platform | contract, legal claims | 2 years after closure |
| Purchases, invoices | commerce schema | legal obligation (tax) | 10 years (`DEFAULT`, the longest EU bookkeeping period used) |
| Ad views | platform | contract (reward) and fraud prevention | 90 days, then aggregated |
| Product analytics | ClickHouse, pseudonymous | consent (opt-in) | 13 months |
| Crash reports | error tracker | consent (opt-in) on native; legitimate interest on web for crashes without personal content | 90 days |
| Audit log | object-locked storage | legal claims, security | 10 years |
| Moderation records | platform | legal obligation (statements of reasons), legitimate interest | 2 years after the action ends |

**Rule 3.10.3 (consent).** First launch shows a privacy notice and a consent screen with equal-weight "Accept" and "Decline" for each optional purpose (product analytics, crash reports on native, marketing email, push). Declining changes nothing in gameplay. Consent is recorded per `ConsentRecord` with the text version, revocable in Settings › Privacy at any time with the same ease. No consent is bundled with Terms acceptance. There is no third-party advertising tracking anywhere, so no tracking-permission prompt is shown on iOS (`DEFAULT (Mathis may override)`, §3.14.8).

**Rule 3.10.4 (data-subject rights).** Export and deletion follow 19 Rule 3.14.3–3.14.4 (export within 30 days, deletion after a 14-day cancellable grace, anonymization of the world footprint). Rectification: email and declared age (upwards only) in settings; other personal data through a ticket. Objection to legitimate-interest processing (security hashes) is assessed by PRIVACY_OFFICER; game-integrity processing needed to protect other players continues where the balance of interests allows. Identity check: a request from a signed-in session is verified; email-only requests require a confirmation link to the account email.

**Rule 3.10.5 (breach handling).** A personal-data breach (security incident affecting PII) is an INC-1 or INC-2 with PRIVACY_OFFICER engaged; the supervisory authority is notified within 72 real hours of awareness when required; affected players are informed without undue delay when the risk is high, in EN and FR.

**Rule 3.10.6 (no leak of game privacy, L11).** Staff tools follow the same publication contract as the game: staff never publish or share a player's holdings, strategy or style; support replies never mention another player's private data; the integrity report aggregates (20 Rule 3.12.2).

### §3.11 Monetization principles and the cosmetics catalogue

**Rule 3.11.1 (the hard lines, L5, L7).** Real money may buy only cosmetic items and the premium track of the Chapter Pass. Real money never buys or influences: in-game money, assets, items with Prestige, rank, licenses, odds of any roll, defense, legal help, compute, data, information, time (no timers, speed-ups, tier skips, energy systems), board placement, matchmaking, or anything another player can perceive as power. No loot boxes, gacha, spins, chests, random paid rewards, mystery bundles or paid rerolls. No premium currency: every price is shown in the player's real currency.

**Rule 3.11.2 (what can be sold).** The Atelier sells items in the slots of `CosmeticSlot`:

| Slot | What it changes | Constraint |
|---|---|---|
| SHELL_STYLE | interface material style (17) | cannot imitate any rank shell's material; the rank chip always shows the true rank; labelled "Purchased" in the profile shell field (14 §3.5) |
| ESTATE_STYLE | furniture and decor style of the Estate view | never adds Prestige or display slots |
| AVATAR_OUTFIT | silhouette outfit | — |
| PROFILE_FRAME | profile card frame | earned frames (titles, Finals) are never sold and are visually distinct (brass seal mark) |
| NAMEPLATE | nameplate typography and color within 17 tokens | contrast rules of 17 still hold |
| CHART_THEME | chart colors within accessible palettes | never changes data, scales or indicators |
| DESKTOP_WALLPAPER | desktop wallpaper | — |
| SOUND_PACK | UI sounds | respects reduced-sound settings |
| TICKER_STYLE | ticker tape typography | — |
| CREST_PART | House crest parts (14 §3.15) | cosmetic only |
| TOWER_FACADE | facade skin for a crown tower the player has already earned (10) | never changes height, position or which towers exist; skyline order stays the leaderboard |
| STOREFRONT_SIGN | sign style of a player storefront (10) | the business must exist |
| CHAT_STICKER | chat stickers (structured chips, 15) | moderated set |
| RECAP_CARD_STYLE | chapter recap and share card style | the numbers on the card never change |

**Rule 3.11.3 (separation from in-game shopping).** The real-money store is named the **Atelier** (string key `app.atelier`). The in-game luxury shops that sell lifestyle items for in-game money keep the name **Boutique** (14 §3.6.2). `DEFAULT (Mathis may override)`: 17's app catalogue row 29, currently titled "Boutique", is the Atelier; the rename keeps real-money purchases unmistakable from in-game purchases (a store-compliance requirement, §3.15). Every Atelier price shows the real currency symbol and the store's price format; in-game prices always show the fictional `$` and never sit on the same screen as a real-money price.

**Rule 3.11.4 (no status from money).** Purchased items never count toward Prestige, titles, milestones, Reputation, Notoriety, NW, rank or any rule (14 AT 58, 20 INV-PRG-002), are never required to access any feature, and carry no rank requirement to display (a rank requirement would make money a status signal of rank). Display of earned status (rank shells, earned frames, titles, crown towers, Hall of Fame) is never purchasable.

**Rule 3.11.5 (ownership).** Cosmetics are account-level entitlements, usable on every platform the account plays on, never transferable, giftable, tradeable or sellable between players (`DEFAULT (Mathis may override)`: no gifting, to keep cosmetics out of real-money trading and alt funnels), and never converted to in-game money. Cosmetic display selections (which outfit, frame, shell style, facade is shown) are platform state (`account_cosmetic_loadout`, 19 §11) merged into profile read models and client rendering; the engine never stores cosmetic ids, purchases or entitlements. Interface requirement on 14: `Account.cosmeticsOwned`, and the cosmetic values of `AvatarSpec.outfitId`, `AvatarSpec.frameId` and the active cosmetic shell, live in the platform read model, not in engine state (earned items stay engine-side).

**Rule 3.11.6 (price tiers).** `DEFAULT (Mathis may override)`. Prices use the stores' standard price points nearest to:

| Tier | EUR | USD | Typical use |
|---|---|---|---|
| T1 | 0.99 | 0.99 | sticker set, single nameplate |
| T2 | 1.99 | 1.99 | frame, wallpaper, chart theme |
| T3 | 4.99 | 4.99 | outfit, sound pack, tower facade |
| T4 | 7.99 | 7.99 | Chapter Pass premium track |
| T5 | 9.99 | 9.99 | shell style, estate style |
| T6 | 14.99 | 14.99 | themed bundle (3–5 items) |

Bundle discounts are real (`discountShownPct` = 1 − bundle price / Σ item prices, rounded down to the nearest 5%) and never shown as fake "was" prices. No item is priced above T6. Prices are stable for at least one chapter; a price change is announced in patch notes.

**Rule 3.11.7 (spending limits and transparency).** Settings › Purchases shows every purchase with date, item and price, and the running total for the current month and the last 12 months. Any player may set a monthly limit (blocks purchases above it until the next month). Accounts in the 16_17 band have `PARAM.spend_cap_minor_monthly_16_17 = €50` (converted at store price points for other currencies; `DEFAULT`), which they can lower but not raise. No limit-raising prompt, no "you are close to your limit" upsell.

**Rule 3.11.8 (no dark patterns).** No countdown timers on Atelier offers except the Chapter Pass end date stated plainly; no "limited time" pressure badges; no confirm-shaming copy ("No thanks, I don't like nice things"); no pre-checked boxes; no notifications about the Atelier (no push, no in-game toast); the Atelier is never shown after a loss, a bust, a defeat in court, or a failed op; the Atelier has no badge counts. Purchase confirmation always uses the platform's own purchase sheet plus, on web, a one-screen summary with the total price.

### §3.12 The Chapter Pass

**Rule 3.12.1 (structure).** One pass per chapter, 50 tiers, a free track (cosmetics on roughly every second tier) and a premium track (cosmetics on every tier), premium priced at tier T4. All rewards are cosmetic items, cosmetic titles marked "Pass" (never titles that 14 grants for achievement), or Atelier credit never; there is no currency reward.

**Rule 3.12.2 (marks).** Tiers advance with chapter marks earned from play. Each tier needs `PARAM.pass_marks_per_tier = 100` marks (5,000 for tier 50). Mark sources, computed by the platform projector from engine events only (never from client claims):

| Source | Marks | Cap |
|---|---|---|
| GAME_DAY_ACTIVE: a game day in which the character had ≥ 1 accepted intent of an economic namespace (`mkt`, `bank`, `fund`, `biz`, `prop`, `lab`, `soc.contract`) | 10 | 12 game days per real day (120 marks) |
| ACADEMY_LESSON: first completion of a lesson (18) | 40 | — |
| WEEKLY_CHALLENGE_ENTRY: entering a server challenge (15) | 150 | 1 per week |
| TOURNAMENT_ENTRY: a model entered in the weekly AI tournament (11) | 150 | 1 per week |
| HOSTED_EVENT: hosting or attending a hosted event (14) | 25 | 2 per real day |
| MILESTONE: a 14 milestone reached | 75 | — |

**Rule 3.12.3 (catch-up, no grind pressure).** While `tierReached < floor(50 × daysElapsed / 56) − 5`, all marks count double. A player active about one real hour on most days finishes the premium track; a player who joins in week 6 can still finish with daily play. There are no daily streaks, no expiring daily tasks and no marks for logging in alone. COSMETIC_FESTIVAL events may add up to `PARAM.pass_festival_bonus_max = 0.25` bonus to marks for their duration.

**Rule 3.12.4 (no farming value).** Marks give only cosmetics, so farming them has no economic value. A mark source can never require spending in-game money beyond what the action costs anyway, and no mark source rewards a specific trade, op or contract outcome (no incentive to wash trade or collude). GAME_DAY_ACTIVE ignores intents that 20/15 later void as linked-account activity.

**Rule 3.12.5 (late purchase).** Buying premium mid-chapter grants every premium item for tiers already reached. Buying premium in the last 7 real days shows a plain note "The chapter ends on <date>. Tiers reached: N of 50." No tier skips are sold.

**Rule 3.12.6 (anti-FOMO return).** Premium pass items return to the Atelier for direct purchase `PARAM.pass_items_return_chapters = 2` chapters after their pass ends, at their slot's tier price. Free-track items return as free-track items in a later "Archive" pass tier set. Earned achievement cosmetics never return (they are not pass items).

### §3.13 Purchases, entitlements and refunds

**Rule 3.13.1 (storefronts).** iOS and Android purchases go through the platform stores' in-app purchase systems (19 Rule 3.17.6). Web purchases go through a merchant-of-record checkout (`DEFAULT (Mathis may override)`) that handles VAT, invoices and EU consumer law, embedded in the `(store)` route group of `apps/web` (19 Rule 3.17.1). Store-specific rules on steering and external links are followed per platform (§3.15).

**Rule 3.13.2 (flow).**
1. The client requests a purchase for `sku`; the commerce service creates a `Purchase` in PENDING with an idempotency key `(accountId, sku, clientNonce)`.
2. The storefront completes payment and returns a receipt or token.
3. The commerce service verifies it server-to-server with the storefront (never trusting the client), checks `storeTransactionId` uniqueness, applies the spending cap (§3.11.7; a purchase over the cap is refused before payment on web and, on stores, is refused at step 1 so the store sheet never opens).
4. On success: `Purchase.status = VERIFIED`, `Entitlement` rows are created, the client's `acct:entitlements` platform channel (served by the gateway from the platform, not by the engine) and `GET /api/v1/me/entitlements` reflect the change, and the client shows the item.
5. Store server notifications (refund, revoke, chargeback, renewal of nothing because nothing is a subscription) update the purchase and entitlements asynchronously.
6. Restore: on reinstall or a new device, entitlements come from the account, so no "restore purchases" is needed for logged-in players; the platform's restore call is still supported for store review.

**Rule 3.13.3 (structural isolation, L7).** Purchase code can never import the engine package (20 INV-STR-002, hard CI failure, `DEFAULT (Mathis may override)` as handed to this module). Commerce code lives only in `apps/web/store/**`, `apps/jobs/commerce/**` and `packages/platform/commerce/**`; it may import `platform`, `protocol` (types) and `i18n`. No `SystemInput` kind exists for purchases, entitlements or the pass (19 §4.3 has none and must never gain one). The world hosts hold no commerce credentials (20 INV-STR-004). Therefore no code path exists by which a purchase could change engine state.

**Rule 3.13.4 (refunds and chargebacks).** Store refunds follow the store's policy; on a refund notification the entitlement is revoked; if the item was in use, the loadout reverts to the default for that slot; pass premium refunds revoke premium items (free-track items stay). Web: refunds within the merchant of record's policy; a chargeback revokes the entitlements and blocks further purchases until resolved; a second chargeback within 12 months opens a V14 case. No refund ever touches in-game state, because none was created.

**Rule 3.13.5 (taxes and invoices).** Store prices include VAT where the store requires; web invoices come from the merchant of record. The game's operator never stores card data.

### §3.14 Rewarded ads (L12)

**Rule 3.14.1 (where ads exist).** Rewarded ads exist only in the online world, only in the native iOS and Android apps (`DEFAULT (Mathis may override)`: none on web or PWA, where rewarded inventory and verification are weaker), and never in the browser sandbox or Academy practice worlds. There are no interstitial, banner or forced ads anywhere.

**Rule 3.14.2 (eligibility, checked once at the start of the player's local day).** `DEFAULT (Mathis may override)`, resolving ROADMAP Q3 as option B. Mechanism:
1. **Wall-clock marks.** Every `PARAM.ad_clock_mark_minutes = 15` real minutes the coordinator seals a `sys.wallclock_mark { utcIso }` system input into the first tick after that instant (interface requested from 19, §4.3; deterministic in replay because it is an input).
2. **Local midnight.** Each character's timezone arrives through `sys.profile_change { timezone }` (19). The engine holds the IANA timezone rules as content data (22, versioned) and, on each wall-clock mark, finds characters whose local date changed since their last evaluation (`localDate(utcIso, tz) > AdDayState.localDate`).
3. **Evaluation (P12).** For each such character: `startOfDayNWReal = rankBasisNW / MSI` (14, 03); `eligibleToday = (account FULL) ∧ (account age ≥ PARAM.ad_min_account_age_hours = 24 real hours) ∧ (account status ACTIVE) ∧ (character not Held) ∧ (startOfDayNWReal < PARAM.ad_nw_line_real = $1,000)`; `grantsToday = 0`; `localDate` set; `evaluatedTick` set.
4. **During the day** the eligibility does not change with NW: a player who starts the day at $600 may watch all 10 ads even after crossing $1,000 (up to $2,500, landing at ≤ $3,500 real). A player who starts the day at $1,000 or more is not eligible that day even if NW falls below $1,000 later; the offer appears next local day if NW is still under the line at midnight.
5. **Timezone changes** apply to ad days only if at least `PARAM.ad_min_hours_between_days = 20` real hours have passed since the last evaluation, and a timezone change is accepted by 19/14 at most once per `PARAM.tz_change_cooldown_days = 30` real days. Device clocks are irrelevant (server time only).

**Rule 3.14.3 (the grant).**
1. The player taps the offer (velvet spec: low-cash card or More › "Earn $250"); the client asks the platform for an ad session; the platform checks the mirrored `AdDayState` (`eligibleToday ∧ grantsToday < 10`) and creates an `AdView`.
2. The ad network shows the ad in its own full-screen player. On completion the network calls the platform's server-side verification endpoint with a signed callback containing the ad session id. The client's own "completed" message is never sufficient.
3. The platform verifies the signature, the session's uniqueness and age (≤ `PARAM.ad_callback_max_age_minutes = 30`), then submits `sys.ad_grant { characterId, receiptId, amount }` (19 §4.3).
4. The engine at P1 re-checks `eligibleToday`, `grantsToday < PARAM.ad_max_per_local_day = 10`, the character not Held, and `receiptId` never used; on success in P12 it posts `ACCT_REWARDED_AD` (FAUCET, 03's code; `AD_GRANT` is the restricted-cash lot tag; ruling in 24) of `amount = PARAM.ad_grant_real = $250 × MSI(tick)`, creates a `RestrictedCashLot { reason: 'AD_GRANT', restrictedUntilTick: tick + 51,840 }` (72 real hours; 14 `RestrictedCashLot`, ROADMAP C5), increments `grantsToday` and emits a PRIVATE event. On failure the grant is refused with a code (`AD_NOT_ELIGIBLE`, `AD_DAILY_CAP`, `AD_HELD`, `AD_DUPLICATE_RECEIPT`) and the player sees "This ad didn't earn cash: <reason>."
5. At MSI 1.0 (launch) the grant is exactly $250 and the line exactly $1,000, as L12 states. `DEFAULT (Mathis may override)`: both are indexed by MSI like every other "real dollar" threshold of 14, so the rule keeps its meaning in a world that never resets.

**Rule 3.14.4 (amount is fixed).** The reward is a constant, never a spin, chest, multiplier, "double it" offer or random amount (L5, L7, 20 INV-STR-010).

**Rule 3.14.5 (ordering with the Fresh Start).** When a character is under the line, the low-cash card offers the Fresh Start first (if available, 14 §3.13), ads second, "Keep trading" third (velvet bankruptcy spec). Both can be used in the same episode, each once per its own rule.

**Rule 3.14.6 (restricted uses for 72 real hours).** While any `AD_GRANT` lot is unexpired, spending is FIFO over lots and the lot's cash cannot pay for: cyber or espionage ops and intelligence purchases (12), insider actions (13), margin, leverage or derivatives premium and margin (06, 07), P2P transfers, gifts, contract payments and alliance contributions (15). It can pay for spot trades in licensed cash products, T1–T2 businesses and their upgrades (09), lifestyle items (14) and fees. An order that would use restricted cash for a blocked use is refused with `RESTRICTED_CASH_USE` and the ticket shows the reason (velvet spec). Unrestricted cash is used first for blocked uses.

**Rule 3.14.7 (anti-abuse).** Guests are never eligible (anti-alt). Accounts flagged `ALT_SUSPECT` by 15 with link score ≥ 0.8 to an eligible account are ineligible. Ad cash cannot flow to other players during the window (Rule 3.14.6), and after the window it is ordinary cash subject to 15's P2P caps. Ad views from emulators, rooted devices or network-flagged invalid traffic (as the network reports) are `REJECTED_FRAUD`; repeated fraud flags open a V04/V14 case.

**Rule 3.14.8 (privacy and ad content).** `DEFAULT (Mathis may override)`: ads are requested in non-personalized, contextual mode only, for every player, with no advertising identifier collected and therefore no tracking-permission prompt on iOS; the ad network receives only what is needed to serve and verify the ad. Blocked ad categories: gambling and betting, real-money trading and investing apps, crypto exchanges, dating, alcohol, tobacco and vaping, weapons, political, mature content. 16_17 accounts additionally get the network's teen-appropriate settings.

**Rule 3.14.9 (faucet budget).** Worst case per character: 10 × $250 real per local day ≈ $0.9M real per year, negligible against the wealth curve (ROADMAP §2.7). World level: `ACCT_REWARDED_AD` is tracked under its own reason code; an alert fires when the day's `AD_GRANT` total exceeds `PARAM.ad_faucet_alert_share = 0.0001` of the day's net mint (20 INV-LED-011, FAU.ad_faucet_share).

**Rule 3.14.10 (privacy of ad use).** Ad views are never shown to other players, never affect boards, and never appear in public profiles or the integrity report except as a world total (20 §2.8).

**Rule 3.14.11 (network choice needs Mathis's yes).** The ad network must meet: (R1) signed server-side reward verification; (R2) non-personalized mode; (R3) category blocking per Rule 3.14.8; (R4) a data-processing agreement with EU processing or an approved transfer basis; (R5) no precise location collection; (R6) user-initiated rewarded format only; (R7) teen-appropriate settings; (R8) store-policy compliance on both platforms. Selecting the network and confirming the "no tracking" default is an item in 24 that needs Mathis's explicit yes before ads launch (bible PART VI #10).

### §3.15 Store and platform compliance

**Rule 3.15.1 (age rating answers).** The game targets 16+ (L5). Rating questionnaires (the stores' and the international age-rating coalition questionnaire used by Google Play and others) are answered honestly:

| Question area | Answer | Why |
|---|---|---|
| Violence, blood, fear | none | crime is abstract corporate-thriller verbs (12) |
| Sexual content, nudity | none | — |
| Language | mild (player chat may contain strong language, masked by default) | 15, §3.8 |
| Controlled substances | none | vice businesses are out (L10) |
| Gambling: real-money gambling | no | no cash-out exists (L5) |
| Simulated gambling | **no** | no casino games, no chance-based purchases, no betting on events (prediction markets are out, L10); financial markets with risk are simulation of investing, not gambling; reward amounts are fixed |
| Loot boxes / random paid items | **no** | Rule 3.11.1 |
| In-app purchases | yes (cosmetics) | — |
| User interaction (chat) | yes, moderated | §3.8 |
| Shares location | no | — |
| Digital purchases disclosure | yes | — |
| Themes | crime and hacking as abstract game mechanics; financial risk | rating boards may still assign a lower age than 16; the store age setting is set to the 16+ level or the nearest higher one, and the in-app age gate enforces 16 regardless |

**Rule 3.15.2 (pre-submission checklist, ROADMAP M51, Risk R6).** Before every store submission COMMERCE_OPS and TM_LEAD sign a checklist, each item tested: (1) no random paid reward anywhere (20 INV-STR-010); (2) no casino visuals or "double or nothing" UI (17 audit); (3) ad cash barred from margin and derivatives (20 FAU.restricted_use); (4) disclaimers present in app and listing (§3.16.1); (5) account deletion reachable inside the app in ≤ 3 taps from Settings (store requirement; 19 Rule 3.14.4); (6) Sign in with Apple offered on iOS wherever other social logins are (02 §5.1); (7) privacy nutrition labels and data-safety forms match §3.10.2 (no tracking, no data sold); (8) purchases use the store's in-app purchase system for digital goods on that store; any link to web purchase follows the current rules for that store and region exactly; (9) restore purchases works; (10) the app functions without purchases; (11) user-generated content has report, block and moderation (store UGC rules); (12) no real brand names (20 INV-STR-009); (13) age gate present before gameplay; (14) a demo account and review notes for store reviewers that explain the simulated market and the abstract crime theme.

**Rule 3.15.3 (financial-services distance).** Store listings and the app state that the game is a simulation with fictional companies and currencies, that nothing is financial advice, and that no real money can be won or withdrawn. The app never links to real brokers or exchanges, never shows real tickers (L6), and ads for trading or investing products are blocked (Rule 3.14.8).

**Rule 3.15.4 (accessibility of commerce).** The Atelier, checkout and purchase history meet WCAG 2.1 AA (17) and the European Accessibility Act requirements for e-commerce services: keyboard and screen-reader operable, clear price and total before confirming, accessible error messages.

### §3.16 Legal texts, disclaimers and consumer law

**Rule 3.16.1 (disclaimers, exact strings, EN and FR).**
- Broker footer and Settings › About: "Simulated market. Not financial advice." / "Marché simulé. Ceci n'est pas un conseil financier."
- Settings › About and store listing: "No real money can be won or withdrawn." / "Aucun argent réel ne peut être gagné ni retiré."
- Atelier header: "Cosmetics only. Nothing here changes money, rank, Prestige or odds." / "Uniquement cosmétique. Rien ici ne change l'argent, le rang, le Prestige ni les probabilités."
- Ad offer note (velvet spec): "Ad cash can't pay for ops, insider actions, margin or transfers for 72 h." / "L'argent des pubs ne peut pas payer d'opérations, d'actions d'initié, de marge ni de transferts pendant 72 h."
The French list of banned advice words used by 20 UX.no_advice_words: "vous devriez", "garanti", "sans risque", "achetez maintenant", "impossible de perdre".

**Rule 3.16.2 (documents).** Terms of Service, Privacy Policy, Cookie notice (web), Community Rules (the violation codes of §3.7.1 in plain words), Atelier Terms, Ad notice. Each in EN and FR, versioned (`LegalDocVersion`), with a change log. Material changes require re-acceptance at next login with a summary of what changed; non-material changes are notified in Settings › About. The Terms state: in-game money and items have no real-world value, cannot be sold or exchanged for money (V05), and are a licence, not property; the world is persistent and the operator may change rules with notice (§3.4); account enforcement and appeals (§3.7).

**Rule 3.16.3 (governing law).** `DEFAULT (Mathis may override)`: the operator's EU establishment's law, without removing mandatory consumer protections of the player's country of residence.

**Rule 3.16.4 (EU right of withdrawal).** For web purchases, the checkout asks for express consent to immediate delivery and acknowledgement that the 14-day right of withdrawal is lost once the item is delivered; without that consent the item is delivered after 14 days. Store purchases follow the store's refund system.

**Rule 3.16.5 (no advice, no solicitation).** Staff communications, Academy texts (18), patch notes and support replies never recommend real-world investments or name real financial products.

### §3.17 Incident management and status

**Rule 3.17.1 (levels).** Not to be confused with the crime severity scale S1–S6 (13).

| Level | Definition | Page | Public status update | Postmortem |
|---|---|---|---|---|
| INC-1 | world halted unplanned; shadow-verifier mismatch; data breach with high risk; money created outside reason codes; any CRITICAL Finding being exploited live | immediately, 24/7, incident commander + TM_LEAD | within 15 real minutes, then every 30 | public summary within 7 real days |
| INC-2 | a module kill switch thrown; partition recovery > 60 s; payment or ad verification outage > 30 min; audit-log chain gap | immediately | within 30 real minutes | internal, public summary if players were affected |
| INC-3 | degraded latency (tick p99 > 3.5 s for > 10 min), shadow lag > 2 game days, moderation backlog > 24 h | business hours, or immediately at night if sustained 1 h | if visible to players | internal |
| INC-4 | minor defects | ticket | no | no |

**Rule 3.17.2 (status page and in-game notices).** A public status page (outside the game infrastructure) shows world status, gateway, login, purchases and ads. In game, notices are diegetic Exchange notices on the Wire and the halt overlay (17).

**Rule 3.17.3 (postmortems).** Blameless; include timeline in ticks and real time, cause, detection path (invariant, shadow, monitor, player report), impact (characters, value), compensation plan, RegressionCases added (20), follow-ups with owners.

### §3.18 Hosting and data residency

**Rule 3.18.1 (EU hosting).** `DEFAULT (Mathis may override)`, resolving ROADMAP Q7 and old 02 Q7 together with 19 Rule 3.13.4, which owns the infrastructure (ruling in 24): alpha on one dedicated EU server plus managed S3-compatible object storage and a CDN; from open beta a container platform in one primary EU region across three availability zones, with a disaster-recovery copy in a second EU region. 21's compliance requirement is that every component holding personal data (world, gateways, databases, bus, object storage, harness) stays in the EU; the CDN in front of static assets and city chunks may serve globally but holds no personal data. The cost benchmark of 19 §3.13 precedes alpha.

**Rule 3.18.2 (latency).** Global players are served from the EU site: with a 5-second batch tick and batch-uniform ordering (19), round-trip latency gives no advantage, so no regional game servers are needed (fairness, 00 §5.5). Gateways may later be added at the edge in other regions as pure relays (no state, no ordering role), which 19 permits.

**Rule 3.18.3 (backups and recovery).** Intents are durable on the replicated bus before acknowledgement (19); snapshots and intent archives replicate to the standby site within `PARAM.dr_replication_lag_max_minutes = 5`; recovery point objective for committed ticks: 0 ticks lost; recovery time objective for a site loss: `PARAM.dr_rto_minutes = 60`. A restore drill runs every chapter (20 G4 restore drill).

**Rule 3.18.4 (personal data location).** The `pii` schema and commerce data stay in the EU sites. Processors outside the EU are used only under an approved transfer mechanism recorded by PRIVACY_OFFICER.

### §3.19 Player communications

**Rule 3.19.1 (channels).** In-game Wire Exchange notices (patches, maintenance, live events), the bell (17), push notifications (opt-in), email (account and security always; news only with consent), the status page, and official community channels.

**Rule 3.19.2 (push limits).** At most `PARAM.push_cap_per_real_day = 5` per character, none in quiet hours (default 22:00–08:00 local, editable), never for the Atelier or ads, never "come back" nags; live-event pushes only for events the player opted into (15, 19 Rule 3.17.5).

**Rule 3.19.3 (no punishing absence).** No login streaks, no daily rewards that break, no "your empire is in danger" messages that are not true game alerts (old 04 §11.3). A returning player sees "While You Were Away" (02 §3.5).

### §3.20 Live-ops analytics and player health

**Rule 3.20.1 (what is measured).** With consent (§3.10.3), pseudonymous product analytics: sessions, screens opened, onboarding funnel (18), feature adoption, retention cohorts, Atelier conversion (aggregate), ad offer acceptance (aggregate), support contact rate. Game-state analytics come from the event store (no consent needed for game operation, pseudonymous, never used for marketing).

**Rule 3.20.2 (health metrics with targets).** Reviewed weekly by LIVE_OPS with 20's live monitors:

| Metric | Target |
|---|---|
| Share of revenue from the top 1% of spenders | reported; if > 50% for 2 chapters, review pricing for whale-dependence (`DEFAULT`) |
| 16_17 accounts reaching the spend cap | reported; if > 5%, review |
| Players with real-time play > 8 h per real day for 7 consecutive days | reported; triggers the optional "Take a break?" reminder setting being offered to them once (never forced) |
| Support first-response within targets | ≥ 90% |
| Moderation V16/V17 within 1 h | ≥ 95% |
| Appeals reversed | 5–25% (outside the band means decisions are too harsh or appeals rubber-stamped) |

**Rule 3.20.3 (no manipulation by data).** Analytics never drive per-player price changes, personalized offers, or targeting of "high spenders". Prices are the same for everyone in a currency.

### §3.21 Sandbox and offline policy

All `DEFAULT (Mathis may override)`, as handed to 20 and 21; 20 §3.15 holds the verification rules.
1. **Solo sandbox progress never carries over online** (resolves ROADMAP Q4). Sandbox money, assets, ranks, titles, research and records stay in the sandbox. Academy completion flags and sandbox-only badges stay account records visible in the Academy (19 Rule 3.17.4). Atelier cosmetics are account entitlements and appear in both.
2. **No ranked solo play.** No board, ladder, league, tournament or Hall of Fame accepts sandbox results (resolves Q5 with Risk R1).
3. **Weekly challenges are server-only**, as is the weekly AI tournament, with committed seeds revealed after results (20 §3.10.1).
4. **Held is off in the sandbox and in practice worlds** (resolves Q8 as option B; 13 §3.10 owns the rule; 19 Rule 3.17.4 agrees; ruling in 24). Verdicts there apply fines, op bans and the record only.
5. **No ads and no purchases inside the sandbox flow**; the Atelier remains reachable from the account menu.
6. Run files exported from the sandbox are for replay and bug reports only (20 Rule 3.10.5).

---

## §4 Player intents

Player-facing actions in this module are mostly platform HTTP actions (not engine intents, because they must not touch engine state). The few engine-relevant ones arrive as `sys.*` inputs from the platform.

### §4.1 Platform actions (HTTP, `apps/web` route handlers)

| Action | Payload | Validation | Effect |
|---|---|---|---|
| Age gate submit | `{ birthYearMonth }` | well-formed; computes band; store signal check | creates account or refuses (§3.9) |
| Consent update | `{ purpose, granted }` | signed-in or device session | `ConsentRecord` |
| Accept legal version | `{ docId, version }` | version is current | acceptance recorded |
| Atelier: start purchase | `{ sku, storefront, clientNonce }` | FULL account; not BANNED/SUSPENDED; spend cap; sku on sale; not already owned (non-consumable) | Purchase PENDING; store sheet opens (§3.13.2) |
| Atelier: confirm receipt | `{ purchaseId, receipt }` | server verification | Entitlement granted |
| Set loadout | `{ slot, itemId \| null }` | item owned (or earned and exported by 14 events) | `account_cosmetic_loadout` updated; profile read model refreshed |
| Set monthly spend limit | `{ capMinor \| null }` | 16_17 cannot raise above the band cap | SpendState cap |
| Request ad session | `{ characterId }` | native app; mirrored `AdDayState.eligibleToday ∧ grantsToday < 10`; not Held; account FULL | AdView created; ad shown |
| Ad network callback (server-to-server) | network-signed body | signature, session unique, age ≤ 30 min | `sys.ad_grant` submitted (§3.14.3) |
| Open support ticket | `{ category, subject, body, attachments?, tickRange? }` | ≤ `PARAM.support_tickets_per_day = 5`; attachments scanned | SupportTicket |
| Report content | `{ targetKind, targetId, reason, note? }` | ≤ 20 per day; target visible to reporter | ModerationReport |
| Appeal | `{ decisionId, text }` | within 30 days; one per decision | ticket category APPEAL; case APPEALED |
| Privacy request | `{ kind }` | identity check | PrivacyRequest (§3.10.4) |

### §4.2 Engine inputs used by this module

`sys.ad_grant`, `sys.account_status`, `sys.profile_change` (timezone), `sys.param_change`, `sys.content_change`, `sys.engine_upgrade`, `adm.halt_world`, `adm.resume_world`, `adm.halt_market`, `adm.resume_market`, `adm.compensate`, `adm.clawback`, `adm.freeze_character`, `adm.inject_event`, `adm.cancel_event`, `adm.snapshot` (all shapes per 19 §4.3), plus one requested addition: `sys.wallclock_mark { utcIso }` sealed every 15 real minutes by COORD (Rule 3.14.2). Engine reject codes owned here: `AD_NOT_ELIGIBLE`, `AD_DAILY_CAP`, `AD_HELD`, `AD_DUPLICATE_RECEIPT`, `RESTRICTED_CASH_USE` (validated by the owning module of the blocked use), `SYS_MODULE_PAUSED`, `MOD_NAME_REFUSED`.

Reason codes this module requires in 03's table: `ACCT_REWARDED_AD` (FAUCET; called `AD_GRANT` in older text, which remains only the restricted-cash lot tag), `ADM_COMPENSATION` (FAUCET), `ADM_CLAWBACK` (SINK), `ADM_TRANSFER_REVERSAL` (TRANSFER).

---

## §5 Engine events

| Kind | Visibility | When | Payload |
|---|---|---|---|
| `liveops.ad.granted` | PRIVATE | ad grant posted | `{ characterId, amount, lotId, grantsToday, restrictedUntilTick }` |
| `liveops.ad.refused` | PRIVATE | grant refused at P1 | `{ characterId, code }` |
| `liveops.ad.day_evaluated` | PRIVATE | local-day evaluation | `{ characterId, localDate, eligibleToday }` (drives the client offer and the platform mirror) |
| `liveops.compensated` | PRIVATE | `adm.compensate` posted | `{ characterId, amount, incidentRef }` |
| `liveops.clawed_back` | PRIVATE | `adm.clawback` posted | `{ characterId, amount, scheduleRemaining, reasonCategory }` |
| `liveops.exchange_notice` | PUBLIC | patch, maintenance, live event announcements | `{ noticeKey, params, effectiveTick? }` (Wire, 16 template `NEWS_EXCHANGE_NOTICE`) |
| `liveops.module_paused` / `liveops.module_resumed` | PUBLIC | kill switch | `{ module, reasonCategory }` |
| `liveops.event.started` / `liveops.event.ended` | PUBLIC | live events with world effect | `{ eventId, type }` |
| `liveops.account_frozen` | PARTIES (the character) | `sys.account_status` SUSPENDED/BANNED | `{ characterId, status }` |

Platform-only records (never engine events): purchases, entitlements, pass progress, moderation actions, tickets, approvals, audit entries.

---

## §6 NPC behaviour

NPCs do not use this module. Constraints: NPCs never receive compensation or clawback; NPC names are on the moderation reserved list; live events never script an NPC actor's decision (16 decides); staff cannot direct NPC actors.

---

## §7 Screens

Player-facing (layouts in 17):
- **Atelier** (17 app 29, renamed per Rule 3.11.3): tabs Featured (no timers), Shells, Estate, Avatar, Profile, Desktop and Sound, City (facades, signs), Chapter Pass, Owned; item preview on the player's own profile and desktop; price in real currency; header disclaimer; Purchases history link.
- **Chapter Pass**: 50-tier track, free and premium rows, marks progress, mark sources list with caps, catch-up indicator ("Double marks active"), end date.
- **Settings › Purchases**: history, monthly totals, spend limit.
- **Settings › Privacy**: consents, export, deletion (in ≤ 3 taps), legal documents.
- **Low-cash card and More › Earn $250** (velvet spec): offer row with "N of 10 today", restriction note, toasts; the `AD` pill on restricted cash.
- **Help › Report a problem**: categories, attachments (run file), status of my tickets.
- **Report sheet** on every player-authored item; **statement of reasons** message; **Appeal** form.
- **Age gate**, **consent screen**, **legal re-acceptance** sheet.
- **System overlay** for world halts and **Exchange notices** on the Wire.

Internal (admin console modules):
- **PLAYERS**: search by handle, character id, account id (email search only for SUPPORT/PRIVACY with a ticket); character overview (public, private with ticket), ledger viewer (postings by reason), event history, replay launcher (19 replay API), linked-account view (15), enforcement history.
- **APPROVALS**: pending requests with payload diff and plain-language rendering, approve/reject with hardware key.
- **WORLD**: world status, halt/resume, market halts, module kill switches, partition health (19), param and content change composer with 23/22 range checks and 20 diff-run results.
- **LIVE OPS**: chapter calendar, event composer (template picker from 16/15), notice composer (EN/FR), patch planner.
- **SUPPORT**: queue, ticket view, macros, compensation plan builder (C1 schedule; C2/C3 with counterfactual run from 20).
- **INTEGRITY**: anti-cheat cases (15 signals), Finding exposure lists (20), enforcement case builder, shadow pools.
- **MODERATION**: report queue, content view with context, actions, filter rules editor (lead), appeals.
- **COMMERCE**: catalogue, prices, pass builder, refunds, chargebacks, spend metrics.
- **ADS**: eligibility and grant metrics, fraud flags, network status.
- **PRIVACY**: requests, retention jobs, breach register.
- **TRUTH** (20 §7): dashboard, cases, harness console.
- **AUDIT**: audit log viewer with chain verification.

---

## §8 Edge cases

1. **Ad completes just after local midnight** for a session started before it. The grant is evaluated against the `AdDayState` current when `sys.ad_grant` is validated (the new day). If the new day is ineligible, the grant is refused with `AD_NOT_ELIGIBLE` and the player sees why; the ad session is not retried.
2. **Two devices watch ads at once.** Both callbacks arrive; P1 processes them in canonical order; the 11th in a day is refused (`AD_DAILY_CAP`). The platform also refuses to open a new ad session while `grantsToday + openSessions ≥ 10`.
3. **DST transitions.** A 23-hour or 25-hour local day is still one ad day; the 20-hour minimum between evaluations holds on both.
4. **Timezones with 30- or 45-minute offsets.** Covered by the 15-minute wall-clock marks.
5. **World halt over local midnight.** No tick runs, so the evaluation happens at the first wall-clock mark after resume; it uses NW at that tick (still the start of the player's local day in game terms because no tick ran in between).
6. **Character goes Held after watching 3 ads.** Further grants are refused while Held (`AD_HELD`); the day's count is kept; restricted lots keep their windows (extended by world halts only, not by Held).
7. **Account deletion with restricted lots or a clawback schedule.** Deletion proceeds; the character is anonymized; outstanding platform claims are written off (they were game-internal).
8. **Refund of a pass after items were used** in a recap card already shared: the shared image stays (it is the player's own export); the item is removed from the loadout.
9. **Purchase verified while the account is banned in between.** Purchases are refused at start for BANNED or SUSPENDED accounts; a purchase completing during a ban is refunded through the storefront's refund route.
10. **Purchase in a currency the store converts.** The `Purchase.price` stores the store-reported amount and currency; spend caps compare in the account's primary currency using the store's reported value.
11. **Compensation for a character that is now dormant or banned.** Compensation is posted anyway (the defect happened); a banned character's compensation stays on the frozen character.
12. **Clawback would push a character below the Fresh Start line.** The clawback stops at the line and the remainder goes onto the income-share schedule (Rule 3.6.6).
13. **A defect is found that benefited one player at another's expense** (e.g., a wrong fill). The fix is a pair: `ADM_TRANSFER_REVERSAL` from the beneficiary to the harmed party, not a faucet plus a sink, so M0 is unchanged.
14. **A live event's start time lands inside a world halt.** The event shifts by the halt duration (Rule 3.3.2); announced end times shift equally; the Wire posts the new times.
15. **A RULES patch fails its G5 diff run a week before the boundary.** The patch is postponed to the next boundary; the boundary proceeds without it; patch notes say so.
16. **Under-16 discovered after purchases.** Account closed and data deleted; refunds to the guardian on request; the world footprint anonymized.
17. **Player in a country where a store forbids a feature** (for example a store's regional rules on external purchase links). The web checkout link is hidden on that store and region; the Atelier works through the store system.
18. **Moderator is also a player in the reported conversation.** The admin app refuses the action (Rule 3.1.4) and routes the report to another moderator.
19. **Name blocked as a real brand but is a common word** (e.g., an everyday noun that is also a brand). The block list uses whole-token matches with an allow-list of common words maintained by MODERATION_LEAD; a refused player may ask for review through Help.
20. **Ad network outage.** The offer row is hidden (velvet: ineligible rows are not shown); no partial grants; INC-2 if verification is down > 30 minutes while sessions are open (those sessions' callbacks are honoured up to `PARAM.ad_callback_max_age_minutes` after recovery).

---

## §9 Exploits and counters

| # | Exploit | Counter |
|---|---|---|
| X1 | A staff member mints money or edits a balance for a friend | no such function exists; compensation needs two approvers, a ticket and (C2+) a replay counterfactual; staff cannot act on linked characters; audit chain published daily (Rules 3.1.4, 3.1.5, 3.2.5) |
| X2 | A staff member leaks a whale's holdings | just-in-time access with ticket, logged; access windows expire; publication contract applies to staff (Rules 3.1.3, 3.10.6) |
| X3 | Ad timing tricks (timezone hopping, device clock, NW dumping before midnight to qualify) | server time only; tz change cooldown 30 days and 20-hour minimum between ad days; NW dumping to qualify costs far more than $2,500 real per day and is caught by 20 H15 bands; dumped value moved to an alt is P2P-capped and linked-account-voided (Rule 3.14.2, 15) |
| X4 | Alt farms of ad-eligible accounts funnelling ad cash to a main | restricted 72 h, no P2P during the window, guests ineligible, account age ≥ 24 h, ALT_SUSPECT ineligible, P2P caps after the window (Rules 3.14.6–3.14.7) |
| X5 | Fake ad completions | server-side signed callbacks only; receipt uniqueness checked in P1 (Rule 3.14.3) |
| X6 | Buying power with money via a backdoor (a cosmetic that changes information, an Atelier item that affects rules) | slot table forbids it; INV-STR-002..004 structural isolation; 14 AT 58 replay identity; review by TM_LEAD for every new slot (Rules 3.11.2, 3.13.3) |
| X7 | Real-money trading of in-game cash or accounts | no gifting, no cash-out, V05/V06 sanctions, P2P caps on new accounts, RMT text blocked in chat (Rules 3.7.1, 3.8.2, 3.11.5) |
| X8 | Pass mark farming through wash trades or colluding contracts | marks come only from coarse activity with caps, never from trade outcomes; voided linked activity gives no marks; marks give only cosmetics (Rule 3.12.4) |
| X9 | Chargeback after using a purchased item | entitlement revoked; second chargeback opens V14; nothing in-game was created (Rule 3.13.4) |
| X10 | Mass-report brigading of a rival | priority uses distinct reporters with diminishing weight; low-accuracy reporters lose priority; human review before any action above a mute (Rule 3.8.4) |
| X11 | Filter evasion with look-alike characters | normalization step (Rule 3.8.2); classifier hold; reports |
| X12 | Using an appeal to delay an estate auction indefinitely | one appeal per decision, 30-day window, 7-day review target (Rule 3.7.6) |
| X13 | Exploiting a world halt to dodge a margin call or a protection expiry | real-time windows extend by the halt; nothing accrues or expires during a halt; standing orders follow 05's reopen rules (Rule 3.3.2) |
| X14 | Gaming a patch announced 48 h ahead (front-running a balance change) | changes affect rules, not prices directly; parameter steps are capped (Rule 3.4.3); the most consequential changes are RULES at chapter boundaries with 14 days' notice, so everyone has the same information |
| X15 | Getting compensated for ordinary losses by claiming a "bug" | compensation only for defects reproduced by 20 (RegressionCase); C2+ amounts come from the counterfactual, not from the claim (Rule 3.6.3–3.6.4) |
| X16 | Minors circumventing the age gate | neutral gate with no hint, retry block, store age signals, reports and V15 process (Rule 3.9.2) |

---

## §10 Acceptance tests

1. The admin app exposes no function that sets a balance, price, odds, rank or Prestige, or reads SEALED evidence; a scan of its API surface and the `adm.*` registry (19 §4.3) finds none.
2. An `adm.compensate` input with one approval is rejected at P1; with two approvals from the same person it is rejected; with two different eligible approvers it posts `ADM_COMPENSATION` and a PRIVATE event.
3. Editing an ApprovalRequest payload after one approval voids that approval (the request returns to zero approvals).
4. A staff member's attempt to view or act on their own declared account, their alliance, or a character with link score ≥ 0.5 to them is refused and logged.
5. The audit log chain verifies from genesis; removing or editing any entry breaks verification at that entry; the daily chain head appears in the integrity bulletin.
6. `adm.halt_market` by one ONCALL engineer halts the asset and auto-resumes after 60 real minutes unless a second approver confirms.
7. During a 20-minute world halt, no tick commits, and every real-time window (Held, protection, restricted cash, ad local day evaluation) of every character is extended by exactly the halt duration rounded up to whole ticks.
8. A BALANCE patch with an `effectiveTick` that is not a day close, or announced less than 48 real hours ahead, cannot be approved; a RULES patch cannot take effect except at a chapter boundary.
9. No patch class changes any committed tick: replaying the production log across a patch boundary with the old engine up to `effectiveTick − 1` and the new engine afterwards reproduces production hashes (20 Rule 3.3.6).
10. `adm.inject_event` with a template not flagged `liveOpsSchedulable` is rejected; staff cannot schedule a natural major crisis.
11. A C2 compensation plan cannot be approved without an attached 20 counterfactual HarnessRun; its per-character amounts equal the run's `Δ_c` to the micro-unit.
12. A clawback of $50,000 real from a character with $8,000 cash takes the cash down to the Fresh Start line at most and schedules the remainder at 30% of daily income; no liquidation is triggered.
13. A wrong-fill correction between two players posts as `ADM_TRANSFER_REVERSAL` and leaves M0 unchanged (20 INV-LED-003).
14. A TEMP_BAN or BAN decision cannot be recorded without a statement of reasons; the player receives it in EN or FR per their locale; an appeal filed within 30 days is reviewed by a different staff member.
15. A chat message containing an email address, a phone number, an external link or a listed real brand name is not delivered and the author sees the category; a message scoring above 0.85 on the classifier is visible only to its author until reviewed.
16. A handle or company name matching a reserved name, a slur after normalization, or a real brand is refused with `MOD_NAME_REFUSED` and never reaches a tick.
17. 16_17 accounts cannot turn off the strong-language mask, cannot receive DMs from non-followed non-alliance players, and cannot raise their monthly spend cap above €50.
18. The age gate refuses a declared age under 16 without creating an account or storing personal data; a store age signal under 16 overrides a declared 18+.
19. An export request delivers a complete archive within 30 real days; a deletion request completes after the 14-day grace with PII removed and the character anonymized (19 Rule 3.14.4).
20. Optional consents default to off; declining every optional consent leaves gameplay identical (replay of a scripted session with and without consent yields the same world hashes).
21. The Atelier never shows a timer other than the Chapter Pass end date, never shows on the screens following a loss, bust, court loss or failed op, and no push or toast ever advertises it (e2e over a scripted session).
22. No Atelier item has a random content, a rank requirement or a Prestige value; every Atelier and premium item displays "Purchased" where 14 and 17 require.
23. The module graph has no path from any commerce path to `packages/engine` (20 INV-STR-002); the world hosts have no commerce credentials; no `sys.*` or `adm.*` kind references purchases, entitlements or the pass.
24. Buying a cosmetic shell, outfit or facade, equipping it and replaying the world log gives identical engine hashes to the same log without the purchase (14 AT 58).
25. A purchase is granted only after server-side receipt verification; a replayed receipt (same `storeTransactionId`) grants nothing; a store refund notification revokes the entitlement and reverts the loadout.
26. Pass marks are computed only from engine events; a client cannot add marks; GAME_DAY_ACTIVE never exceeds 120 marks per real day; catch-up doubling applies exactly while `tierReached < floor(50 × daysElapsed/56) − 5`.
27. Buying the premium pass at tier 30 immediately grants the 30 premium items already reached; no tier-skip SKU exists.
28. Ad eligibility is evaluated once per local day at the first wall-clock mark after local midnight; a character whose start-of-day NW is $600 real can receive 10 grants that day even after reaching $1,800; a character at $1,000 at midnight gets none that day.
29. Every ad grant is exactly $250 × MSI, tagged `AD_GRANT`, creates a restricted lot of 51,840 ticks, and requires a verified network callback; a client-only completion message grants nothing.
30. With restricted ad cash unspent, an order to open a margin position, buy an option, pay a P2P transfer, contribute to an alliance or launch an op is refused with `RESTRICTED_CASH_USE` unless unrestricted cash covers it; a spot equity purchase and a T1 business purchase succeed.
31. Guests, accounts younger than 24 real hours, Held characters and suspended accounts are never offered an ad and are refused if a grant arrives.
32. Changing timezone twice within 30 real days is refused; a timezone change never yields a second ad day within 20 real hours.
33. No ad is ever requested on web, PWA, the browser sandbox or an Academy practice world; ad requests are always non-personalized with no advertising identifier.
34. The low-cash card lists the Fresh Start before the ad offer when the Fresh Start is available.
35. The day's `ACCT_REWARDED_AD` total above 0.01% of net mint raises the alert (20 FAU.ad_faucet_share).
36. The store pre-submission checklist (Rule 3.15.2) has a recorded pass for every submitted build, and account deletion is reachable in ≤ 3 taps from Settings on iOS and Android.
37. The disclaimers of Rule 3.16.1 appear verbatim in EN and FR in the listed places; the advice-word scan finds none of the EN or FR banned phrases.
38. Web checkout records express consent to immediate delivery before delivering; without it, delivery is deferred 14 days.
39. All production stores holding personal data are located in the EU sites; a configuration scan finds no PII store outside them.
40. No board, ladder, tournament or Hall of Fame accepts sandbox results; no import path from sandbox to the online character exists; Held never applies in the sandbox or a practice world (13 §3.10; 20 AT 35–37).
41. An INC-1 produces a public status update within 15 real minutes and a public postmortem summary within 7 real days.
42. The chapter calendar for every chapter contains the template events of Rule 3.5.2 with lead times of Rule 3.5.3, and competitive start bands rotate across EU, AMERICAS and APAC within every 3 chapters.
