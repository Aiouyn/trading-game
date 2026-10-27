# 15 — Multiplayer and Social

Owner module for: the one persistent world as players experience it (invisible partitions, the activity measure `N_a`, countries), chapters (seasons), every leaderboard and league, ladder finish rules, Season Finals and the Hall of Fame, challenge events and the weekly AI tournament, alliances and consortia, the contract engine and its clause library (including the shared **Mandate** schema), public filings, chat, the Wire as a feed, spectating and replays, While You Were Away, notifications, activity states (inactive, dormant, estate), and anti-cheat and integrity.

Depends on: 02 (clock, determinism, RNG streams, replay), 03 (ledger, holds, beneficial ownership and consolidation, NWI and `MSI`), 05 (marks, fills, surveillance score, VWAP), 06 (instruments, auctions), 07 (CCP escrow, loans, liquidation), 08 (funds, mandates), 09 (businesses, companies, company filings content), 10 (cities, properties, concessions, Hall of Patrons), 11 (models, licenses, tournament model freezing), 12 (ops, sessions, SOC, joint ops), 13 (courts, arbitration, regulators, sanctions), 14 (identity, ranks, Prestige, Reputation, Notoriety, titles), 16 (news generation, rumors, NPC actors, history), 17 (layouts), 19 (servers, partitions, auth, API), 21 (moderation tooling, admin console, cosmetics), 22 (names).

Sources kept: original vision 02 (all), 03 §13 and §15, 04 §8, §10.2, ROADMAP §2.4 and §2.8, MASTER-BIBLE PART V #1 and PART VI, V3 Part 10. Where 00 changes the time model, game-time durations are restated (a game day is one real hour; a real day is 24 game days).

Intent namespace owned here: `soc.*` (16 uses the sub-namespaces `soc.pol.*` and `soc.world.*`; nothing in 15 uses those).

---

## §1 Purpose

1. **One world everyone shares** (L1). Every player can trade with, sue, partner with, take over or attack any other player. Partitioning is a deployment detail, never visible.
2. **Many ways to win something.** One headline board, many specialist boards, weekly leagues among peers, chapter ladders a late joiner can win, country and city crowns.
3. **Rhythm without resets.** Eight-week chapters give themes, ladders, Finals and a Hall of Fame; nothing an empire owns is wiped.
4. **Player-built relationships the engine can enforce**: typed contracts with escrow, alliances with treasuries and roles, syndicates and consortia that can own institutions (V3 Part 10).
5. **A public record that creates a metagame without leaking strategy** (L11): filings by legal rule, the Wire, spectating, replays.
6. **Integrity**: alts, collusion, botting and real-money trading are detected and neutralized; every action is a replayable ledger fact.

---

## §2 Entities

### §2.1 World activity and countries

```ts
interface ActivityRecord {                 // one per character, maintained by 15
  characterId: string;
  lastActiveRealMs: number;                // last authenticated intent or socket presence
  activeRealDaysThisChapter: number;       // days with ≥ 10 real minutes of presence
  status: CharacterStatus;                 // 14 §2.4 enum; INACTIVE/DORMANT/ESTATE set here
}
interface WorldActivity { tick: Tick; N_a: number; activeChars7d: number; partitions: number; }

type CountryCode = string;                 // ISO-3166 alpha-2
interface CountryBoardState {
  country: CountryCode;
  activePlayers: number;                   // ACTIVE characters with this country, recomputed daily
  ownBoard: boolean;                       // activePlayers ≥ PARAM.country_board_min_active = 500
  rollupRegion: RollupRegion;              // used while ownBoard is false
}
type RollupRegion = 'NA_OTHER' | 'LATAM' | 'EU_WEST_OTHER' | 'EU_EAST_OTHER' | 'MENA' | 'SSA'
                  | 'SOUTH_ASIA' | 'SEA' | 'EAST_ASIA_OTHER' | 'OCEANIA';
```

### §2.2 Chapters

```ts
type ChapterPhase = 'OPEN' | 'CLOSING_BELL' | 'FINISH_WINDOW' | 'SETTLING';
interface Chapter {
  number: number;                          // 1 at world genesis
  startTick: Tick; endTick: Tick;          // 967,680 ticks (56 real days)
  phase: ChapterPhase;
  themeId: string;                         // §3.3.3
  themeAnnouncedTick: Tick;
  patchVersion: string;                    // rules version shipped at the boundary (21)
  finalsEventId: string | null;            // Season Finals of this chapter (runs at the start of the next)
}
interface ChapterTheme {
  themeId: string; nameKey: string;
  shockMultipliers: Partial<Record<ShockCategory, number>>; // 16 §3.7 categories, each in [0.5, 2.0]
  wireMastheadKey: string;
}
```

### §2.3 Boards and leagues

```ts
type BoardId = 'RICHEST' | 'RICHEST_CHAPTER' | 'CLIMBER' | 'TRADER' | 'TYCOON' | 'ALLIANCE' | 'PRESTIGE'
             | 'MOST_WANTED' | 'DEFENDER' | 'CITY_WEALTH' | 'CITY_PROFIT' | 'SECTOR_PROFIT' | 'LEGACY'
             | 'TOP_LABS' | 'CLEANEST_LAB' | 'RIVALS' | 'AI_TOURNAMENT';
type BoardScope = { kind: 'GLOBAL' } | { kind: 'COUNTRY'; key: CountryCode | RollupRegion }
                | { kind: 'CITY'; cityId: string } | { kind: 'SECTOR'; sectorId: string };
type BoardPeriod = 'ALL_TIME' | 'CHAPTER';

interface BoardRow {
  rank: number; subjectId: string;         // chr, ali, or npc (reference rows)
  score: number;                           // float64; display rules §3.4.3
  displayValue: string;                    // rounded/bucketed text
  isReference: boolean;                    // NPC rival funds and benchmark ghosts; not counted in rank numbers
  deltaRank: number | null;                // vs previous snapshot
}
interface BoardSnapshot { boardId: BoardId; scope: BoardScope; period: BoardPeriod; tick: Tick; rows: BoardRow[]; full: boolean; }

type LeagueTier = 'PENNY' | 'RETAIL' | 'PRO' | 'INSTITUTIONAL' | 'TITAN' | 'APEX';
interface LeagueWeek { weekIndex: number; startRealMs: number; endRealMs: number; }   // Monday 00:00 UTC to next Monday
interface LeagueGroup { groupId: string; weekIndex: number; tier: LeagueTier; members: string[]; capacity: number; }
interface LeagueMembership {
  characterId: string; weekIndex: number; tier: LeagueTier; groupId: string;
  startScoreBasis: Money;                  // average rank-basis real NW of the first 3 game-day closes of the week
  netP2PInReal: Money;                     // accumulated through the week
  result: 'PROMOTED' | 'RELEGATED' | 'STAYED' | null;
}
```

### §2.4 Challenges and tournaments

```ts
type ChallengeKind = 'CRASH_COURSE' | 'PURE_MARKETS' | 'SPEEDRUN' | 'SEASON_FINALS' | 'AI_TOURNAMENT'
                   | 'AI_ARENA' | 'SCENARIO' | 'LIVE_SHADOW';
interface ChallengeEvent {
  eventId: string; kind: ChallengeKind; nameKey: string;
  ruleset: ChallengeRuleset;
  seedCommitHash: string | null;           // scenario markets: hash committed before entry closes
  seedReveal: string | null;               // revealed after results
  entryOpensTick: Tick; entryClosesTick: Tick; startsTick: Tick; endsTick: Tick;
  entrants: string[]; maxEntrants: number | null;
  state: 'ANNOUNCED' | 'OPEN' | 'RUNNING' | 'SCORING' | 'FINAL' | 'CANCELLED';
}
interface ChallengeRuleset {
  market: 'SCENARIO' | 'LIVE_SHADOW';
  startingNotionalReal: Money;             // identical for every entrant
  paceMultiplier: 1 | 4;                   // SPEEDRUN uses 4
  assetClasses: string[];                  // 06 classes allowed
  cyberLayer: boolean;                     // false for PURE_MARKETS and FINALS
  scoring: 'FINAL_NAV_AVG' | 'MEDIAN_SHARPE' | 'RETURN';
  maxDrawdownDQ: number | null;
  minTradesPerRun: number | null;
}
interface ChallengePortfolio {             // ring-fenced; never touches the real empire
  portfolioId: string; eventId: string; characterId: string;
  cash: Money; positions: Record<string, Qty>; navHistory: Money[];
}
interface TournamentEntry {
  entryId: string; eventId: string; characterId: string; modelId: string;
  division: 'LAPTOP' | 'STARTUP' | 'FRONTIER';
  frozenHash: string;                      // hash of strategy graph + parameters at lock (11 freezes)
  runs: { seedIndex: number; sharpe: number; returnPct: number; maxDD: number; trades: number }[];
  score: number | null; disqualified: 'DRAWDOWN' | 'TOO_FEW_TRADES' | 'STOLEN_MODEL' | null;
}
```

### §2.5 Alliances

```ts
type AllianceTier = 'PARTNERSHIP' | 'FIRM' | 'CORPORATION' | 'CONGLOMERATE';
type AllianceRole = 'CHAIR' | 'TREASURER' | 'CISO' | 'GENERAL_COUNSEL' | 'ANALYST' | 'MEMBER';
type Permission = 'TREASURY_SPEND' | 'TREASURY_TRANSFER_OUT' | 'APPROVE_DEALS' | 'LAUNCH_OPS'
                | 'HIRE_LAWYERS' | 'MANAGE_SOC' | 'INVITE' | 'KICK' | 'POST_INTEL' | 'READ_INTEL'
                | 'DECLARE_RIVALRY' | 'PROPOSE_VOTE' | 'MANAGE_CONSORTIUM' | 'SET_TAX';

interface Alliance {
  allianceId: string;                      // 'ali_' + ulid; also the treasury entity id (00 §5.3)
  name: string; tag: string;               // tag 2–5 chars, unique
  crest: { shieldId: string; chargeId: string; tinctures: [string, string] };
  tier: AllianceTier;
  foundedTick: Tick;
  hqPropId: string | null;                 // FIRM+: office; CORPORATION+: tower (10)
  members: AllianceMember[];
  charter: AllianceCharter;
  socLevel: 0 | 1 | 2 | 3;                 // 12 §3 (CORPORATION+)
  subsidiaryAllianceIds: string[];         // CONGLOMERATE: up to 3 FIRM-tier subsidiaries
  consortiumCmpIds: string[];              // §3.7.9
  parentAllianceId: string | null;
  rivalryIds: string[];
  status: 'ACTIVE' | 'DISSOLVING' | 'DISSOLVED' | 'MERGED';
}
interface AllianceMember { characterId: string; role: AllianceRole; joinedTick: Tick; contributedReal: Money; }
interface AllianceCharter {
  memberTaxPct: number;                    // 0..10 (% of members' business operating profit, 09)
  roleSpendLimitsRealPerDay: Partial<Record<AllianceRole, Money>>;
  multisigThresholdReal: Money;            // spends above need multisigApprovals
  multisigApprovals: number;               // 1..5, counted among CHAIR/TREASURER/GENERAL_COUNSEL
  votingWeight: 'ONE_MEMBER_ONE_VOTE' | 'BY_CONTRIBUTION';
  quorumPct: number;                       // default 50
  rolePermissions: Record<AllianceRole, Permission[]>;
  intelRetentionGameDays: number;          // default 364
}
interface AllianceProposal {
  proposalId: string; allianceId: string; kind: ProposalKind; payload: unknown;
  openedTick: Tick; closesTick: Tick;      // default 24 game days (1 real day)
  votes: Record<string, 'YES' | 'NO' | 'ABSTAIN'>; state: 'OPEN' | 'PASSED' | 'FAILED' | 'EXECUTED';
}
type ProposalKind = 'CHARTER_CHANGE' | 'TIER_UPGRADE' | 'MERGER' | 'DISSOLUTION' | 'KICK' | 'ROLE_ASSIGN'
                  | 'LARGE_SPEND' | 'RIVALRY' | 'CONSORTIUM_ACTION' | 'SUBSIDIARY_ADD';
interface Rivalry {
  rivalryId: string; allianceA: string; allianceB: string; weekIndex: number;
  scoreA: number; scoreB: number; state: 'ACTIVE' | 'ENDED'; winner: string | null;
}
interface IntelPost {
  postId: string; allianceId: string; authorId: string; tick: Tick;
  kind: 'NOTE' | 'RUMOR' | 'RESEARCH' | 'INTEL_ITEM'; bodyText: string; attachments: string[];
  provenance: 'PUBLIC' | 'OWN_RESEARCH' | 'ESPIONAGE';   // ESPIONAGE items keep 12's tag (court evidence)
  canaryId: string | null;                 // 12 canary briefings
}
```

