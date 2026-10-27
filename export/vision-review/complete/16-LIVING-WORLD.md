# 16 — The Living World

Owner module for: the aggregate base economy (household sectors per city, firm sectors per bloc), the roster of named NPC actors and their decision models, NPC dynasties, politics and lobbying (legislatures, parties, bills, elections, the policy-lever registry), causal news and the information tiers (Terminal, analysts, Research Desk, rumors, tips), exogenous world events and their frequency, the consequence scheduler that unfolds effects over time, world history and the archive, eras and technology, secrets and discovery, and opportunity briefs. It runs in **P3 world** of the tick pipeline (00 §5.2).

Depends on: 02 (clock, RNG streams, determinism, day-close hooks), 03 (ledger, balance sheets, beneficial ownership, `MSI`, Stabilizer levers), 04 (macro state per bloc, central-bank rule, fiscal, sovereigns), 05 (price reaction to news, belief model, surveillance score, `explainMove`), 06 (commodities, compute, collectibles), 07 (banks, credit standards, deposits, loans), 08 (funds, insurers, rating agencies), 09 (businesses, NPC companies, demand pools, supply chains, R&D, company filings), 10 (cities, districts, housing, new cities), 11 (AI lab, AI-race index, models), 12 (NPC crews, espionage, bribery, due diligence), 13 (regulators, courts, insider rules, whistleblowers), 14 (Reputation, clubs, Galas), 15 (Wire, filings, contracts, chapters, boards), 17 (layouts), 22 (names, templates, actor generator).

Sources kept: original vision 01 §5.6 and §6, MASTER-BIBLE PART VII sections 2, 3 (C09, C10), 9 (P01–P08), 11 (B09–B11), ROADMAP §2.5 (rumors, tips) and §2.8 (world-event frequency), approved ideas L13 (NPC rival funds, shared world events, rumors and tips, "Why it moved" and Research Desk), V3 Part 3.11 and Part 7. Intent sub-namespaces owned here: `soc.pol.*` (politics) and `soc.world.*` (information, secrets, briefs).

---

## §1 Purpose

1. **A world that lives without the player** (W01, W03): households earn and spend, firms hire and invest, banks lend, politicians legislate, families feud, and news reports it, whether or not any player is online. Players are added to this foundation, never its only cause.
2. **Named actors with motives and memory** (W02, W04): banks protect liquidity, founders protect independence, families protect control, suppliers favour dependable customers. Their decisions respect their balance sheets.
3. **Causal truth** (W05, W09): every headline corresponds to a real state change; consequences unfold over recorded links on different schedules, so later explanations can trace them.
4. **History that matters** (W10): mergers, bankruptcies, feuds, elections, discoveries persist; returning players meet familiar actors in changed circumstances.
5. **Discoverable depth** (P01–P08): dynasties behind familiar names, politics as competing interests, secrets with provenance and counterplay.
6. **Fairness**: NPCs see only what is public plus what is genuinely theirs; they never know private player plans and never punish success as such (C09, F05).

---

## §2 Entities

### §2.1 Aggregate sectors

```ts
interface HouseholdSector {                 // one 'hh' entity per city (00 §5.3)
  entityId: string; cityId: string; blocId: string;
  population: number;                       // from 10's city size
  laborForce: number;                       // PARAM.lf_share = 0.5 × population
  employed: number;
  wageIndex: number;                        // city wage relative to bloc average, from 10 (district mix)
  disposableIncomeGameDay: Money;           // last computed
  consumptionGameDay: Money;
  consumptionByCategory: Record<ConsumptionCategory, Money>;
  savingsGameDay: Money;
  depositsHeld: Money;                      // at NPC banks (07), mirrors the hh balance sheet
  housingDemandIndex: number;               // 1.0 = baseline households per dwelling (10 consumes)
  creditDemandGameDay: Money;               // mortgages + consumer credit applications (07 consumes)
  sentiment: number;                        // [0,100], from 04 consumer sentiment + local events
}
type ConsumptionCategory = 'FOOD_BEV' | 'RETAIL' | 'HOUSING' | 'TRANSPORT' | 'ENTERTAINMENT' | 'HEALTH'
                         | 'PERSONAL_SERVICES' | 'TECH' | 'FINANCIAL' | 'EDUCATION' | 'LUXURY' | 'UTILITIES';

interface FirmSector {                      // one 'frm' entity per bloc
  entityId: string; blocId: string;
  nominalOutputGameDay: Money;              // from 04 nominal GDP
  wageBillGameDay: Money; employment: number;
  investmentGameDay: Money;                 // capex demand (09 B2B, 10 construction)
  rndGameDay: Record<TechDomain, Money>;    // §3.10
  b2bDemandByCategory: Record<B2BCategory, Money>;
  profitGameDay: Money; dividendsGameDay: Money;
}
type B2BCategory = 'LOGISTICS' | 'CONSTRUCTION' | 'IT_SERVICES' | 'BUSINESS_SERVICES' | 'ENERGY' | 'DATA'
                 | 'COMPUTE' | 'SECURITY' | 'MAINTENANCE' | 'COLD_CHAIN' | 'MARKETING' | 'LEGAL';
```

### §2.2 Named actors

```ts
type ActorArchetype =
  | 'CENTRAL_BANKER' | 'FINANCE_MINISTER' | 'REGULATOR_HEAD' | 'REGULATOR_OFFICIAL' | 'JUDGE' | 'POLITICIAN'
  | 'BANK_CEO' | 'FUND_PRINCIPAL' | 'INSURER_CEO' | 'RATING_HEAD' | 'EXCHANGE_HEAD' | 'CEO' | 'FOUNDER'
  | 'DYNASTY_MEMBER' | 'EDITOR' | 'RUMOR_SOURCE' | 'SUPPLIER_OWNER' | 'LENDER_OWNER' | 'CRIME_CREW' | 'UNION_LEADER' | 'ARBITRATOR';

interface NpcActor {
  actorId: string;                          // 'npc_' + ulid; a person or an institution's persona
  archetype: ActorArchetype;
  nameKey: string;                          // generated by 22
  blocId: string; cityId: string | null;
  institutionIds: string[];                 // entities this actor controls or runs (bnk, fnd, cmp, outlet cmp, party…)
  ownEntityId: string | null;               // personal balance sheet ('npc' entity) for wealthy actors
  traits: Traits;
  goals: GoalWeight[];                      // 2..5, weights sum to 1
  ideology: Ideology | null;                // politicians, ministers, editors, dynasty heads
  age: number;                              // actor years (§3.4.6)
  health: number;                           // [0,1]
  status: 'ACTIVE' | 'RETIRED' | 'DECEASED' | 'IMPRISONED' | 'REPLACED';
  focus: 'FOCUS' | 'BACKGROUND' | 'IDLE';   // §3.3.7
  memory: MemoryItem[];                     // ≤ PARAM.actor_memory_cap = 64
  relationships: Relationship[];            // ≤ PARAM.actor_rel_cap = 48 (strongest kept)
  dynastyId: string | null;
  minCounterpartyRep: number;               // contracts with players (15 §6.2)
  careerHistory: { tick: Tick; roleKey: string; institutionId: string }[];
  createdTick: Tick;
}
interface Traits {                          // all in [0,1], drawn at creation from archetype distributions (22)
  riskTolerance: number; aggression: number; patience: number; integrity: number;
  loyalty: number; ambition: number; sociability: number; competence: number;
}
interface Ideology { econ: number; reg: number; trade: number; tech: number; }   // each in [−1, +1]
type GoalKind = 'PRESERVE_LIQUIDITY' | 'GROW_SHARE' | 'MAXIMIZE_RETURN' | 'PROTECT_CONTROL' | 'PROTECT_REPUTATION'
              | 'WIN_ELECTION' | 'ADVANCE_POLICY' | 'STABILIZE_PRICES' | 'PROTECT_DEPOSITORS' | 'PUNISH_RIVAL'
              | 'SECURE_SUCCESSION' | 'EXPAND_INFLUENCE' | 'DEPENDABLE_CUSTOMERS' | 'INDEPENDENCE' | 'SCOOP';
interface GoalWeight { kind: GoalKind; weight: number; targetIds?: string[]; }
interface MemoryItem { eventId: string; tick: Tick; subjectIds: string[]; valence: number /* −1..1 */; salience: number /* 0..1 */; }
interface Relationship {
  otherId: string;                          // npc, chr, cmp, ali, dynasty id
  trust: number;                            // [−100, 100]
  affinity: number;                         // [−1, 1] personal liking
  obligations: string[];                    // contract ids, favors owed
  lastInteractionTick: Tick;
}
```

### §2.3 Dynasties

```ts
interface Dynasty {
  dynastyId: string; nameKey: string;       // "the Halvorsen family"
  homeBlocId: string;
  headActorId: string; memberActorIds: string[];
  holdingCmpIds: string[];                  // private holding companies (09), possibly layered through shells
  influence: InfluenceAsset[];
  successionRule: 'PRIMOGENITURE' | 'DESIGNATED' | 'COUNCIL_VOTE' | 'MERIT';
  designatedHeirId: string | null;
  factions: { factionId: string; memberIds: string[]; leaderId: string; aim: 'EXPAND' | 'SELL' | 'MODERNIZE' | 'CONSERVE' }[];
  netWorthReal: Money;                      // consolidated (03), for internal rules only
  debtStress: number;                       // [0,1] = debt service / income, clamped
  feuds: { otherDynastyId: string; intensity: number; sinceTick: Tick }[];
  pacts: { otherDynastyId: string; kind: 'MARRIAGE' | 'CROSS_HOLDING' | 'JOINT_VENTURE'; sinceTick: Tick }[];
  state: 'ASCENDANT' | 'STABLE' | 'DISTRESSED' | 'DISSOLVED';
  foundedTick: Tick;
}
interface InfluenceAsset {
  kind: 'CONTROLLED_LENDER' | 'MEDIA_OUTLET' | 'SHIPPING_GROUP' | 'INDUSTRIAL_GROUP' | 'REAL_ESTATE' | 'POLITICAL_TIE' | 'SUPPLIER';
  entityId: string;                         // the bnk / outlet cmp / cmp / politician actor
  stakePct: number;                         // effective control share
}
```

### §2.4 Politics

```ts
interface Party { partyId: string; blocId: string; nameKey: string; position: Ideology; treasury: Money; leaderActorId: string; }
interface Caucus { caucusId: string; partyId: string; seats: number; leaderActorId: string; ideologyOffset: Ideology; constituency: ConstituencyInterest; }
interface ConstituencyInterest { sectorWeights: Record<string, number>; cityIds: string[]; }   // what local voters care about
interface Legislature { blocId: string; seats: number; caucuses: Caucus[]; governmentPartyIds: string[]; nextElectionTick: Tick; }
interface PublicMood { blocId: string; govApproval: number /* 0..1 */; salience: { econ: number; reg: number; trade: number; tech: number }; voterMedian: Ideology; scandalLoad: number; }

interface PolicyLeverDef {
  leverId: PolicyLeverId; ownerModule: string;      // the module that reads the value
  unit: string; min: number; max: number; default: number;
  maxChangePerBill: number; implementationLagGameDays: number;
  direction: { up: Partial<Ideology>; };            // ideological meaning of raising it, e.g. TAX_TOP_INCOME up = econ −1
  scope: 'BLOC' | 'CITY' | 'BLOC_PAIR' | 'SECTOR';
}
interface PolicyValue { leverId: PolicyLeverId; scopeKey: string; value: number; sinceTick: Tick; enactedByBillId: string | null; }

interface Bill {
  billId: string; blocId: string; leverId: PolicyLeverId; scopeKey: string; proposedValue: number;
  sponsorActorId: string; origin: 'GOVERNMENT' | 'PRIVATE_MEMBER' | 'PETITION';
  stage: 'INTRODUCED' | 'COMMITTEE' | 'FLOOR' | 'PASSED' | 'FAILED' | 'ENACTED' | 'IN_FORCE' | 'REPEALED';
  stageEndsTick: Tick; votes: Record<string /*caucusId*/, 'YES' | 'NO'> | null; introducedTick: Tick;
}
interface Election { electionId: string; blocId: string; tick: Tick; voteShares: Record<string, number>; seats: Record<string, number>; turnout: number; }
interface LobbyRegistration { registrationId: string; lobbyistEntityId: string; clientEntityId: string; leverId: PolicyLeverId; scopeKey: string; direction: 'UP' | 'DOWN'; registeredTick: Tick; }
interface LobbySpend { registrationId: string; tick: Tick; amountReal: Money; targetCaucusId: string | null; }
interface Contribution { donorEntityId: string; partyId: string; electionId: string; amountReal: Money; tick: Tick; }
```

### §2.5 News, rumors and tips

```ts
interface NewsTemplate {
  templateId: string; kind: NewsKind; conditions: string[];   // required slot facts
  headlineKey: string; bodyKey: string; slots: string[];
  toneVariants: ('NEUTRAL' | 'WARM' | 'CRITICAL')[];
  baseCredibility: number; alwaysPublish: boolean;
}
type NewsKind = 'MACRO_DATA' | 'CENTRAL_BANK' | 'EARNINGS' | 'GUIDANCE' | 'PRODUCT' | 'TRIAL' | 'LAWSUIT' | 'VERDICT'
              | 'M_AND_A' | 'EXEC_CHANGE' | 'SCANDAL' | 'REGULATION' | 'BILL' | 'ELECTION' | 'WEATHER' | 'GEOPOLITICS'
              | 'SUPPLY' | 'LABOR' | 'CRYPTO_INCIDENT' | 'CYBER' | 'BANKRUPTCY' | 'IPO' | 'DYNASTY' | 'TECH' | 'CITY'
              | 'PLAYER_PUBLIC' | 'ERA' | 'HISTORY';
interface NewsItem {
  newsId: string; templateId: string; outletId: string;
  causeEventIds: string[];                  // non-empty (invariant N1)
  revealedFactIds: string[];
  slots: Record<string, string>;
  publishTick: Tick; tierEarlyTick: Tick;   // Terminal subscribers see headline one tick earlier (§3.6.6)
  newsworthiness: number; credibility: number; tone: 'NEUTRAL' | 'WARM' | 'CRITICAL';
  impactHint: Record<string /*assetId*/, number> | null;   // from the owner module (05/09), never invented here
  telegraph: boolean;                       // precursor of a coming event
  breaking: boolean;
}
interface CausalLink { linkId: string; causeEventId: string; effectEventId: string; channel: string; lagTicks: number; ruleId: string | null; recordedTick: Tick; }

interface RumorSource { sourceId: string; actorId: string | null; nameKey: string; hiddenAccuracy: number; resolved: number; hits: number; stream: 'PUBLIC' | 'CIRCLE_WHISPERS'; }
interface Rumor {
  rumorId: string; sourceId: string; publishTick: Tick; resolvesByTick: Tick;
  claim: { factKind: string; subjectIds: string[]; direction: 'UP' | 'DOWN' | 'YES' | 'NO' };
  isTrue: boolean;                          // SEALED until resolution
  resolution: 'PENDING' | 'CONFIRMED' | 'FIZZLED' | 'DENIED';
}
interface Tip {
  tipId: string; recipientId: string; channel: 'BRIBED_CONTACT' | 'STOLEN_DATA' | 'INFORMANT' | 'BOARD_PACK' | 'ORDER_TAP';
  factId: string | null;                    // null when planted or stale
  isAccurate: boolean;                      // SEALED
  plantedBy: string | null;                 // an NPC fund actor when disinformation
  deliveredTick: Tick; legalRiskTag: 'INSIDER';
}
```