### §2.6 Contracts

```ts
type ContractState = 'DRAFT' | 'OFFERED' | 'PARTIALLY_SIGNED' | 'ACTIVE' | 'COMPLETED' | 'BREACHED'
                   | 'TERMINATED' | 'VOIDED' | 'DISPUTED' | 'EXPIRED_UNSIGNED' | 'FAILED_TO_FUND';
interface Contract {
  contractId: string;                      // 'ctr_' + ulid
  templateId: string | null;
  parties: ContractParty[];                // 2..8
  clauses: Clause[];                       // 1..PARAM.contract_clauses_max = 12
  forum: 'COURT' | 'ARBITRATION';          // §3.6.10
  arbitratorId: string | null;             // 13 arbitration panel or licensed player arbiter
  offeredTick: Tick | null; offerExpiresTick: Tick | null;
  activatedTick: Tick | null; endsTick: Tick | null;
  state: ContractState;
  escrowHoldIds: string[];                 // 07 CCP escrow holds
  flags: ContractFlag[];                   // 'OFF_MARKET' | 'ZERO_RATE' | 'NEW_ACCOUNT' | 'LINKED' | 'AGE_CAPPED'
  notionalReal: Money;                     // §3.6.8, for fees and caps
  history: { tick: Tick; event: string; by: string | null }[];
}
interface ContractParty { partyId: string; entityId: string; signerCharacterId: string; signedTick: Tick | null; role: string; }

type Clause =
  | { kind: 'TRANSFER'; from: string; to: string; assets: AssetBundle; atTick: Tick | 'ON_ACTIVATION' }
  | { kind: 'LOAN'; lender: string; borrower: string; principal: Money; ccy: string; ratePerGameYear: number;
      schedule: 'BULLET' | 'AMORTIZING' | 'INTEREST_ONLY'; termGameDays: number; paymentEveryGameDays: number;
      collateral: AssetBundle | null; covenants: Covenant[] }
  | { kind: 'LEASE'; lessor: string; lessee: string; propOrBizId: string; rentPerPeriod: Money; periodGameDays: number;
      termGameDays: number; deposit: Money }
  | { kind: 'REVENUE_SHARE'; payer: string; payee: string; bizId: string; sharePct: number; termGameDays: number }
  | { kind: 'EQUITY_STAKE'; holdingCmpId: string; stakes: Record<string, number>; votingRule: 'PRO_RATA' | 'UNANIMOUS' }
  | { kind: 'OPTION'; writer: string; holder: string; underlying: AssetBundle; strike: Money; premium: Money;
      style: 'AMERICAN' | 'EUROPEAN'; expiryTick: Tick; collateralFromWriter: AssetBundle }
  | { kind: 'SERVICE_LEVEL'; provider: string; client: string; serviceKind: 'SECURITY' | 'PROPERTY_MGMT' | 'MARKETING' | 'LEGAL' | 'INTEL' | 'SUPPLY';
      fee: Money; periodGameDays: number; guarantee: SlaGuarantee; refundPct: number }
  | { kind: 'NON_COMPETE'; restricted: string; scope: { sectorId?: string; cityId?: string; districtId?: string }; termGameDays: number }
  | { kind: 'NDA'; parties: string[]; subjectIds: string[]; termGameDays: number }
  | { kind: 'BOUNTY'; sponsor: string; targetCharacterId: string; offenseClass: string; amount: Money; expiresTick: Tick }
  | { kind: 'PENALTY'; payer: string; payee: string; amount: Money; triggerClauseIndex: number | null; triggerText: string | null }
  | { kind: 'COVENANT'; obligor: string; text: CovenantKind; params: Record<string, string | number> }
  | { kind: 'MANDATE'; mandate: Mandate }
  | { kind: 'LICENSE'; licensor: string; licensee: string; licenseRef: string /* 11 license terms id */; feePerGameDay: Money; termGameDays: number }
  | { kind: 'SUPPLY'; supplier: string; buyer: string; bizOutputKind: string; unitsPerPeriod: number; pricePerUnit: Money;
      periodGameDays: number; termGameDays: number; requirements: SupplyRequirement[]; shortfallPenaltyPerUnit: Money }
  | { kind: 'SUBCONTRACT'; primeContractId: string; prime: string; sub: string; shareOfUnitsPct: number; shareOfPaymentPct: number; penaltySharePct: number }
  | { kind: 'GUARANTEE'; guarantor: string; guaranteedPartyId: string; coveredClauseIndex: number; capAmount: Money }
  | { kind: 'TERMINATION'; noticeGameDays: number; feeAmount: Money; whoMay: 'ANY' | string[] }
  | { kind: 'ASSIGNMENT'; allowed: boolean; consentRequired: boolean };

interface AssetBundle { cash?: { amount: Money; ccy: string }[]; instruments?: { assetId: string; qty: Qty }[];
                        bizIds?: string[]; propIds?: string[]; itemIds?: string[]; modelLicenseRefs?: string[]; datasetLicenseRefs?: string[]; }
type Covenant = { kind: 'MAX_LEVERAGE'; value: number } | { kind: 'MIN_INTEREST_COVER'; value: number } | { kind: 'MIN_CASH'; amount: Money };
type CovenantKind = 'VOTE_WITH' | 'NOT_SUE_CIVIL' | 'EXCLUSIVE_DEALING' | 'BEST_EFFORTS' | 'CUSTOM_TYPED';
type SlaGuarantee = { kind: 'DEFENSE_FLOOR'; unitIds: string[]; minCoverage: number } | { kind: 'UPTIME'; pct: number } | { kind: 'DELIVERY'; unitsPerPeriod: number };
type SupplyRequirement = 'CERTIFIED' | 'RESPONSE_TIME_1D' | 'CONFIDENTIAL' | 'COLD_CHAIN' | 'MIN_QUALITY_3';
```

### §2.7 Mandate (shared schema; 08 extends it as FundMandate, 09 and 11 reuse it)

```ts
interface Mandate {
  mandateId: string;
  principalId: EntityId;                   // whose assets
  operatorId: EntityId;                    // chr, npc, or a model (11) acting for the principal
  scope: MandateScope;                     // what the operator may touch
  allowedAssetClasses: AssetClass[];       // 06 enum (08 field name kept)
  allowedIntentKinds: string[];            // e.g. ['mkt.order.place','mkt.order.cancel','biz.upgrade']
  maxLeverage: number;                     // gross exposure / equity of the scope
  maxPositionPctNav: number;               // per instrument, of the scope's NAV
  maxDrawdownPct: number;                  // breaker: operator rights suspend when breached
  maxSpendPerGameDay: Money;               // non-trading spend cap
  legalRiskTolerance: 'NONE' | 'LOW' | 'MEDIUM';   // NONE = operator may not submit any intent flagged by 13 as legally risky
  noticeTicksForChange: number;            // principal must give notice before tightening, default 720
  fee: { fixedPerGameDay: Money; performancePct: number; highWaterMark: boolean };
  exceptionsToPrincipal: ('DRAWDOWN_75PCT' | 'LIMIT_HIT' | 'LEGAL_FLAG' | 'LARGE_LOSS_DAY')[];
  validFromTick: Tick; validToTick: Tick | null;
  state: 'ACTIVE' | 'SUSPENDED_BREAKER' | 'TERMINATED';
}
type MandateScope = { kind: 'ACCOUNT_SUBBOOK'; subBookId: string } | { kind: 'FUND'; fundId: string }
                  | { kind: 'BUSINESSES'; bizIds: string[] } | { kind: 'PROPERTIES'; propIds: string[] } | { kind: 'MODEL'; modelId: string };
```

### §2.8 Filings

```ts
type FilingKind = 'OWNERSHIP_5' | 'SHORT_POSITION' | 'INSIDER_TRADE' | 'HOLDINGS_QUARTERLY' | 'MATERIAL_CONTRACT'
                | 'COMPANY_PERIODIC' | 'COMPANY_EVENT' | 'PROSPECTUS' | 'FUND_REPORT' | 'LOBBYING' | 'CONTRIBUTION'
                | 'VOLUNTARY_STATEMENT';
interface FilingObligation {
  obligationId: string; filerId: EntityId; kind: FilingKind; triggerTick: Tick; dueTick: Tick;
  draft: FilingPayload; state: 'OPEN' | 'FILED' | 'AUTO_FILED' | 'WAIVED';
}
interface Filing {
  filingId: string; filerId: EntityId; filerDisplay: string; kind: FilingKind;
  filedTick: Tick; lateByTicks: number; autoFiled: boolean;
  payload: FilingPayload; amendsFilingId: string | null;
  visibility: 'PUBLIC';
}
type FilingPayload = Record<string, string | number | boolean | string[]>;   // schema per kind, §3.8
```

### §2.9 Social: chat, follows, Wire, notifications

```ts
type ChannelKind = 'COUNTRY' | 'CITY' | 'LEAGUE_GROUP' | 'ALLIANCE' | 'ALLIANCE_OPS' | 'CONSORTIUM' | 'CLUB'
                 | 'EVENT_ROOM' | 'CONTRACT_THREAD' | 'DM' | 'FINALS_LOBBY';
interface ChatChannel { channelId: string; kind: ChannelKind; key: string; slowModeRealSeconds: number; members: string[] | 'OPEN'; createdTick: Tick; expiresTick: Tick | null; }
interface ChatMessage {
  channelId: string; messageId: string; authorId: string; realMs: number; tick: Tick;
  body: string;                            // ≤ PARAM.chat_max_chars = 500, plain text
  chips: ({ kind: 'TICKER'; assetId: string } | { kind: 'RECEIPT'; receiptId: string } | { kind: 'FILING'; filingId: string } | { kind: 'CONTRACT'; contractId: string })[];
  moderation: 'VISIBLE' | 'HELD_FOR_REVIEW' | 'HIDDEN';
}
interface Follow { followerId: string; followedId: string; sinceTick: Tick; }
interface Friendship { a: string; b: string; sinceTick: Tick; }        // mutual, both accepted
interface Block { blockerId: string; blockedId: string; }

type WireKind = 'NEWS' | 'RUMOR' | 'FILING' | 'VERDICT' | 'MARKET' | 'PURCHASE' | 'ALLIANCE' | 'STATEMENT'
              | 'OUTLET' | 'CHAPTER' | 'RECORD' | 'RANK' | 'PHILANTHROPY' | 'WORLD_EVENT' | 'DAILY_CLOSE';
interface WireItem {
  wireId: string; kind: WireKind; tick: Tick; sourceEventIds: string[];   // must be non-empty (16 causal rule)
  headlineKey: string; slots: Record<string, string>;                     // L8 strings
  subjectIds: string[]; assetIds: string[]; cityIds: string[]; blocIds: string[];
  newsworthiness: number;                  // [0,1] from 16 or the emitting module
  credibility: number | null;              // rumors and statements
  authorId: string | null;                 // STATEMENT/OUTLET
  breaking: boolean;
}
interface PlayerStatement { statementId: string; authorId: string; tick: Tick; text: string; assetTags: string[]; evidenceRefs: string[]; reachWeight: number; verdict: 'UNRESOLVED' | 'TRUE' | 'FALSE' | 'OPINION'; }

type NotifyCategory = 'SECURITY' | 'MARGIN' | 'LEGAL' | 'CONTRACT' | 'LEAGUE' | 'RIVAL' | 'GOAL' | 'ALLIANCE' | 'EVENT' | 'WORLD';
interface Notification { notificationId: string; characterId: string; category: NotifyCategory; tick: Tick; textKey: string; slots: Record<string, string>; deepLink: string; push: boolean; }
```

### §2.10 Integrity

```ts
interface LinkEvidence { a: string; b: string; signal: LinkSignal; strength: number; firstTick: Tick; lastTick: Tick; }
type LinkSignal = 'DEVICE' | 'PAYMENT' | 'IP_ASN' | 'EMAIL_PATTERN' | 'LOGIN_TIMING' | 'BEHAVIOR' | 'VALUE_FLOW' | 'REFERRAL' | 'ADMIN_CONFIRMED' | 'DECLARED_HOUSEHOLD';
interface LinkPair { a: string; b: string; score: number; linked: boolean; suspect: boolean; declared: boolean; updatedTick: Tick; }
interface IntegrityCase {
  caseId: string; subjects: string[]; kind: 'ALT_FUNNEL' | 'COLLUSION' | 'BOTTING' | 'RMT' | 'EXPLOIT' | 'ACCOUNT_THEFT';
  evidence: string[]; confidence: number; state: 'OPEN' | 'ACTIONED' | 'DISMISSED';
  action: 'NONE' | 'WARNING' | 'CLAWBACK' | 'TEMP_BAN' | 'BAN' | 'SHADOW_POOL' | null;
}
```

---

## §3 Rules and formulas

### §3.1 One world, partitions and activity

**§3.1.1 One world.** One set of markets, regions and cities, one court system per bloc, one Wire, one global board. Partitions (player, market, city; 19 owns deployment) are invisible: no rule, UI string, ID format or latency depends on which partition a character is in. Cross-partition money moves only by hold → settle (02, 19); consequences land on the next tick.

**§3.1.2 Activity-weighted players.** Recomputed at each day close:

```
N_a(t) = Σ_characters exp( −realDaysSinceLastActive / PARAM.na_decay_real_days )      na_decay_real_days = 7
```

Characters that are guests, banned or anonymized are excluded. `N_a` sizes NPC pools (05, 09, 16), regulator capacity (13: 1 investigation per 200 active players), drop sizes (14), and city openings (10 opens a new city for each `PARAM.new_city_na_step = 4,000` of growth above the launch baseline).

**§3.1.3 Event clock fairness.** One world spans every time zone, so 04, 09 and 16 schedule recurring public moments (central-bank meetings, earnings clusters, elections, Galas) in rotation across three bands centred on 14:00 UTC, 22:00 UTC and 06:00 UTC: the k-th instance of any recurring event family uses band `k mod 3`. Finishes use 24-hour windows (§3.5.2).

### §3.2 Countries

**§3.2.1 Assignment.** The real country (for boards only; in-game cities are fiction and independent) is decided in priority order: native app store region; else the majority country of logins over the first 7 real days; else IP geolocation at sign-up. Until day 7 the provisional country is used. A mismatch between sources flags the account for review (`RMT_WATCH` is not set; a support check only) and never auto-bans.

**§3.2.2 Change.** Once per `PARAM.country_change_real_days = 180`; a change resets the current chapter's country-board scores for the character in the old and new country (anti board-hopping). Resolves old 02 open question 2: kept as proposed.

**§3.2.3 Boards by country.** A country gets its own boards and Gilt edition (14) once it has ≥ 500 ACTIVE characters at a day close; it loses them only after `PARAM.country_board_hysteresis_days = 14` real days below 450. Smaller countries roll up into the fixed `RollupRegion` from a static country→region table (22 lists it). In-game blocs are never used for country boards.

### §3.3 Chapters (seasons)

**§3.3.1 Calendar.** Chapter 1 starts at world genesis. Each chapter lasts 56 real days (1,344 game days, 967,680 ticks). Phases: `OPEN` (real days 1–49), `CLOSING_BELL` (real days 50–55), `FINISH_WINDOW` (real day 56, the final 24 real hours), `SETTLING` (the first 30 ticks of the next chapter, while results are computed; the world keeps running). Nothing owned resets (L1).

**§3.3.2 Boundary actions** (at the boundary tick, in P2 calendar hooks): close chapter boards and ladders; award chapter titles (14 §3.5.2); write Hall of Fame records (§3.5.6); save chapter portraits (14); start the Season Finals event (§3.5.4); trigger 10's concession re-auctions; apply the patch scheduled by 21 (rule changes ship only at boundaries, small fixes any time); reset chapter-scoped counters (league week continues independently).

**§3.3.3 Themes.** Each chapter has a theme announced 7 real days before it starts. A theme sets multipliers in [0.5, 2.0] on 16's exogenous shock categories and a Wire masthead; it never forces a specific event. The theme is chosen by 16's scheduler with the rule: no theme repeats within 4 chapters; the candidate whose multipliers best counter the last chapter's realized imbalance (most under-represented shock category gets ×1.5) is chosen, ties by `hash(worldSeed, chapter)`. Launch catalog (12 themes, 22 lists them): The Rate Shock, Silicon Spring, The Long Drought, Harbor Strikes, Crypto Weather, The Credit Thaw, Election Season, The Energy Squeeze, Merger Mania, The Quiet Boom, The Data Wars, Frontier Rush.

**§3.3.4 Closing Bell.** During `CLOSING_BELL` the Wire runs a recap masthead; the ladder finish rules (§3.5.2) apply; 16 starts no new exogenous major crisis in the final 48 real hours (16 §3.7).

### §3.4 Boards

**§3.4.1 Common rules.** Boards include ACTIVE and INACTIVE characters; DORMANT and ESTATE characters leave every board except Richest all-time, where they remain with a "dormant" marker. Banned characters are removed. Characters in an open integrity case with confidence ≥ 0.6 are hidden from public top-100 views until the case closes (they still see their own rank). Guests never appear. Ties: earlier tick of reaching the score, then lower `hash(characterId)`. NPC rival funds and the benchmark ghost appear as **reference rows** (`isReference = true`) on RICHEST_CHAPTER, CLIMBER and TRADER; reference rows do not take a rank number.

**§3.4.2 Board definitions.** All money values are rank-basis real values from 03 (`nw.rankBasisReal`), the same basis 14 uses for ranks. `netP2PInReal` = real value received through P2P transfers, gifts and contract payments minus real value sent through them during the period (loan principal and its repayment excluded, §3.6.8).