### §2.6 World events

```ts
type ShockCategory = 'WEATHER' | 'GEOPOLITICAL' | 'LABOR' | 'HEALTH' | 'TECH' | 'ACCIDENT' | 'DISCOVERY' | 'COMMODITY_SUPPLY' | 'CYBER_WAVE';
type ShockTier = 'RIPPLE' | 'STORM' | 'MAJOR';
interface ShockDef {
  shockId: string; category: ShockCategory; tier: ShockTier; nameKey: string;
  scope: 'CITY' | 'BLOC' | 'SECTOR' | 'COMMODITY' | 'WORLD';
  precursorGameDays: [number, number];      // telegraph window range
  effects: ShockEffect[];
  baseWeight: number;                       // relative draw weight within its tier and category
}
interface ShockEffect { channel: string; ownerHook: string; magnitude: [number, number]; lagGameDays: [number, number]; durationGameDays: [number, number]; }
interface ShockInstance { instanceId: string; shockId: string; scopeKey: string; drawnTick: Tick; onsetTick: Tick; endTick: Tick; magnitudes: number[]; state: 'TELEGRAPHED' | 'ACTIVE' | 'ENDED'; causeEventId: string; }
interface CrisisWeek { weekIndex: number; announcedTick: Tick; themeKey: string; }
```

### §2.7 Consequences and history

```ts
interface ConsequenceRule {
  ruleId: string; triggerKind: string; triggerFilter: string;   // event kind + condition expression over payload
  effects: { channel: string; ownerHook: string; magnitudeExpr: string; lagGameDays: [number, number]; durationGameDays: [number, number]; recordOnly: boolean }[];
}
interface PendingConsequence { pcId: string; ruleId: string; effectIndex: number; causeEventId: string; dueTick: Tick; params: Record<string, number | string>; }

interface HistoryEntry {
  entryId: string; tick: Tick; kind: string; significance: number;
  subjectIds: string[]; cityIds: string[]; blocIds: string[];
  summaryKey: string; slots: Record<string, string>; sourceEventIds: string[];
  retention: 'PERMANENT' | 'AGGREGATE_AFTER_YEAR';
}
interface Chronicle { chapter: number; top: string[] /* entryIds */; byBloc: Record<string, string[]>; publishedTick: Tick; }
```

### §2.8 Technology and eras

```ts
type TechDomain = 'COMPUTE' | 'AI' | 'ENERGY' | 'BIOTECH' | 'AUTOMATION' | 'MATERIALS' | 'LOGISTICS' | 'FINTECH';
interface TechState { domain: TechDomain; level: number; nextThreshold: number; rndTrailingRealPerGameDay: Money; }
interface Breakthrough { breakthroughId: string; domain: TechDomain; level: number; nameKey: string; effects: { leverOrParam: string; delta: number; diffusionGameDays: number }[]; unlocks: string[]; }
interface Era { index: number; nameKey: string; threshold: number; startedTick: Tick | null; }
```

### §2.9 Secrets, knowledge and briefs

```ts
interface Fact {
  factId: string;
  kind: 'OWNERSHIP_LINK' | 'LIABILITY' | 'RELATED_PARTY' | 'PAST_INCIDENT' | 'FAMILY_LINK' | 'POLITICAL_TIE'
      | 'LOCATION' | 'ARCHIVE_DOCUMENT' | 'PENDING_EVENT' | 'EDITORIAL_SLANT';
  predicate: string; args: string[];        // e.g. 'controls', ['npc_halvorsen_head', 'cmp_nordline_shipping', '0.34']
  sourceEventIds: string[];                 // engine provenance; facts are always true
  material: boolean;                        // could move a listed price (13 insider relevance)
  sensitivity: number;                      // [0,1] harm to holders if public
  holders: string[];                        // actors or entities who would react
  publicSinceTick: Tick | null;             // null while not public
}
interface Secret { secretId: string; factIds: string[]; authored: boolean; decorative: boolean; paths: DiscoveryPath[]; reward: string | null; }
interface DiscoveryPath {
  method: 'FILINGS_CHAIN' | 'RESEARCH_MAP' | 'DUE_DILIGENCE' | 'ARCHIVE_STUDY' | 'CONVERSATION' | 'ESPIONAGE' | 'WHISTLE';
  prerequisites: string[];                  // fact ids already known, rank, relationship trust, archive item
  costReal: Money; pSuccess: number; durationTicks: number;
  yieldsFactIds: string[]; legalBasis: 'PUBLIC_MOSAIC' | 'NON_PUBLIC';
}
interface KnowledgeRecord {                 // per character, private
  characterId: string; factId: string; learnedTick: Tick; method: DiscoveryPath['method']; legalBasis: 'PUBLIC_MOSAIC' | 'NON_PUBLIC';
  disposition: 'KEPT' | 'SHARED' | 'SOLD' | 'REPORTED' | 'PUBLISHED';
}
interface OpportunityBrief {
  briefId: string; characterId: string; realDayIndex: number;
  sourceEventIds: string[]; whatHappenedKey: string; whyRelevantKey: string;
  known: string[]; uncertain: string[];     // string keys with slots, from consequence rules and owner estimates
  actions: { label: string; deepLink: string }[];
}
```

---

## §3 Rules and formulas

### §3.1 Scheduling, budget and determinism

**§3.1.1 Where 16 runs.** In P3 of every tick: the event scheduler (shocks, scheduled announcements, rumor publication, consequence due list), reactive actor decisions, news generation for events committed in the previous tick, and history recording. At day close (t = 719), after 04's macro step in P2: the aggregate economy step (§3.2), tactical decisions of BACKGROUND actors, rumor resolution, shock draws for the next day, and politics stage transitions. All randomness uses 02's streams: `rng('world.shock', day)`, `rng('world.actor', actorId, tick)`, `rng('world.rumor', day)`, `rng('world.politics', blocId, tick)`, `rng('world.dynasty', dynastyId, tick)`, `rng('world.news', eventId)`.

**§3.1.2 Budget.** `PARAM.phase_budget_ms_P3 = 200` per tick on the reference core (owned by 19 §3.3.3; ruling in 24). At most `PARAM.actor_full_evals_per_tick = 2,000` full decision evaluations per tick world-wide; overflow is deferred to the next tick in `(dueTick, actorId)` order. A deferred reactive decision is never dropped.

**§3.1.3 Writes.** 16 writes only its own entities (actors' memory, relationships, dynasties, politics, news, history, tech, secrets) and queues postings for P13. Every effect on another module goes through that module's published hook (named in each rule) and is applied by the owner in its own phase of the same or next tick. 16 never writes another module's state directly.

### §3.2 The aggregate economy (layer 1)

**§3.2.1 Inputs** at day close: from 04 per bloc: real growth `g`, inflation `π`, unemployment `u`, policy rate `i`, neutral rate `i_n`, consumer sentiment `S` (0–100), credit conditions `c` (−1 tight … +1 loose), nominal GDP `Y_b` per game year; from 10 per city: population `P_c`, wage index `ω_c`, housing stock; from 03: the Stabilizer demand lever `λ_d ∈ [0.9, 1.1]` (01 §8.2 lever 1).

**§3.2.2 Firm sector (per bloc).** Daily nominal output `Q_b = Y_b / 364`. Wage bill `W_b = PARAM.labor_share = 0.55 × Q_b × automationFactor_b`, where `automationFactor = 1 − 0.01 × (AUTOMATION level)` (§3.10), floor 0.85. Profit `Π_b = Q_b − W_b − intermediate_b`, `intermediate_b = 0.30 × Q_b`. Investment demand `I_b = Q_b × 0.18 × (1 + 0.5·(S−50)/50) × (1 − 5·(i − i_n))` (rate term 5, E-28/E-29; 04's closure reads final demand C + I only, never the intermediate), clamped to [0.08, 0.28] of `Q_b`. B2B demand by category = `intermediate_b × b2bShare_k` (22 table; e.g. LOGISTICS 0.16, CONSTRUCTION 0.12, IT_SERVICES 0.10, BUSINESS_SERVICES 0.12, ENERGY 0.12, DATA 0.04, COMPUTE 0.04, SECURITY 0.03, MAINTENANCE 0.08, COLD_CHAIN 0.03, MARKETING 0.08, LEGAL 0.08), plus `I_b × 0.6` to CONSTRUCTION. R&D by domain `= Q_b × PARAM.rnd_share = 0.025 × domainShare_b,d` (22 per-bloc table, e.g. Pacific League leans COMPUTE and MATERIALS). Dividends `= 0.5 × max(0, Π_b)`.

**§3.2.3 Household sector (per city).** City share of its bloc `φ_c = P_c ω_c / Σ_{c∈b} P_c ω_c`.
```
employed_c   = 0.5·P_c · (1 − u_b) · localEmploymentAdj_c          // adj from consequence impulses, default 1
wageIncome_c = φ_c · W_b
transfers_c  = φ_c · fiscalTransfers_b / 364                          // 04 fiscal
divIncome_c  = φ_c · 0.3 · dividends_b                                // 30% of NPC dividends reach households
taxes_c      = taxRateHH_b · (wageIncome_c + divIncome_c)            // 03/04 statutory rate (policy lever)
Yd_c         = wageIncome_c + transfers_c + divIncome_c − taxes_c
mpc_c        = clamp(0.85 + 0.05·(S_c − 50)/50 − 2.5·(i_b − i_n,b) + 0.03·c_b, 0.70, 0.95)
C_c          = λ_d · ( mpc_c · Yd_c + 0.04/364 · depositsHeld_c )   // wealth effect 4% per game year
savings_c    = Yd_c − C_c   (may be negative; then deposits fall)
```
Consumption by category: `C_c,k = C_c × share_k(incomeLevel_c, era)`, with launch shares (22 holds the full table) FOOD_BEV 0.14, RETAIL 0.12, HOUSING 0.22, TRANSPORT 0.09, ENTERTAINMENT 0.06, HEALTH 0.08, PERSONAL_SERVICES 0.06, TECH 0.05, FINANCIAL 0.04, EDUCATION 0.03, LUXURY 0.03, UTILITIES 0.08. Higher-income cities shift 0.02 from FOOD_BEV to LUXURY per +25% wage index; eras shift shares (§3.10).

**§3.2.4 Outputs** (each owner applies its own rule):
- 09: `demandPool(cityId, category, C_c,k)` for consumer sectors and `b2bPool(blocId, category, …)`; 09's logit market share splits each pool between NPC firms and player businesses.
- 10: `housingDemandIndex_c = (households_c / dwellings_c) × (1 + 0.5·(employed_c/employed_c,prev − 1)·30)` smoothed with a 30-game-day EMA (households = P_c / 2.3).
- 07: deposit flow `savings_c` into the city's NPC banks pro rata to their deposit share; credit demand `= mortgageDemand + consumerDemand`, `mortgageDemand_c = housingTurnover_c × avgPrice_c × LTV_c` (10/07), `consumerDemand_c = 0.02 × C_c × (1 + c_b)`.
- 04: realized consumption and investment are reported back as the demand side of next day's growth update (04 owns the closure).

**§3.2.5 Money closure.** Households and firms are real balance-sheet entities (03). Wages, NPC-to-NPC purchases and dividends are TRANSFERs inside the NPC economy (`HH_WAGES`, `HH_CONSUMPTION_NPC`, `FRM_DIVIDENDS`). Spending that lands at a player business is booked `HH_CONSUMPTION_PLAYER` / `FRM_B2B_PLAYER`, which 03's boundary rule classes as FAUCET for the player economy (old 01 §8.1 "NPC customers pay players"). Player payments to NPC firms are SINKs on the same boundary. Because the NPC economy is sized by 04's GDP (about 50× player net worth at launch, 01 §14.1), NPC sector income each day is posted from `row` by 04's nominal-GDP closure (`ROW_NPC_INCOME`), and any NPC cash leaving to players is replaced by that closure; 03 audits that `hh` and `frm` balances never go negative (if a day's spending would, consumption is cut to available cash plus credit drawn from 07). The Stabilizer acts only through `λ_d` (and its other levers), never by editing balances.

**§3.2.6 Ordinary activity between crises** (W06): every game day the aggregate step also emits low-key events that 09/10 turn into actor or city events: new NPC contracts, hiring rounds, construction starts, product launches, ownership changes. Their count per bloc per game day `= Poisson(λ)`, `λ = clamp(2 + 100·(g_b + 0.02), 1, 9)`, count clamped to [0, 12] (E-28/E-29); each is routed to a named actor in that bloc (§3.3) as a candidate action, so the motion is real, not decorative.

### §3.3 Named actors (layer 2)

**§3.3.1 Roster at launch** (600, 00 §5.7; 22 generates names and traits from these counts):

| Archetype | Count | Controls (entities) | Key knob or action set (owner executes) |
|---|---|---|---|
| CENTRAL_BANKER | 15 (5 governors, 10 board) | `cbk` | hawkishness persona → 04 rule personality |
| FINANCE_MINISTER | 5 | `gov` | fiscal stance bias → 04 fiscal |
| REGULATOR_HEAD / REGULATOR_OFFICIAL | 5 / 15 | `reg` | enforcement priority multiplier → 13 queue |
| JUDGE | 20 | `crt` benches | names and careers only (never affects verdicts, §3.3.8) |
| POLITICIAN | 60 (12 per bloc) | caucuses | votes, bills, campaigns (§3.5) |
| BANK_CEO | 25 (+25 banks) | `bnk` | credit standards, deposit pricing, M&A → 07 |
| FUND_PRINCIPAL | 30 (+30 funds, the NPC rival funds of L13) | `fnd` | style, size, allocation appetite → 08, 05 |
| INSURER_CEO | 10 (+10 insurers) | `ins` | underwriting appetite, cat exposure → 08 |
| RATING_HEAD | 3 (+3 agencies) | `rat` | methodology conservatism within 08 bounds |
| EXCHANGE_HEAD | 5 | `exc` | listing standards, fee proposals → 05/10 |
| CEO | 115 (of the 240 listed NPC companies; the rest are run by BACKGROUND policy) | `cmp` | capex, hiring, pricing stance, buybacks, guidance, M&A, R&D → 09 |
| FOUNDER | 40 | private `cmp` | fundraise, sell, IPO, pivot → 09 |
| DYNASTY_MEMBER | 96 (12 dynasties × 8) | holding `cmp`s | §3.4 |
| EDITOR | 30 (15 outlets + 15 editors) | outlet `cmp` | coverage selection and tone (§3.6.4) |
| RUMOR_SOURCE | 20 | — | rumor output (§3.6.7) |
| SUPPLIER_OWNER / LENDER_OWNER | 12 / 8 | private `cmp` | SUPPLY contracts, private credit offers (15 contracts) |
| CRIME_CREW | 10 | — | 12 owns targeting; 16 provides persona and memory |
| UNION_LEADER | 8 | — | strike decisions (§3.7.4) |
| ARBITRATOR | — (drawn from JUDGE pool for 13 panels) | — | 13 |

Total 600 (0 for ARBITRATOR as they reuse JUDGE actors). Growth: each new city (10) spawns 40 actors: 1 BANK_CEO with a new regional bank, 2 CEOs of newly listed local companies, 6 FOUNDERs, 4 SUPPLIER_OWNERs, 1 LENDER_OWNER, 1 EDITOR with a local outlet, 2 RUMOR_SOURCEs, 2 POLITICIANs (local caucus leaders), 1 UNION_LEADER, 1 CRIME_CREW, and 19 BACKGROUND private-firm owners. Dynasty count target `= 12 + floor(N_a / 20,000)` (§3.4.7).

**§3.3.2 Knowledge firewall.** An actor's observation set is: all PUBLIC state and events; the private state of entities the actor controls; terms of contracts it is party to; facts in its own `KnowledgeRecord`-equivalent (learned through relationships, its own due diligence, or NPC espionage resolved by 12 under the same rules as players). It never reads any player's private positions, orders, cash, strategy, AI design, presence, or anti-cheat data. **No actor rule may use a player's rank, net worth, board position or Prestige as an input**, so NPCs never mechanically punish success (C09, F05); they react to public, market-relevant facts (filings, prices, bids, verdicts, contract offers) that any actor would react to.

**§3.3.3 Generic decision model.** At each decision epoch the actor:
1. Builds candidate actions from its archetype's action catalog (§3.3.6), filtered by feasibility: budget and balance sheet (03), the owner module's validation (the same validation a player's intent gets), license and charter rules (13), and legality: an illegal action is a candidate only if `integrity < PARAM.npc_illegal_integrity_max = 0.25` and the archetype allows it (CRIME_CREW, corrupt POLITICIAN or CEO); illegal NPC actions go through 12 and 13 exactly like a player's.
2. Scores each candidate:
```
U(a) = Σ_g w_g · ΔG_g(a)                                  // archetype forward model: expected change in goal metric g, normalized to [−1,1]
     − (1 − riskTolerance) · κ · Risk(a)                  // κ = 1.0; Risk = normalized downside (e.g. capital ratio drop, VaR)
     − Cost(a) / Scale                                     // Scale = actor's liquid resources
     + 0.3 · Σ_{o ∈ counterparties(a)} trust(o)/100       // relationships
     − 0.3 · Σ_{m ∈ memory, m.subject ∈ counterparties(a)} salience_m · max(0, −valence_m)
     + τ · ε,   ε ~ Gumbel(0,1),  τ = 0.05 + 0.15 · (1 − patience)
```
3. Chooses `argmax U`; acts only if `U(best) > U(NO_OP) + PARAM.actor_action_margin = 0.05`. At most `PARAM.actor_actions_per_epoch = 2` actions per epoch (the second must be independent of the first).
4. Submits the action as an intent through the same validation and the same phase as a player intent (00 §5.5 fairness rule: no private API). NPC intents are tagged `actorKind = 'npc'` for telemetry only.

**§3.3.4 Cadence.**
- **Strategic** epoch every 7 game days, on game days where `dayIndex mod 7 = hash(actorId) mod 7`, at tick-of-day `hash(actorId) mod 720`: goals re-weighted (e.g. a bank under capital stress raises PRESERVE_LIQUIDITY), big actions (M&A, launches, bills, elections, succession).
- **Tactical** epoch daily at tick-of-day `hash(actorId) mod 720`: routine actions (pricing stance, hiring, quotes, contract responses).
- **Reactive**: when a PUBLIC event matches one of the actor's subscriptions (its institutions, counterparties, sector, city, holdings, feuds) with salience ≥ `PARAM.actor_react_salience = 0.5`, a reactive epoch runs on the next tick; at most one reactive epoch per actor per 30 ticks.

**§3.3.5 Memory and relationships.**
- Each consequential event touching the actor adds a `MemoryItem`: salience `= clamp(|impact on the actor's goals|, 0, 1)`, valence by sign. Salience decays with half-life `PARAM.memory_halflife_game_days = 90 × (0.5 + patience)`; when over capacity, the lowest-salience item is evicted.
- Trust updates (applied to both directions where the other side is an actor): contract honored to term `+5 × min(1, value/$10M real)` (min +1); default or breach `−25`; lawsuit filed against the actor `−30`; lost a case the actor brought `−10` (applied by the actor toward the winner); public feud event `−20`; support in a crisis (lending, buying a block at a fair price, a rescue) `+15`; competitive takeover bid `−15`. Trust gained from honored contracts is capped at `PARAM.trust_contract_gain_cap = +20` per counterparty pair per game quarter. Trust decays toward 0 by 1% per game week. Affinity changes only through shared club/gala attendance (+0.05 per shared event, cap 0.5) and feuds (−0.2).
- NPC lenders, suppliers and customers use trust in pricing and allocation: a supplier ranks customers by `trust + 50·dependableHistory` when capacity is short (C06), a lender offers private credit at `spread − trust × 0.5 bps`.

**§3.3.6 Archetype action catalogs** (each action is a call into the owner's normal intents or hooks):

| Archetype | Actions (owner) |
|---|---|
| CENTRAL_BANKER | set persona hawkishness `h ∈ [0,1]` used by 04's reaction function (moves ≤ 0.05 per strategic epoch; a new governor resets it from ideology by the formula in §3.5.10); speeches that 04 turns into forward guidance |
| FINANCE_MINISTER | fiscal stance bias for 04's fiscal rule (`±0.5%` of GDP); sovereign issuance calendar preference (04); bills |
| REGULATOR_HEAD | enforcement priority multiplier `∈ [0.8, 1.2]` per regulator domain (13); public speeches (news) |
| BANK_CEO | credit standards `s ∈ [−1, +1]` (07 maps to LTV/DTI caps and spreads within its bounds), deposit rate offset `[−25, +25] bps`, buy a distressed bank (07 rescue), cut dividends, raise capital (09 issuance) |
| FUND_PRINCIPAL | target gross exposure, style tilts within the fund's strategy class, subscriptions to player funds as an NPC allocator (08), launch or close a fund (≤ 1 per chapter) |
| INSURER_CEO | underwriting appetite `∈ [0.7, 1.3]` per line (08), buy reinsurance, cat bond issuance (08) |
| CEO | capex level `∈ [0.5, 1.5]×` baseline, hiring plan, price stance (09 logit price term `[−5%, +5%]`), buyback / dividend policy, guidance conservatism, R&D intensity `[0.5, 2]×`, M&A bids (09 takeover rules; targets chosen by strategic fit and valuation only), relocation (10), product launches |
| FOUNDER | raise a round (09 venture), sell the company, pursue an IPO (09), pivot sector |
| DYNASTY_MEMBER | §3.4 |
| EDITOR | coverage and tone (§3.6.4) |
| SUPPLIER_OWNER | offer, renew or exit SUPPLY contracts with businesses (15), capacity expansion, price changes, prioritization under shortage (trust) |
| LENDER_OWNER | offer private loans (15 LOAN clause) to businesses with trust ≥ 0 and 03 statements within covenant bounds |
| POLITICIAN | §3.5 |
| UNION_LEADER | strike call (§3.7.4), wage settlement |
| CRIME_CREW | 12 |

**§3.3.7 Detail scaling** (W11). `focus` is recomputed at each day close: `FOCUS` if any player interacted with the actor or its institutions in the last 3 game days (contract, bid, lawsuit, public statement tagging it, club/gala co-attendance, trade ≥ 1% of ADV in its company), or it is party to an active consequence chain, crisis, bill or succession; `BACKGROUND` otherwise; `IDLE` for actors with no institution and no relationships above |20| trust. FOCUS actors run the full model at every epoch; BACKGROUND actors use a cached policy table (the last full decision's knob values held, with a full re-evaluation at each strategic epoch only); IDLE actors decide only at strategic epochs and only if their goals are breached. Detail never creates money or invents past commitments: the aggregate layer already accounts for the activity BACKGROUND actors represent.

**§3.3.8 Fairness constraints.** Judges and arbitrators never influence verdict probabilities (13 owns verdict math). Regulators' priority multipliers apply to whole case categories, never to named players. NPC funds are limited to `PARAM.npc_fund_max_participation = 0.5 × ADV per tick` per asset with seed-jittered parameters (old ROADMAP R5) so they cannot be trivially front-run or used to squeeze.

### §3.4 Dynasties (layer 3)

**§3.4.1 Launch roster.** 12 fictional families (22 names them), 2–3 per bloc, each with a head and 7 other members (heirs, siblings, cousins, a spouse), each a `DYNASTY_MEMBER` actor with traits. Each dynasty owns 1–3 private holding companies, which own stakes of 5–40% in 3–8 listed NPC companies and 2–6 private firms (09 generator), with 1–3 nominee shell layers between the family and some stakes. Each has 2–4 `InfluenceAsset`s, drawn so that across the world there are: 8 controlled lenders (of the 25 NPC banks), 9 controlled outlets (of 15), 6 shipping or logistics groups, 10 industrial groups, 12 city real-estate portfolios, and 20 political ties.

**§3.4.2 Goals.** Heads weight PROTECT_CONTROL 0.35, SECURE_SUCCESSION 0.2, MAXIMIZE_RETURN 0.2, EXPAND_INFLUENCE 0.15, PROTECT_REPUTATION 0.1 (jittered ±0.05 per family). Factions add EXPAND, SELL, MODERNIZE or CONSERVE.

**§3.4.3 Specific, bounded influence** (P03). Every influence acts only through its asset's normal rules:
- **Controlled lender**: the bank's credit decisions add `−20 bps` for borrowers with trust ≥ 50 with the family and `+30 bps` for those with trust ≤ −50, and the family's allies are ranked first under credit rationing (07 applies). Bounded by 07's capital rules.
- **Media outlet**: coverage selection multiplies newsworthiness of items touching the family's interests by 1.2 (favourable) or 0.8 (unfavourable), and chooses WARM or CRITICAL tone variants accordingly (§3.6.4). Never false facts.
- **Shipping / industrial / supplier**: priority allocation under shortage to allies (09 allocation order), contract offers.
- **Real estate**: development choices in their districts (10 developer rules).
- **Political tie**: the tied politician's caucus gets the family's lobbying through the normal lobbying rules (§3.5.7) at no extra effect; the tie itself is a discoverable fact.
Each dynasty also has debts (07 loans on the holding companies), covenants, rivals (feuds) and internal disputes; `debtStress` above 0.6 forces asset sales.

**§3.4.4 Discovery** (P02). Players first meet names: a newspaper, a lender, a supplier. Links are `Fact`s of kind OWNERSHIP_LINK, FAMILY_LINK, POLITICAL_TIE, EDITORIAL_SLANT. Each is reachable by at least two paths (§3.11.3): the FILINGS_CHAIN (a shell that crosses 5% must file under 15 §3.8, which names the shell; the shell's own shareholders are listed in 09's company registry, which is public for companies above $50M real assets), the Research Desk ownership map, a due-diligence dossier (12 E8), archive study, conversation with an actor of trust ≥ 40, or espionage. Wealth broadens access (paid paths), while curious smaller players can follow filings and archives for free.

**§3.4.5 Internal disputes.** Each game quarter for each dynasty:
```
p_dispute = σ( −3 + 2·successionUncertainty + 1.5·poorPerformance + 1.0·debtStress + 0.5·(factions − 1) )
successionUncertainty = 1 if no designated heir and rule ≠ PRIMOGENITURE, 0.5 if the heir's competence < 0.4, else 0
poorPerformance       = clamp(−(holding return over the last 4 quarters)/0.2, 0, 1)
```
A dispute picks a type by weights: BOARD_FIGHT 0.35 (a proxy contest inside a family-controlled listed company: public filings, votes, opportunities for outside holders), BUYOUT 0.25 (one faction buys another out: block sales, financing need), PUBLIC_FEUD 0.25 (news, trust −30 between factions), SALE 0.15 (a faction forces the sale of an asset: an auction lot or a block trade at the close). Disputes resolve within 30–120 game days with a recorded outcome.

**§3.4.6 Aging and succession** (P06). Actors age at `PARAM.actor_aging_rate = 0.25` actor-years per game year (one actor-year ≈ 2 real months; a game year of 15 real days would otherwise age characters 24 years per real year). Per game year, an actor of age `a` leaves (death or incapacity) with hazard `0.25 × 0.0003 × e^(0.09·(a − 30))`; dynasty heads aged ≥ `PARAM.dynasty_head_retire_age = 60` retire with probability `0.25 × PARAM.dynasty_head_retire_p_actor_year = 0.3` (E-34, PROVISIONAL [Quant]). On a head's exit: successor by rule (PRIMOGENITURE eldest adult heir; DESIGNATED the designated heir if alive, else primogeniture; COUNCIL_VOTE members vote by `trust + 50·competence`; MERIT highest competence). Then: the new head's traits re-weight the family goals; with probability 0.3 the family sells one non-core asset within 90 game days; with probability 0.2 a passed-over member starts a feud faction; the bloc's inheritance tax lever (§3.5.9 `TAX_INHERITANCE`) applies to the estate, often forcing block sales; a SUCCESSION news item and a history entry are written. Player characters do not age (14 §3.15.6).

**§3.4.7 Rise and fall.** A dynasty whose consolidated equity falls below 0 or whose `debtStress ≥ 0.9` for 2 game quarters becomes DISTRESSED: it sells assets (auction lots, blocks, stakes) until `debtStress < 0.6`, or enters 09's restructuring for its holding companies; a dynasty with no adult members or no assets DISSOLVES (history entry). A new dynasty forms when a FOUNDER or CEO actor's personal net worth ≥ `PARAM.dynasty_formation_nw_real = $5B` and age ≥ 55, generating 3–6 family members; formation happens only while the dynasty count is below target (`12 + floor(N_a/20,000)`). Pacts: each game year, each pair of dynasties with mutual affinity > 0.3 forms a pact (MARRIAGE, CROSS_HOLDING or JOINT_VENTURE) with probability 0.05; feuding pairs (intensity > 0.5) compete for the same assets (higher bid reservation +10%).

**§3.4.8 Relations with players** (P04). A player can work with a family (contracts, joint ventures through syndicates), bargain (become an essential supplier: the family's trust and dependence rise), investigate wrongdoing (13), or build a rival coalition (15 alliances). Pressure from a family is always through rules with counterplay (credit pricing, coverage slant, allocation priority); there is never a mechanic that leaves a player permanently helpless: every influence has a substitute (other lenders, outlets, suppliers), and 13's antitrust and conduct rules apply to families like anyone.


### §3.5 Politics and lobbying (layer 4)

**§3.5.1 Structure.** Each of the 5 blocs has one `Legislature` of `PARAM.legislature_seats = 300` seats, 4 parties (22 names them; launch positions are drawn so that one party sits in each ideological quadrant of `(econ, reg)`, with `trade` and `tech` jittered U(−0.6, 0.6)), and 12 caucuses (3 per party, each tied to a constituency: a set of cities and sector weights). Each caucus has a POLITICIAN actor as leader (the 12 per bloc of §3.3.1); party leaders are the leader of that party's largest caucus. Ideology convention for all of 16: `econ +1` = low tax, small state; `reg +1` = light regulation; `trade +1` = open trade; `tech +1` = permissive on new technology. A party's `position` is the seat-weighted mean of its caucuses' `party.position + ideologyOffset` (offsets U(−0.2, 0.2) per axis).

**§3.5.2 Government formation.** After each election (and when a coalition collapses), the government is the smallest set of parties with ≥ 151 seats that minimizes ideological spread `Σ pairs ‖pos_i − pos_j‖₂`; ties broken by the largest party first, then by `partyId`. If no 3-party set reaches 151, the largest party governs as a minority government (`minority = true`: its bills need +1 logit on the floor from opposition caucuses, see §3.5.6). The government sets the agenda (§3.5.4) and names the finance minister (FINANCE_MINISTER actor of the bloc, ideology re-drawn as the government's seat-weighted position + N(0, 0.1) per axis, clamped).

**§3.5.3 Public mood.** Updated at each day close per bloc:
```
approvalTarget = 0.5 + 0.8·(g − g*) − 1.2·(π − π*) − 1.5·(u − u*) − 0.1·scandalLoad + 0.05·(S − 50)/50
                 // g* = trend growth, π* = 04 inflation target, u* = 04 natural rate
govApproval   ← govApproval + 0.02·(clamp(approvalTarget, 0.1, 0.9) − govApproval)
scandalLoad   ← 0.98·scandalLoad + Σ (severity of SCANDAL news about government members today)   // severity 0.1..1
salience.x    = normalized share of last 28 game days' published newsworthiness by axis (econ: MACRO_DATA, CENTRAL_BANK, EARNINGS, BANKRUPTCY; reg: REGULATION, SCANDAL, VERDICT, CRYPTO_INCIDENT; trade: GEOPOLITICS, SUPPLY; tech: TECH, PRODUCT, ERA)
voterMedian   drifts toward  (0.97·voterMedian + 0.03·issueShift)  each game quarter, where issueShift is the cumulative effect of issue campaigns (§3.5.8) and eras (§3.10.4)
```
If `govApproval < PARAM.coalition_collapse_approval = 0.20` (E-34, PROVISIONAL [Quant]) for 28 consecutive game days and the government is a coalition, the most distant junior partner leaves with probability 0.5 per game quarter; the government re-forms per §3.5.2 without an election, or a snap election is called if no government reaches 151 seats. At most `PARAM.coalition_collapse_max_per_chapter = 1` collapse per bloc per chapter (E-34, PROVISIONAL [Quant]).

**§3.5.4 Agenda.** Each game quarter the government introduces `1 + Poisson(1)` bills, clamped to [1, 3], drawn from levers where `|preferred − current| > 0.25·maxChangePerBill`; `preferred` for lever `k` is `default_k + Σ_axis (govPosition.axis × direction_k.up.axis) × (max_k − min_k)/2`, clamped to bounds; the proposed value moves at most `maxChangePerBill` toward it. Opposition caucus leaders each introduce a PRIVATE_MEMBER bill with probability 0.1 per game quarter (rarely passes). A **petition** bill (`soc.pol.petition`, §4) is introduced when registered backers commit lobbying spend totalling at least `PARAM.petition_threshold_real = $50M` within `PARAM.petition_window_game_days = 28` game days (E-35, PROVISIONAL [Quant]) (a real sink, nonrefundable); a bloc has at most 2 petition bills per game quarter (first come, first served).

**§3.5.5 Pipeline.** INTRODUCED → COMMITTEE for `PARAM.committee_game_days = 14` → FLOOR vote at the next day close → PASSED or FAILED → ENACTED after the lever's `implementationLagGameDays` (in the registry table, typically 28) → IN_FORCE. 04 and the other owners read `PolicyValue` only once IN_FORCE. Every stage change is a PUBLIC event and a BILL news item (always published). A bill's lever and proposed value are public from INTRODUCED, so players and NPC actors can position before enactment (a central learning loop, P05). A failed bill on the same lever and scope cannot be reintroduced for 91 game days. The REPEALED stage occurs only when a later enacted bill moves the same lever.

**§3.5.6 Floor vote.** Each caucus votes as a block:
```
p_yes(k) = σ( 2·whip_k + 2·ideoFit_k + 1·constFit_k + 1·L_k + 1·mood_k + ε ),   ε ~ N(0, PARAM.vote_noise_sd = 0.5)
whip_k     = +1 if caucus in government and bill origin GOVERNMENT; −0.5 if in opposition and GOVERNMENT bill; 0 otherwise
ideoFit_k  = sign(proposed − current) × Σ_axis (caucusPos.axis × direction.up.axis) / max(1, #axes in direction.up)   // in [−1, 1]; +1 = the move fits the caucus
constFit_k = Σ_sector constituency.sectorWeights[s] × sectorImpact_s(bill)   // 22 table per lever: +1 benefits, −1 harms; in [−1, 1]
L_k        = lobbying index (§3.5.7)
mood_k     = (govApproval − 0.5) × 2 × (+1 if in government else −1) × 0.5
corrupt_k  = +1 added inside σ when a bribery operation (12) succeeded on this caucus leader for this bill (13 consequences apply)
minority   = −1 added for government caucuses' bills when the government is a minority (passes only with opposition help)
```
The caucus votes YES if `rng('world.politics', blocId, tick) < p_yes(k)`. The bill passes if YES seats ≥ 151. Votes by caucus are published.

**§3.5.7 Lobbying.** A lobbyist (any player character holding an active `LobbyRegistration`, or an NPC actor) registers once per (client, lever, scope, direction) via `soc.pol.lobby.register` (fee `PARAM.lobby_registration_fee_real = $10,000`, sink `LOBBY_SPEND`). Spend (`soc.pol.lobby.spend`) is a real SINK (paid to NPC consultancies, booked to `row`), in real dollars (nominal ÷ MSI at the tick paid). All registrations and spend totals per lever are **public** in the lobbying register (Civic screen), refreshed at each day close; the client is named (13 §lobbying rules: unregistered spend is impossible as an intent). For each caucus `k` and bill on lever `l`:
```
F_for,k     = Σ spends with direction toward the bill's proposed value, last PARAM.lobby_window_game_days = 91, targeted at k
              + (untargeted spend) × seats_k / 300
F_against,k = same for the opposite direction
L_k = clamp( PARAM.lobby_coeff = 0.25 · ( sqrt(F_for,k / $1M) − sqrt(F_against,k / $1M) ), −0.75, +0.75 )
```
The square root gives diminishing returns, and opposing coalitions cancel. Spend older than 91 game days stops counting. A single entity's spend counts in full; linked accounts (15 §3.12) are pooled and their pooled spend is capped as if one entity. Effect bound: even `L_k = +0.75` cannot flip a caucus that opposes on ideology and constituency (`2·ideoFit + constFit ≤ −2` keeps `p_yes < 0.25`).

**§3.5.8 Issue campaigns.** `soc.pol.campaign` buys public advocacy on one axis in one bloc (min $1M real, SINK `ISSUE_CAMPAIGN`):
```
Δsupport = PARAM.campaign_coeff = 0.05 × ln(1 + spend / $10M)     toward the chosen axis direction
cap: Σ |Δsupport| per (bloc, axis) ≤ PARAM.campaign_cap_per_quarter = 0.15 per game quarter (all campaigners combined)
```
Δsupport is added to `issueShift` (moves `voterMedian` per §3.5.3) and, for the next election, to the vote utility (`β_iss` term). Opposing campaigns net out before the cap.

**§3.5.9 Elections and contributions.** Each bloc holds an election every `PARAM.election_interval_game_years = 4` game years (1,456 game days, about 60.7 real days), staggered so blocs are offset by 291 game days. 28 game days before an election a CAMPAIGN period starts (ELECTION news). Vote shares by softmax over parties `p`:
```
V_p = β_inc · incumbent_p · (govApproval − 0.5)·2       β_inc  = 1.0
    − β_iss · ‖voterMedian − position_p‖₂                β_iss  = 2.0
    + β_camp · ln(1 + campaignFunds_p / $10M)             β_camp = 0.3
    + ε_p,  ε_p ~ N(0, 0.15)
share_p = exp(V_p) / Σ exp(V_q)
```
`campaignFunds_p` = party treasury + contributions this cycle. Seats by Sainte-Laguë over parties with share ≥ 5%; caucus seats within a party by constituency strength (22 table, re-drawn ± 10%). Turnout `= 0.55 + 0.1·(salienceMax − 0.25)`, display only. Contributions (`soc.pol.contribute`): at most `PARAM.contribution_cap_real = $5M` real per donor per party per election cycle (linked accounts pooled), SINK `POL_CONTRIBUTION` (the party is an NPC entity; its treasury is spent on campaigns, which are NPC-internal), public by donor name at the day close (Civic screen). Corporate contributions are allowed from the company's treasury and named as the company. Contributions are never anonymous and never refundable.

**§3.5.9a Policy lever registry** (the only levers politics can move; each owner reads the in-force value):

| Lever | Owner reads | Scope | Unit | Min | Max | Default | Max change per bill | Lag (game days) | `direction.up` |
|---|---|---|---|---|---|---|---|---|---|
| TAX_CORP | 03/09 | BLOC | % of profit | 10 | 35 | 21 | 4 | 91 | econ −1 |
| TAX_TOP_INCOME | 03 | BLOC | % | 20 | 50 | 35 | 5 | 91 | econ −1 |
| TAX_CAPITAL_GAINS | 03 | BLOC | % | 0 | 30 | 15 | 5 | 91 | econ −1 |
| TAX_PROPERTY | 10 | CITY | % of value per game year | 0.2 | 2.5 | 1.0 | 0.3 | 91 | econ −1 |
| TAX_TRANSACTION | 05 | BLOC | bps | 0 | 10 | 0 | 2 | 56 | reg −1 |
| TAX_INHERITANCE | 14 §3.15 | BLOC | multiplier on 14's bands | 0.5 | 1.5 | 1.0 | 0.25 | 182 | econ −1 |
| CAP_BANK_MIN_RATIO | 07 | BLOC | % CET1 | 6 | 14 | 8 | 1 | 182 | reg −1 |
| LEVERAGE_CAP_RETAIL | 05/07 | BLOC | × | 2 | 10 | 5 | 1 | 56 | reg +1 |
| LEVERAGE_CAP_PRO | 05/07 | BLOC | × | 5 | 30 | 20 | 5 | 56 | reg +1 |
| AI_REGISTRATION_THRESHOLD | 11/13 | BLOC | compute units | 0.5× | 4× | 1× | 0.5× | 91 | tech +1 |
| DATA_SCRAPE_LEGALITY | 11/13 | BLOC | enum 0 forbidden, 1 licensed, 2 open | 0 | 2 | 1 | 1 | 91 | tech +1 |
| TARIFF | 04/09 | BLOC_PAIR | % | 0 | 40 | 5 | 10 | 56 | trade −1 |
| SECTOR_SUBSIDY | 09 | SECTOR in bloc | % of revenue | 0 | 10 | 0 | 3 | 91 | econ −1 |
| ZONING_DENSITY | 10 | CITY | multiplier on permitted floor area | 0.7 | 1.6 | 1.0 | 0.15 | 182 | reg +1 |
| MIN_WAGE | 09 | BLOC | × bloc median wage | 0.3 | 0.6 | 0.45 | 0.05 | 91 | econ −1 |
| SHORT_SELLING_RULE | 05 | BLOC | enum 0 free, 1 uptick, 2 locate+report, 3 banned in crisis | 0 | 3 | 1 | 1 | 28 | reg −1 |
| DISCLOSURE_THRESHOLD | 15 §3.8 | BLOC | % ownership | 3 | 10 | 5 | 2 | 91 | reg +1 |
| CRYPTO_REGIME | 05/13 | BLOC | enum 0 banned, 1 restricted, 2 licensed, 3 open | 0 | 3 | 2 | 1 | 91 | reg +1 |
| FISCAL_SPEND | 04 | BLOC | % of GDP deviation | −2 | +3 | 0 | 1 | 28 | econ −1 |
| ANTITRUST_SHARE_THRESHOLD | 13 | BLOC | % market share | 25 | 60 | 40 | 10 | 91 | reg +1 |
| REGULATOR_BUDGET | 13 | BLOC | multiplier on case capacity | 0.6 | 1.6 | 1.0 | 0.2 | 91 | reg −1 |

Precedence (DEFAULT, Mathis may override): the Stabilizer (03 §3.7) has no tax lever (taxes are TRANSFERs, so 00 §5.4 excludes them; ruling in 24), so TAX_TOP_INCOME and every other tax lever take exactly their in-force legislated value. Where a Stabilizer lever and a legislated value ever touch the same price, the legislated value is the base and the Stabilizer multiplier applies on top. Politics never edits 03's Stabilizer state. Enum levers move by 1 step per bill. A lever change takes effect at the first day close after IN_FORCE; positions opened before keep no grandfathering unless the owner module says so (05 grandfathers leverage for 7 game days).

**§3.5.10 Central bank appointments.** A governor's term is 8 game years. At term end or exit (§3.4.6 hazard), the bloc government appoints a successor actor whose ideology is the government's position + N(0, 0.2) per axis, and whose hawkishness starts at
```
h0 = clamp( 0.5 + 0.25·ideology.econ + 0.10·(competence − 0.5) + N(0, 0.05), 0.1, 0.9 )
     (econ +1 = more hawkish; the other axes have no weight, DEFAULT)
```
After appointment `h` moves at most 0.05 per strategic epoch toward `h0 + 0.5·(π − π*)/0.02` clamped to [0.1, 0.9] (inflation persistence makes any governor more hawkish). 04 maps `h` into its rule personality (e.g. inflation weight `1.2 + 0.8·h`). Players cannot lobby the central bank (no lever exists); they can only read its speeches.

**§3.5.11 Player standing in politics.** Players influence politics only through the public, priced channels above (lobbying, contributions, issue campaigns, petitions), plus 12's bribery operation (a crime with 13 consequences). Any player's spend shows on the public register by name. There is no player office-holding at launch (DEFAULT, Mathis may override; a later season may add elected offices).

### §3.6 Causal news and the information tiers (layer 5)

**§3.6.1 Source events.** News is generated only from committed engine events (00 §5.6 event log) of kinds that map to a `NewsKind` (22 mapping table): owner-module events (04 data releases and rate decisions, 05 halts and large moves, 07 bank failures, 09 earnings, launches, takeovers, IPOs, bankruptcies, 10 city events, 11 model releases and AI-race milestones, 12 public outcomes of operations such as a discovered breach, 13 suits, verdicts, sanctions, 15 filings and public player statements), plus 16's own events (bills, elections, shocks, dynasty disputes, successions, eras, breakthroughs). **Invariant N1**: every `NewsItem.causeEventIds` is non-empty and every id resolves to a committed event of the same or an earlier tick. **Invariant N2**: a news item never states a fact that is not true in engine state at `publishTick`, except a Rumor (§3.6.7), which is always labeled as a rumor and carries its source.

**§3.6.2 Newsworthiness.**
```
nw(e) = base_kind × magnitude(e) × reach(e) × novelty(e) × (1 + 0.5·telegraphBonus) × outletFit
base_kind   : 22 table, e.g. CENTRAL_BANK 1.0, BANKRUPTCY 0.8, M_AND_A 0.7, EARNINGS 0.5, PRODUCT 0.3, CITY 0.25, PLAYER_PUBLIC 0.3
magnitude   : owner-supplied in [0,1] (e.g. |surprise| / 2σ for data, deal value / sector cap, loss / assets)
reach       : 1 for WORLD, 0.7 BLOC, 0.5 SECTOR, 0.4 CITY, 0.3 single company; × min(2, 1 + 0.25·log10(1 + PP)) for PLAYER_PUBLIC (14 §3.8.3 `reachWeight`)
novelty     : 1 − 0.5^(game days, fractional = ticks/720, since the last item on the same subject and kind)   (repeat coverage decays)
telegraphBonus : 1 if the event fulfils a prior precursor item
outletFit   : 1.2 / 0.8 slant multiplier for dynasty-controlled outlets (§3.4.3), else 1
```
Items with `nw ≥ PARAM.news_publish_threshold = 0.05` (E-28/E-29) are candidates; each day the generator keeps the top `PARAM.news_target_per_game_day = 40` by nw (world-wide, with at least 4 per bloc and at least 1 per active city when candidates exist), plus every `alwaysPublish` kind regardless of count: CENTRAL_BANK decisions, MACRO_DATA releases, BILL stage changes, ELECTION results, VERDICT in public cases, BANKRUPTCY of listed firms and banks, ERA, every MAJOR shock and its precursors, every halt (05), and required filings that cross 10% (15 §3.8). Candidates are evaluated each tick for events of the previous tick, so publication is 1 tick after the event (`publishTick = eventTick + 1`); the daily cap is enforced with a rolling quota of `40/720` per tick and a carry-over list (items that miss the quota within 30 ticks are dropped and logged, never published late out of order).

**§3.6.3 Templates.** About 400 templates (22) keyed by `NewsKind` and conditions on slot facts; the selector picks the template whose `conditions` all hold with the highest specificity (most conditions), ties by `templateId`. Slots are filled only from the cause events and public facts. Body text explains the mechanism ("because", "after", "which means") using the `CausalLink`s recorded for that event (§3.8). Language variants (EN, FR, L8) are pure presentation.

**§3.6.4 Outlets and slant.** 15 outlets (22 names), each with an EDITOR actor, a bloc or world scope, an audience size and a slant `Ideology`. Each outlet covers the subset of candidates within its scope; for a given event, the outlet with the highest `audience × outletFit` publishes the canonical item, and up to 2 others may publish variants (same facts, different tone). Tone choice: CRITICAL if the subject is a rival of the outlet's owner (feud intensity > 0.3) or opposes the editor's ideology by more than 0.5 on the bill's axis; WARM if allied (trust ≥ 50 or pact); else NEUTRAL. Tone changes adjectives and order of facts only; `credibility` (`baseCredibility × outlet reliability`) never depends on tone. Discovery of an outlet's owner and slant is a Fact (EDITORIAL_SLANT, §3.11).

**§3.6.5 Market impact.** 16 never sets prices. `impactHint` is filled by the owner (05 from its belief model, 09 for company events) and is display only. 05 reads the underlying event, not the headline (the headline is a view of the event), so an outlet's tone cannot move prices. Precursor (`telegraph`) items let attentive players anticipate; 05's belief model updates on precursors in the same way for NPC traders.

**§3.6.6 Information tiers** (L13 "Why it moved" and Research Desk). All prices in real dollars, charged per game day while active (SINK, codes in §3.14):

| Tier | Price per game day | What it gives |
|---|---|---|
| Free feed | 0 | Every published item at `publishTick`, the public registers (filings, lobbying, contributions), the archive search (§3.9), and "Why it moved" for any asset after the move, at summary depth from 05's `explainMove(assetId, window)` |
| Terminal | `max($20, 2e-6 × NW_real)` | Headlines at `tierEarlyTick = publishTick − 1` (one tick, 5 real seconds, early: the body follows at publishTick), filters and alerts, full-depth "Why it moved" (all contributing factors with weights from 05), consensus estimates from 09 |
| Analyst T1 / T2 / T3 | $100 / $600 / $2,500 | A named NPC analyst (22) per sector: T1 a daily sector note from public data with a forecast at σ 0.6 (the noisiest tier; E-29); T2 adds forecasts of the next data release using 04/09 model expectations with error σ = 0.6 / 0.4 / 0.25 × the release's historical σ for T1 / T2 / T3; T3 adds scenario analysis of open consequence chains (§3.8) touching the sector |
| Research Desk (R3+, 14 §3.2.5) | `$1,500 + 1e-5 × NW_real` | Ownership maps (09 registry plus filings, up to 3 layers, with confidence where nominees hide links), dynasty atlas entries for known facts, `soc.world.researchDesk.query` (each query $25,000, answers from public mosaic only, 1 game day), and the OpportunityBrief (§3.12) at full depth |

Guards: tiers never reveal another player's private positions, orders or strategy (L11); "Why it moved" attributes flow only by pool type (retail, NPC funds, player funds aggregate, market makers) and only after the fact, never by player identity; the 1-tick head start applies only to the headline and never precedes the event's commit tick, so no tier sees the future. Fees are capped at `PARAM.info_fee_cap_pct_nw_per_game_day = 0.05%` of NW for the Terminal and Research Desk combined. The heir trait QUANT_RAISED (14 §3.15.4) cuts Research Desk and analyst fees by 10% for one chapter. **Published research**: a Research Desk subscriber may publish a research note (`soc.world.research.publish`, free, at most 2 per game day) built only from PUBLIC_MOSAIC facts and public data, with the author named; other players can follow notes, and 14 awards the `PUBLISHED_RESEARCH` legacy line when a note is followed by at least 25 players (14 §3.14). A note that contains a NON_PUBLIC fact is refused at validation.

**§3.6.7 Rumors** (ROADMAP §2.5). `PARAM.rumors_per_game_day = 8` world-wide, published by 20 RUMOR_SOURCE actors, each with `hiddenAccuracy ~ U(PARAM.rumor_accuracy_min = 0.40, PARAM.rumor_accuracy_max = 0.70)` fixed at creation (never shown; players infer it from the source's public track record, which the archive shows as `hits / resolved`). Generation at day close for the next day:
1. Pick a subject from open real candidates (pending events known to the engine: a scheduled bill vote, a takeover negotiation in 09, a pending 13 decision, an incoming shock precursor, earnings within 5 game days); weight by subject salience.
2. `isTrue = rng < hiddenAccuracy`; the claim states the real outcome if true and the opposite if false. The resolution horizon is U(1, 5) game days, never past the real event's due time.
3. Resolution: a true rumor is CONFIRMED when the event happens. A false one is FIZZLED (70%: nothing happens by the horizon) or DENIED (30%: the subject issues a public denial, a news item).
Price effect: 05 receives `rumorImpulse = 0.5 × (2·credibility − 1) × expectedMove` (zero at credibility 0.5; E-28/E-29), with `credibility = trackRecord of the source shrunk to 0.5 (`PARAM.rumor_cred_prior_mean`) with prior weight `PARAM.rumor_cred_prior_weight = 10`; the same estimator and param drive the public `credBand`, errata E-56 §3`, fading with a half-life of `PARAM.rumor_fade_halflife_game_days = 1`; 05 applies it to NPC beliefs only (players decide for themselves). Harness gates (20): the sign-accuracy of rumors overall stays in [0.50, 0.60], and a strategy of trading every rumor at publication earns ≤ 0 after costs in the 20 rumor-trader bot test.
Rumors never concern a player's private plans or holdings (L11); a rumor can concern a public player event (a filed takeover bid) only after it is public.

**§3.6.8 Tips.** Tips are private messages from 12's channels (bribed contacts, stolen data, informants, board packs, order taps; all abstract operations owned by 12). 16 builds the content: 85% accurate (`PARAM.tip_accuracy = 0.85`), 15% stale or planted (by an NPC FUND_PRINCIPAL with integrity < 0.25 whose fund holds the opposite position). Every tip is tagged `legalRiskTag = 'INSIDER'`: trading on it is insider dealing under 13 (detection by 05's surveillance score). The tip screen always offers `soc.world.tip.act` with options TRADE (normal intents; 13 risk applies), IGNORE, or REPORT (to the regulator: Rep +2 via 14, the tip's fact becomes a 13 lead; reporting within 3 game days gives immunity for that tip).

**§3.6.9 Circle whispers.** Members of Glasshill and Summit (14 §3.12.1) receive the `CIRCLE_WHISPERS` stream: 2 items per game day drawn the same way as rumors but with `hiddenAccuracy ~ U(0.45, 0.75)` (14's value), and only on PUBLIC-pending subjects (never NON_PUBLIC facts, so whispers are never insider information).

**§3.6.10 Player statements.** 15 §3.10 sends public statements; 16 resolves their news coverage: a statement becomes a PLAYER_PUBLIC candidate with `magnitude = 0.2` (0.5 if it names a listed company or a bill), reach scaled by Prestige; statements are never `impactHint`ed, and 05 applies no price effect for statements (DEFAULT, Mathis may override: prevents talk-up schemes). A statement that asserts a fact the engine knows is false about a listed company triggers 13's market-manipulation check.

**§3.6.11 Language layer** (B09). An optional LLM paraphrase layer may rewrite bodies for variety; its output is validated (every number, name and causal claim must match slots; else the template text is used) and it is presentation only. Engine logic never reads paraphrased text.

### §3.7 World events and shocks (layer 6)

**§3.7.1 Frequencies** (ROADMAP §2.8, made exact). Shocks are drawn at day close for the next game day from `rng('world.shock', day)`:
```
RIPPLE : Poisson rate PARAM.macro_ripple_rate = 1/7 per game day world-wide   (≈ 3.4 per real day; local, small)
STORM  : PARAM.macro_storm_rate = 1/91 per game day                            (≈ 1 per 3.8 real days; bloc or sector)
MAJOR  : drawn by 04 only (`macro_major_base_rate`, 04 §3.16); `major_exo_rate` retired (E-29)
```
Target: the probability that a chapter contains at least one MAJOR crisis of any cause is about 35% (`λ_total = −ln(0.65) ≈ 0.43` per chapter); the remaining `0.23` comes from endogenous crises (bank runs from 07, sovereign stress from 04, crashes from 05, contagion), which 16 does not draw but does count. The harness (20) tests the observed rate across 200 simulated chapters to lie in [25%, 45%]. The split between exogenous and endogenous MAJORs is 04's (`macro_major_base_rate`, constraint 5); 16 draws none (E-29).

**§3.7.2 Drawing.** Category by weights per tier (22 per-tier table; launch: WEATHER 0.25, GEOPOLITICAL 0.15, LABOR 0.12, HEALTH 0.05, TECH 0.10, ACCIDENT 0.12, DISCOVERY 0.06, COMMODITY_SUPPLY 0.10, CYBER_WAVE 0.05), × the chapter theme multiplier (15 §3.3, e.g. "Supply Squeeze" ×2 for COMMODITY_SUPPLY), × band rotation: the bloc or sector hit by the previous shock of the same tier gets weight × 0.5 for the next 2 draws. Then `ShockDef` by `baseWeight` within (tier, category), scope key uniformly among eligible (cities with population ≥ the def's minimum; commodities listed in 06). Magnitudes uniform in each effect's range.

**§3.7.3 Precursors and constraints.**
- Precursor (telegraph) window: MAJOR ≥ `PARAM.major_precursor_min_game_days = 8` (8–20), STORM 1–2 game days, RIPPLE none. During the window, 1–3 telegraph news items appear (WEATHER: forecasts with probability bands; GEOPOLITICAL: escalating statements; LABOR: strike ballot). A telegraphed event happens with probability 0.85 (15% de-escalate, recorded): hedging has value but is never certain.
- At most 1 MAJOR active at a time; MAJOR onsets at least `PARAM.macro_major_min_gap_days = 504` apart (21 real days).
- No MAJOR or STORM onset in the final 48 real hours of a chapter (the finish window, 15 §3.3), and none during the first 24 real hours of a chapter.
- After a player-caused major crisis (a cascade that 03 attributes to player entities, e.g. a player bank failure triggering contagion), exogenous MAJORs are suppressed for `PARAM.major_suppression_game_days = 336` (14 real days).
- **Crisis Week**: defined and drawn by 04 §3.16.1 (owner of crisis tiers and rates; ruling in 24): at most 1 per chapter, drawn at chapter start with probability 0.6 and placed in real weeks 2–7, announced 48 real hours ahead as a world event (theme from 22), storms ×2 with one guaranteed storm and the MAJOR rate ×1.5; no MAJOR is ever guaranteed. LiveOps (21) supplies only its theme copy and cannot schedule or force one.

**§3.7.4 Effects.** A shock's effects are routed to owner hooks only, each with magnitude, lag and duration (e.g. `06.supplyShock(commodity, −12%, lag 0, dur 30)`, `09.capacityShock(sector, city, −20%)`, `10.cityDamage(district, severity)`, `04.demandShock(bloc, −0.5% GDP)`, `07.creditTightening(bloc, +0.2)`, `08.catLoss(region, peril, severity)`, `05.volRegime(bloc, +1)`). 16 schedules them through the consequence scheduler (§3.8) so follow-on effects (insurance claims, reconstruction demand, price normalization) are recorded and explainable.

**§3.7.5 Labor and strikes.** Each UNION_LEADER actor covers 1–3 sectors in a bloc. At each strategic epoch: `p_strike = σ(−4 + 3·(realWageGap) + 2·(profitGrowth) − 1.5·u + 1.0·aggression)`, where `realWageGap = max(0, π − wageGrowth)/0.02`. A strike is telegraphed by a ballot (3–7 game days), lasts U(3, 21) game days, cuts that sector's capacity in the covered cities by 30–60% (09), and ends with a settlement raising wages by `0.5–1.5 × π` (09 wage costs). Player businesses in the sector can settle early with their own workers (09 wage intent) to keep operating at a cost.

**§3.7.6 Shock catalog** (22 holds about 120 defs; minimum at launch): RIPPLE: local storm, port delay, product recall, factory fire, celebrity scandal, small cyber incident at an NPC firm, local power cut, road closure. STORM: regional drought, hurricane on one coastal city, chip-fab outage, shipping-lane disruption, regional strike, data-center outage, crop disease, a mid-size bank run. MAJOR: pandemic wave, trade war between two blocs, major quake, global energy shock, systemic cyber wave (abstract: many firms offline), sovereign default scare, AI breakthrough shock (from §3.10), commodity super-squeeze. Cyber shocks are described only as outcomes (firms offline, data exposed); no techniques.

### §3.8 Consequences over time

**§3.8.1 Scheduler.** Every committed event of a kind listed in a `ConsequenceRule.triggerKind` whose filter matches spawns `PendingConsequence`s, one per effect, with `dueTick = eventTick + U(lag)` (drawn from `rng('world.news', eventId)`). At P3 each tick the scheduler fires due items in `(dueTick, pcId)` order: it calls the owner hook with the evaluated magnitude, records a `CausalLink {cause, effect, channel, lag, ruleId}`, and emits the effect event. `recordOnly` effects only write the link and a history note (used where the owner module already models the effect itself, so 16 never double-counts). Owners may veto with a reason (e.g. the plant was already closed); the veto is recorded.

**§3.8.2 Launch rules** (22 may add; each rule's magnitudes in its table):

| # | Trigger | Effects (owner, lag, duration) |
|---|---|---|
| C01 | Plant or large site closure (09) | local employment −(jobs/labor force) (16 §3.2 adj, 0–7 d, 365 d decay); housing demand −(0.5× that) (10, 14–60 d, **record-only**: the employment channel of §3.2.4 already moves it; E-28/E-29); supplier orders −share (09, 0–14 d); rent index −(0.3× that) (10, 30–180 d); local politician salience econ +0.1 |
| C02 | Plant opening | the mirror of C01 with positive signs, plus construction demand (09) |
| C03 | Bank failure (07) | credit tightening bloc +0.2 (07, 0–3 d, 91 d); deposit flight from banks with similar ratios (07, 0–2 d); bill on CAP_BANK_MIN_RATIO with p 0.6 (16, 14–60 d) |
| C04 | Listed bankruptcy | supplier receivables loss (09, 0 d, record-only); sector credit spread +50 bps (07, 0–5 d, 56 d) |
| C05 | Takeover completed | integration layoffs 0–8% of target staff (09, 30–180 d); product consolidation (09); antitrust review if share > threshold (13, 0 d) |
| C06 | Strike settlement | sector wage cost +x (09, 0 d); prices +0.5x pass-through (09, 7–28 d) |
| C07 | Rate decision surprise (04) | mortgage rates (07, 0–3 d); housing turnover −/+ (10, 14–91 d); consumer credit (07) |
| C08 | Commodity spike (06) | input cost for dependent sectors (09, 0–14 d); CPI pass-through (04, 14–60 d); TARIFF bill p 0.2 |
| C09 | Natural disaster (shock) | insured losses (08, 0–7 d); reconstruction demand construction +x (09/10, 30–365 d); city population −0–2% (10, 0–91 d) |
| C10 | Major scandal at a listed company (13) | CEO exit p 0.5 (16, 7–60 d); Rep of named people (14) |
| C11 | Election result | agenda reset (16, 0 d); market risk premium bloc ±(policy distance) (05, 0–3 d) |
| C12 | Bill in force (each lever) | owner reads the lever (record-only link) plus lever-specific secondary rules (22), e.g. ZONING_DENSITY up → construction starts +x (10, 91–365 d) |
| C13 | Breakthrough (§3.10) | sector productivity (09, diffusion), job displacement in AUTOMATION-exposed sectors (16 §3.2, 182–728 d), new product categories (09) |
| C14 | Dynasty succession | asset sale p 0.3 (16, 0–90 d); feud p 0.2 |
| C15 | Player business expansion with ≥ 200 jobs in a city | as C02 at the player's size (record-only for the business itself) |
| C16 | Sovereign downgrade (08) | bloc bond yields (04, 0 d); bank capital mark (07, 0–3 d) |
| C17 | Data-center or compute outage | compute price +x (06, 0 d, 3–14 d); AI lab delays (11) |
| C18 | Port or shipping disruption | delivery delays (09, 0–3 d, 7–56 d); inventory price premium |
| C19 | Pandemic wave | demand shift ENTERTAINMENT/TRANSPORT −, HEALTH/TECH + (16 §3.2 shares, 0–14 d, 91–364 d); labor supply −2% |
| C20 | Large insider or fraud verdict (13) | regulator budget bill p 0.3; sector surveillance priority +0.1 (13) |

**§3.8.3 Bounded cascades.** A consequence chain stops when depth reaches `PARAM.consequence_max_depth = 4` or the evaluated magnitude falls below 2% of the root's; each event can spawn at most 12 pending consequences. Every fired consequence is explainable: the Archive (§3.9) and "Why it moved" (05) can traverse `CausalLink`s back to the root.

### §3.9 World history and the archive

**§3.9.1 Recording.** Every event with significance `σ_h = nw × durationFactor ≥ PARAM.history_threshold = 0.4` is written as a `HistoryEntry` (durationFactor = 1 + log10(1 + game days of the effect)/2, capped 2). Entries with `σ_h ≥ PARAM.history_permanent = 0.6`, all elections, successions, eras, breakthroughs, bankruptcies of listed firms and banks, MAJOR shocks, Season Finals results (15 §3.5) and Hall of Fame inductions are PERMANENT; others are AGGREGATE_AFTER_YEAR (after one real year they collapse into a monthly digest entry per bloc).

**§3.9.2 Chronicle.** At each chapter close, the chronicle picks the top 25 entries world-wide by σ_h and 10 per bloc, with at most 3 per subject. It publishes a "Chronicle of chapter N" page in the Archive and feeds 15's chapter recap and 14's Chapter Portrait.

**§3.9.3 "Since you left".** On login after an absence of at least 15's `wywa_min_absence_real_minutes` (20 real minutes), 15 §3.11 asks 16 for the top entries since the last session, filtered to those touching the player's holdings, contracts, cities, counterparties and known actors (by subject ids), up to 7 items, ranked by `σ_h × relevance` where relevance is 1 for direct holdings, 0.6 for counterparties, 0.4 for home city, 0.2 otherwise.

**§3.9.4 Timelines and the archive.** Every company, city, actor, dynasty, party and bill has a public timeline of its entries. `soc.world.archive.search` searches entries by subject, kind, date range and text keys (free). Old archive documents (`ARCHIVE_DOCUMENT` facts) are seeded by 22 and by recorded history; some are prerequisites for discovery paths (§3.11).

### §3.10 Eras and technology

**§3.10.1 Progress.** Each `TechDomain` has a level 0, 1, 2, … At each day close:
```
rnd_d        = Σ_b FirmSector.rndGameDay[d] / MSI  +  Σ player R&D spend in d (09 R&D intents, 11 lab spend for AI and COMPUTE) / MSI     // real dollars
cost_d(L)    = PARAM.tech_base_cost_chapters = 1.3 (E-36, PROVISIONAL [Quant]) × baselineRnd_d,chapter × PARAM.tech_cost_growth = 1.25^L
progress_d  += rnd_d / cost_d(level_d)          // when progress_d ≥ 1: level_d += 1, progress_d −= 1, fire the breakthrough
```
`baselineRnd_d,chapter` is the launch NPC R&D in domain d over one chapter (fixed at world creation so player investment genuinely accelerates technology). Player R&D can raise the pace; there is a hard pace limit of at most 1 breakthrough per domain per 14 real days (excess progress carries over).

**§3.10.2 Breakthroughs.** 22 authors 5 named breakthroughs per domain (levels 1–5; 40 total). Levels beyond 5 are generated as "incremental" breakthroughs with smaller effects (0.5× level-5 effects). Each breakthrough has effects with diffusion over `diffusionGameDays` (linear ramp), e.g. COMPUTE L2: compute cost −15% (06), AI lab training efficiency +10% (11); AUTOMATION L3: labor share −0.02 in manufacturing sectors (§3.2 automationFactor), job displacement C13; ENERGY L2: energy input cost −8% (09); LOGISTICS L1: delivery lead times −10% (09); BIOTECH L2: new HEALTH product category (09); MATERIALS L2: construction cost −5% (10); FINTECH L1: settlement fees −20% (05); AI: tied to 11's AI-race index thresholds (11 owns; 16 records). Breakthroughs are announced as TECH news items with a 3–10 game day telegraph from 09/11 R&D pipelines (labs report "late-stage trials").

**§3.10.3 Eras.**
```
eraScore = Σ_d level_d + floor(AIRaceIndex / 10)     // AIRaceIndex 0..100 from 11
era thresholds (PARAM.era_thresholds) = [0, 8, 18, 30, 40]   // E-36, PROVISIONAL [Quant]   → eras 0..4 (22 names them, e.g. "The Ledger Age", "The Wired Age", …)
```
A new era begins at the day close after `eraScore` crosses the next threshold, but at most one era change per 2 chapters (`PARAM.era_min_chapters = 2`); a pending era waits until the next chapter boundary allowed. Eras shift consumption shares (§3.2.3: e.g. era 2 moves 0.02 from RETAIL to TECH), unlock 22 catalog content (14 lifestyle items, 09 sectors), change the Ink & Brass accents (L4, 17 owns), and write a permanent history entry and an ERA news item. **Foreshadowing** (E-36, PROVISIONAL [Quant]): when the 7-GD eraScore projection first shows the era landing in 5–9 GD, 16 schedules causally linked precursors: `tech.patent_filing` (2–3, T − 7–9 GD, nw 0.053–0.075), `tech.late_stage_trial` (1, T − 3–7 GD, nw 0.24–0.40), `world.era.imminent` (1, T − 1–2 GD, nw 0.5, always published); the ERA item gets ×1.5. Precursors re-anchor if the era moves; a slip > 14 GD after publication emits a "timeline pushed back" item; no item states a date.

**§3.10.4 Gates.** Unlocks requiring technology: player tokens (L10 "later") require FINTECH ≥ 3 AND era ≥ 2 AND a LiveOps release flag (21); DEFAULT, Mathis may override. New derivative classes in 05 may require FINTECH levels (05 lists them). Eras also move each bloc's voterMedian.tech by +0.05 (populations get used to technology).

### §3.11 Secrets and discovery

**§3.11.1 What a secret is.** A `Secret` groups true `Fact`s that are not public (`publicSinceTick = null`). Facts are always true and always derived from engine state (ownership chains, liabilities, related-party contracts, past incidents in history, family links, political ties, editorial slant, pending events). 22 authors 40 **authored** secrets with authored paths and rewards (e.g. a dynasty's hidden stake in a rival shipping group), and 60 **decorative** secrets (easter eggs: a lost painting's provenance, a founder's first shop; no economic effect, a collection entry or title in 14). The engine also generates **systemic** facts automatically: every nominee chain, every related-party contract above $10M real, every political tie, every pending takeover negotiation.

**§3.11.2 Discovery methods** (each `DiscoveryPath` names prerequisites, cost, success probability and duration; defaults when 22 does not override):

| Method | Default cost (real) | pSuccess | Duration | Legal basis | Notes |
|---|---|---|---|---|---|
| FILINGS_CHAIN | free | 1 (if the chain is public) | instant (player follows links) | PUBLIC_MOSAIC | follows 15 filings and 09 registry |
| RESEARCH_MAP | Research Desk query $25,000 | 0.8 per layer | 1 game day | PUBLIC_MOSAIC | R3+ |
| DUE_DILIGENCE | 12 E8 dossier price | 0.7 | 12's duration | PUBLIC_MOSAIC | 12 owns |
| ARCHIVE_STUDY | $5,000 | 0.6 (1 if the archive document is known) | 2 game days | PUBLIC_MOSAIC | archive documents as prerequisites |
| CONVERSATION | free, needs actor trust ≥ 40 | `0.3 + 0.5·trust/100 − 0.3·integrity` | 1 game day | PUBLIC_MOSAIC if the actor may disclose; NON_PUBLIC if the actor breaches a duty | at club/gala co-attendance or contract counterparties |
| ESPIONAGE | 12 operation price | 12's success model | 12's duration | NON_PUBLIC | crime; 13 consequences |
| WHISTLE | none | event-driven | — | NON_PUBLIC to the recipient, public once reported | a disgruntled NPC (integrity ≥ 0.7, trust ≤ −50 with its employer) contacts a player with Rep ≥ 60 |

`soc.world.secret.investigate` starts one path; on success the character gets a `KnowledgeRecord` for each yielded fact. A **mosaic** of public facts is legal to act on even when the conclusion is not public (13 mosaic doctrine, DEFAULT); a NON_PUBLIC material fact makes trading on it insider dealing (13).

**§3.11.3 Coverage rule.** Every authored secret has at least 2 paths, at least one of them PUBLIC_MOSAIC (free or cheap for patient players, P02); the harness (20) checks this for the 40 authored secrets and for a sample of systemic facts.

**§3.11.4 Uses.** For a known fact, the holder chooses (§4):
- **KEEP**: act on it through ordinary intents (subject to legal basis).
- **SHARE** (`soc.world.fact.share`) with another character or alliance: their records copy the fact with the same legal basis and `method` noted as shared; sharing NON_PUBLIC material facts is tipping (13).
- **SELL to an NPC outlet** (`soc.world.fact.sell`): only for non-material facts or PUBLIC_MOSAIC facts; seller rank ≥ `PARAM.fact_sale_min_rank = R2`; price `= PARAM.fact_sale_base_real = $5,000 × (1 + 9·sensitivity) × outletAudience` (audience 0.5–2), TRANSFER `FACT_SALE_NPC` from the NPC firm sector (E-33) capped at `PARAM.fact_sale_cap_real_per_chapter = $100k` per character per chapter (E-35, PROVISIONAL [Quant]); each fact sells once world-wide; the drained NPC firm cash is refilled by `ROW_NPC_INCOME` at the next day close (§3.2.5), so the sale is new money one day close later, ≤ $100k real per R2+ character per chapter (E-35 amendment, PROVISIONAL [Quant]); the outlet publishes it (becomes public, news item).
- **REPORT** (`soc.world.fact.report`) to a regulator when it evidences wrongdoing: 13 opens a lead and the fact adds its discovery path's expected cost to the investigation's cumulative spend on the E-24 √ curve (E-35, PROVISIONAL [Quant]); the reporter gets Rep +3 (14) and, if 13 obtains a sanction, a whistleblower award from 13's rules.
- **PUBLISH** (`soc.world.fact.publish`) as a public statement (15 Wire, cost as a statement): becomes public; holders react (trust −30 toward the publisher; denial or self-disclosure).
- **APPROACH** the holder (`soc.world.actor.approach`) to propose an ordinary deal (a contract, an acquisition, a partnership) informed by what the player knows. The approach may mention the fact. **Conditioning silence on payment is extortion, a crime, and is never a valid intent**: 15's contract validation refuses any clause whose consideration is non-disclosure of a fact, and `approach` has no payload field for such terms.

**§3.11.5 Holder counterplay.** Holders are NPC actors (or player entities when the fact concerns a player's public structures, e.g. a nominee chain that is in any case derivable from filings). When a fact about them becomes public or they detect an investigation (CONVERSATION reveals the interest with p 0.2; ESPIONAGE detection by 12), the holder may: self-disclose first (pre-empting the news), restructure (sell the stake, unwind the related-party contract, 09/15), issue a denial if the fact is ambiguous, or bring a 13 case against NON_PUBLIC acquisition. Facts about players are generated only from what is already public or legally required to be filed; 16 never creates a "secret" from a player's private state (L11).

### §3.12 Opportunity briefs

At the first login of each real day (and on demand, at most `PARAM.briefs_per_real_day = 3`), each character can receive up to 3 briefs. Candidates are open consequence chains, telegraphed shocks, bills in committee and pending elections, scored by `relevance (as §3.9.3) × magnitude × uncertainty`, where uncertainty favors items with outcomes still open. A brief states what happened, why it is relevant to this character, what is known (from recorded links and owner estimates) and what is uncertain, and offers deep links (to the asset, bill, city, company), never a recommended trade or direction (DEFAULT). Free players get a summary; the Research Desk gives full depth with owner estimates. Briefs are deterministic given the event log and the character's public relations (holdings are the character's own private data, read only for its own brief). `soc.world.brief.dismiss` hides a brief and lowers that kind's weight for the character by 0.2 for 7 real days.

### §3.13 Population, replacement and growth

- Every institution always has an acting leader: when an actor exits (DECEASED, RETIRED, IMPRISONED by 13, REPLACED by a board after scandal or poor performance: `p_replace` per strategic epoch `= σ(−4 + 3·underperformance + 2·scandal)`), an interim is appointed the same tick and a successor is generated by 22's generator within 1 game day, inheriting the institution's relationships at half trust (memories are personal and not inherited).
- Actor count grows with cities (§3.3.1) and dynasties (§3.4.7), capped at `PARAM.actor_cap = 2,000`; above the cap, IDLE actors retire first.
- NPC funds (30 at launch) are kept between 25 and 40 by FUND_PRINCIPAL launch and close decisions; NPC banks between 20 and 35 (07 failures and new charters).
- Retired and deceased actors keep their timeline and appear in history; the dynasty atlas keeps family trees.

### §3.14 Reason codes (03 ledger)

| Code | Class | Use |
|---|---|---|
| HH_WAGES | TRANSFER | firm sector to households |
| HH_CONSUMPTION_NPC | TRANSFER | households to NPC firms |
| HH_CONSUMPTION_PLAYER | FAUCET | households to player businesses (09 posts it) |
| FRM_B2B_PLAYER | FAUCET | NPC firm purchases at player businesses (09) |
| FRM_DIVIDENDS | TRANSFER | NPC firm dividends to households and NPC holders |
| ROW_NPC_INCOME | FAUCET (into the NPC sector only; not counted in player money supply) | 04 nominal-GDP closure |
| LOBBY_SPEND | SINK | lobbying registration and spend |
| POL_CONTRIBUTION | SINK | contributions to parties |
| ISSUE_CAMPAIGN | SINK | issue campaigns |
| PETITION_COMMIT | SINK | petition backers' commitments |
| INFO_TERMINAL_FEE | SINK | Terminal subscription (alias of 03 `ACCT_TERMINAL_SUBSCRIPTION`, E-29) |
| INFO_ANALYST_FEE | SINK | analysts |
| INFO_RESEARCH_DESK_FEE | SINK | Research Desk subscription |
| INFO_RESEARCH_QUERY | SINK | Research Desk queries |
| SECRET_PATH_FEE | SINK (alias of `WLD_ARCHIVE_PURCHASE`, E-33) | ARCHIVE_STUDY and other paid paths owned by 16 |
| FACT_SALE_NPC | TRANSFER from the NPC firm sector (capped; E-33) | sale of a fact to an NPC outlet |

---

## §4 Player intents

Common validation: registered account, character not banned or anonymized, 00's rate limit (20 per tick), sufficient cash for any fee (charged in nominal at `amountReal × MSI`). Held characters (13) may use only `soc.world.archive.search`, `soc.world.brief.dismiss` and `soc.world.fact.report`. All 16 intents apply in P12 (social) with effects read by 16 in P3 of the next tick.

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `soc.pol.lobby.register` | `{ clientEntityId, leverId, scopeKey, direction: 'UP'\|'DOWN' }` | caller controls the client entity (03 beneficial ownership) or the client signed a 15 SERVICE contract naming the caller as lobbyist; lever exists for that scope; no duplicate active registration; R1+ | `LobbyRegistration` created, public; fee $10,000 real (`LOBBY_SPEND`) |
| `soc.pol.lobby.spend` | `{ registrationId, amountReal, targetCaucusId? }` | registration active; amount ≥ $10,000 real; caucus belongs to the lever's bloc | `LobbySpend` recorded; `LOBBY_SPEND` sink; register updated at day close |
| `soc.pol.lobby.withdraw` | `{ registrationId }` | own | registration ended; past spend keeps counting until its window ends |
| `soc.pol.contribute` | `{ partyId, amountReal }` | an election cycle is open (always true: cycles run between elections); cap $5M real per donor per party per cycle, linked accounts pooled (15 §3.12) | party treasury +; `POL_CONTRIBUTION`; public by name at day close |
| `soc.pol.campaign` | `{ blocId, axis: 'econ'\|'reg'\|'trade'\|'tech', sign: 1\|-1, amountReal }` | amount ≥ $1M real; R2+ | Δsupport per §3.5.8 (capped); `ISSUE_CAMPAIGN`; public |
| `soc.pol.petition.open` | `{ blocId, leverId, scopeKey, proposedValue }` | within lever bounds and max change; no bill on that lever in that scope in COMMITTEE or FLOOR; no failed bill in the last 91 game days; R3+ | petition record (public), 28 game days to reach $50M |
| `soc.pol.petition.back` | `{ petitionId, amountReal }` | petition open; amount ≥ $100,000 real | commitment escrowed (07 `escrow.hold`); at threshold all commitments are charged (`PETITION_COMMIT`) and a PETITION bill is introduced; at expiry escrows are released |
| `soc.world.terminal.subscribe` / `.cancel` | `{}` | — | Terminal tier on/off; daily fee charged at each day close while on (pro rata on the first day) |
| `soc.world.analyst.hire` / `.fire` | `{ sector, tier: 1\|2\|3 }` | ≤ 5 analysts per character | analyst notes; daily fee |
| `soc.world.researchDesk.subscribe` / `.cancel` | `{}` | R3+ (14 §3.2.5) | Research Desk on/off; daily fee |
| `soc.world.researchDesk.query` | `{ subjectId, question: 'OWNERSHIP'\|'RELATED_PARTIES'\|'POLITICAL_TIES'\|'TIMELINE' }` | subscribed; ≤ 10 per game day | answer after 1 game day from PUBLIC_MOSAIC facts only; $25,000 (`INFO_RESEARCH_QUERY`) |
| `soc.world.secret.investigate` | `{ pathId }` | path prerequisites met; not already running; ESPIONAGE paths are refused here and must use 12's intents | path runs; success → `KnowledgeRecord`s; fee (`SECRET_PATH_FEE`) |
| `soc.world.fact.share` | `{ factId, toCharacterId \| toAllianceId }` | caller holds the fact; recipient not blocked | recipient records; NON_PUBLIC material share is logged for 13 as possible tipping |
| `soc.world.fact.sell` | `{ factId, outletId }` | fact not material or PUBLIC_MOSAIC; not public; chapter cap not exceeded; the fact is not about a player's private state (impossible by §3.11.5) | outlet publishes next tick; `FACT_SALE_NPC` faucet; holders react |
| `soc.world.fact.report` | `{ factId, regulatorId }` | fact evidences a rule breach (13's predicate list) | 13 lead; Rep +3 (14); possible award (13) |
| `soc.world.fact.publish` | `{ factId, statementText }` | 15 statement rules (cost, 3 per game day) | fact becomes public; PLAYER_PUBLIC news candidate; holders react |
| `soc.world.tip.act` | `{ tipId, action: 'IGNORE'\|'REPORT' }` | own tip | REPORT: 13 lead, Rep +2, immunity if within 3 game days; trading is done through ordinary trade intents and is not part of this intent |
| `soc.world.research.publish` | `{ title, body, factIds: string[], subjectIds: string[] }` | Research Desk subscriber; every fact PUBLIC_MOSAIC or public; ≤ 2 per game day; 15 moderation filter | note published, author named; followers counted for 14 |
| `soc.world.archive.search` | `{ query: { subjectId?, kind?, fromTick?, toTick?, textKey? }, page }` | ≤ 30 per game day | results (read-only) |
| `soc.world.brief.dismiss` | `{ briefId }` | own | hidden; kind weight −0.2 for 7 real days |
| `soc.world.actor.approach` | `{ actorId, proposalKind: 'CONTRACT'\|'ACQUISITION'\|'PARTNERSHIP'\|'INTRODUCTION', draftContractId?, mentionFactIds?: string[] }` | actor reachable (same club, gala, counterparty, or trust ≥ 0 and actor's institution is public); ≤ 3 approaches per actor per game week; no field for silence-for-payment terms exists | the actor evaluates the proposal with §3.3.3 at its next reactive epoch; mention of facts sets the actor's memory (valence −0.5 if sensitive); reply is a 15 contract offer, counter or refusal |

---

## §5 Engine events

| Kind | Payload | Visibility | Consumers |
|---|---|---|---|
| `world.aggregate.day` | `{ blocId, cityTotals[], b2bTotals[] }` | PUBLIC (summary) | 09, 10, 07, 04, 17 |
| `world.activity` | `{ actorId, kind, subjectIds }` | PUBLIC | 09, 10, news |
| `world.actor.decision` | `{ actorId, actionKind, intentId }` | INTERNAL (outcome public via the owner's event) | telemetry, 20 |
| `world.actor.exit` / `.appointed` | `{ actorId, institutionId, reason }` | PUBLIC | 07, 08, 09, 13, news |
| `world.dynasty.dispute` / `.succession` / `.formed` / `.dissolved` / `.pact` | `{ dynastyId, … }` | PUBLIC (facts behind them may be secret) | news, history, 09 |
| `world.bill.stage` | `{ billId, from, to, votes? }` | PUBLIC | 03, 04, 05, 07, 09, 10, 11, 13, 14, 15 (owners read in-force levers) |
| `world.policy.inForce` | `{ leverId, scopeKey, value, billId }` | PUBLIC | lever owner |
| `world.election.result` | `{ electionId, shares, seats, government }` | PUBLIC | 04, 05, news |
| `world.lobby.register` / `.daySummary` | `{ registrationId \| leverTotals }` | PUBLIC | Civic screen, news |
| `world.news.published` | `{ newsId, kind, outletId, causes }` | PUBLIC (headline at tierEarlyTick to Terminal) | 17, 05 (NPC beliefs on precursors), 15 Wire |
| `world.rumor.published` / `.resolved` | `{ rumorId, sourceId, claim, resolution? }` | PUBLIC (isTrue sealed until resolved) | 05, 17 |
| `world.tip.delivered` | `{ tipId }` | PRIVATE (recipient) | 13 (sealed audit), 17 |
| `world.shock.telegraph` / `.onset` / `.end` | `{ instanceId, shockId, scopeKey, magnitudes? }` | PUBLIC | owners of the effects |
| `world.consequence.fired` / `.vetoed` | `{ pcId, ruleId, causeEventId, effectEventId }` | PUBLIC (link) | 05 explainMove, archive |
| `world.history.entry` | `{ entryId, significance }` | PUBLIC | 14, 15, 17 |
| `world.chronicle.published` | `{ chapter }` | PUBLIC | 15, 14 |
| `world.tech.breakthrough` / `world.era.started` | `{ domain, level } \| { eraIndex }` | PUBLIC | 05, 06, 09, 10, 11, 14, 17, 21 |
| `world.fact.learned` | `{ characterId, factId, method, legalBasis }` | PRIVATE | 13 (insider checks), 17 |
| `world.fact.public` | `{ factId, by }` | PUBLIC | holders, news, 13 |
| `world.brief.issued` | `{ briefId, characterId }` | PRIVATE | 17 |

---

## §6 NPC behaviour (guarantees)

1. **Same rules.** Every NPC action is an intent through the owning module's validation, costs, legal checks and phase; NPCs have no private API (00 §5.5).
2. **Firewall.** No NPC rule reads any player's private state, rank, net worth, board standing or Prestige (§3.3.2). Tests 6 and 7 check this by input-dependency analysis.
3. **Balance-sheet respect.** NPC institutions never act beyond their cash, capital or covenants (03, 07). A dynasty under `debtStress ≥ 0.6` must sell.
4. **Bounded influence.** Lender pricing −20/+30 bps, outlet newsworthiness ×1.2/×0.8, supplier priority only under shortage, lobbying |L| ≤ 0.75, NPC fund participation ≤ 0.5 × ADV per tick.
5. **Motivated, explainable choices.** Every major NPC action (M&A, launch, bill, dispute, strike) records its top 3 utility terms for the Archive ("why the bank refused": PRESERVE_LIQUIDITY dominated).
6. **No punishing success.** Feuds, rivalry and competition are triggered only by public market-relevant events (bids, lawsuits, breaches, public statements naming the actor), never by a player's size.
7. **NPC rivals for new players** (ROADMAP C1 resolved in 15): each new character is paired with the nearest NPC fund or founder reference row on its starting boards.
8. **Consistency.** Actors keep their names, roles and memories for life; changes of role are recorded in `careerHistory`.

---

## §7 Screens (content; 17 owns layout)

- **Newsroom / Feed**: published items with outlet, tone tag, cause chain link ("Why this happened"), credibility; rumor items labeled with source and track record; Terminal filters; 1-tick early headline marker for subscribers.
- **Why it moved**: per asset, 05's explanation with 16's causal links to the root event.
- **Civic** (per bloc): legislature seat chart, government, public mood (approval, salience), the agenda, bills by stage with caucus vote predictions shown only as public information (the lobbying index per caucus is public; the noise term is not), lever registry with in-force values and pending changes, lobbying register (by client, lever, amount), contributions register, petitions, election calendar and results. Actions: register, spend, contribute, campaign, petition.
- **Archive**: search, timelines for every entity, chronicles per chapter, "Since you left".
- **Dynasty atlas**: families and members the character knows (only known facts are drawn; unknown links appear as "?"), family trees, holdings known, feuds and pacts (public), succession events.
- **Research Desk**: ownership maps with confidence, queries and answers, briefs at full depth.
- **Notebook**: the character's `KnowledgeRecord`s with legal basis tags (green PUBLIC_MOSAIC, red NON_PUBLIC), source, actions (share, sell, report, publish, approach); a running investigation list.
- **Briefs**: up to 3 per real day, dismissable.
- **Era timeline**: tech domains with levels and progress bars, breakthroughs, era names and the next threshold.
- **World events**: active and telegraphed shocks with scope, expected window, probability band; Crisis Week banner.
- **Actor card**: name, role, institution, public timeline, the character's own trust level shown as a band (cold, neutral, warm), known facts.

---

## §8 Edge cases

1. **Over-budget tick**: if P3 exceeds `PARAM.phase_budget_ms_P3` (200 ms), reactive epochs beyond the limit defer in `(dueTick, actorId)` order; news for committed events is never deferred beyond 30 ticks (quota rule §3.6.2); the scheduler never skips a due consequence (it fires late and records the actual tick).
2. **Event with no template**: the generic template of its kind is used; if none, no news is published and a content alert goes to 21 (N1 still holds since nothing is published).
3. **Rumor subject vanishes** (the pending event is cancelled by its owner): the rumor resolves FIZZLED at cancellation if it claimed the event, CONFIRMED if it claimed "no".
4. **Bill lever changed by another bill in force before this one enacts**: the later bill's `proposedValue` is re-clamped to `current ± maxChangePerBill`; if it would now be a no-op it FAILS with reason NO_OP.
5. **Election during a MAJOR**: proceeds; mood uses current data. No election falls inside a chapter finish window: if one would, it moves to 1 game day after the chapter boundary.
6. **Tied floor vote** (YES seats exactly 150): fails.
7. **Coalition with every party** (no viable smaller set): allowed; minority flag false.
8. **Dynasty head dies with no adult heirs**: COUNCIL_VOTE among adult members; if none, the dynasty becomes a trust administered by its main holding company's board (BACKGROUND policy) and DISSOLVES after 364 game days unless a member reaches adulthood (actor age 18).
9. **Actor controls an institution that fails** (bank failure in 07): actor status REPLACED, memory keeps a high-salience negative item; may reappear as a FOUNDER later (p 0.2).
10. **A fact becomes public through the normal course** (a filing) while a character is investigating it: the investigation ends at no further cost and the record is created as PUBLIC_MOSAIC.
11. **Character sells a fact that another character already sold**: refused (`ALREADY_PUBLIC`).
12. **Linked accounts lobbying both sides** of the same lever: pooled; the net counts once (cancels).
13. **Petition backers include a character who is banned before the threshold**: their escrow is released; if the total falls below threshold, the petition continues to its deadline.
14. **Tech level jumps by more than 1 in a day** (huge R&D): only one breakthrough per domain per 14 real days; progress caps at 1.99 and carries over.
15. **Era threshold crossed during the finish window**: the era starts at the chapter boundary.
16. **MSI change between registration and spend**: amounts are stored in real dollars; nominal charged at the tick of each payment.
17. **New city founded** (10): its 40 actors spawn over 7 game days; its households join the aggregate at the next day close; two POLITICIAN actors join existing caucuses (constituency extended); no extra seats.
18. **Shock scope city deleted or merged** (10, never at launch): the shock rescopes to the successor city.
19. **Character anonymized** (14): its knowledge records are deleted; public items it authored remain under "a former participant"; lobbying and contribution records stay with the anonymized label (public-record integrity, DEFAULT).
20. **An NPC fund planting a tip** loses that fund's tip ability for 91 game days if a REPORT leads to a 13 sanction against it.

---

## §9 Exploits and counters

| # | Exploit | Counter |
|---|---|---|
| X1 | Buy a bill: flood lobbying to set a tax or leverage lever, then trade its effect | √ diminishing returns, |L| ≤ 0.75, ideology and constituency dominate, opposition spend cancels, all spend public with names, lag between pass and in force lets everyone position, petitions cost a $50M sink |
| X2 | Front-run news with the 1-tick Terminal head start | head start is the headline only, 5 s, after the event commit; 05 already reacts to the event at its commit; Terminal fee scales with NW; 20 tests that a Terminal-only bot has ≤ 0 excess return after fees at R3+ |
| X3 | Farm rumors | accuracy 40–70% and price impulses on NPC beliefs only, fading in 1 game day; 20 rumor-trader gate |
| X4 | Fake causal news via statements to move prices | statements have no price effect and are flagged when false (13) |
| X5 | Sell facts in a loop (create, sell, recreate) | facts come only from engine state; one sale per fact world-wide; $1M real cap per chapter per character; linked accounts pooled |
| X6 | Use alts to discover secrets and share them | linked accounts (15 §3.12) pooled for caps; sharing logs; NON_PUBLIC shares are tipping |
| X7 | Extort holders with secrets | no intent or clause can condition silence on payment; 15 validation refuses; any attempt via chat is not a mechanic (chat is never a channel for engine effects) |
| X8 | Manipulate NPC trust (tiny contracts honored repeatedly) | trust gain scales with `min(1, value/$10M)` and min +1 per contract, a cap of +20 per actor per game quarter from contracts |
| X9 | Provoke an exogenous crisis timing | draws use sealed per-day streams; no player input affects exogenous draws; suppression rule after player-caused crises removes double shocks |
| X10 | Repeated approaches to force NPC concessions | 3 approaches per actor per game week; refusals lower the actor's trust by 2 each beyond the first per game week |
| X11 | Spam petitions to block a lever | a lever with a petition or bill in progress blocks new ones only for its duration; 2 petitions per bloc per game quarter; costs are sinks |
| X12 | Predict elections with a bot and trade bonds | allowed: elections are public mechanics with noise; markets price expectations (05); this is skill, not an exploit |
| X13 | Overload the world phase by spamming events (e.g. thousands of tiny statements) | statements capped at 3 per game day per character; activity events per bloc capped at 12 per day; news quota |
| X14 | Starve a competitor with a dynasty's controlled lender | influence is bounded (+30 bps) and substitutes exist (other lenders, 07); 13 conduct rules |
| X15 | Corrupt a caucus leader through bribery (12) | +1 logit only, for one bill; a crime with 13 detection and penalties; the politician's integrity gates success |

---

## §10 Acceptance tests

1. Replaying a world from seed and the input log reproduces every shock, rumor, news item, vote and history entry bit-identically.
2. P3 completes within `PARAM.phase_budget_ms_P3` = 200 ms (19) on the reference core with 600 actors, 15 cities and 10,000 synthetic intents per tick; under overload, deferred reactive epochs all fire within 3 ticks.
3. For every city each day, `Yd = wageIncome + transfers + divIncome − taxes` and `C = λ_d·(mpc·Yd + 0.04/364·deposits)` match recomputation; `mpc` stays within [0.70, 0.95].
4. Σ consumption by category equals `C_c` to the micro-dollar (rounding remainder to HOUSING).
5. The ledger shows `HH_CONSUMPTION_PLAYER` and `FRM_B2B_PLAYER` as FAUCET and every other HH/FRM code as TRANSFER; `hh` and `frm` balances never go negative over a 4-chapter simulation.
6. Static analysis: no actor decision function reads a field from player private state, rank, NW, boards or Prestige (dependency allowlist).
7. Two worlds identical except one player's net worth ×100 (same public actions) produce identical NPC decisions.
8. An actor acts only when `U(best) − U(NO_OP) > 0.05`, at most 2 actions per epoch; reactive epochs at most one per 30 ticks.
9. Memory half-life for patience 0.5 is 90 game days (salience halves at day 90 ±1).
10. Trust after a breach drops by 25 and decays 1% per game week toward 0.
11. NPC funds never exceed 0.5 × ADV participation per tick in any asset.
12. Launch roster totals exactly 600 actors with the per-archetype counts in §3.3.1; a new city adds exactly 40.
13. A dynasty with `debtStress ≥ 0.9` for 2 game quarters becomes DISTRESSED and sells assets until below 0.6.
14. A head's exit triggers succession by the family's rule within the same tick and writes a SUCCESSION news item and a history entry.
15. Every dynasty ownership link reachable in the atlas is reachable by at least two paths, one of them PUBLIC_MOSAIC.
16. Government formation picks the minimum-spread coalition with ≥ 151 seats on a fixture of 4 parties.
17. A bill moves INTRODUCED → COMMITTEE (14 game days) → FLOOR → PASSED → ENACTED after the lever lag, and owners see the new value only at IN_FORCE.
18. With `F_for = $100M` and `F_against = 0` on one caucus, `L_k = 0.25·√100 = 2.5` clamps to 0.75; with equal opposing spend, `L_k = 0`.
19. A caucus with `2·ideoFit + constFit ≤ −2` has `p_yes < 0.25` at maximum lobbying (no noise draw).
20. Issue campaign Δsupport for $10M is `0.05·ln 2 ≈ 0.0347`; the per-quarter cap of 0.15 per bloc and axis holds.
21. A second $5M contribution by a linked account to the same party in the same cycle is refused.
22. Lobbying and contributions are visible on the public register by name at the next day close.
23. Election seats from a fixed vote share vector match Sainte-Laguë with a 5% threshold.
24. Elections occur every 1,456 game days per bloc, offset by 291 game days, and never inside a finish window.
25. A petition reaching $50M within 28 game days introduces a PETITION bill and charges backers; one that does not releases every escrow.
26. A legislated TAX_TOP_INCOME stays within [20, 50] and the effective top rate equals the legislated value exactly (no Stabilizer offset).
27. Every published news item has non-empty causes that resolve to committed events at or before its tick (N1).
28. No news item states a false fact except rumors labeled as such (N2), checked by slot validation against state.
29. Daily published count is 40 ± always-publish items, with ≥ 4 per bloc when candidates exist.
30. Changing an outlet's tone never changes 05's price response (05 reads events only).
31. A Terminal subscriber sees the headline exactly one tick before non-subscribers and never before the event commit tick.
32. "Why it moved" never names a player; flows are grouped by pool type.
33. 8 rumors per game day on average over 30 days (±25%); source accuracies lie in [0.40, 0.70]; aggregate sign accuracy in [0.50, 0.60] over 200 days.
34. False rumors resolve FIZZLED or DENIED at 70/30 ± 5% over 1,000 samples.
35. A rumor-trading bot earns ≤ 0 after costs over 200 simulated days.
36. Tips are accurate 85% ± 3% over 1,000 samples; REPORT within 3 game days grants immunity for that tip and Rep +2.
37. Circle whispers never carry NON_PUBLIC facts.
38. Over 200 simulated chapters, the share of chapters with at least one MAJOR crisis of any cause lies in [25%, 45%].
39. No two MAJOR onsets are closer than 504 game days; no MAJOR or STORM onset occurs in a chapter's final 48 real hours or first 24 real hours.
40. MAJORs have ≥ 8 game days of telegraph; 15% ± 5% of telegraphed events de-escalate.
41. After a player-caused major crisis, no exogenous MAJOR occurs for 336 game days.
42. Each consequence rule's effects fire at a tick within their lag range and record a `CausalLink`; chains stop at depth 4.
43. A C01 plant closure of 2,000 jobs in a city with labor force 200,000 reduces local employment by 1% within 7 game days and decays it over 365.
44. History records every event with σ_h ≥ 0.4; PERMANENT entries survive the one-year aggregation.
45. The chapter chronicle holds 25 world entries and 10 per bloc, with at most 3 per subject.
46. "Since you left" returns ≤ 7 items ranked by σ_h × relevance after a 1-day absence.
47. Tech progress follows `rnd/cost` with cost growth 1.25 per level; at most one breakthrough per domain per 14 real days.
48. Era changes happen at most once per 2 chapters and only at thresholds [0, 8, 18, 30, 45].
49. Player-token features stay locked until FINTECH ≥ 3, era ≥ 2 and the LiveOps flag.
50. `soc.world.fact.sell` for a material NON_PUBLIC fact is refused; total FACT_SALE_NPC per character per chapter never exceeds $1M real.
51. No intent or contract clause can carry a silence-for-payment term (schema test on `soc.world.actor.approach` and 15 clause validation).
52. A REPORT of a fact that leads to a 13 sanction grants Rep +3 and the 13 award.
53. Every authored secret has ≥ 2 paths with ≥ 1 PUBLIC_MOSAIC (40 of 40).
54. No `Fact` is generated from a player's private state (generator dependency test).
55. Briefs are ≤ 3 per real day, deterministic from the event log, and never contain a buy or sell direction.
56. Every institution has an acting leader at every tick, including the tick of an exit.
57. NPC fund count stays within [25, 40] and NPC bank count within [20, 35] over a 10-chapter simulation.
58. Lever values never leave their registry bounds and change by at most `maxChangePerBill` per bill.