| Board | Score | Periods | Scopes | Min eligibility |
|---|---|---|---|---|
| RICHEST | rank-basis real NW (= NWI × base) | all-time | global, country, city (home city) | registered |
| RICHEST_CHAPTER | `NWend − NWstart − netP2PInReal` where NWstart/NWend are averages of the first / last 24 game-day closes of the chapter | chapter | global, country | active ≥ 10 real days in the chapter |
| CLIMBER | `ln( (NWend − netP2PInReal) / max(NWstart, $100,000) )` | chapter | global, country | same; NWend − netP2PIn ≥ $100k |
| TRADER | annualized Sharpe of daily returns of the trading book (05 defines the book: positions and cash in the trading sub-ledger, excluding business income), net of fees | chapter | global, country | ≥ 100 fills and turnover ≥ 2× average trading-book equity in the chapter |
| TYCOON | trailing-one-game-year business operating profit (09), real | all-time (rolling), chapter | global, country, sector | ≥ 1 business |
| ALLIANCE | Σ of the top 20 members' RICHEST score | all-time, chapter | global, country (alliance's Chair's country) | ≥ 2 members |
| PRESTIGE | Prestige (14 §3.8) | all-time | global, country | — |
| MOST_WANTED | §3.4.4 | chapter | global | opt-in public listing (14 `showNotoriety`); others ranked privately |
| DEFENDER | §3.4.5 | chapter | global, country | — |
| CITY_WEALTH | RICHEST restricted to residents of the city (home city) | all-time | city | — |
| CITY_PROFIT | business operating profit in that city, trailing game year | all-time | city | — |
| SECTOR_PROFIT | business operating profit in that sector | all-time | sector (09's 13 sectors) | — |
| LEGACY | Legacy points (14 §3.14) | all-time | global, country | — |
| TOP_LABS | highest MCS of a currently deployed model (11) | all-time | global | ≥ 1 deployed model |
| CLEANEST_LAB | highest MCS among characters with zero AI governance incidents (11) and zero theft convictions (13) in the trailing chapter | chapter | global | — |
| RIVALS | RICHEST_CHAPTER with NPC rival funds counted as normal rows (a solo-feel board; old ROADMAP M12) | chapter | global | — |
| AI_TOURNAMENT | §3.14.4 | weekly and chapter (best 5 of 8 weeks) | division | entered |

**§3.4.3 Display.** Money scores display rounded to 3 significant figures (`$412M`, `$1.05B`); exact values are never in a public payload. CLIMBER shows `×` growth (e^score). TRADER shows Sharpe to 2 decimals. Public payloads carry only `rank, handle (or alliance tag), country flag, rank badge, displayValue, deltaRank`.

**§3.4.4 Most Wanted score** (old 03 §13.7). Per chapter, for each unique victim `v` that is unlinked, not a rookie (13 rookie zone) and not in the Penny league at the time of the op, take the largest successful op against v: `w_v = 1 + log10(1 + lootReal_v / $10,000)` (non-cash loot valued by 12). Score `= Σ_v w_v − 2 · mean(w_v) · convictionsThisChapter` (mean = 1 if no victims). Public top 10 get +15% detection against them (12 applies).

**§3.4.5 Defender score.** For each unique unlinked attacker `a` whose session was disconnected while FLAGGED, or whose op against the character failed and was detected (12), `d_a = 1 + log10(1 + protectedValueReal_a / $10,000)`, where `protectedValueReal` is 12's estimate of the loot cap the attempt targeted. Score `= Σ_a d_a`.

**§3.4.6 Cadence.** Top 100 rows of every board refresh every game hour (30 ticks) in P12; full boards at each day close; league tables once per real day at 00:00 UTC. Board snapshots are kept per chapter forever.

### §3.5 Leagues, finish rules, Finals and the Hall of Fame

**§3.5.1 Leagues** (old 02 §6.3, reconciled). A league week runs Monday 00:00 UTC to the next Monday 00:00 UTC (7 real days = 168 game days).

Tiers by world percentile of RICHEST among ACTIVE registered characters at week start: PENNY bottom 30%, RETAIL 30–60%, PRO 60–85%, INSTITUTIONAL 85–97%, TITAN top 3% excluding Apex, APEX top 100 globally. Group size 50 (TITAN 30, APEX one group of 100).

Placement at week start, for each character:
```
baseTier = tier from percentile
move     = last week's result: PROMOTED +1, RELEGATED −1, else 0 (0 for a first week)
tier     = clamp(prevTier + move, baseTier − 1, baseTier + 1), restricted to PENNY..TITAN
APEX overrides: the global top 100 at week start are APEX; nobody else is
```
This keeps both rules of the old design: wealth decides the neighbourhood, weekly results let a player play one tier up or down.

Grouping within a tier: order members by `hash(weekIndex, characterId)` and cut into groups of the group size (the last group may be smaller; if it has fewer than 20 members, they are spread across other groups up to capacity + 10). This mixes join dates and time zones; players never choose groups (no sandbagging). Shadow-pool characters (§3.12.6) are grouped only with each other.

Score: `ln( (B_end − netP2PInReal_week) / B_start )`, where `B_start` and `B_end` are the averages of the first and last 3 game-day closes of the week. Top 10 of a group are PROMOTED, bottom 10 RELEGATED (TITAN group of 30: top 5 and bottom 5; APEX: none). A character joining mid-week enters the least-full group of their base tier with `B_start` taken from their first 3 closes. Rewards: the group winner gets the week title (14 §3.5.2); promotion and relegation are cosmetic; no cash ever.

**§3.5.2 Chapter finish rules.** `NWend` for chapter ladders is the average over the 24 game-day closes of the `FINISH_WINDOW` (the final real day), not a single tick, so no time zone must be awake at a given moment and last-minute pumps are diluted 24×. This replaces the old "last 3 game days" wording, which under 00's clock would be only 3 real hours. Positions in player-issued instruments (the player's own IPO'd company or fund units, 09/08) are marked at the lower of fair value and their VWAP over the final 72 game days. Leverage caps do not change at chapter end (the world does not reset).

**§3.5.3 Chapter titles.** Champions of RICHEST_CHAPTER and CLIMBER, globally and per country; top 10 and top 100 global; TRADER, TYCOON, ALLIANCE, DEFENDER, MOST_WANTED (opt-in only), LEGACY chapter champions. Title PP is 14's.

**§3.5.4 Season Finals.** At each chapter boundary, 100 finalists are seated: alternate from the top of the global RICHEST_CHAPTER and CLIMBER lists (1st of each, 2nd of each, …), skipping duplicates and ineligible characters (banned, open integrity case ≥ 0.6, linked to another finalist), until 100. Finals run for 48 real hours from the boundary as a `SEASON_FINALS` challenge (§3.14): identical $10,000,000 notional challenge portfolios, scenario market on a committed seed, asset classes up to the LIC3 set for everyone, no cyber layer, score = average NAV of the last 3 game-day closes. Spectators see positions with a 30-tick delay; finalists see only ranks and NAVs. The winner gets "Chapter N Finals Champion" (800 PP fresh, 14), Hall of Fame and Legacy entries. Entering the Finals is consent to publish the challenge portfolio (it is ring-fenced, not the player's real strategy).

**§3.5.5 Rivals for new players.** The league view highlights the closest player above the viewer in their group ("your rival"); 18 shows it in minute 4. If the closest player above is more than 3× the viewer's score basis, the nearest NPC reference row is shown instead (resolves old ROADMAP conflict C1).

**§3.5.6 Hall of Fame.** Permanent records per chapter, globally and per country: champions of every chapter board, Finals champion, biggest single realized trade gain (real), biggest crash survived (largest NW drawdown later fully recovered within the chapter), longest-undetected session proven in court (12/13), longest-lived alliance, largest philanthropy, fastest climb to R4 since join, first R6 of the world. Each record stores handle, value bucket, tick and a replay link where public.

### §3.6 The contract engine

**§3.6.1 Principle.** A contract is a typed bundle of clauses the engine can execute (old 02 §8.2). No free-text legalese has legal force; free text is allowed only as non-binding notes. What the engine can verify, it enforces; what it cannot becomes a court claim (03 §15 split, owned now by 13; the table in §3.6.6 is the binding version for 15's engine side).

**§3.6.2 Parties.** 2–8 parties. A party is an entity (chr, cmp, fnd, ali, or an npc through 16's decision model); the signer must be the character controlling it or an alliance role holder with `APPROVE_DEALS`. Guests cannot be parties (14 §3.1.1). Each party sees the counterparty card (§3.6.7) before signing.

**§3.6.3 Lifecycle.**
```
DRAFT --offer--> OFFERED --sign(each)--> PARTIALLY_SIGNED --last sign--> [fund escrow next tick]
   ACTIVE <--funded-- | FAILED_TO_FUND (holds released)
OFFERED --expiry--> EXPIRED_UNSIGNED       (default expiry 720 ticks, max 7 real days)
ACTIVE --all obligations met--> COMPLETED
ACTIVE --engine-verified breach--> BREACHED  (penalties and collateral execute; may continue if clauses say so)
ACTIVE --termination clause / mutual / court order--> TERMINATED
any   --linked parties found / illegal content / court void--> VOIDED (unwound to the extent possible)
ACTIVE|BREACHED --claim filed--> DISPUTED (engine parts keep executing unless a 13 order pauses them)
```
Amending an ACTIVE contract needs a new signature from every party and creates a new version; the old version is kept in history.

**§3.6.4 Escrow.** Escrow is held by the Clearing House's escrow sub-ledger (07 provides `escrow.hold(entityId, bundle, contractId) → holdId`, `escrow.release(holdId, toEntityId)`, `escrow.returnToOwner(holdId)`). At the last signature, every bundle a party must deliver at activation (TRANSFER `ON_ACTIVATION`, LEASE deposit, OPTION writer collateral, LOAN principal, BOUNTY amount, PENALTY amount when engine-triggered) is held on the next tick. If any hold fails, the contract is `FAILED_TO_FUND` and all holds return. Escrowed assets count in the owner's net worth but cannot be used elsewhere.

**§3.6.5 Execution.** In P12 each tick the engine evaluates due clause events in order of `(contractId, clauseIndex)`; payments due "per period" post at the day close of the period end. A payment that the payer's cash cannot cover is retried at the next day close for `PARAM.payment_grace_game_days = 3`; then it is a default (engine-verified breach).

**§3.6.6 Clause rules** (engine side; 13 owns the court side and the arbitration process):

| Clause | Validation at drafting | Engine execution | Breach and outcome |
|---|---|---|---|
| TRANSFER | assets owned and unencumbered by the `from` party | atomic swap at the tick (both sides held, both settle or neither) | cannot breach (escrow) |
| LOAN | rate ≥ 0; term ≤ `PARAM.contract_max_term_game_days = 2,912` (8 game years); collateral owned | disbursement from escrow; schedule postings `CTR_LOAN_INTEREST`, `CTR_LOAN_PRINCIPAL`; covenants tested at each day close from 03 statements | missed payment after grace or covenant breach: collateral seized to lender; shortfall becomes a judgment debt (13 garnishment) |
| LEASE | lessor owns the property/business; lessee eligible to operate it (licenses, city access) | rent each period; operating rights move to lessee for the term (10/09) | missed rent after grace: lease ends, deposit to lessor |
| REVENUE_SHARE | payer controls the business; share 1–90% | at each day close, `sharePct × that day's operating profit (if > 0)` paid | cannot breach while the business exists; a sale without assignment is a court claim |
| EQUITY_STAKE | creates or references a holding cmp (09) | pro-rata dividends and votes; this is how syndicates work (§3.7.6) | — |
| OPTION | underlying deliverable; strike, premium > 0; expiry ≤ max term | premium paid on activation; `soc.contract.exercise` by holder before expiry settles from writer's collateral | auto-settles; unexercised expires |
| SERVICE_LEVEL | provider has the matching service business (09) | fee each period; for SECURITY, the engine watches 12's events for a successful op against a covered unit | covered breach: refund `refundPct × fees paid in the period`; arbitration if provider claims client neglect (unit coverage < 0.5) |
| NON_COMPETE | term ≤ 2 game years; scope non-empty | the engine refuses the restricted party's matching intents (`biz.open` in scope) at P1 | cannot breach; intents refused with reason |
| NDA | subjects are dataset/intel/model ids | none | court via provenance (13) |
| BOUNTY | offense class is a crime; no "hire to commit" wording; target exists | amount held; on a conviction of the target in the class before expiry, paid pro rata to evidence submitters (13 decides) | expires: returns to sponsor |
| PENALTY | trigger is another clause index (engine) or typed text (court) | engine trigger: auto-paid from escrow, appealable in arbitration | — |
| COVENANT | typed kinds only; NOT_SUE_CIVIL cannot cover criminal or regulator cases | none | court, damages only |
| MANDATE | operator exists; limits sane (§3.6.11) | operator's intents for the principal validate against the mandate at P1 | breaker suspends operator rights; fee postings per §2.7 |
| LICENSE | licensor owns the model/dataset; 11's license terms id valid; honeypot models cannot be licensed (12) | fee per game day; access per 11 | query caps and training-on-outputs per 11 and 13 |
| SUPPLY | supplier operates a business producing the output (09); buyer business consumes it | delivery each period through 09's supply chain; price paid per delivered unit | shortfall: `shortfallPenaltyPerUnit × missing units` auto-paid; requirements not met (09 checks certification, response time, cold chain) count as missing |
| SUBCONTRACT | references an ACTIVE SUPPLY or SERVICE_LEVEL contract of the prime | engine splits units, payment and penalties by the stated shares | as the prime clause |
| GUARANTEE | guarantor ≠ guaranteed party; cap > 0 | on a breach of the covered clause, the guarantor pays up to the cap | guarantor's failure is its own default |
| TERMINATION | notice ≤ term; fee ≥ 0 | `soc.contract.terminate` by an allowed party starts notice; at its end the contract terminates and the fee is paid | — |
| ASSIGNMENT | — | `soc.contract.assign` moves a party's position to another entity (consent if required) | assignment to a linked account is refused |

Illegal content is refused at drafting (13 list): paying for an op, buying flagged goods, price-fixing between competitors, covenants to drop criminal cases. Trying to encode one by template abuse raises a 13 S5 conspiracy flag.

**§3.6.7 The counterparty card** (shown before signing, built from public data): handle, rank badge, account age, chapters played, Reputation and its last 10 public lines, contracts completed vs defaulted (counts, lifetime), convictions (public record), open public cases as defendant, alliance tag. Never shown: NW beyond the public board bucket, holdings, or anti-cheat link scores.

**§3.6.8 Fees and taxes.**
- Registration fee: `PARAM.contract_registration_fee = 0.5%` of `notionalReal`, min $100 real, max $5,000,000 real, paid by the offering party at activation (`CTR_REGISTRATION_FEE`, SINK). Waived for contracts registered between two attendees of a LIVE hosted event (14 §3.12.2).
- P2P transfer tax: `PARAM.p2p_tax = 2%` on every one-directional value transfer between different beneficial owners: the price side of TRANSFERs, gifts, lease rent, revenue-share payouts, loan interest, option premiums, license fees, service fees, supply payments, penalties, bounties (`CTR_P2P_TAX`, TRANSFER to the tax authority per E-9, paid by the payer). Exempt: loan principal and its repayment, escrow returns, collateral seizure (taxed as the debt it settles), transfers between entities of the same beneficial owner (03 consolidation).
- `notionalReal` = the larger of the total value delivered by either side over the life of the contract (estimated at drafting from clause amounts; for REVENUE_SHARE, `sharePct × trailing game-year profit × term`).

**§3.6.9 Termination and party loss.** A party whose account is deleted (14 §3.1.7) or whose character becomes ESTATE: ACTIVE contracts follow their TERMINATION clause if present; otherwise they terminate with escrow returned and pending payments settled pro rata. LOAN obligations survive into the estate and are paid in 07's liquidation order.

**§3.6.10 Forum.** Each contract elects COURT (13's civil court of the bloc of the first party's home city) or ARBITRATION (13 arbitration: an NPC panel, or a player arbiter licensed by 13 and selected by the parties; arbiters' reputation is a public record). Arbitration is faster (13 sets 2–6 real hours) and its award is engine-enforced from escrow where possible.

**§3.6.11 Mandate rules.** A mandate is valid only if `0 < maxLeverage ≤` the principal's own license cap, `0 < maxPositionPctNav ≤ 1`, `0 < maxDrawdownPct ≤ 0.9`. Every intent submitted by the operator for the principal is validated at P1 against: intent kind in `allowedIntentKinds`, asset class allowed, post-trade leverage and position limits computed on the scope, spend cap, legal-risk tag (13 marks intents such as trading during a blackout as risky), and the principal's own licenses and holds. When the scope's drawdown from its high-water mark exceeds `maxDrawdownPct`, the mandate becomes `SUSPENDED_BREAKER` (operator may only reduce risk) until the principal re-enables it. An operator that breaks the law under a mandate is the principal's legal problem as well (13: both may be charged; old 02 §4.1 rule 5). Tightening limits takes effect after `noticeTicksForChange`; loosening is immediate.

**§3.6.12 Anti-funneling** (old 02 §8.2, §10.1):
- Flags at drafting: price > 10% from fair value (05/06/09/10 marks), loan rate below the bloc policy rate − 2 percentage points, revenue share or gift to an account younger than 7 real days, any party pair with `LinkPair.suspect`.
- Flagged contracts are allowed but count fully against the payer's P2P cap and go to the integrity queue.
- Contracts between `linkedAccounts` are VOIDED (unwound, fees not refunded, 13 notified as a possible S4 scheme).
- P2P caps per payer per real day (all P2P value out, real): account age < 7 real days: `$10,000`; 7–20 days: `$1,000,000`; ≥ 21 days: `10% of the payer's rank-basis NW` (minimum $1,000,000). Loan principal counts at 50%. Inflows are uncapped.

**§3.6.13 Templates.** One-tap templates (22 lists text keys): Sell a business, Sell a property, Loan with collateral, Lease my office, Revenue share, Join a syndicate, Hire a manager (MANDATE), Security retainer (SERVICE_LEVEL), Model license, Supply agreement, Subcontract an order, Option to buy my stake, Bounty for evidence. Templates fill defaults; the advanced builder exposes every field.

### §3.7 Alliances

**§3.7.1 Tiers** (old 02 §7.1; caps kept small on purpose):

| Tier | Members | Requirement | Charter fee (real, sink `ALI_CHARTER_FEE`) |
|---|---|---|---|
| PARTNERSHIP | 2–5 | none | 0 |
| FIRM | up to 15 | HQ office (a commercial property owned or leased by the treasury or a member, 10) | $5,000,000 |
| CORPORATION | up to 40 | HQ tower (10 property class `TOWER`) owned by the treasury or a consortium | $250,000,000 |
| CONGLOMERATE | up to 40 + 3 subsidiary FIRMs | treasury + consortium equity ≥ $5,000,000,000 real | $0 extra (qualification only) |

Upgrades are proposals (§3.7.4). Blocs larger than 160 people form only through visible contracts between alliances.

**§3.7.2 Treasury.** The alliance id is an `ali` entity with its own balance sheet (03). Inflows: voluntary contributions (`ALI_CONTRIBUTION`, TRANSFER), member tax `memberTaxPct × member's daily business operating profit` collected at day close by 09 (`ALI_MEMBER_TAX`, TRANSFER), consortium dividends. `DEFAULT (Mathis may override)`: inflows into one's own alliance treasury are exempt from the 2% P2P tax (pooling), while every outbound transfer from the treasury to a character or to a non-consortium entity pays the 2% tax and is subject to the linked-account checks and to the P2P cap of §3.6.12 (the treasury is aged by the alliance's founding date). Pooling stays cheap and a treasury cannot be a tax-free funnel. Outflows only by permission. Every movement appears on the members-only alliance ledger view.

**§3.7.3 Roles and permissions.** Defaults (charter may change by vote):

| Permission | CHAIR | TREASURER | CISO | GENERAL_COUNSEL | ANALYST | MEMBER |
|---|---|---|---|---|---|---|
| TREASURY_SPEND (alliance purchases) | ✓ | ✓ | SOC only | legal only | — | — |
| TREASURY_TRANSFER_OUT (to any entity) | ✓ | ✓ | — | — | — | — |
| APPROVE_DEALS (sign contracts for the alliance) | ✓ | ✓ | — | ✓ | — | — |
| LAUNCH_OPS (joint ops, 12) | ✓ | — | ✓ | — | — | — |
| HIRE_LAWYERS | ✓ | — | — | ✓ | — | — |
| MANAGE_SOC | ✓ | — | ✓ | — | — | — |
| INVITE | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| KICK | ✓ (by proposal) | — | — | — | — | — |
| POST_INTEL / READ_INTEL | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | —/✓ |
| DECLARE_RIVALRY, PROPOSE_VOTE | ✓ | ✓ | ✓ | ✓ | ✓ | PROPOSE only |
| MANAGE_CONSORTIUM, SET_TAX | ✓ (SET_TAX by proposal) | ✓ | — | — | — | — |

Limits: one CHAIR, ≤ 2 TREASURERs, one CISO, one GENERAL_COUNSEL, ≤ 5 ANALYSTs. Default `roleSpendLimitsRealPerDay`: CHAIR $10M, TREASURER $5M, CISO $1M (SOC), GENERAL_COUNSEL $1M (legal); `multisigThresholdReal` default $2M with 2 approvals. A spend above the role limit or the multisig threshold becomes a `LARGE_SPEND` proposal.

**§3.7.4 Proposals and votes.** Any role with PROPOSE_VOTE opens a proposal; voting lasts `PARAM.alliance_vote_game_days = 24` (one real day). Passing: turnout ≥ quorum (default 50% of members) and YES > NO; MERGER, DISSOLUTION, TIER_UPGRADE and CHARTER_CHANGE need ≥ 2/3 of votes cast. KICK of a CHAIR needs 2/3 and turnout ≥ 75%. Executed on the tick after closing.

**§3.7.5 Joining, leaving, kicking.** Invitations expire after 72 game days. A character can be in one alliance (subsidiary FIRMs count as separate alliances; a member of a subsidiary is not a member of the parent). After leaving or being kicked: `PARAM.alliance_hop_cooldown_real_hours = 48` before joining another (anti-spy). Kicked members keep their own assets; syndicate and consortium stakes remain contract holdings.

**§3.7.6 Syndicates.** A syndicate is an EQUITY_STAKE contract over a holding company (09 `cmp`) that the participants fund pro rata to buy one asset too big for one member (a B5 business, a stadium, a takeover stake). Profits flow pro rata at each day close; votes per the clause's voting rule. Syndicates can include non-members.

**§3.7.7 Shared defense, intel and joint ops.** SOC (CORPORATION+): 12 owns levels 0–3 and their effect; the treasury pays. Intel feed: posts with provenance tags; ESPIONAGE-provenance items stay tagged as court evidence (12/13). Leaking alliance intel to outsiders is espionage op E6 (12) with an NDA civil claim if a contract exists. Joint ops: 12's combination rule (`AP_max + 0.5·Σothers`, max 5 participants); every participant's legal exposure is shared (13).

**§3.7.8 Rivalries.** One alliance with DECLARE_RIVALRY may declare a public rivalry with another for the next league week; the target cannot refuse (it is a framing layer only). Points for rival-vs-rival public actions during the week: hostile takeover bid on a rival member's company 10; winning a civil case against a rival member 8; a public short campaign whose true findings move a rival company's stock ≥ 5% (12 M1, verified true) 6; outbidding a rival at an auction for a lot ≥ $10M real 3; taking a district's demand leadership in a sector from a rival business (09) 3; detected-and-attributed successful op against a rival 4 (only after attribution, so hidden play never scores). Winner: higher total at week end; ties none. Reward: a cosmetic HQ trophy and a Wire item. No money.

**§3.7.9 Consortia (alliances as institutions).** A CORPORATION or CONGLOMERATE may create consortium companies (09 `cmp` with the treasury and optionally members as shareholders via EQUITY_STAKE). A consortium can apply for charters (13: CH_BANK, CH_FUND, CH_INSURER, CH_EXCHANGE_MEMBER, CH_CUSTODIAN), bid on concessions (10) and own funds (08). Rank gates (14 §3.2.2) apply to the alliance's CHAIR. Consortium governance follows the EQUITY_STAKE clause; regulator obligations attach to the consortium (13).

**§3.7.10 Mergers and acquisitions of alliances.** A merger needs a passed MERGER proposal in both alliances; the combined member count must fit the surviving tier; treasuries merge (`ALI_MERGE`, TRANSFER, exempt from P2P tax); the surviving name and charter are chosen in the proposal. An alliance can also buy majority stakes in other alliances' consortium companies through normal takeover rules (09).

**§3.7.11 Embezzlement.** A TREASURER or CHAIR can transfer treasury funds within their daily limit to any entity, including themselves; nothing stops the transfer at P1. A transfer out to the actor, to an entity they control, or to a linked account is automatically an **embezzlement** event: 13 opens a high-detection case at once (13 sets the evidence grant), the alliance is notified, and the actor's Reputation history records the line on conviction. The multisig threshold is the counterplay: it caps what one betrayer can move in a day.

**§3.7.12 Dissolution.** A passed DISSOLUTION: consortium stakes are distributed to members pro rata by contribution (EQUITY transfer), treasury cash likewise after debts; HQ property sold or distributed per proposal.

**§3.7.13 Alliance HQ effect.** 10 applies the desirability effect of an HQ on its district.

### §3.8 Public filings

Filings are the legal disclosure rules of the world. They are the only way positions become public apart from opt-in and espionage (L11). Beneficial ownership is computed by 03 consolidation (direct holdings + controlled entities + delta of options/swaps referencing the shares + holdings of parties to an engine-visible concert contract: EQUITY_STAKE or COVENANT `VOTE_WITH` about that company).

| Kind | Who must file | Trigger | Due | Public content |
|---|---|---|---|---|
| OWNERSHIP_5 | any beneficial owner | crossing 5% of a listed company's voting shares upward; each 1% change while ≥ 5%; crossing below 5% | 720 ticks (1 game day) | filer display name, company, % to 0.1, intent PASSIVE/ACTIVE, change |
| SHORT_POSITION | any holder of a net short | net short ≥ 0.5% of a listed company's float; each 0.1% change; dropping below | 720 ticks | filer, company, % to 0.01 |
| INSIDER_TRADE | officers and directors of a listed company (09 seats, 14 Summit board seats), ≥ 10% owners | any trade in the company's securities | 1,440 ticks (2 game days) | filer, role, side, quantity bucket, price |
| HOLDINGS_QUARTERLY | every `fnd`, and any entity holding LIC4 with reportable long equity ≥ $1B real at a game quarter end | each game quarter end | 21 game days after quarter end | up to 20 long listed-equity positions, each ≥ 0.5% of the filer's reportable book, with quantity |
| MATERIAL_CONTRACT | listed companies (09) | contract worth ≥ 5% of annual revenue; start or end of a security vendor contract (12) | 1,440 ticks | counterparties, kind, value bucket |
| COMPANY_PERIODIC / COMPANY_EVENT / PROSPECTUS | listed and listing companies (09 owns content) | quarterly, material events, IPO | 09 | 09 |
| FUND_REPORT | funds (08 owns content and transparency level) | 08 | 08 | 08 |
| LOBBYING / CONTRIBUTION | lobbyists, donors (16) | 16 | 16 | 16 |
| VOLUNTARY_STATEMENT | anyone | any time | — | text + evidence refs (also a Wire statement, §3.10.4) |

`DEFAULT (Mathis may override)`: old 02's "top 200 NWI players publish their top 10 positions quarterly" is replaced by HOLDINGS_QUARTERLY above (funds and large LIC4 institutions only), because a rule that discloses holdings merely for being rich is too close to an automatic leak under L11; institutional disclosure is the real-world rule.

**Drafting and lateness.** The engine opens a `FilingObligation` with a pre-filled draft at the trigger tick and notifies the filer (category LEGAL). The filer may add an intent statement and submit (`soc.filing.submit`). If not submitted by the due tick, the registrar auto-files the draft at the due tick, marked "filed by the registrar", charges `PARAM.registrar_fee_real = $5,000` (sink `FILING_REGISTRAR_FEE`) and records `FILING_LATE` (14: −2 Reputation). Holdings the engine cannot see (concert action with no contract) carry no obligation in the engine; failing to disclose them is a matter for 13 investigations (13 owns it). A false voluntary statement or an amended filing that contradicts engine facts goes to 13 as possible S1–S5.

Filings never include anything beyond the listed fields. Filing feeds: the Wire (§3.10), Whale Watch (§3.11.1), the Research Desk (16), boards' public profile tabs.

### §3.9 Chat

**§3.9.1 Channels** (text only at launch, old 02 §8.4):

| Kind | Who can read/post | Slow mode (real seconds between posts per member) | Lifetime |
|---|---|---|---|
| COUNTRY | ACTIVE registered characters of the country (roll-up regions too) | 30 | permanent |
| CITY | residents (home city) and owners of a business or property in the city | 20 | permanent |
| LEAGUE_GROUP | group members for the week | 10 | the week, then archived read-only 7 days |
| ALLIANCE / ALLIANCE_OPS | members / roles with LAUNCH_OPS or MANAGE_SOC | 0 | alliance lifetime |
| CONSORTIUM | consortium shareholders | 0 | consortium lifetime |
| CLUB | club members (14) | 10 | permanent |
| EVENT_ROOM | hosted-event attendees (14) | 0 | event window |
| CONTRACT_THREAD | parties of a DRAFT/OFFERED/ACTIVE contract | 0 | contract lifetime + 7 real days |
| DM | between friends, between parties of an offered or active contract, between members of the same alliance | 0 | until either blocks |
| FINALS_LOBBY | finalists (read/post), spectators (read) | 10 | the Finals |

There is no single global channel (unreadable at scale). Guests can read their league group channel only.

**§3.9.2 Message rules.** ≤ 500 characters, plain text plus structured chips (ticker, receipt, filing, contract). No external links or images (`DEFAULT`). Rate limit per character: 6 messages per real minute across all channels, plus the channel's slow mode. Messages pass 21's filter: profanity and slurs masked; personal data patterns (emails, phone numbers) blocked; a classifier hit puts the message in `HELD_FOR_REVIEW` (visible only to the author until reviewed). Report, mute (per channel) and block (account-wide: blocks DMs, invitations, hosted-event invites and contract offers from the blocked party) are always available. Retention: `PARAM.chat_retention_real_days = 90`, then deleted except contract threads (kept while the contract is live). Chat is never evidence in any game rule (`DEFAULT`): only typed contracts and engine events are; this avoids fabricated "screenshots".

**§3.9.3 Resolves old 02 open question 5**: country and city chat open at launch with slow mode and moderation (21 staffs it); DMs restricted as above.

### §3.10 The Wire

**§3.10.1 What it carries.** Every Wire item comes from engine events (non-empty `sourceEventIds`): NEWS and WORLD_EVENT (16 generates), RUMOR (16), FILING (§3.8), VERDICT (13), MARKET (halts, circuit breakers, index moves ≥ 2%, from 05), PURCHASE (14, bucketed, consented), ALLIANCE (founding, tier upgrades, mergers, rivalries, embezzlement cases once public), STATEMENT (§3.10.4), OUTLET (player-owned media businesses, 09), CHAPTER (themes, Closing Bell, Finals), RECORD (Hall of Fame, R6), RANK (rank-ups at R3+), PHILANTHROPY (14), DAILY_CLOSE (05's "why it moved" daily close report and "priced in so far" bands).

No item reveals a player's positions except filings. "Whale accumulates X" auto-news from the old 01 §6.3 is **not** produced (L11, old bible R04): the Wire may report anonymous market facts (an unusual volume print, a block at the close) only as 05 publishes them, with no identity.

**§3.10.2 Feed ranking** for character `c` (computed when a client requests the feed; cached per character for 30 ticks):

```
score(item, c) = newsworthiness(item)
               × relevance(item, c)
               × recency(item)
               × (kind weight, default 1; RUMOR 0.8, STATEMENT 0.6, PURCHASE 0.5)
relevance = 1 + 2·[item touches an asset c holds or watches] + 1·[a city or bloc where c owns assets]
              + 1.5·[subject c follows] + 1·[c's country] + 0.5·[c's alliance]
recency   = 0.5 ^ ( (now − item.tick) / PARAM.wire_halflife_ticks )     wire_halflife_ticks = 360
```
Muted kinds and blocked authors are removed. The top `PARAM.wire_page = 50` items form a page. Holdings-based relevance runs server-side for that character only and is never visible to others. **Breaking strip**: items with `breaking = true` (16 sets it for major crises and market-wide halts) pin to the top of every feed for 30 ticks.

**§3.10.3 Information tiers.** The free Wire shows headlines when they publish. Paid tiers (Terminal, Research) are 16's; the Wire shows a lock icon on bodies the viewer's tier does not include.

**§3.10.4 Player statements.** `soc.wire.post` publishes a STATEMENT: ≤ 280 characters, up to 3 asset tags, up to 5 evidence refs (filings, public records, verdicts, the author's own verified track record, published research). Fee `PARAM.wire_post_fee_real = $500` (sink `WIRE_POST_FEE`), max 3 per game day per character. Distribution: always to followers; to non-followers in the "Voices" section with weight `reachWeight` (14 §3.8.3) × the author's statement credibility (16 belief model: a public track record of statements later verified TRUE or FALSE). 05's belief model reads statements with asset tags as sentiment impulses (bounded by 05). Statements making factual claims about a tagged listed company are checked by 16's resolver against engine facts after `PARAM.statement_resolve_game_days = 5`; FALSE claims go to 05's surveillance score and 13 (manipulation), TRUE ones raise credibility. OPINION (no checkable claim) never resolves.

**§3.10.5 Outlets.** A player-owned media business (09) publishes OUTLET items under its masthead with its own credibility; lying in them is manipulation (13), the same as statements.

### §3.11 Spectating, replays, While You Were Away, notifications

**§3.11.1 Whale Watch.** A page listing the top 50 of RICHEST globally and in the viewer's country, with for each: profile card, recent public filings, verdicts, Gilt appearances, public purchases, alliance. Nothing else (no positions beyond filings).

**§3.11.2 Replays.** Built from public events and public market data only (02 replay API in a sandbox): any asset's tape over any past public window (05), takeover battles (bids and filings), court cases (public portions per 13), crash days (market-wide), Finals (with the spectator delay), famous hacks only as their public post-verdict facts. A player can replay their own private history privately (their own fills, ops, sessions). Replays never show another player's private actions.

**§3.11.3 Live events page.** Calendar of central-bank meetings, earnings clusters, elections (16), chapter clock, league week end, Finals clock, AI tournament lock time, scheduled Galas, drop windows (14).

**§3.11.4 While You Were Away.** Built on login when the last presence was ≥ `PARAM.wywa_min_absence_real_minutes = 20` ago. Card order (old 04 §4.4): (1) money: one big number (Δ rank-basis NW since last presence) with the split businesses / markets / properties / other; (2) needs action: margin calls, lawsuits, contracts awaiting signature, filings due, Held, Fresh Start eligibility; (3) security: detected attacks and scan results (12), and exactly one neutral line for model oddities ("3 oddities on Aster-2 while you were away", never more specific, 04 §10.5.1); (4) rivals: who passed you in the league and on country boards; (5) alliance events; (6) Wire highlights: top 3 items by feed score; (7) Chief of Staff results (14). Maximum 12 cards; swiping through takes under 30 seconds.

**§3.11.5 Notifications.** Categories in §2.9. All push is opt-in, asked only after value is shown (18). Cap `PARAM.push_cap_per_real_day = 5`, except SECURITY and MARGIN, which may exceed the cap up to 10 total while the character is under active attack or margin call. Quiet hours (17 prefs) suppress all but SECURITY and MARGIN. Pushes are never sent for a silent plant (12): only for detected events. Batching: several events of one category within 15 real minutes merge into one push. Email digest optional (daily or weekly).

### §3.12 Anti-cheat and integrity

**§3.12.1 Threats and counters** (old 02 §10.1, kept and made exact):

| Threat | Counter |
|---|---|
| Client tampering | server authority; clients send intents only (19) |
| UI botting outside the in-game AI and API | 20 intents per tick per character (00 §5.5); timing analysis (§3.12.4); no speed advantage (batch auction); in-game AIs and the official API are cheaper anyway |
| Multi-accounting and alt funneling | link scoring (§3.12.2), P2P caps by account age (§3.6.12), no P2P for guests, off-market flags, voiding between linked accounts |
| Collusion (fake lawsuits, fake hacks, wash trades, farmed boards) | value-flow graph (§3.12.3); 13 voids settlements between linked accounts; 12 voids sessions between linked accounts; boards ignore scores earned against linked accounts; 05 blocks self-matching of the same beneficial owner |
| Real-money trading | ToS ban; P2P caps; flags on large transfers to new accounts; handle-change limits (14); 24-hour hold on P2P transfers above $1M real after a password or email change |
| Exploiting bugs | event log finds every beneficiary; targeted rollback by compensating ledger entries (`INTEGRITY_CLAWBACK`, reason-coded, second admin approval, 21); never a world rollback |
| Real account theft | 2FA for top-1% and Chairs (14 §3.1.6), new-device alerts, the 24-hour hold above |
| Harassment | block, mute, report, slow mode, 21 moderation; 12/13 repeat-targeting caps |
| Leaking hidden sessions by datamining | identical serialization and hourly refresh (12 owns) |
| Timing attacks on news or the seed | batches close before publication; seed secret; commit-reveal entropy (02) |
| Insider abuse by staff | admin actions are ledger events with reason codes, second approval for any mint, internal audit log (21) |

**§3.12.2 Link scoring.** For each pair of accounts with any shared signal, signals are scored and combined:

| Signal | Strength `s` |
|---|---|
| `DEVICE` (same device fingerprint seen on both within 30 real days) | 0.5 |
| `PAYMENT` (same payment instrument for cosmetics, 21) | 0.6 |
| `IP_ASN` (fraction of sessions sharing IP /24 in the last 30 real days, × 0.4) | ≤ 0.4 |
| `EMAIL_PATTERN` (normalized email local-part similarity ≥ 0.8) | 0.1 |
| `LOGIN_TIMING` (never both online at once over ≥ 20 sessions while sharing IP) | 0.2 |
| `BEHAVIOR` (intent-sequence similarity ≥ 0.9, computed weekly) | 0.2 |
| `VALUE_FLOW` (§3.12.3 one-directional flow flag) | 0.3 |
| `REFERRAL` (one referred the other) | 0.05 |
| `ADMIN_CONFIRMED` | 1.0 |
| `DECLARED_HOUSEHOLD` | 1.0 |

```
score = 1 − Π_signals (1 − s)
linked  = score ≥ PARAM.link_hard = 0.7  OR admin-confirmed OR declared OR same beneficial owner (03)
suspect = PARAM.link_soft = 0.4 ≤ score < 0.7
```

The exported predicate used by every module is `linkedAccounts(a: EntityId, b: EntityId): boolean`, evaluated on the controlling characters of the entities (`true` also when both are controlled by the same character). Effects of `linked`: contracts voided (§3.6.12), sessions voided (12), settlements voided (13), board, ladder, Most Wanted and Defender scores against the other ignored, Reputation events between them ignored (14), P2P transfers refused. Effects of `suspect`: P2P between them capped at $10,000 real per real day, every contract flagged, a review case opened. Families who share devices can **declare a household** (`soc.integrity.declareHousehold`): the pair is linked for all rules above, but no sanction applies. Link scores and signals are never shown to players.

**§3.12.3 Value-flow graph.** Daily, for every ordered pair (a→b) with ≥ 5 value-moving interactions in the trailing 14 real days (contract payments, auction wins at above fair value, P2P transfers, settlements, op loot), compute `flowRatio = value(a→b) / (value(a→b) + value(b→a))`. If `flowRatio ≥ 0.8` and `value(a→b) ≥ $50,000 real`, add `VALUE_FLOW` evidence and open an `ALT_FUNNEL` review. Clusters (connected components of suspect or linked pairs with ≥ 3 accounts) open a `COLLUSION` review.

**§3.12.4 Botting signals.** A character is flagged `BOTTING` for review if any holds for 3 consecutive real days: presence ≥ 20 real hours per real day; intent inter-arrival times with coefficient of variation < 0.05 over ≥ 500 intents; ≥ 90% of ticks with an intent while present. The sanctioned automation routes are the in-game AI (11) and the official intent API (19) under the same limits. **V3 question 3 resolved** (`DEFAULT, Mathis may override`): the official read/write intent API is available to a character holding license LIC2 Pro or higher, with 2FA (MFA) enabled and account age ≥ 7 real days (ruling in 24; 19 Rule 3.10.3 implements the `api.eligible` flag), using the same 20 intents per tick and the same validation as the UI. Rank and Reputation are not API gates.

**§3.12.5 Enforcement ladder** (old 02 §10.2): warning → asset clawback of exploit gains → temporary ban (character frozen like Held, removed from boards for the rest of the chapter) → account ban. Every step is logged with evidence and appealable through 21's support flow. Confidence < 0.6 never bans; it can place the character in a **shadow pool** (§3.12.6).

**§3.12.6 Shadow pools.** A character with an open integrity case of confidence 0.4–0.6 is grouped in leagues only with other shadow-pool characters and hidden from public top-100 views; everything else (trading, contracts with unlinked players subject to caps) works normally. The pool lasts until the case closes or 14 real days pass.

**§3.12.7 Integrity telemetry** (21 dashboard, also per partition and country): money minted and destroyed per tick by reason code, top 20 wealth deltas per game day with explanation breakdown, P2P flow graph, contract defaults, flagged accounts, tick timing. The public Stabilizer and Exchange integrity report (03, 20) publishes aggregates and exploit-fix history.

### §3.13 Activity states and estates

Thresholds count real days since the last presence (an authenticated socket or an intent).

| State | From | Effects |
|---|---|---|
| ACTIVE | presence | normal |
| INACTIVE | 14 real days | cannot be targeted by new ops; open hidden sessions on the character's models freeze (12 §3, matching 12's 14-day rule); businesses keep running under 09's offline cap; AIs keep their mandates; still on boards |
| DORMANT | 30 real days | leaves every board except RICHEST all-time (marked dormant) and every league; businesses go IDLE with no income and keep 50% attractiveness weight in their markets (09 §3.4.4 owns this; properties keep 100% income under a manager, 10; ruling in 24); unique assets lose protection from antitrust and takeover rules (01 §14.2) |
| ESTATE | 90 real days | UNIQUE assets (14 UNIQUE items, unique businesses and concessions held outright) go to the estate auction (06 auction lots of type ESTATE_SALE); proceeds are paid to the owner as cash; everything else stays owned |

This resolves an old inconsistency: old 03 §13.6 made "dormant (14 days)" untargetable while old 02 §3.7 used 14 days for inactive and 30 for dormant; the targeting block now starts at INACTIVE (14 days), as 12 already assumes. A returning character becomes ACTIVE at the next tick, gets a "Since you left" digest (16 history, §3.11.4 cards), and rejoins leagues at the next league week.

### §3.14 Challenge events and the weekly AI tournament

**§3.14.1 Ring-fenced portfolios.** A challenge uses `ChallengePortfolio`s with identical starting notional. They never touch the real empire: no posting from or to a challenge portfolio ever reaches the main ledger (02 runs scenario markets in a sandbox partition; live-shadow challenges are accounted in a separate sub-ledger that 03 excludes from every money aggregate). Rewards are titles, cosmetics and title PP only (14), never money. A challenge is also the safe test bed for new rules before they reach the world (21 feature flags).

**§3.14.2 Market modes.**
- `SCENARIO`: a scenario market seeded from a seed committed (hash published) before entries close, revealed after results. Determinism makes every entrant face the same world.
- `LIVE_SHADOW`: trades on the live world's markets, but orders never enter the live auction; each order fills at that tick's clearing price plus a simulated square-root impact against that asset's live ADV (05 formula) so size still costs. Live prices are unaffected.

**§3.14.3 Catalog** (launch):

| Kind | Market | Notional | Duration | Rules |
|---|---|---|---|---|
| CRASH_COURSE | SCENARIO (a crash scripted inside the scenario) | $100,000 | 7 game days of scenario (runs over 1 real weekend at pace 4 → about 1.75 real days) | all classes the entrant is licensed for |
| PURE_MARKETS | LIVE_SHADOW | $1,000,000 | one league week | no cyber layer; equities, FX, crypto only |
| SPEEDRUN | SCENARIO at pace 4 | $50,000 | 24 real hours | businesses allowed in the scenario city |
| SCENARIO (named templates) | SCENARIO | $10,000,000 | 3 real days | named, replayable crisis templates: "The Securitization Unwind", "The Repo Run", "Sovereign Default", "Crypto Winter", "The Rate Shock", "The Flash Crash" |
| SEASON_FINALS | §3.5.4 | $10,000,000 | 48 real hours | finalists only |
| AI_TOURNAMENT | §3.14.4 | $1,000,000 | weekly | models only |
| AI_ARENA | SCENARIO, shared | $1,000,000 | 3 real days, once per chapter | top 32 per division trade in one shared seeded market |

**V3 question 4 resolved:** named, real-world-inspired crisis templates exist as replayable scenarios in challenge events, in the Academy and in practice worlds (18) only (and as harness scenarios, 20 Rule 3.8.4); the live world's crises are always emergent (04, 07, 16). Ruling in 24. Each chapter offers at most 2 SCENARIO challenges and 2 other challenges, scheduled by 21.

**§3.14.4 Weekly AI tournament** (approved L13; old ROADMAP §2.4):
1. **Entry.** One frozen model per character per week (11 freezes the strategy graph and parameters and returns `frozenHash`). Entries lock every Sunday at 18:00 UTC; no resubmission after lock.
2. **Divisions** by the entrant's AI tier (11): LAPTOP (T0–T1), STARTUP (T2–T3), FRONTIER (T4–T5). Each entry runs at its tier's DU cap (RESOLVED-NUMBERS A1).
3. **Format v1, isolated runs.** Each entry trades alone in its own copy of a scenario world: 3 secret seeds, each 30 game days (21,600 ticks), $1,000,000 notional. Seeds are committed before the lock and revealed with results. Runs execute off-peak in batch (19).
4. **Score.** Median across the 3 seeds of the annualized Sharpe of daily returns net of fees. Disqualified if any run's max drawdown > 40% or it makes fewer than 20 trades in any seed. Tie-break: total return across seeds. The benchmark ghost and house AIs appear as reference rows.
5. **Integrity.** Forensic audit of each division's top 10 by 11/12: a proven stolen student (watermark residue match) is disqualified and the match adds evidence to the triple (13).
6. **Rewards.** Weekly division titles (14), trophy decor, and the chapter aggregate (best 5 of 8 weeks). No cash.
7. **Publishing.** Nothing about a strategy is published automatically. Top-3 entrants may opt in to publish their tournament trade log with commentary (never weights; old ROADMAP N8).
8. **AI_ARENA (format v2).** Once per chapter, each division's top 32 by chapter aggregate trade in one shared seeded market for 3 real days, so impact and crowding matter.

### §3.15 Reason codes owned by 15

| Code | Class | Use |
|---|---|---|
| `CTR_REGISTRATION_FEE` | SINK | contract registration |
| `CTR_P2P_TAX` | TRANSFER (leg to the tax authority, E-9; alias `TAX_P2P_TRANSFER`) | 2% transfer tax |
| `CTR_TRANSFER`, `CTR_LOAN_PRINCIPAL`, `CTR_LOAN_INTEREST`, `CTR_LEASE_RENT`, `CTR_REVSHARE`, `CTR_OPTION_PREMIUM`, `CTR_OPTION_SETTLE`, `CTR_SERVICE_FEE`, `CTR_LICENSE_FEE`, `CTR_SUPPLY_PAYMENT`, `CTR_PENALTY`, `CTR_BOUNTY`, `CTR_GUARANTEE`, `CTR_COLLATERAL_SEIZE`, `CTR_TERMINATION_FEE`, `CTR_MANDATE_FEE` | TRANSFER | contract flows between players (NPC counterparty flows use the same codes and 03's boundary rule reclassifies them as FAUCET or SINK) |
| `ALI_CHARTER_FEE` | SINK | alliance tiers |
| `ALI_CONTRIBUTION`, `ALI_MEMBER_TAX`, `ALI_PAYOUT`, `ALI_MERGE`, `ALI_SOC_FEE` (SINK when paid to NPC SOC vendors) | TRANSFER | treasury |
| `FILING_REGISTRAR_FEE` | SINK | auto-filed late filings |
| `WIRE_POST_FEE` | SINK | statements |
| `INTEGRITY_CLAWBACK` | per the original posting's class, reversed | exploit rollback |

---

## §4 Player intents

Common validation: registered account (except where noted), character not banned or anonymized, rate limit 20 per tick. Held characters (13) may only use chat (read-only in public channels), `soc.contract.sign` for contracts that reduce their risk (13 decides), `soc.filing.submit` and `soc.alliance.vote`. All apply in P12.

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `soc.country.change` | `{ country }` | 180-day rule | country set; chapter country scores reset |
| `soc.follow` / `soc.unfollow` | `{ subjectId }` | not blocked | follow edge |
| `soc.friend.request` / `.accept` / `.remove` | `{ characterId }` | not blocked | friendship |
| `soc.block` / `soc.unblock` | `{ characterId }` | — | block edge |
| `soc.chat.post` | `{ channelId, body, chips }` | member; slow mode; rate; length | message (filter, moderation state) |
| `soc.chat.report` | `{ messageId, reason }` | can read it | 21 queue |
| `soc.chat.mute` | `{ channelId, characterId, durationRealMinutes }` | — | mute |
| `soc.dm.open` | `{ characterId }` | DM rules §3.9.1 | channel |
| `soc.wire.post` | `{ text, assetTags, evidenceRefs }` | ≤ 3 per game day; fee; text filter | STATEMENT |
| `soc.wire.mute` | `{ kind?, authorId? }` | — | feed filter |
| `soc.contract.draft` | `{ templateId?, parties, clauses, forum, arbitratorId? }` | §3.6.6 drafting rules; illegal-content check | DRAFT |
| `soc.contract.offer` | `{ contractId, expiresTick }` | author; expiry ≤ 7 real days | OFFERED; notifications |
| `soc.contract.sign` | `{ contractId, partyId }` | signer controls party; all flags acknowledged; P2P cap headroom | signature; escrow at last signature |
| `soc.contract.decline` | `{ contractId }` | party | contract EXPIRED_UNSIGNED for all |
| `soc.contract.amend` | `{ contractId, clauses }` | ACTIVE; creates a new version needing all signatures | |
| `soc.contract.exercise` | `{ contractId, clauseIndex }` | OPTION holder before expiry | settlement |
| `soc.contract.terminate` | `{ contractId }` | TERMINATION clause allows actor | notice period starts |
| `soc.contract.assign` | `{ contractId, partyId, toEntityId }` | ASSIGNMENT allowed; consent; not linked | position moved |
| `soc.contract.claim` | `{ contractId, clauseIndex, claimText }` | party | DISPUTED; 13 case or arbitration |
| `soc.mandate.grant` | `{ mandate }` (inside a MANDATE contract or a unilateral grant to an NPC manager or own model) | §3.6.11 | ACTIVE mandate |
| `soc.mandate.update` / `.revoke` | `{ mandateId, changes? }` | principal | tightening after notice; revoke immediate (open positions stay) |
| `soc.alliance.found` | `{ name, tag, crest, tier: 'PARTNERSHIP' }` | not in an alliance; hop cooldown | alliance, actor CHAIR |
| `soc.alliance.invite` / `.join` / `.leave` | `{ allianceId, characterId? }` | permission; caps; cooldown | membership |
| `soc.alliance.propose` | `{ kind, payload }` | PROPOSE_VOTE | proposal |
| `soc.alliance.vote` | `{ proposalId, vote }` | member | vote |
| `soc.alliance.treasury.spend` | `{ purpose, amount, toEntityId }` | permission; limits; multisig | transfer or LARGE_SPEND proposal; embezzlement check §3.7.11 |
| `soc.alliance.treasury.approve` | `{ spendId }` | multisig role | approval |
| `soc.alliance.contribute` | `{ amount }` | member; unrestricted cash | TRANSFER |
| `soc.alliance.intel.post` | `{ kind, bodyText, attachments, provenance }` | POST_INTEL | intel post |
| `soc.alliance.rivalry.declare` | `{ targetAllianceId }` | DECLARE_RIVALRY; one per week | rivalry next week |
| `soc.alliance.consortium.create` | `{ name, shareholders }` | CORPORATION+; MANAGE_CONSORTIUM | consortium cmp (09) |
| `soc.filing.submit` | `{ obligationId, intentStatement? }` | filer | FILED |
| `soc.filing.voluntary` | `{ text, evidenceRefs }` | — | VOLUNTARY_STATEMENT filing |
| `soc.challenge.enter` | `{ eventId, modelId? }` | event OPEN; eligibility (license set for live, tier for AI) | portfolio or tournament entry |
| `soc.challenge.order` | `{ portfolioId, order }` | own portfolio; ruleset | challenge fill |
| `soc.tournament.publishLog` | `{ entryId }` | top 3 | published |
| `soc.integrity.declareHousehold` | `{ otherCharacterId }` | both confirm | linked, no sanction |
| `soc.notify.prefs` | `NotificationPrefs` (17) | — | prefs |

---

## §5 Engine events

| Kind | Payload | Visibility | Consumers |
|---|---|---|---|
| `soc.chapter.boundary` | `{ ended, started, themeId }` | PUBLIC | every module's chapter hooks |
| `soc.board.snapshot` | `{ boardId, scope, period, tickDigest }` | PUBLIC | 17, 14 (titles), 16 (history) |
| `soc.league.result` | `{ characterId, weekIndex, tier, result }` | PARTIES (own) | 17, 14 titles |
| `soc.finals.started` / `.ended` | `{ eventId, finalists, winner? }` | PUBLIC | 14, 16, 17 |
| `soc.contract.state` | `{ contractId, from, to, by }` | PARTIES | 13, 14 (Reputation), 12 (SLA) |
| `soc.contract.breach` | `{ contractId, clauseIndex, breacher, amount }` | PARTIES (PUBLIC count on the counterparty card) | 13, 14 |
| `soc.mandate.breaker` | `{ mandateId }` | PARTIES | 08, 11 |
| `soc.alliance.*` (founded, tier, merged, dissolved, rivalry, kicked) | ids | PUBLIC (membership changes PARTIES) | 16, 17 |
| `soc.alliance.embezzlement` | `{ allianceId, actorId, amount }` | SEALED until 13 makes the case public | 13 |
| `soc.filing.filed` | `{ filingId, kind, filerId }` | PUBLIC | 05 (belief), 16 (Research Desk), 13 |
| `soc.filing.late` | `{ obligationId }` | PUBLIC | 14, 13 |
| `soc.wire.item` | WireItem | PUBLIC | clients |
| `soc.statement.resolved` | `{ statementId, verdict }` | PUBLIC | 05, 13, 16 |
| `soc.integrity.link` | `{ a, b, linked, suspect }` | PRIVATE (internal only) | 12, 13, 14 |
| `soc.integrity.action` | `{ caseId, action }` | PRIVATE to the subject | 21 |
| `soc.activity.state` | `{ characterId, from, to }` | PRIVATE | 09, 12, 06 (estate lots) |

---

## §6 NPC behaviour

1. **NPC rival funds on boards** (L13): 16's styled NPC funds (value, momentum, crypto degen, macro, quant, credit; 30 at launch) are scored with the same formulas and appear as reference rows (§3.4.1). They file HOLDINGS_QUARTERLY like any fund.
2. **NPC counterparties in contracts.** 16's actors offer and accept contracts through the same engine: NPC suppliers and customers offer SUPPLY contracts with requirements (old bible C05–C07), NPC lenders lend through 07 (not contracts), NPC landlords lease, NPC firms buy services (SERVICE_LEVEL), NPC collectors buy items. An NPC accepts a contract when 16's decision model scores it above its no-deal utility; NPCs never sign clauses the engine cannot verify (no COVENANT), and never sign with characters whose Reputation is below their actor's `minCounterpartyRep` trait.
3. **NPC filers.** NPC funds, NPC dynasties' holding companies and NPC insiders file under the same rules, so Whale Watch and the Research Desk see real NPC disclosures (16 dynasty discovery uses them).
4. **NPC outlets on the Wire.** 16's media outlets publish NEWS items under their mastheads with their credibility and editorial line.
5. **No NPC chats, joins alliances, or appears in leagues.** NPCs do not post statements except as outlets.
6. **NPC arbitration panels** (13) serve the ARBITRATION forum.

---

## §7 Screens

| Screen (17 app) | Shows | Drives |
|---|---|---|
| Chapter hub (`boards`) | chapter number, theme, countdown in serif numerals, ladders, Closing Bell banner, Finals clock, past chapters strip | — |
| Leaderboards and league (`boards`) | the viewer's league group first, then scope switch (Global/Country/City/Sector) and period switch, board tabs, own row pinned, rival highlighted, promotion/relegation lines | follow, profile |
| Hall of Fame (`boards`) | records per chapter, global and country | replay links |
| Challenges (`boards` sub-view) | open and upcoming challenges, entry, live challenge portfolio terminal (same Broker components in a ring-fenced frame), tournament entries and results | enter, trade |
| Finals spectator page | finalists' NAVs and delayed positions | — |
| Alliance HQ (`alliance`) | treasury and ledger, roles, proposals, SOC, intel feed, ops board (12), syndicates and consortia, rivalry scoreboard, chat | all `soc.alliance.*` |
| Contract builder and inbox (`contracts`) | templates, clause cards, live summary, counterparty card, flags, escrow status, signatures, timeline, claims | all `soc.contract.*` |
| Filings (`legal` sub-view and `research`) | own obligations with due countdowns, public filings search, Whale Watch | submit, voluntary |
| Wire and Whale Watch (`wire`) | feed with filter chips, breaking strip, Voices, statement composer with fee and limit | post, mute |
| Messages (`messages`) | channels, DMs, contract threads, event rooms | chat intents |
| While You Were Away (overlay) | §3.11.4 cards | tap-throughs |
| Replays (`replay`) | timeline player over public events | — |
| Live events page (`wire` sub-view) | calendar §3.11.3 | reminders |
| Settings: notifications, country, household declaration | — | prefs |

---

## §8 Edge cases

1. **Chapter boundary during a FINISH_WINDOW crash.** Scores use the 24-close average; no special handling.
2. **A finalist is convicted during the Finals.** Finals results stand (ring-fenced); titles are withheld if a ban follows within 7 real days.
3. **League group under 20 members after placement.** Merged per §3.5.1.
4. **A country crosses 500 mid-chapter.** Its own board starts with the chapter's scores computed from the start of the chapter (scores are per character, so this is a view change only).
5. **Contract party becomes INACTIVE.** Engine clauses keep executing; signature requests to them expire normally.
6. **Escrowed asset loses value** (stock crash). Escrow holds quantities, not values; the contract executes on quantities.
7. **Collateral seized but worth less than the debt.** Shortfall becomes a judgment debt (13 garnishment); the lender's loss is recorded.
8. **Option underlying delisted.** 06's corporate-action rule converts the underlying; the option follows it.
9. **NON_COMPETE restricted party buys a company that already operates in scope.** The acquisition is allowed; opening new businesses in scope stays blocked; operating the acquired one is a court claim (non-verifiable intent).
10. **Two alliances declare rivalries on each other for the same week.** One rivalry record.
11. **Alliance falls below tier requirements** (HQ sold). Tier drops at the next day close; members beyond the cap stay but no new invitations until within cap; SOC above the new tier's limit lapses.
12. **Treasurer embezzles exactly at the multisig threshold.** Only spends strictly above the threshold need approvals.
13. **Filing obligation for a holder who becomes ESTATE.** Auto-filed by the registrar without fee.
14. **Statement tags an asset that is delisted before resolution.** Resolved against engine facts as of the statement tick.
15. **WYWA after a 90-day absence.** Cards include the estate auction results first.
16. **Declared household pair where one later wants to separate.** Undeclaring takes effect after 30 real days; signals still apply.
17. **A board tie at a chapter title.** Both share the title if scores are bit-identical; otherwise earlier tick wins.
18. **A guest reaches top 100 by NW.** Guests never appear; registration within 30 minutes of play is required anyway.
19. **AI tournament model is deleted after lock.** The frozen copy still runs; deletion does not withdraw.
20. **A character changes country during Closing Bell.** Allowed; their chapter country scores reset in both countries (no title in either).

---

## §9 Exploits and counters

| # | Exploit | Counter |
|---|---|---|
| 1 | Alt feeds main through contracts at off-market prices | flags, age-based P2P caps, link voiding, value-flow graph |
| 2 | Farm Climber with a fresh alt at $5k | $100k floor in the denominator; Climber eligibility requires NWend − netP2PIn ≥ $100k |
| 3 | Pump RICHEST_CHAPTER with gifts | netP2PIn subtracted |
| 4 | Last-minute pump at chapter end | 24-close average; player-issued instruments at lower of FV and 72-game-day VWAP |
| 5 | Sandbag into a weak league | placement by percentile with ±1 clamp; groups by hash |
| 6 | Board-hop countries | 180-day rule; chapter country scores reset |
| 7 | Treasury as a tax-free funnel | outbound treasury transfers taxed and capped; linked checks |
| 8 | Spy by joining and leaving alliances | 48-hour hop cooldown; intel retention per charter; canaries (12) |
| 9 | Hide a 5% stake via syndicate | syndicates are engine-visible EQUITY_STAKE contracts and aggregate into beneficial ownership |
| 10 | Avoid filings by staying at 4.9% with friends | concert without contract is invisible to the engine but prosecutable by 13 investigations; contracts that coordinate votes aggregate |
| 11 | Spam statements to move sentiment | $500 fee, 3 per game day, credibility weighting, FALSE claims to surveillance |
| 12 | Fake rivalry wins with a friendly alliance | points only for public actions against unlinked rival members; no money reward |
| 13 | Use challenge portfolios to move real money | ring-fenced sub-ledger excluded from all aggregates; no transfer path exists |
| 14 | Copy finalists live | 30-tick spectator delay; finalists see only ranks |
| 15 | Overfit the AI tournament | secret committed seeds, revealed after; median of 3 |
| 16 | Submit a stolen model to the tournament | forensic audit of top 10; DQ and evidence |
| 17 | Script the UI to watch the market | no speed advantage; rate limits; botting signals; API is the sanctioned door |
| 18 | Household declaration to dodge sanctions | declared pairs are linked for all value rules, so it gives no advantage |
| 19 | Chat-based scams ("send me money, I'll repay") | DMs restricted; engine escrow is the only safe path and the UI says so; chat is never evidence |
| 20 | Contract that pays for a hack | refused at drafting; S5 conspiracy flag |

---

## §10 Acceptance tests

1. No API response, ID or UI string differs between two characters in different partitions with identical state (partition invisibility diff test).
2. `N_a` at a day close equals Σ exp(−d/7) over registered non-banned characters, recomputed bit-identically on replay.
3. A country with 499 ACTIVE characters has no own board; at 500 it gets one at the next day close; it keeps it at 460 and loses it after 14 real days below 450.
4. A second country change within 180 real days is refused.
5. A chapter lasts exactly 967,680 ticks and its phases change at real days 50, 56 and the boundary.
6. At a chapter boundary no owned asset, balance or rank changes as a result of the boundary itself.
7. RICHEST_CHAPTER for a player who received a $1M gift and otherwise did nothing is ≈ 0, not +$1M.
8. CLIMBER uses `max(NWstart, $100k)`: a player going from $5k to $150k scores ln(1.5).
9. The chapter-end score is the mean of the 24 closes of the finish window (unit test with a spike at one close: the spike's effect is 1/24).
10. A player-issued instrument held by its issuer is marked at min(fair value, 72-game-day VWAP) for ladder purposes only.
11. Reference rows (NPC funds) never take a rank number and never block a player from a title.
12. MOST_WANTED ignores ops against linked accounts, rookies and Penny-league victims, and counts each victim once per chapter.
13. League placement never puts a character more than one tier from their percentile tier, and APEX contains exactly the top 100.
14. Two replays of league grouping with the same inputs produce identical groups.
15. Top 10 of a 50-group are PROMOTED and bottom 10 RELEGATED; the TITAN group of 30 moves 5 and 5.
16. The Finals seat exactly 100 distinct eligible characters, alternating the two ladders.
17. Spectators see Finals positions exactly 30 ticks late; finalists never receive other finalists' positions.
18. A contract between linked accounts is VOIDED at drafting or as soon as the link is established, and its effects are unwound.
19. A TRANSFER contract settles both sides at the same tick or neither (atomicity property test with random failures).
20. A LOAN payment missed for 3 game days triggers collateral seizure to the lender and a judgment debt for any shortfall.
21. A NON_COMPETE refuses the restricted party's `biz.open` in scope at P1 with the reason `NON_COMPETE`.
22. A SERVICE_LEVEL security clause pays the refund automatically in the tick after 12 records a successful op on a covered unit.
23. A BOUNTY pays only after a 13 conviction in the named class and returns to the sponsor on expiry.
24. Registration fee is 0.5% of notional, min $100, max $5M; P2P tax is 2% on one-directional value and 0 on loan principal.
25. A payer aged 3 real days cannot move more than $10,000 real P2P in a real day; at day 25 the cap is max(10% of NW, $1M).
26. A mandate operator's order that would exceed `maxPositionPctNav` is refused at P1; a drawdown beyond `maxDrawdownPct` sets SUSPENDED_BREAKER.
27. The Mandate type contains every field 08 assumes (`mandateId, principalId, operatorId, allowedAssetClasses, maxLeverage, maxPositionPctNav, maxDrawdownPct, noticeTicksForChange`).
28. An alliance cannot exceed its tier's member cap; a 41st Corporation member is refused.
29. A treasury spend above the role's daily limit becomes a LARGE_SPEND proposal; above the multisig threshold it needs the configured approvals.
30. A Treasurer transfer to themselves succeeds and emits `soc.alliance.embezzlement` and a 13 case in the same tick.
31. A character who left an alliance cannot join another for 48 real hours.
32. A beneficial owner crossing 5% gets an OWNERSHIP_5 obligation due in 720 ticks; not submitting leads to an auto-filing at the due tick with a $5,000 fee and a FILING_LATE Reputation event.
33. Holdings held through a controlled company and through options' delta aggregate into beneficial ownership.
34. No filing kind discloses any field not listed in §3.8.
35. Chat messages over 500 characters, with links, or exceeding slow mode are refused; DMs to a non-friend non-counterparty non-ally are refused.
36. No rule in any module reads chat content (static check of rule inputs).
37. Every Wire item has at least one source event id.
38. A character's feed ranking uses their holdings server-side, and the feed payload for another viewer of the same items is identical in order only when their relevance inputs are identical (no cross-viewer leakage).
39. Statements cost $500, are limited to 3 per game day, and a statement resolved FALSE increments the author's surveillance inputs (05).
40. While You Were Away contains at most 12 cards and exactly one neutral line about model oddities regardless of the number of real clues and decoys.
41. Push notifications never exceed 5 per real day outside SECURITY and MARGIN, and a silent plant (no detection) never produces a push.
42. Link score combines signals as 1 − Π(1 − s); a device match (0.5) plus a payment match (0.6) gives 0.8 → linked.
43. A suspect pair (0.4–0.7) is capped at $10,000 real P2P per real day.
44. A character inactive for 14 real days cannot be targeted by a new op and their sessions freeze; at 30 days they leave active boards; at 90 days their UNIQUE assets are listed in estate auctions and the proceeds credited to them.
45. A returning dormant character becomes ACTIVE on the next tick and joins a league at the next week start.
46. No posting from a challenge portfolio appears in the main ledger; world money aggregates are identical with and without challenges running.
47. A LIVE_SHADOW challenge order never changes the live clearing price (replay with and without the challenge order is identical for the live market).
48. AI tournament seeds' hashes are published before the lock and match the revealed seeds.
49. A tournament run with drawdown 41% is disqualified; with 19 trades in one seed it is disqualified.
50. The official API is refused to a LIC1 character, to a LIC2 character without 2FA, and to a LIC2 character with 2FA whose account is 6 real days old; it is granted to a LIC2 character with 2FA and an account age of 7 real days.
51. A household declaration makes the pair linked without opening any sanction.
52. Exploit clawback uses `INTEGRITY_CLAWBACK` postings with second-approval admin references and never rolls back unrelated characters.
