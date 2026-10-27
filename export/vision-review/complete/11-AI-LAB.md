# 11 — AI Lab

Owner module: 11. Status: complete specification, 2026-10-18.
Scope (00 §1): compute, data, algorithms, training, evaluation, deployment, model products, strategy graphs, crowding, AI operations, AI governance.
Hands off to: 12 (breach resolution, hidden-session accrual P, scans, clues, deception items), 13 (registration enforcement, audits, theft cases, sanctions), 06 (compute, data and energy commodity prices), 05 (order types and matching that agents use), 09 (data-center and AI-lab businesses, operations decisions), 10 (data-center sites, property-management products), 14 (Prestige and Reputation effects, lab flex), 15 (model and data market plumbing, contracts, tournament board), 16 (NPC labs as named actors, AI policy, AI-race index), 17 (layouts), 19 (worker pool, DU accounting), 20 (withheld worlds, balance bands).

**Tone rule.** Security models produce numbers (AP, DP_ai, scan tier). No text in this module, its tooltips or help describes a real technique (BRIEF safety rule; 12 header).

**Time conventions.** 1 tick = 2 game minutes; 1 game day (GD) = 720 ticks = 1 real hour (L9); game hour (GH) = 30 ticks. Lab processes are in game time (GD). Durations owned by 12 that the old vision stated in real hours (scan cadence, session lifetime) stay in real hours and are stored as ticks (1 real hour = 720 ticks). The old 05 research-node timers ("1 day" … "45 days") are converted at **1 old day = 8 GD** (one real working day of play), `DEFAULT (Mathis may override)`; this resolves old 05 open question 1 (time scale): every AI timer runs on the server's game clock, progresses while the player is offline, and solo uses the same game clock.

---

## §1 Purpose

1. **AI is a business, not a cheat code** (old 05 §0). Every capability is bought with money, compute, data, talent, time and risk. A player who never touches AI can still win through markets, businesses and property (V3 Part 5, old 05 §12).
2. **Capability is information, not a stat** (A03, V3 Part 5). A model's Model Capability Score (MCS) sets how precisely it estimates state that already exists in the world but is not yet public or is noisy in public. Returns come from acting on that information through the same market as everyone else, so alpha decays mechanically through crowding, impact and convergence (A06), never through an arbitrary countdown.
3. **Scaling laws are the master dial.** `MCS = A·k·C^α·D^β` with a visible run planner, failure odds and a "one more run" pull.
4. **A real research pipeline**: hypothesis, data with provenance, training, out-of-sample evaluation on withheld worlds, paper trading, staged capital, monitoring, retirement (A04, A05, A07, A10).
5. **AI everywhere it helps**: trading agents, analyst signals for manual players, security attack and defense models, operations models for businesses and properties (I05), licensing and data products.
6. **Expert ceiling, legible floor**: strategy graphs of blocks with DU budgets give quants a deep tool without arbitrary code on the server; templates and advisory mode give beginners a door.
7. **AI is both weapon and target**: models can be distilled, data siphoned, compute leeched; defense models find hidden sessions (L3); governance makes AI trading a regulated activity with incidents and reputation.

---

## §2 Entities

Types per 00 §3.1–3.2. Compute in the engine is integer **PFLOP-days × 1000** (`PFd1k`); displays use GPU-hours (`1 PFLOP-day = 10 GPUh`, RESOLVED C1). Data in DQU is float64 in model math, persisted ×1000. `Rate` per GY.

### §2.1 Lab

```ts
type AiTier = 0 | 1 | 2 | 3 | 4 | 5;                       // T0 Laptop … T5 Hegemon (00 §5.8)
type ArchNode = 'LINEAR' | 'CLASSIC_ML' | 'DEEP_NETS' | 'SEQUENCE' | 'TRANSFORMER' | 'MOE' | 'RL' | 'MULTIMODAL' | 'FRONTIER_STACK' | 'SECRET_SAUCE';

interface Lab {
  id: Id;                        // 'lab_' + ulid
  ownerId: Id;                   // chr (personal lab, exactly one per character, created at Lab unlock) or cmp (via a 09 AI-lab business)
  controllerChrId: Id;           // the character whose DU budget this lab draws on (§3.10.4)
  publicName: string;            // moderated display name, used by the registry and boards
  tier: AiTier;                  // §3.2
  peakNwTierEligible: AiTier;    // from the controller's peak NW at day close (never demoted)
  unlockedNodes: ArchNode[];
  secretSauce: { aBonus: number; signature: string } | null;   // unique per lab (§3.5)
  researchQueue: Id[];           // ResearchProject ids
  clusterIds: Id[]; cloudLeaseIds: Id[];
  datasetIds: Id[]; subscriptionIds: Id[]; partnershipIds: Id[];
  researcherIds: Id[];
  modelIds: Id[]; deploymentIds: Id[];
  safetyCoverage: number;        // 0..1, from safety-specialist researchers (§3.7.4)
  trustedLab: boolean;           // §3.16.4
  insightCredits: Partial<Record<ArchNode, number>>;    // from failed runs (§3.6.6)
  leechedComputeCredit: { amount: PFd1k; expiresTick: Tick }[];   // from 12 C07 loot, own runs only
  computePolicy: { autoBuySpot: boolean; maxSpotPerGD: Money; reservePriority: 'TRAINING' | 'INFERENCE' };
  createdTick: Tick;
}
```

### §2.2 Compute

```ts
type GpuModelId = 'GX10' | 'GX40' | 'DX100' | 'DX300' | 'DX900POD';

interface GpuModel {             // static catalog (§3.3.1)
  id: GpuModelId; price: Money; throughputPerGD: PFd1k; kwhPerPFd: number; minTier: AiTier;
  leadTimeNormalGD: number; depreciationGY: number; failRatePerGY: number;
}

interface ComputeCluster {
  id: Id;                        // 'cls_' + ulid
  ownerId: Id;                   // lab owner (chr/cmp); a 09 Data Center business wraps a cluster
  labId: Id | null;              // null when purely a 09 data-center business selling capacity
  site: { kind: 'HOME' | 'COLOCATION' | 'OWNED_SITE'; propId: Id | null; coloContractId: Id | null; cityId: Id };
  powerCapMW: number;            // site capacity (10 DATACENTER_SITE MW, colocation contract MW, HOME 0.02)
  pue: number;                   // 1.10..1.60 (§3.3.2)
  cards: { model: GpuModelId; count: number; bookValue: Money; installedTick: Tick }[];
  onOrder: { model: GpuModelId; count: number; deliveryTick: Tick; paid: Money }[];
  powerContract: { kind: 'SPOT' | 'FIXED'; pricePerMWh: Money | null; untilTick: Tick | null };
  throughputPerGD: PFd1k;        // Σ cards × throughput × availability
  availability: number;          // 1 − failed share
  allocation: ComputeAllocation; // §3.3.5
  externalSalesShare: number;    // share of capacity sold to the world pool (09 data-center business) or leased P2P
}

interface ComputeAllocation { defense: PFd1k; inference: PFd1k; leasesOut: PFd1k; training: Record<Id /*runId*/, PFd1k>; idle: PFd1k }

interface CloudLease {
  id: Id; labId: Id;
  kind: 'SPOT' | 'RESERVED';
  throughputPerGD: PFd1k;        // capacity rented
  pricePerPFd: Money;            // SPOT: floats each game hour with 06 spot; RESERVED: fixed at signing
  startTick: Tick; endTick: Tick | null;   // RESERVED: 30 GD commit (21,600 ticks); SPOT: open, billed per game hour
  preemptible: boolean;          // SPOT true
}

interface ComputeLeaseP2P { id: Id; lessorClusterId: Id; lesseeLabId: Id; throughputPerGD: PFd1k; pricePerPFd: Money; startTick: Tick; endTick: Tick; contractId: Id /* 15 */ }
```

### §2.3 Data

```ts
type Domain = 'EQUITIES' | 'CREDIT_RATES' | 'FX' | 'COMMODITIES' | 'CRYPTO' | 'MACRO' | 'SENTIMENT'
            | 'MICROSTRUCTURE' | 'OPERATIONS' | 'PROPERTY' | 'SEC_OFFENSE' | 'SEC_DEFENSE' | 'MEDIA';
type LegalTag = 'CLEAN' | 'GREY' | 'ILLICIT';           // ILLICIT matches 12's provenance tag

interface Dataset {
  id: Id;                        // 'dts_' + ulid (E-50; `dst_` is 10's district)
  ownerLabId: Id;
  name: string;
  domain: Domain;
  bloc: BlocId | 'GLOBAL';
  volumeMrec: number;            // million records
  quality: number;               // 0..1
  baseDqu: number;               // volumeMrec × quality (at acquisition)
  dataEndTick: Tick;             // freshness clock starts here (§3.4.2)
  halflifeGD: number;            // per domain (§3.4.2)
  appendPerGD: number;           // DQU appended per GD by a live feed, 0 for archives
  legalTag: LegalTag;
  source: 'BROKER' | 'SCRAPE' | 'PARTNERSHIP' | 'SYNTHETIC' | 'INTERNAL' | 'MARKET_COPY' | 'SIPHON' | 'LEAK' | 'WALKOUT';
  commonality: number;           // 0..1 share of this data that is widely sold (broker 1.0, partnership/internal 0, scrape 0.5) (§3.8.3)
  provenance: ProvenanceLink[];  // full chain, SEALED to others, PARTIES to owner
  canaryIds: Id[];               // 12 deception items seeded in it
  watermarkResidue: number;      // >0 only for copies of watermarked model outputs (query distillation)
  licensedCopyOf: Id | null;     // data-market copy
}

interface ProvenanceLink { tick: Tick; fromOwnerId: Id | null; method: Dataset['source'] | 'LICENSE' | 'MERGE'; eventId: Id }

interface DataSubscription {     // NPC broker live feed
  id: Id; labId: Id; brokerId: Id /* npc */; domain: Domain; bloc: BlocId | 'GLOBAL';
  tier: 'BASIC' | 'PRO' | 'ELITE'; pricePer28GD: Money; symbolsCovered: number; appendDquPerGD: number; quality: number;
  datasetId: Id; startTick: Tick; renewsTick: Tick; status: 'ACTIVE' | 'LAPSED';
}

interface DataPartnership {      // exclusive alt-data slot (§3.4.4)
  id: Id; slotId: Id; labId: Id; domain: Domain; bloc: BlocId;
  quality: number; appendDquPerGD: number; feePerChapter: Money; chapterIndex: number; datasetId: Id;
}
```

### §2.4 Research

```ts
interface ResearchNodeDef {      // static (§3.5)
  id: ArchNode; prereq: ArchNode[]; pocCost: Money; pocComputePFd: number; unlockGD: number; aValue: number;
  tierGate: AiTier; failBase: number; minRunGD: number; unlocks: string[];
}

interface ResearchProject {
  id: Id; labId: Id; node: ArchNode;
  startTick: Tick; endTick: Tick;            // unlockGD × researcher speed factor
  costPaid: Money; computeReserved: PFd1k;
  leadResearcherId: Id | null;
  status: 'ACTIVE' | 'DONE' | 'CANCELLED';
}
```

### §2.5 Researchers

```ts
type Specialty = 'ARCHITECTURE' | 'DATA' | 'TRADING' | 'SECURITY' | 'SAFETY' | 'OPERATIONS';

interface Researcher {
  id: Id;                        // 'res_' + ulid; NPC person (16 generator), never a player
  name: string; specialty: Specialty;
  skill: number;                 // 1..100
  star: boolean;                 // skill ≥ 90, named luminaries from 22
  salaryPerGY: Money;            // §3.7.2
  equityDemandPct: number;       // of the lab owner company if cmp-owned, else cash bonus equivalent
  loyalty: number;               // 0..100, 12 §3.9.1 staff-loyalty formula
  employerLabId: Id | null;
  assignedTo: Id[];              // run, research project, deployment or safety
  hiredTick: Tick;
  burnout: number;               // 0..100
  knowledgeOf: Id[];             // labs whose secret sauce this researcher has worked on (poaching leak, §3.7.5)
}
```

### §2.6 Training runs

```ts
type RunKind = 'PRETRAIN' | 'FINETUNE' | 'SELF_DISTILL' | 'STUDENT_DISTILL' | 'POC' | 'LAUNDER';
type HparamCare = 'QUICK' | 'CAREFUL' | 'ABLATION';

interface TrainingRun {
  id: Id;                        // 'run_' + ulid
  labId: Id; kind: RunKind;
  arch: ArchNode;                // must be unlocked (POC: the node being researched)
  baseModelId: Id | null;        // FINETUNE, SELF_DISTILL, LAUNDER
  focus: { mode: 'GENERAL' } | { mode: 'SPECIALIST'; domain: Domain };
  purpose: 'TRADING' | 'ANALYST' | 'SECURITY_OFFENSE' | 'SECURITY_DEFENSE' | 'OPERATIONS' | 'PROPERTY_OPS' | 'MEDIA' | 'GENERAL';
  computeBudget: PFd1k;          // C (§3.6.1)
  datasetIds: Id[];              // ≤ data slots for the tier
  dquSnapshot: { total: number; byDomain: Record<Domain, number>; syntheticShare: number; illicitShare: number; greyShare: number; commonality: number };
  hparam: HparamCare;
  checkpointing: boolean;
  researcherIds: Id[];           // ≤ team size for the tier
  pFailShown: number;            // planner value at start (legibility)
  mcsBandShown: [number, number, number];   // P10 / P50 / P90
  startTick: Tick; expectedEndTick: Tick;
  consumed: PFd1k;               // compute consumed so far
  status: 'QUEUED' | 'RUNNING' | 'PAUSED_NO_COMPUTE' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  outcomeRoll: number | null;    // SEALED (replay, court)
  failAtFraction: number | null; // SEALED
  resultModelId: Id | null;
  leechedShare: number;          // share of compute from 12 C07 loot (evidence, SEALED)
}
```

### §2.7 Models

```ts
interface Model {
  id: Id;                        // 'mdl_' + ulid
  labId: Id; codename: string;   // generated codename (e.g. 'Aster-2'), shown in Connections
  lineageRootId: Id;             // first ancestor (own pretrain, or the teacher for stolen students)
  parentIds: Id[];               // base model, teacher(s)
  version: number;
  arch: ArchNode;
  mcs: number;                   // raw capability at training end
  focus: TrainingRun['focus'];
  specMult: Record<Domain, number>;          // §3.6.3
  trainedTick: Tick; dataEndTick: Tick;      // freshness reference
  trainedRegime: Record<BlocId, RegimeId>;   // 04 regime at training (§3.8.4)
  cumulativeEffC: number; cumulativeEffD: number;   // for fine-tunes (§3.6.5)
  commonality: number;           // DQU-weighted commonality of its training data (§3.8.3)
  provenance: { cleanShare: number; greyShare: number; illicitShare: number };
  watermarkStrength: number;     // 0.3..1.0, default 0.8 (§3.14.5)
  residue: number;               // traceable residue carried (students), 0 for originals
  poison: number;                // 0..0.6 from honeypots (§3.14.6)
  isHoneypotDecoy: boolean;      // decoy model for a 12 honeypot item
  inferenceMult: number;         // 1.0; 0.4 after SELF_DISTILL compression
  unlockedProducts: string[];    // §3.9.1 gates satisfied at training
  status: 'READY' | 'DEPLOYED' | 'RETIRED' | 'SEIZED' | 'QUARANTINED';
  registrations: Id[];           // 13 registry entries per bloc
}
```

### §2.8 Evaluations

```ts
interface Evaluation {
  id: Id; modelId: Id; graphId: Id | null; labId: Id;
  kind: 'BACKTEST_HISTORICAL' | 'WITHHELD_WORLD' | 'PAPER' | 'ARENA';
  window: { fromTick: Tick; toTick: Tick } | { withheldSetId: Id; worlds: number; gdPerWorld: number };
  computeCost: PFd1k;
  metrics: EvalMetrics;
  overfitFlag: boolean;          // §3.12.2
  createdTick: Tick;
}

interface EvalMetrics {
  returnAnn: number; volAnn: number; sharpe: number; maxDrawdown: number; turnoverPerGD: number;
  hitRate: number; avgSlippageBps: number; capacityEstimate: Money; edgeHalfLifeTicks: number;
  inSampleSharpe?: number; withheldSharpe?: number; trackingErrorVsPaper?: number;
}
```

### §2.9 Deployments (products)

```ts
type ProductKind = 'TRADING_AGENT' | 'ANALYST' | 'SECURITY_OFFENSE' | 'SECURITY_DEFENSE' | 'BUSINESS_OPS' | 'PROPERTY_OPS' | 'MEDIA' | 'LICENSE_API' | 'NPC_LICENSING' | 'HONEYPOT_DECOY';
type Autonomy = 'ADVISORY' | 'SEMI_AUTO' | 'FULL_AUTO';

interface Deployment {
  id: Id;                        // 'dep_' + ulid
  labId: Id; product: ProductKind;
  modelIds: Id[];                // 1..3 (ensemble, §3.9.7)
  graphId: Id | null;            // TRADING_AGENT, ANALYST
  mandateId: Id | null;          // TRADING_AGENT, BUSINESS_OPS, PROPERTY_OPS
  autonomy: Autonomy;
  targetRefs: Id[];              // business ids, prop ids/groups, defended surfaces, licensed customers
  duAllocationPerEval: number;   // DU per evaluation granted from the controller's budget
  cadenceTicks: number;          // ≥ tier cadence (§3.10.4)
  stage: 'PAPER' | 'STAGE_10' | 'STAGE_25' | 'STAGE_50' | 'FULL' | 'PAUSED' | 'RETIRED';
  capitalAllocated: Money;       // trading agents
  liveFeedIds: Id[];             // subscriptions/partnerships feeding freshness (§3.8.4)
  inferencePFdPerGD: PFd1k;      // §3.9.8
  guardrails: { killSwitchDrawdown: number; maxOrderNotional: Money; approvalAbove: Money | null };
  health: ModelHealth;
  startedTick: Tick;
}

interface ModelHealth {          // computed each game hour, shown as the model-health meter
  effMcsByDomain: Record<Domain, number>;   // §3.8.4
  freshness: number; regimeFit: number; liveFeed: number;
  duUtilisation: number;         // effective DU / allocated (hostile drain shows here, 12)
  edgeHalfLifeTicks: number; realisedSharpe28: number; drawdown: number;
  alerts: ('STALE' | 'REGIME_CHANGE' | 'NO_FEED' | 'DRAWDOWN' | 'CAPACITY' | 'LOW_THROUGHPUT' | 'POISON_SUSPECT')[];
}
```

### §2.10 Strategy graphs

```ts
interface StrategyGraph {
  id: Id; labId: Id; name: string; version: number;
  universe: { assetIds: Id[]; maxSymbols: number };      // ≤ tier limit (§3.10.2)
  nodes: GraphNode[]; edges: { from: Id; to: Id; port: string }[];
  costPerEvalDU: number;         // computed at validation (§3.10.3)
  templateId: Id | null;         // built from a template (beginner path)
  locked: boolean;               // deployed versions are immutable; edits create a new version
}

interface GraphNode { id: Id; block: BlockKind; params: Record<string, number | string | boolean>; modelRef?: Id; domain?: Domain }
```

### §2.11 AI mandates

```ts
interface AiMandate {
  id: Id; ownerChrId: Id; deploymentId: Id;
  capitalMax: Money; leverageMax: number;                // ≤ license limits (13/06)
  assetClasses: string[]; assetAllow: Id[] | null; assetDeny: Id[];
  maxPositionPctOfCapital: number; maxPositionPctOfADV: number;
  drawdownStop: number;          // hard: agent flattens and pauses
  dailyLossStop: Money;
  retrainBudgetPerChapter: Money; computeBudgetPerGD: Money;
  legalRiskTolerance: 'CLEAN_ONLY' | 'ALLOW_GREY';       // ILLICIT never allowed by a mandate (13)
  blocsAllowed: BlocId[];
  reviewEveryGD: number;         // exceptions summary cadence
}
```

### §2.12 Licenses and data products

```ts
interface ModelLicense {
  id: Id; modelId: Id; licensorLabId: Id; licenseeId: Id /* chr | cmp | npc */;
  kind: 'PLAYER_API' | 'NPC_BUSINESS';
  domains: Domain[]; pricePerGD: Money;
  queryCapPerGD: number;         // API calls per GD
  noTrainClause: boolean;        // anti-distillation (12 §license tools)
  exclusivity: 'NONE' | 'BLOC' | 'FULL';
  startTick: Tick; endTick: Tick; contractId: Id;        // 15
  queriesUsed: number[];         // per GD (SEALED to licensor as aggregate)
}
```

### §2.13 Tournaments and arenas

```ts
interface Tournament { id: Id; weekIndex: number; division: 'D01' | 'D23' | 'D45'; withheldWorldId: Id; gdLength: number; entries: Id[]; status: 'OPEN' | 'RUNNING' | 'SCORED'; results: { entryId: Id; score: number; rank: number }[] }
interface TournamentEntry { id: Id; tournamentId: Id; labId: Id; deploymentSnapshot: { modelIds: Id[]; graphId: Id; mandate: AiMandate }; displayName: string | null }
interface Arena { id: Id; hostLabId: Id; invited: Id[]; seats: number; withheldWorldId: Id; gdLength: number; entryComputeFee: PFd1k; status: 'LOBBY' | 'RUNNING' | 'DONE'; results: { labId: Id; score: number }[] }
```

### §2.14 Governance

```ts
interface ModelRegistration { id: Id; modelId: Id; bloc: BlocId; regulatorId: Id; publicBand: AiTier; domainClass: Domain; autonomy: Autonomy; registeredTick: Tick; feePerGY: Money; status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' }
interface AiIncident { id: Id; labId: Id; deploymentId: Id; kind: 'ROGUE_EPISODE' | 'SAFETY_INCIDENT' | 'POISON_LOSS' | 'MANDATE_BLOCK'; tick: Tick; lossRealised: Money; reportable: boolean; reported: boolean }
interface AiRule { id: Id; bloc: BlocId; kind: 'REGISTRATION_THRESHOLD' | 'STRATEGY_BAN' | 'DATA_RULING' | 'AUDIT_SWEEP' | 'AUTONOMY_LIMIT'; params: Record<string, number | string>; fromTick: Tick; toTick: Tick | null; sourceEventId: Id /* 16 politics */ }
```

### §2.15 Stolen and derived students

```ts
interface StudentDerivation {
  studentModelId: Id; route: 'SESSION' | 'QUERY' | 'WALKOUT' | 'LICENSED_SELF';
  teacherModelId: Id; teacherMcsAtCopy: number;
  progressP: number;             // from 12 (SESSION) or query progress (QUERY)
  retentionRaw: number; retentionAfter: number;
  residueRaw: number; residueAfter: number; launderingLevel: number;
  poisonInherited: number;
  sessionId: Id | null; licenseId: Id | null;
  createdTick: Tick;             // whole record SEALED (13 discovery)
}
```

---

## §3 Rules and formulas

### §3.1 Phases and schedule

| What | Phase | When |
|---|---|---|
| Intent validation `lab.*` | P1 | every tick |
| Strategy-graph evaluation, analyst signals, DU accounting, scan DU charge | P5 ai | at each deployment's cadence, staggered by `hash(deploymentId) mod cadence` |
| Agent order intents | generated in P5, matched in P6 of the same tick | after human intents in P0 order; uniform-price auction gives no ordering advantage (05) |
| Hidden-session accrual, scan rolls | P10 (12) | 12's schedule |
| Lab operations: compute allocation, training progress, research progress, data appends and decay, deliveries of hardware, model health | P9 real | once per game hour per lab, offset `hash(labId) mod 30` |
| Accruals: energy, cloud, salaries, subscriptions, license fees, registration fees, depreciation | posted at day close t = 719, committed P13 | daily |
| Training-run outcome draws | P9 at the run's completion hour | stream `ai/<labId>/run/<runId>` |
| Tournaments and arenas | off-tick batch workers (19) | weekly / on demand |

Observation rule: every model and graph observes only state **committed at the end of tick t−1** (prices, public data, hidden-signal true values, own portfolio). No block can read anything produced by P0–P4 of the current tick, any future entropy commit, or any other player's private state (L11).

### §3.2 Lab tiers

The **Lab** unlocks when the character's net worth first reaches `PARAM.lab_unlock_nw = $100,000` at a day close (old 04 §4.2 "The Lab opens at $100k"). The lab starts at T0 with LINEAR unlocked free and `PARAM.lab_starter_grant_compute = 200 PFd` of cloud credit (a one-time FAUCET, about $240, so a first experiment costs nothing).

```
peakNwTierEligible = highest k with peakNW ≥ PARAM.ai_tier_nw[k]     // never demoted, like rank (14)
archTier           = LINEAR/CLASSIC_ML → 0, DEEP_NETS/SEQUENCE → 1, TRANSFORMER → 2, MOE or RL or MULTIMODAL → 3, FRONTIER_STACK → 4, SECRET_SAUCE → 5
lab.tier           = min(peakNwTierEligible, archTier)
```

`PARAM.ai_tier_nw`: T0 $100k, T1 $250k (R2), T2 $1M, T3 $20M, T4 $200M, T5 $2B (old 05 §8 bands with T1 aligned to R2 Owner, old 04 §3.1; `DEFAULT`). A company-owned lab uses its controlling character's peak NW.

| Gate | T0 | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|---|
| Base effective DU/tick (RN A1) | 5 | 15 | 100 | 400 | 1,500 | 2,000 |
| Cadence (ticks) | 6 | 6 | 3 | 2 | 1 | 1 |
| Base DU per evaluation | 30 | 90 | 300 | 800 | 1,500 | 2,000 |
| Hardware allowed | GX10 | + GX40 | + DX100 | + DX300 | + DX900POD | all |
| Concurrent runs | 1 | 1 | 2 | 3 | 4 | 6 |
| Data slots per run | 2 | 3 | 5 | 8 | 12 | 20 |
| Deployment slots | 1 | 2 | 4 | 6 | 10 | 16 |
| Universe per graph (symbols) | 10 | 25 | 60 | 120 | 250 | 400 |
| Researchers employed / per run | 2 / 1 | 4 / 2 | 10 / 4 | 25 / 6 | 60 / 10 | 150 / 16 |
| Live hostile sessions as attacker (12) | 1 | 1 | 2 | 3 | 4 | 5 |
| Run size band C3 (PFd) | 100–1,000 | 1,000–5,000 | 15,000–60,000 | 200,000–800,000 | 4M–12M | 35M–120M |
| Licensing allowed | no | no | yes | yes | yes | yes |

Runs below a tier's band are allowed (experiments). Runs above it raise failure risk (§3.6.6).

### §3.3 Compute

#### §3.3.1 Hardware catalog

The PFLOP-day is the engine unit of training compute. Game hardware throughput is set so that 01's base data center (1,000 DX100-equivalent, $40M of cards) supplies 0.84M PFd per GD and RESOLVED C1's owned energy cost of $0.15/PFd holds at $0.10/kWh.

| Model | Price | Throughput / GD | kWh per PFd | Draw per card | Min tier | Normal lead time | Depreciation | Failures |
|---|---|---|---|---|---|---|---|---|
| GX10 "consumer" | $2,000 | 33.6 PFd | 2.0 | 2.8 kW | T0 | 0 GD | 2 GY straight-line | 3%/GY |
| GX40 "prosumer" | $12,000 | 201.6 | 1.8 | 15.1 kW | T1 | 0 | 2 GY | 3%/GY |
| DX100 "datacenter" | $40,000 | 840 | 1.5 | 52.5 kW | T2 | 12 GD | 3 GY | 2%/GY |
| DX300 "flagship" | $150,000 | 3,024 | 1.2 | 151 kW | T3 | 24 GD | 3 GY | 2%/GY |
| DX900POD "frontier node" | $2,400,000 | 30,240 | 1.0 | 1.26 MW | T4 | 48 GD | 4 GY | 1.5%/GY |

A "card" is a game unit (a server node), so per-card draw is large; old 05's kW column is superseded by these numbers, which reconcile 01 and RESOLVED C1. Failures: each GD each card fails with `rate/364`; a failed card is out until repaired (`10%` of price, 3 GD) or written off. Vendors are NPC hardware companies (22) and player chip-fab businesses (09); purchase from NPC is `AI_HW_PURCHASE` (SINK), from a player business TRANSFER. NPC buyback of used cards: 60% of book value (`AI_HW_SALE`, FAUCET from the NPC sector, 03 class).

#### §3.3.2 Sites, power and energy

- **HOME** site: powerCap 0.02 MW, PUE 1.6, no hookup cost, T0–T1 only.
- **COLOCATION**: a contract with a 09 data-center business or NPC colocation provider: MW reserved, price per MW per GD (`PARAM.colo_price_per_mw_gd = $600`), PUE 1.25.
- **OWNED_SITE**: a 10 DATACENTER_SITE prop (MW from 10 §3.4.2), PUE chosen at build: 1.45 standard, 1.25 efficient (+20% shell cost), 1.12 cold-climate (only in Nordic and alpine cities: Vintra, Skarvik, Nordhaven, Belmara; old 05 "cheap hydro regions").
- `drawMW = Σ_cards throughputPerGD · kWhPerPFd · PUE / 24 / 1000`; cards beyond the site cap cannot be installed.
- `energyCostPerGD = Σ throughput · kWhPerPFd · PUE · price_per_kWh`, with price from the power contract: SPOT = 06 Energy MWh spot of the site's bloc; FIXED = locked price for `N` GD (`PARAM.power_contract_gd` options 28, 91, 364) at `forward + 3%`. Heatwave events (16) raise PUE by +0.10 for their duration on non-cold-climate sites. Posted as `AI_ENERGY` (SINK to NPC utility; TRANSFER to a player power utility or solar farm, 09 vertical integration gives at-cost energy).
- Example: 100 DX100 at PUE 1.3, $0.10/kWh = 84,000 PFd/GD and $16,380/GD energy ($0.195 per PFd).

#### §3.3.3 Cloud

- Price: 06 owns the compute spot index (old 01 §3.4.1: `spot $/GPUh = 0.12·(u/0.75)^3`, clamped [$0.05, $0.60]). Engine price per PFd = 10 × $/GPUh.
- **SPOT** lease: any throughput up to `PARAM.spot_max_share_of_npc_cloud = 0.02` of NPC cloud supply per lab; billed per game hour at the current spot; preemptible: when utilisation `u > 0.90`, each game hour each spot lease loses half its throughput with probability `min(0.5, 5·(u − 0.90))` until the next game hour.
- **RESERVED** lease: 30 GD commit (`21,600` ticks) at the reserved price (`PARAM.reserved_price_mult = 1.667` × spot reference $1.2 = $2.0/PFd, RESOLVED), never preempted, price fixed at signing.
- Cloud purchase from NPC clouds is `AI_CLOUD` (SINK); from a player data-center business (09) TRANSFER at its price.
- 11 reports `D_players` (Σ active-run and inference demand, PFd per GD) to 06 each game hour; 06 recomputes utilisation and spot.

#### §3.3.4 Chip shortages

16/06 world event "chip shortage" (old 05 §1.1): spot rises through 06's supply shock; new hardware lead times become `U(48, 240)` GD; DX300 and DX900POD orders require Reputation ≥ 50 or trustedLab (allocation gating); reserved leases keep their price. Players who own idle capacity can lease it (§3.3.6).

#### §3.3.5 Allocation scheduler (each game hour)

Available = owned clusters' throughput (after failures) + cloud leases + leeched credit (own runs only). Allocation order:
1. Security models' inference (defense first, then offense).
2. Deployed inference (trading, analyst, ops, licenses), by deployment priority set by the player.
3. Contracted P2P leases out and 09 external sales commitments.
4. Training runs and research PoC runs, by run priority.
5. Idle (may be sold to the world pool at spot − 5% if the cluster's owner set `externalSalesShare` or owns a 09 data-center business).
Shortfall in step 1–2: if `autoBuySpot`, buy spot up to `maxSpotPerGD`; else inference degrades: the deployment's effective DU is scaled by `served/required`. Shortfall in step 4: runs slow (duration extends); a run with zero allocation for 24 GH becomes PAUSED_NO_COMPUTE.

#### §3.3.6 P2P compute leasing

A cluster owner may lease throughput to another lab through a 15 contract (`lab.leaseCompute`): price per PFd, throughput, term. Leased throughput appears in the lessee's available pool in step 3 order of the lessor. Payments are TRANSFERs. A lessee can never re-lease (no chains).

#### §3.3.7 Compute and DU (RN A1, C3a)

```
computeOwnedPerGD = Σ owned cluster throughput + Σ RESERVED lease throughput      (spot, P2P-in and leeched compute do not count; 02 §4.1)
DU_cap(chr)       = min(2000, base_tier · (1 + 0.25 · min(1, computeOwnedPerGD / tierRunMidpoint)))
tierRunMidpoint   = midpoint of the tier's C3 band: T0 550, T1 3,000, T2 37,500, T3 500,000, T4 8,000,000, T5 77,500,000 PFd
```

`base_tier` is the controller's highest lab tier. `DU_cap` is per character across all labs it controls (§3.10.4).

### §3.4 Data

#### §3.4.1 DQU

`baseDqu = volumeMrec × quality`. Effective DQU of a dataset at tick t:

```
effDqu(t) = (baseDqu + appended) · 0.5^( ageGD / halflifeGD )            ageGD = (t − dataEndTick) / 720
```

Live feeds append `appendPerGD` each GD and move `dataEndTick` forward for the appended part (stored as a running DQU-weighted mean end tick). Halflives (`PARAM.halflife_gd_<domain>`): MICROSTRUCTURE 7, SENTIMENT 14, CRYPTO 21, MEDIA 28, EQUITIES 56, COMMODITIES 56, SEC_OFFENSE 56, SEC_DEFENSE 56, FX 91, CREDIT_RATES 91, OPERATIONS 91, MACRO 182, PROPERTY 182.

#### §3.4.2 Relevance

A run's effective data: `D_run = Σ_i effDqu_i · rel(purpose, domain_i) · focusW(domain_i) · qualityBoost`, then the synthetic collapse multiplier (§3.4.6). `rel` table (`PARAM.data_relevance`): TRADING uses EQUITIES, CREDIT_RATES, FX, COMMODITIES, CRYPTO, MACRO, SENTIMENT, MICROSTRUCTURE at 1.0, OPERATIONS and PROPERTY at 0.2, others 0; ANALYST same as TRADING; SECURITY_OFFENSE: SEC_OFFENSE 1.0, SEC_DEFENSE 0.5; SECURITY_DEFENSE: SEC_DEFENSE 1.0, SEC_OFFENSE 0.6; OPERATIONS: OPERATIONS 1.0, PROPERTY 0.5, MACRO 0.3, SENTIMENT 0.3; PROPERTY_OPS: PROPERTY 1.0, MACRO 0.5, OPERATIONS 0.3; MEDIA: MEDIA 1.0, SENTIMENT 0.7; GENERAL: every domain 0.8. `focusW` = 1 for GENERAL; for SPECIALIST(d): 1.0 for d, 0.2 otherwise. `qualityBoost = 1 + 0.1·S_data/100` (DATA researchers, §3.7.3).

#### §3.4.3 Sources

| Source | How acquired | Price | Quality | Legal tag | Commonality | Notes |
|---|---|---|---|---|---|---|
| Broker archive (NPC data brokers per domain and bloc) | one-off package | `$40 · (dqu/1,000)^(−0.10)` per DQU (bulk discount), floor $15 | 0.70–0.95 by package grade | CLEAN | 1.0 | non-resellable licence |
| Broker live feed | subscription per 28 GD | BASIC $5,000 (25 symbols, +2 DQU/GD, q 0.70); PRO $20,000 (100 sym, +10, q 0.85); ELITE $80,000 (400 sym, +40, q 0.95) | as tier | CLEAN | 1.0 | required for live-feed factor (§3.8.4) |
| Public scrape | a scrape job: compute `0.5 PFd` + `$2` per DQU | — | `U(0.30, 0.60)` | GREY | 0.5 | each job has a `PARAM.scrape_flag_prob = 0.03` chance of an S1 terms claim (13) from an NPC data owner |
| Exclusive partnership | per-chapter sealed-bid auction of slots (§3.4.4) | reserve $2M/chapter (T3+), $250k (T2) | 0.90–0.99 | CLEAN | 0.0 | +50–200 DQU/GD exclusive feed |
| Synthetic | a generation job from an own model | compute `0.3 PFd` per DQU | `min(0.85, 0.40 + 0.45·σ((MCS − 200)/150))` | CLEAN | 0.0 | collapse rule §3.4.6 |
| Internal (own 09 businesses' data credits) | automatic | free | 0.75 | CLEAN | 0.0 | 09 supplies `dataCreditsPerGD(bizId, domain)` (old 01 §4.3 data generation) |
| Data market copy (15) | buy a licence copy from a player | seller's price | inherits | inherits (ILLICIT stays ILLICIT) | inherits | §3.9.6 |
| Siphon (12 C04) | hidden session | op cost | `q_victim · P` | ILLICIT | inherits | 12 |
| Leak (12 E1) / walkout (12 E4) | espionage | op cost | inherits | ILLICIT | inherits | 12 |

Purchases from NPC brokers are `AI_DATA` (SINK); player-to-player sales TRANSFER (+15's 2% P2P tax).

#### §3.4.4 Exclusive partnerships (alt-data)

Each bloc has `PARAM.partnership_slots_per_domain_bloc = 3` slots per domain for EQUITIES ("footfall"), COMMODITIES ("shipping manifests"), MACRO ("card-spend nowcast"), MICROSTRUCTURE ("venue depth feed"), CRYPTO ("on-chain clustering"), SENTIMENT ("panel survey"), PROPERTY ("listing pipeline"), OPERATIONS ("supplier telemetry") (names in 22). Slots are auctioned at each chapter start, sealed bid, eligibility Reputation ≥ 40 (14) and lab tier ≥ T2, winner pays at bid; held for the chapter; re-auctioned next chapter with a 10% incumbent bid credit (mirrors old 01 concession rule). `AI_PARTNERSHIP` (SINK).

#### §3.4.5 Provenance and legal tags

Every dataset carries its provenance chain. A run's `illicitShare` and `greyShare` are DQU-weighted; the resulting model's `provenance` copies them; students and fine-tunes inherit DQU-weighted provenance from parents. Mandates may forbid GREY (`CLEAN_ONLY`). ILLICIT data use is never allowed by any mandate; the player can still train on it manually (it is crime, priced by 13).

#### §3.4.6 Synthetic data and model collapse (old 05 §9)

```
r              = syntheticDqu / totalDqu   (in the run, after relevance)
synQualityEff  = synQuality · (1 − r²)
collapseMult   = 1 − 3·max(0, r − 0.40)      floor 0.2
D_run          = (D_real + D_syn_using synQualityEff) · collapseMult
```

Past 40% synthetic share, adding synthetic data reduces `D_run` (marginal DQU negative), which keeps brokers, partnerships and theft economically relevant.

### §3.5 Research tree

| Node | Prereq | PoC $ | PoC compute (PFd) | Unlock (GD) | A | Tier gate | failBase | minRunGD | Unlocks |
|---|---|---|---|---|---|---|---|---|---|
| LINEAR | — | free at Lab unlock | — | 0 | 1.0 | T0 | 0.02 | 0.25 | technical blocks, advisory analyst |
| CLASSIC_ML | LINEAR | $25,000 | 200 | 16 | 1.4 | T0 | 0.04 | 0.5 | ModelSignal blocks, tabular data |
| DEEP_NETS | CLASSIC_ML | $120,000 | 2,000 | 32 | 2.0 | T1 | 0.06 | 1 | SENTIMENT line, semi-auto |
| SEQUENCE | DEEP_NETS | $400,000 | 10,000 | 56 | 3.0 | T2 | 0.07 | 1.5 | MICROSTRUCTURE line |
| TRANSFORMER | DEEP_NETS | $1,200,000 | 30,000 | 80 | 4.2 | T2 | 0.08 | 2 | analyst summaries, MEDIA, licensing, large models |
| MOE | TRANSFORMER | $4,000,000 | 300,000 | 112 | 5.5 | T3 | 0.12 | 3 | inference ×0.7 for that arch |
| RL | TRANSFORMER | $6,000,000 | 400,000 | 144 | 6.0 | T3 | 0.14 | 3 | adaptive execution blocks, FULL_AUTO |
| MULTIMODAL | TRANSFORMER | $9,000,000 | 500,000 | 168 | 7.0 | T3 | 0.14 | 4 | partnership alt-data counts ×1.25 |
| FRONTIER_STACK | MOE + RL | $30,000,000 | 5,000,000 | 240 | 9.0 | T4 | 0.22 | 6 | autonomous allocator, frontier products |
| SECRET_SAUCE | FRONTIER_STACK | $80,000,000 + Reputation ≥ 60 | 40,000,000 | 360 | 9.0 + bonus | T5 | 0.25 | 8 | lab-unique A bonus `U(1.5, 3.0)` (A ≤ 12), distillation target |

Old 05's "1–45 days" are converted at 8 GD per old day; LINEAR is free at unlock so the first session is not a wait (`DEFAULT`).
Research rules: one project per node; up to `1 + floor(tier/2)` concurrent projects; duration `unlockGD · (1 − 0.30·S_arch/100)` (ARCHITECTURE researchers, §3.7.3); the PoC compute must be allocated (as a run of kind POC); PoC $ is paid at start (`AI_RESEARCH`, SINK). A node completes when both time and PoC compute are done. Nodes are permanent for the lab (a company lab's nodes transfer with the company in M&A).

### §3.6 Scaling law and training runs

#### §3.6.1 Master formula

```
MCS = A_eff · k · C^α · D^β · balance · specFactor
A_eff   = aValue(run.arch) + ΔA_researchers + secretSauceBonus (if arch = SECRET_SAUCE)     (A_eff ≤ 12 + 1.5)
C       = computeBudget in PFd (run compute actually consumed)
D       = D_run (§3.4.2)
α = PARAM.scaling_alpha = 0.15,  β = PARAM.scaling_beta = 0.12,  k = PARAM.scaling_k = 2.31
D*      = PARAM.data_compute_ratio_gamma (0.02) · C                // compute-optimal data
ρ_D     = D / D*
balance = clamp( 1.15 − 0.55 · max(0, |ln ρ_D| − ln 1.25) / (ln 4 − ln 1.25), 0.60, 1.15 )
```

**Calibration (resolves old 05 open question 8).** Old α ≈ 0.34 and β ≈ 0.28 with the C3 run sizes (spanning 100 to 120M PFd, six orders of magnitude) would make a T5 model about 70,000× a T0 model; the tier AP bands (RN B2: T0 5–20 … T5 2,000–5,000) need about 300–500×. α = 0.15, β = 0.12 keep the old 0.34:0.28 ratio and land each tier's typical run in its band:

| Tier | Typical arch (A) | C (PFd) | D* (DQU) | MCS at balance 1.15 |
|---|---|---|---|---|
| T0 | LINEAR 1.0 | 300 | 6 | ≈ 7.8 |
| T1 | DEEP_NETS 2.0 | 3,000 | 60 | ≈ 29 |
| T2 | TRANSFORMER 4.2 | 37,500 | 750 | ≈ 120 |
| T3 | RL 6.0 | 500,000 | 10,000 | ≈ 344 |
| T4 | FRONTIER 9.0 | 8,000,000 | 160,000 | ≈ 1,094 |
| T5 | SECRET 12.0 | 77,500,000 | 1,550,000 | ≈ 2,690 |

Researcher A bonuses and ensembles carry the best labs to 4,000–5,000. These MCS ranges are the shared scale: AP and DP_ai use them directly (§3.9.3).

#### §3.6.2 Data cost at optimum

At $40/DQU (bulk-discounted) a T2 run's 750 DQU costs about $30k, close to its compute (~$45k at spot), and a T5 run's 1.55M DQU about $30M against $93M compute. Data and compute are both real spends; the balance term punishes skipping either.

#### §3.6.3 Specialist and general models (A02)

- **GENERAL** focus: `specMult_d = clamp(0.30 + 2.0·c_d, 0.30, 1.00)`, `c_d` = share of the run's relevant DQU in domain d. A broad model trained on four equally weighted domains gets 0.80 on each.
- **SPECIALIST(d)** focus: requires ≥ 70% of relevant DQU in d; `specMult_d = 1.40`, every other domain 0.40. Specialists are cheaper for the same in-domain capability (less data needed for D*... the run's D counts only d at full weight) and much weaker elsewhere.
- `specFactor` in §3.6.1 is 1.0 (the specialisation acts through `specMult` at use, §3.8.4).

#### §3.6.4 Duration

`durationGD = max(minRunGD(arch), C / allocatedThroughputPerGD)` with allocation re-evaluated hourly. The planner refuses runs whose expected duration exceeds `PARAM.max_run_gd = 60` at the current allocation. QUICK hparams: −20% duration, ABLATION: +30% duration and +25% compute.

#### §3.6.5 Run kinds

- **PRETRAIN**: new model (version 1) with `cumulativeEffC = C`, `cumulativeEffD = D`.
- **FINETUNE** of model m: `C_cum' = m.cumulativeEffC + 0.5·C_ft`, `D_cum' = 0.5·m.cumulativeEffD + D_ft`, `MCS' = formula(A_eff_now, C_cum', D_cum')`; `dataEndTick` = DQU-weighted mean end tick of the new composition; trainedRegime updates to the current regime if ≥ 20% of `D_ft` is newer than the regime change. failBase × 0.5. This is "retrain": restoring freshness costs typically 10–20% of a pretrain (A07).
- **SELF_DISTILL** (compression, legal): student `MCS = 0.90 · teacher.mcs`, `inferenceMult = 0.40`, compute `0.05 · teacher.cumulativeEffC`, min 1 GD, same lineage and watermark, no residue.
- **STUDENT_DISTILL**: builds a student from stolen progress or licence queries (§3.14).
- **LAUNDER**: reprocess a student with clean data to cut residue (§3.14.4).
- **POC**: research proof-of-concept (§3.5), no model output.

#### §3.6.6 Failure and outcomes

```
pFail = clamp( failBase(arch) · hparamF · dataRiskF · scaleF · talentF · burnoutF · insightF · (kind == FINETUNE ? 0.5 : 1), 0.01, 0.60 )
hparamF   = QUICK 1.6, CAREFUL 1.0, ABLATION 0.7
dataRiskF = 1 + 0.3·illicitShare + 0.1·greyShare
scaleF    = 1 + 0.5 · max(0, log2(C / tierRunMax))
talentF   = 1.4 − 0.8 · S_team / 100                     (S_team §3.7.3)
burnoutF  = 1 + 0.10 · [any assigned researcher burnout > 60]
insightF  = 0.8 once after a failure on the same arch, else 1
```

Outcome draws at completion (stream `ai/<labId>/run/<runId>`): `u1 < pFail` → **FAILED**: the failure point `f ~ U(0.60, 1.00)` of budget is consumed and lost (old 05 "lose 60–100%"); without checkpointing the run ends; the lab gains an insight credit (next run on that arch: insightF 0.8 and +3% MCS). With **checkpointing** (+15% compute): the run resumes from the last checkpoint, losing only `U(0.10, 0.30)·C` extra, and rolls once more at `pFail·0.5`. Else `u2 < PARAM.partial_prob (0.25)` → **PARTIAL**: MCS = formula × `U(0.50, 0.80)` for PRETRAIN, or the improvement over the base model × `U(0.50, 0.80)` for FINETUNE. Else **SUCCEEDED**: MCS = formula × `exp(N(0, 0.05))`.

The **run planner** shows, before commitment: compute cost (spot, reserved, owned split), data cost, duration at current allocation, pFail, and MCS P10/P50/P90 from this distribution (goal of legible risk, old 05 §0.4).

### §3.7 Talent

#### §3.7.1 Pool

Each bloc refreshes a researcher pool every 7 GD: `6 + 2·viewerTier + min(3, floor(PP/1000))` candidates visible to a lab (14 talent bonus), skills `clamp(round(LN(ln 45, 0.35)), 10, 89)`, specialties uniform, from 16's person generator. Stars (skill 90–99, 22 lists 40 named luminaries): one per bloc per chapter, listed for 1 GD; highest total offer (salary + bonus + equity value) wins; NPC labs bid too.

#### §3.7.2 Cost

`salaryPerGY = $30,000 · exp(0.05·skill)` (skill 50 ≈ $365k; skill 90 ≈ $2.7M), stars ×1.5; signing bonus 25% of salary; equity demand `max(0, (skill − 70)/30) · 2%` of a company owner (cash-equivalent for a character lab). Posted daily `AI_SALARY` (SINK).

#### §3.7.3 Effects

```
S_team   = min(100, max_i skill_i + 0.3·Σ_{others} skill_i) using specialties matching the run purpose (TRADING/ANALYST: TRADING and DATA; SECURITY_*: SECURITY; OPERATIONS/PROPERTY_OPS: OPERATIONS; all runs: ARCHITECTURE counts at 0.5)
ΔA_researchers = min(1.5, Σ_{ARCHITECTURE} (0.5·(skill/100)² + 0.5·[star]))          // lab-wide, applies to all runs
S_arch, S_data, S_sec = the same team formula restricted to that specialty, lab-wide
```

#### §3.7.4 Safety team

`safetyCoverage = min(1, Σ_{SAFETY} skill / (60 · max(1, N_frontierFullAuto)))` where `N_frontierFullAuto` counts FULL_AUTO deployments with MCS ≥ 600. Coverage reduces incidents (§3.15.2) and is required for the trusted-lab badge (§3.16.4).

#### §3.7.5 Loyalty, burnout, poaching

Loyalty uses 12 §3.9.1. Burnout: +3 per GD for each assignment beyond one; −2 per GD when single-assigned; above 60 the researcher's loyalty falls 1 per GD. Poaching is 12's E3 (legal): the poacher's offer vs loyalty; when a researcher who worked on a lab's SECRET_SAUCE (`knowledgeOf`) moves, the new lab gets a one-time `ΔA = +0.2` (lab-wide, cap applies) and the old lab loses that researcher's ΔA (old 05 §3.3 "minor one-time A transfer"); carrying files is 12's E4 walkout (crime). Researchers who quit (loyalty < 15 for 7 GD) leave to the pool.

### §3.8 From capability to information (A03)

#### §3.8.1 Hidden signals

Owning modules register **hidden signals**: quantities that exist in committed world state but are public only noisily, late or not at all. Each has a public estimate everyone sees and a true value that models estimate.

```ts
interface HiddenSignal { key: string; domain: Domain; assetId: Id | null; bloc: BlocId | null;
  trueValue: number;            // committed at end of t−1
  publicEstimate: number;       // what every player sees (consensus, last release, public data)
  sigmaPublic: number;          // error of the public estimate (owner-defined, ≥ 0)
  releaseTick: Tick | null }    // when the true value becomes public, if scheduled
```

Registered at launch (owners in brackets; interface assumed): EQUITIES `fairValueLog[asset]`, `nextEarningsSurprise[asset]` (determined at quarter close, released at the earnings tick) (05/09); CREDIT_RATES `defaultIntensity[issuer]`, `policyReaction[cbk]` (hidden hawkishness), `nextDecisionProb[cbk]` (04/07); FX `fairFx[pair]`, `interventionProb[cbk]` (04/06); COMMODITIES `trueInventory[commodity]` vs reported (06); CRYPTO `reserveHealth[stablecoin]`, `netFlows[token]` (06); MACRO `outputGapNow[bloc]`, `inflationNow[bloc]` before release, `regimeProb[bloc]` (04); SENTIMENT `storyCredibility[wireItem]` (16/12, true/false status of a story, including 12's false stories), `sentimentTrue[asset]`; MICROSTRUCTURE `npcMakerInventory[asset]` (05, committed t−1); OPERATIONS `demandPool[city, sector]` next-GD (09); PROPERTY `pressureNext91[district, use]` (10). No signal ever contains another player's holdings, orders, P&L or strategy (L11).

#### §3.8.2 Estimate precision

```
ρ(m)        = 1 / (1 + (m / PARAM.info_m50 (150))^PARAM.info_eta (0.8))
σ_model     = sigmaPublic · ρ(effMcs_domain)                      // no model in the domain → σ_model = sigmaPublic
estimate    = trueValue + σ_model · z
z           = sqrt(c_m) · z_common(key, tick) + sqrt(1 − c_m) · z_lineage(lineageRootId, key, tick)
c_m         = model.commonality (DQU-weighted, §2.3)
```

Reference: `ρ(20) = 0.83`, `ρ(150) = 0.50`, `ρ(600) = 0.25`, `ρ(3,000) = 0.08`. All `z` are standard normals from 02 streams `ai/common/<key>/<tick>` and `ai/lineage/<root>/<key>/<tick>`, so: models trained mostly on widely sold broker data make the **same errors** and trade the same way (crowding); exclusive and internal data give idiosyncratic errors; a stolen student shares its teacher's lineage noise.

#### §3.8.3 Why edge decays (A06, mechanism only)

1. **Convergence**: as `releaseTick` approaches or as other informed traders act, prices move toward the true value, so the remaining gap shrinks.
2. **Crowding**: many agents with similar estimates trade the same direction in the same batch auction; the uniform clearing price moves and impact (05 square-root law) eats the edge.
3. **Capacity**: bigger positions cost more impact per unit.
4. **Staleness and regime change** (§3.8.4).
No universal timer applies.

#### §3.8.4 Effective MCS at use

```
effMcs_d = mcs · specMult_d · freshness_d · regimeFit · liveFeed_d · (1 − poison)·[trading/analyst use] · licenseMult · ensembleMult
freshness_d = max(0.30, 0.5^( (now − dataEndTick)/720 / halflife_d ))
regimeFit   = 0.70 if 04's current regime in any bloc the deployment trades differs from model.trainedRegime for that bloc, else 1.0
liveFeed_d  = 1.0 if a live feed (subscription, partnership or internal) in domain d is attached; else max(0.20, 0.5^(GD since last attached / 7))
licenseMult = 0.90 for a licensee using a licensed model; 1.0 otherwise
```

This replaces old 05 §7.1's `edge(t) = edge0·0.5^(days/halflife)` with the same shape applied to information quality, and the model-health meter shows each factor.

### §3.9 Products

#### §3.9.1 Trading agents

A TRADING_AGENT is a deployment of 1–3 models + a strategy graph + an AiMandate + capital. It trades the controller's (or company's) account through the same `mkt.*` intents as a human (00 §5.5, fairness rule). Its intents count toward the character's per-tick intent limit; if 05 provides a basket intent (assumed: `mkt.basket` with up to 50 legs counting as one intent), execution blocks use it, otherwise excess orders queue to the next tick.

Product gates (blocks available only when a bound model meets them at deployment and while effMcs stays ≥ 80% of the gate):

| Block / template | Gate |
|---|---|
| Trend and mean-reversion templates | any model, MCS ≥ 20 |
| QuoteTwoSided (market making) | MICROSTRUCTURE effMcs ≥ 50 |
| PairSpread (statistical arbitrage) | EQUITIES effMcs ≥ 60 |
| SentimentSignal | SENTIMENT effMcs ≥ 80 and DEEP_NETS |
| CrossVenueSpread (crypto venues, 06) | CRYPTO effMcs ≥ 90 |
| EarningsEvent | EQUITIES effMcs ≥ 100 and an EQUITIES partnership feed |
| ShortHorizonFlow (microstructure) | MICROSTRUCTURE effMcs ≥ 120, SEQUENCE, and an exchange gateway subscription (05 market-data fee) |
| MacroAllocator | MACRO effMcs ≥ 150 and TRANSFORMER |
| AdaptiveExecution | RL |
| AutonomousAllocator (multi-asset, multi-signal) | GENERAL effMcs ≥ 600 and FRONTIER_STACK |

Autonomy: ADVISORY (orders proposed to the owner, expire after 30 ticks), SEMI_AUTO (auto below `approvalAbove`, larger ones proposed), FULL_AUTO (requires DEEP_NETS for semi, RL for full; rogue risk §3.15.1).

#### §3.9.2 Analyst AI (the bridge for manual players)

An ANALYST deployment shows, for the player's watchlist, the model's estimates of hidden signals with 90% bands (`estimate ± 1.645·σ_model`) next to the public estimate, conviction scores, risk flags (regime probability shifts, credibility of Wire stories), and, with TRANSFORMER, short natural-language summaries generated from these numbers only (B09 rule: text describes authorised facts, never invents). It costs DU at the tier cadence for the symbols shown (2 DU per symbol per refresh) and inference compute. It never places orders.

#### §3.9.3 Security models (handed to 12)

```
AP       = round( effMcs_SEC_OFFENSE · q_off ),   q_off = clamp(0.8 + 0.3·corpusQuality + 0.2·S_sec/100, 0.8, 1.3)
DP_ai    = round( effMcs_SEC_DEFENSE · q_def · 0.8 ),   q_def = clamp(0.8 + 0.3·telemetryQuality + 0.2·S_sec/100, 0.8, 1.3)
AP_media = round( effMcs_MEDIA · q_off )                                    // 12 C12 false story, M4 rebuttal reach
scanTier = min(lab.tier, tierBand(effMcs_SEC_DEFENSE))     tierBand: <20 T0, 20–60 T1, 60–200 T2, 200–600 T3, 600–2,000 T4, ≥ 2,000 T5
```

`corpusQuality` and `telemetryQuality` are the DQU-weighted quality of SEC_OFFENSE and SEC_DEFENSE data in the model. Because MCS tier bands equal RN B2's AP bands at q ≈ 1, AP and DP_ai fall in the agreed ranges (T0 5–20 … T5 2,000–5,000; DP_ai = 0.8× at equal tier). 11 publishes `{ap, aiTier}` to 12's AttackCapability and `{dpAi, scanTier}` to 12's DefenseProfile each game hour. Each scheduled auto-scan charges `0.5 · baseDUperEval(tier)` DU on its tick. Security deployments need no strategy graph. Exploit-corpus data comes from the Back Room (14) as GREY or ILLICIT data and from the player's own ops results (12 intelligence items converted to SEC_OFFENSE DQU at 5 DQU per item); telemetry comes from the player's own businesses and models (INTERNAL, 1 DQU per surface unit per GD) and security vendors (09).

#### §3.9.4 Operations models (I05)

- **BUSINESS_OPS**: targets up to `5·(tier + 1)` of the owner's businesses (09). 11 supplies per business each game hour `{ forecastSigmaMult = ρ(effMcs_OPERATIONS), autoDecisions: boolean, bounds }`. 09 uses `forecastSigmaMult` to scale its demand-forecast error in pricing, inventory and capacity decisions, and when `autoDecisions` is on, 09 lets the model set price (within ±30% of reference), capacity utilisation and marketing spend within the mandate's budget. Effects are always through 09's supported decisions (I05) and shown as "decision made by Ops model, expected effect +x%" with 09's explanation.
- **PROPERTY_OPS**: serves as a property manager for 10 (10 §3.13): `skill = 1 + 4·σ((effMcs_PROPERTY − 60)/40)`; fee = its inference cost. It also gives the owner a 91-GD pressure forecast band per followed district (estimate of 10's `pressureNext91` hidden signal).

#### §3.9.5 Licensing (A11, Bible decision 6)

- **Weights never change hands** except with the whole lab in a company acquisition (09 M&A) or through theft (12). There is no outright model sale (old 05 §4.5 superseded by Bible decision 6).
- **PLAYER_API licence** (15 model market): licensor sets price per GD, `queryCapPerGD`, domains, term, exclusivity, and may add the `noTrainClause`. The licensee can bind the licensed model in a graph block `LicensedSignal` (effMcs × 0.90) and in an analyst deployment; each symbol per evaluation is one query; queries over the cap are refused. Licence payments are TRANSFER (+15's fees). Every active licence adds a LICENSEE connection to the model (cover for hidden sessions, 12) and a surface unit (12). Honeypot decoys cannot be licensed (12 §3.6).
- **NPC_BUSINESS licensing**: per (domain, bloc) an NPC licensing pool `V = PARAM.npc_license_pool_per_gd ($150,000) · aiRaceIndex · N_a/10,000` per GD is split among offered models (player and NPC labs) by logit `u = 2.0·ln(effMcs) − 1.5·ln(price/refPrice) + 0.2·trustedLab`, `refPrice = $500 per GD per licence-unit`. Revenue `AI_LICENSE_NPC` (FAUCET, NPC sector; 03 class). Domains offered: OPERATIONS, PROPERTY, SENTIMENT, MACRO, EQUITIES (analyst-grade), SEC_DEFENSE (as a managed defense service; no AP for NPCs).

#### §3.9.6 Data products

A lab may list dataset copies on 15's data market: buyer receives a `MARKET_COPY` dataset, seller keeps the original (old 02 §8.1). Listing is refused for BROKER and PARTNERSHIP data (licence terms) and allowed for INTERNAL, SYNTHETIC, SCRAPE (stays GREY) and own-derived data. Listing ILLICIT data is possible (crime), trips canaries (12) and carries 13 liability.

#### §3.9.7 Ensembles

A deployment may bind up to 3 models: `effMcs_ens_d = max_i effMcs_{i,d} + 0.25·Σ_{others} effMcs_{j,d}·(1 − overlap_ij)`, `overlap_ij` = DQU-weighted Jaccard overlap of their training datasets; inference cost = sum of members.

#### §3.9.8 Inference cost

```
TRADING / ANALYST : 0.8 · mcs · inferenceMult · sqrt(1 + DU_eff_per_tick)      PFd per GD
SECURITY_*        : 0.6 · mcs · inferenceMult
BUSINESS_OPS      : 0.5 · mcs · inferenceMult · targets
PROPERTY_OPS      : 0.3 · mcs · inferenceMult · max(1, props/10)
LICENSE_API       : 0.0004 · mcs · inferenceMult per query
MOE arch          : × 0.7
```

Example: MCS 120 trading agent at 100 DU/tick ≈ 965 PFd/GD ≈ $1,160/GD at spot, ≈ $190/GD on owned DX100s.

### §3.10 Strategy graphs

#### §3.10.1 Blocks

DU costs are per symbol per evaluation unless marked "per graph" or "per order".

| Family | Block | DU | Notes |
|---|---|---|---|
| Data | PriceVolume | 0.5 | OHLCV, returns, volume from committed public data |
| | Technical(kind: momentum, zscore, vol, breakout, carry) | 1.0 | window ≤ 720 ticks |
| | ModelSignal(domain, signalKey) | 2.0 | estimate and σ from a bound model (§3.8.2) |
| | LicensedSignal | 2.0 | + 1 query |
| | EventSignal (earnings, CB meeting, release calendar) | 2.0 | public calendar plus model estimate |
| | OrderBookPublic | 1.5 | public batch-auction depth and imbalance of t−1 (05) |
| | MacroNowcast(bloc) | 2.0 per graph | MACRO signals |
| | SentimentSignal | 2.0 | gated |
| | CrowdingGauge | 0.5 | own signal half-life and capacity (§3.11) |
| Transform | Combine/Weight, Rank, ZScore, Smooth | 0.25 each | |
| | Threshold/Filter, Lag | 0.1 | |
| | RegimeGate | 0.5 per graph | uses 04 public regime or a MACRO model estimate |
| | StateMemory | 0.1 | rolling state ≤ 720 ticks, the only recurrence |
| Portfolio | TargetWeight | 0.5 | |
| | RiskParity | 1.0 | |
| | MeanVariance | 2.0 | |
| | PairSpread | 1.5 per pair | gated |
| | HedgeOverlay | 0.5 | index or FX hedge |
| Risk | PositionLimit, ExposureCap | 0.1 | |
| | VolTarget | 0.25 | |
| | DrawdownStop, KillSwitch | 0 per graph | hard; also enforced by the mandate |
| Execution | MarketOrder, LimitOrder, StopOrder | 0.25 per order | 05 order types |
| | TWAP, VWAP, POV, Iceberg | 0.5 per order | 05 algos (T04, T05) |
| | QuoteTwoSided | 1.0 | gated; market making |
| | AdaptiveExecution | 1.0 per order | RL gated |
| | ShortHorizonFlow, CrossVenueSpread, EarningsEvent, MacroAllocator, AutonomousAllocator | 3.0 / 2.0 / 2.0 / 3.0 per graph / 6.0 per graph | gated |
| Control | Schedule (slower cadence only) | 0 | |

#### §3.10.2 Validation (at deploy and on every graph version)

DAG with no cycles; every input port connected; every gated block satisfied; universe ≤ tier limit; `costPerEvalDU = Σ blocks (cost × applicable symbols or orders at max)` ≤ the deployment's `duAllocationPerEval`; mandate-consistent (assets, leverage, blocs); not banned by an active `AiRule` in any bloc it trades; RiskBlocks DrawdownStop and PositionLimit present (mandatory for SEMI_AUTO and FULL_AUTO). Deployed graph versions are immutable.

#### §3.10.3 Evaluation semantics

Evaluated topologically in P5 at the deployment's cadence. Inputs: committed state at end of t−1 plus the account's own positions and cash. Outputs: target positions → execution blocks → intents, after mandate checks (position, leverage, loss stops). Deterministic: block math in float64 with fixed evaluation order; ties broken by asset id. If the effective DU available this evaluation is less than `costPerEvalDU` (hostile drain, scale-down, compute shortage), symbols are dropped from the end of the player's universe priority list until it fits; the health meter shows "running at x% of budget".

#### §3.10.4 Budgets

```
Per character: Σ_deployments (duAllocationPerEval / cadenceTicks) + analyst DU/tick + scan DU (amortised) ≤ DU_cap(chr)     (≤ 2,000, RN A1)
Effective DU of a deployment = duAllocationPerEval · (1 − Σ hostile drains on its models, ≤ 0.20, 12) · s_partition · computeServedShare
Per partition: if Σ requested DU/tick > PARAM.du_partition_cap (3,000,000), s_partition = cap / Σ for everyone this tick; emit ai.computeCrunch; 06 raises D_npc by 10% for the GD (old 01 §3.4.1)
```

Cadence may be slower than the tier cadence (Schedule block), never faster. Cadences are staggered by deployment id (02 §4.1 rule).

#### §3.10.5 Templates (beginner path, D03)

Twelve templates that build valid graphs from 3–5 choices: Trend Follower, Mean Reverter, Pairs (gated), Market Maker (gated), Sentiment Rider (gated), Earnings Drift (gated), Macro Carry, Crypto Basis, Volatility-Target Overlay, Defensive Rebalancer, Hedger (hedges the owner's business commodity exposure, 09), Execution Assistant (works a manual order with TWAP/VWAP).

### §3.11 Crowding, capacity and the agent's own diagnostics

Only from the agent's own history and public data:

```
edgeHalfLifeTicks = h such that, over the last 28 GD of the agent's signals, the mean share of the predicted move realised by public prices reaches 50% at horizon h
capacityEstimate  = ADV · ( grossEdgeBps / (2 · Y · σ_daily_bps) )²          // Y and σ from 05's impact model calibration for the asset
crowding indicator = falls as edgeHalfLife shortens relative to its 28-GD-ago value
```

Shown on the health meter as "your edge now converges in about h ticks (was h₀)" and "estimated capacity $X". Nothing about other players' agents is shown or inferable beyond what prices already reveal (L11).

### §3.12 Evaluation pipeline (A05, A07, A10)

1. **Historical backtest** on the live world's past (≤ 364 GD window): uses archived committed state and the same deterministic noise streams; fills use 05's impact model with the agent's own size; costs include fees and spreads. Windows overlapping the model's training data are reported **in-sample** and flagged.
2. **Withheld worlds**: 20 supplies a weekly rotating set of `PARAM.withheld_worlds_per_set = 50` worlds generated by the same engine from secret seeds (never the live world's future entropy), each 10 GD. A lab may evaluate on 1–20 of them per request; results are private to the lab.
3. **Overfit flag**: `withheldSharpe < 0.5·inSampleSharpe` while `inSampleSharpe > 1`.
4. **Paper trading**: live shadow mode, fills simulated at the actual clearing price plus own modelled impact, no market effect; minimum `PARAM.paper_min_gd = 2` before STAGE_10 (skippable only in ADVISORY).
5. **Staged deployment**: STAGE_10 → 25 → 50 → FULL of `capitalAllocated`; advance when ≥ 2 GD in stage, tracking error vs paper < 30%, drawdown < 50% of the mandate stop; automatic demotion one stage on breach.
6. **Monitoring and retirement**: health alerts (§2.9) create exceptions; options offered on each alert: keep, fine-tune, reduce capital, change universe, change execution, switch dataset, retire (A07). Retired models are kept and can be fine-tuned or licensed later (A10).
Compute cost of evaluations: backtest `0.002·mcs·symbols·windowGD` PFd; withheld `0.002·mcs·symbols·10` per world; paper trading costs its normal inference.

### §3.13 Tournament and arenas (L13)

- **Weekly AI tournament**: each real week (15 calendar), three divisions by lab tier (D01: T0–T1, D23: T2–T3, D45: T4–T5). Entry free, one per lab per week, a snapshot of one trading deployment (models, graph, mandate). All entrants of a division trade **in one shared seeded market** (a fresh withheld world with NPC liquidity) for 10 GD in a headless batch run (19), so impact and crowding between entrants matter. Virtual capital $1M / $50M / $1B per division. DU budgets as live. Score `= Sharpe_ann − 2·max(0, maxDD − 0.10)`, ties by lower turnover. Rewards: titles and cosmetics, Prestige 50/30/20 to the top 3 per division (14), "Top Labs" board points (15). No cash, no faucet. Results publish rank, lab public name (or "Anonymous lab" if opted out) and score; never graphs, positions or trades (L11).
- **Arenas**: private matches of 2–16 invited labs on a withheld world for 2–10 GD; host pays an entry compute fee per seat `0.001·mcs·symbols·GD` PFd; results visible to participants.

### §3.14 Distillation and theft (attacker side; 12 owns breach, P, scans, evidence)

#### §3.14.1 Session distillation (12 C05)

When a MODEL session ends (12 §3.7), the attacker may run a STUDENT_DISTILL within `PARAM.student_window_gd = 7` GD (after that the captured progress expires):

```
retentionRaw = clamp( 0.60 + 0.15·min(1, A_attacker / A_teacher) + 0.10·S_arch/100 + 0.05·[DP_eff/AP < 1 at plant], 0.60, 0.90 )
studentMcs   = min( teacherMcsAtEnd · min(P, retentionAfter), archCeiling(attacker) )
archCeiling  = 1.25 × upper MCS of the attacker lab's tier band (T0 25, T1 75, T2 250, T3 750, T4 2,500, T5 6,250)
compute      = 0.10 · teacher.cumulativeEffC · (A_teacher / A_attacker)           // cost scales with target size (old 05 §5.3)
residueRaw   = model.watermarkStrength_teacher · (0.4 + 0.6·P/0.85)              // 12 confirmed
```

The student inherits the teacher's `specMult`, `dataEndTick` (staleness), `trainedRegime`, lineage root (shares lineage noise), product unlocks only if the attacker's lab has the nodes, and `poison` if the teacher was a honeypot decoy. Provenance: 100% ILLICIT.

#### §3.14.2 Query distillation (12 C06, the underdog route)

Requires an active PLAYER_API licence. Each query the licensee spends on a `DistillQuery` job (instead of a LicensedSignal) adds to `Q`:

```
P_query   = 0.85 · (1 − exp(−Q / Q50)),   Q50 = 2,000 · (teacherMcs / 100)^0.5
studentMcs, residue, laundering: as §3.14.1 with P = P_query; compute 0.10 · teacher C_equiv as above
```

Queries count against the licence cap; the `noTrainClause` makes any DistillQuery a breach verified by the engine (12 evidence). Detection is 12's query-anomaly tool.

#### §3.14.3 Walkout (12 E4)

A walked-out copy gives `studentMcs = teacherMcs · min(0.85, retentionRaw)` and `residueRaw = watermarkStrength` (full residue), ILLICIT.

#### §3.14.4 Laundering (RN B1)

A LAUNDER run on a student with level `L ∈ [0, 1]` costs `(0.25 + 0.35·L) ×` the student run's compute plus clean data `0.5·L × D*` of that compute:

```
residueAfter   = max(0.03, residueRaw · (1 − 0.7·L))
retentionAfter = retentionRaw · (1 − 0.35·L)
studentMcs     = recomputed with retentionAfter
```

Example (RN): teacher 300, P 0.85, retention 0.85, L = 1 → retention 0.5525 → student ≈ 166.

#### §3.14.5 Watermarks

Every model has `watermarkStrength` default 0.8; the owner may raise it to 1.0 (+5% inference cost) or lower it to 0.3 (−3% inference cost). Residue in a student is what 12/13 forensic audits detect (`p_find = 1 − e^(−3·residue)`, 12/13).

#### §3.14.6 Honeypot decoys and poison (RN B3)

A defender creates a decoy model (no training needed: `isHoneypotDecoy = true`, shown to C01 survey with an apparent MCS the defender chooses up to 1.5× their best model) and attaches a 12 DeceptionItem (basic 0.20, advanced 0.40, frontier 0.60 poison). A student built from a decoy inherits `poison`; while poisoned its trading and analyst `effMcs` is multiplied by `(1 − poison)`, and on each 04 regime change it takes a loss of `poison × 2%` of its deployed capital (posted as forced liquidation of that share at market, capped at 10% of capital per GD, 12/old 03 §6.6). Each FINETUNE on clean data halves poison. Decoys cost their 12 upkeep and no inference.

#### §3.14.7 Compute leech loot (12 C07)

Leeched PFd arrive as `leechedComputeCredit` usable only by the attacker's own runs, non-resellable, never counted for DU, expiring after 1 GD (RN C3b, 12 cap).

### §3.15 AI risks

#### §3.15.1 Rogue episodes

FULL_AUTO trading agents: per GD `p_rogue = PARAM.rogue_base (0.002) · (regimeFit < 1 ? 3 : 1) · (1 − 0.7·guardrailScore) · (1 − 0.5·safetyCoverage)`; SEMI_AUTO × 0.2; ADVISORY 0. `guardrailScore` = share of {KillSwitch, DrawdownStop, PositionLimit, ExposureCap, VolTarget} present. An episode lasts `U(30, 120)` ticks: the agent's signal sign inverts and sizing goes to the mandate maximum. Mandate hard limits always hold, so the loss is bounded by the mandate; the loss itself emerges from the market. The owner is notified at once (PRIVATE), may kill the agent; the incident is recorded.

#### §3.15.2 Safety incidents

Deployments with MCS ≥ 600 in FULL_AUTO: per GD `p_incident = PARAM.safety_incident_base (0.0004) · (1 − 0.6·safetyCoverage) · sqrt(mcs/600)`. Effect: the deployment halts for 1 GD, liquidates 50% of its positions at market over 10 ticks, pays a cleanup cost of 0.5% of its capital (`AI_INCIDENT_COST`, SINK), files a mandatory incident report (13; reportable), Wire event "AI incident at <lab public name>" (PUBLIC: a filing rule, L11-compliant), Reputation −5 (14), trusted-lab badge lost for 2 chapters. Unreported incidents found by audit: 13 S2.

#### §3.15.3 Regulatory rules (crackdowns)

16's politics produces `AiRule`s per bloc (old 05 §7.3): raise or lower the registration threshold; ban a strategy class (e.g. ShortHorizonFlow or QuoteTwoSided) on that bloc's assets for 28–91 GD; data rulings (a domain's SCRAPE data in that bloc becomes ILLICIT for new runs); audit sweeps (audit probability ×5 for one game quarter); autonomy limits (FULL_AUTO forbidden above an MCS). Rules take effect at their `fromTick`; deployments violating them are blocked at P1/P5 with an exception explaining the rule and its source event.

#### §3.15.4 Model collapse

§3.4.6.

### §3.16 Governance

#### §3.16.1 Registration

A model must be registered with the regulator of every bloc whose assets it trades before deployment when `mcs ≥ PARAM.registration_mcs (200)` or `capitalAllocated ≥ PARAM.registration_aum ($50,000,000)` (thresholds modifiable by AiRules). Fee $25,000 + 0.01% of capital per GY (`AI_REGISTRATION`, SINK). The registry (13) publishes: lab public name, model codename, MCS tier band, domain class, autonomy level, registration date, incidents. It never publishes strategy, positions or performance (L11). Trading an unregistered qualifying model: 13 S2.

#### §3.16.2 Audits

Per registered model per game quarter `p_audit = 0.02` (×0.5 trusted lab, ×5 under sweep) plus triggers (incident, surveillance flag from 05/13, complaint). An audit costs the lab $50,000 and pauses nothing; it checks provenance (any ILLICIT share is evidence for 13), mandate compliance, incident reporting and registration completeness, and returns a finding to 13.

#### §3.16.3 Fog of war (resolves old 05 open question 3)

Rival MCS, defense and models are private. Public: registry bands, tournament results (opt-in names), licences on the market (with the licensor's chosen description and the registry band), NPC licensing presence. 12's C01 survey reveals a DP band; 12's E8 due diligence compiles public records.

#### §3.16.4 Trusted lab (resolves old 05 open question 5)

Requirements: safetyCoverage ≥ 0.5; no safety incident in the last 2 chapters; no conviction for data or model theft in the record (or expunged by 13's decay); all qualifying models registered; ≥ 95% of the lab's training DQU over the last chapter CLEAN. Benefits: audit probability ×0.5, +0.2 in the NPC licensing logit, Reputation +5 (14), eligibility for 14's "trusted frontier lab" Prestige tier, chip allocation during shortages. Clean and criminal AI paths thus have reputational consequences with NPCs, regulators and hiring (14's Reputation and Notoriety axes), as well as economic ones.

### §3.17 NPC labs and the PvE floor (resolves old 05 open question 6)

`PARAM.npc_labs_launch = 30` named NPC labs (22): tiers T1 ×8, T2 ×10, T3 ×7, T4 ×4, T5 ×1, distributed across blocs. They train on a schedule (one run per `[24, 24, 48, 96, 168, 336]` GD by tier), hire from the talent pool, buy data, bid for partnerships, license to NPC businesses, deploy security models (they are hack targets with 12 defense profiles and honeypots at 20% of labs), and trade through 16's named-actor order flow (their agents use the same graphs and DU budgets as players). Their count grows by 2 per new city (10 §3.2.3). They give a solo-feeling world active labs to compete, license from and steal from.

### §3.18 Economy and reason codes

| Reason code | Class (proposed; 03 authoritative) | Flow |
|---|---|---|
| `AI_HW_PURCHASE` | SINK (NPC vendor) / TRANSFER (player vendor) | hardware |
| `AI_HW_SALE` | FAUCET (NPC buyback) / TRANSFER | used hardware |
| `AI_HW_DEPRECIATION` | REVALUE | book value |
| `AI_ENERGY` | SINK / TRANSFER | power |
| `AI_COLO` | SINK / TRANSFER | colocation |
| `AI_CLOUD` | SINK / TRANSFER | cloud compute |
| `AI_COMPUTE_LEASE` | TRANSFER | P2P compute |
| `AI_DATA` | SINK / TRANSFER | data purchases |
| `AI_PARTNERSHIP` | SINK | partnership slots |
| `AI_RESEARCH` | SINK | PoC costs |
| `AI_SALARY` / `AI_SIGNING` | SINK | researchers |
| `AI_LICENSE_P2P` | TRANSFER | player licences |
| `AI_LICENSE_NPC` | FAUCET | NPC licensing pool |
| `AI_REGISTRATION` / `AI_AUDIT` | SINK | governance |
| `AI_INCIDENT_COST` | SINK | incidents |
| `AI_STARTER_COMPUTE` | FAUCET | one-time lab grant |

Balance targets for 20: a well-run deployment pays back its training and data cost in 2–8 real weeks at each tier (old 05 §11); AI-heavy and AI-free strategies at equal capital and skill reach comparable chapter outcomes (old 05 §12, 20 bands); a whale's crown-jewel model leaks only a dent under T5 defense (median P 0.15–0.35, 12).

---

## §4 Player intents

The envelope follows 00 §5.5. Every `lab.*` intent is validated in P1 against these common checks:
- The actor is the lab's `controllerChrId`, or an operator holding a 15 Mandate that covers lab actions (scope `LAB_OPS`, or `LAB_TRADING` for deployment actions).
- The actor is not Held (13), except for `lab.killSwitch`, `lab.pause`, `lab.retire` and `lab.fire`, which are always allowed.
- The lab is not under a 13 seizure order for the object concerned.
- The lab tier gates in §3.2 are met.
- The intent is within the per-character rate limits of 00 §5.5.
- Money checks use available cash after holds. A company lab pays from the company's treasury (09). Its actor needs the company role `CTO` or `CEO`, or must be the controlling holder (09 roles).

On a failed check the intent is rejected with a reason code `LAB_E_*` (listed after the table). A rejected intent has no effect and is visible only to the actor.

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `lab.rename` | `{ labId, publicName }` | moderation pass (18); ≤ 32 chars; at most once per chapter | updates publicName; the registry shows the old name for 7 GD as "formerly" |
| `lab.buyHardware` | `{ clusterId \| newCluster: { siteKind, propId?, coloContractId?, cityId }, model: GpuModelId, count, vendorId }` | `model.minTier ≤ lab.tier`; during a shortage, DX300/DX900POD need Reputation ≥ 50 or trustedLab; cash ≥ price·count; resulting draw ≤ site powerCapMW once delivered; HOME only T0–T1 | pays at once (`AI_HW_PURCHASE`); adds `onOrder` with `deliveryTick = now + leadTime·720`; zero lead time installs at the next P9 hour; emits `ai.hardwareOrdered` |
| `lab.sellHardware` | `{ clusterId, model, count, buyer: 'NPC' \| { contractId } }` | count ≤ installed idle cards (cards serving a reserved commitment cannot be sold) | NPC: 60% of book value (`AI_HW_SALE`); P2P: 15 contract transfers the cards at the agreed price (TRANSFER); throughput updates next hour |
| `lab.repairCard` | `{ clusterId, model, count }` | count ≤ failed cards; cash ≥ 10% of price each | repair over 3 GD; or `writeOff: true` removes them (book value to REVALUE loss) |
| `lab.setSite` | `{ clusterId, site: { kind, propId?, coloContractId? } }` | target site owned or contracted by the owner; enough capacity; moving takes `PARAM.cluster_move_gd = 2` GD offline | moves the cluster; PUE and energy contract follow the new site |
| `lab.powerContract` | `{ clusterId, kind: 'SPOT' \| 'FIXED', termGD?: 28 \| 91 \| 364, supplierId? }` | FIXED: supplier quote valid; a fixed contract can only be replaced after it ends | sets powerContract; FIXED price `forward + 3%` (06); supplier may be a player utility (09) |
| `lab.coloContract` | `{ providerId, mw, termGD }` | provider has free MW; mw ≤ 50 at T2, ≤ 500 at T3+, no limit at T5 | 15 contract; `AI_COLO` daily |
| `lab.leaseCloud` | `{ kind: 'SPOT' \| 'RESERVED', throughputPerGD, providerId? }` | SPOT: ≤ 2% of the NPC cloud supply per lab; RESERVED: cash ≥ the first GD's cost, 30-GD commitment | creates CloudLease; RESERVED price fixed at signing |
| `lab.endCloud` | `{ leaseId }` | SPOT any time; RESERVED only at end (early exit pays `PARAM.reserved_exit_fee_share = 0.5` of the remainder) | ends lease at next game hour |
| `lab.leaseCompute` | `{ clusterId, lesseeLabId, throughputPerGD, pricePerPFd, termGD }` | free capacity ≥ throughput over term; lessee accepts (15 contract handshake); lessee is not re-leasing | creates ComputeLeaseP2P; TRANSFER daily (`AI_COMPUTE_LEASE`) |
| `lab.setComputePolicy` | `{ labId, autoBuySpot, maxSpotPerGD, reservePriority, priorities: { deploymentId \| runId: number }[] }` | — | updates allocation order inside steps 2 and 4 of §3.3.5 |
| `lab.setExternalSales` | `{ clusterId, share: 0..1, floorPricePerPFd }` | cluster not reserved to a lease above the share | idle capacity sold to the world pool (§3.3.5 step 5) |
| `lab.buyData` | `{ brokerId, packageId }` | package visible to the lab (bloc access via 14 rank or 16 permits); cash | creates Dataset (BROKER, CLEAN, commonality 1.0); `AI_DATA` |
| `lab.subscribe` | `{ brokerId, domain, bloc, tier: 'BASIC' \| 'PRO' \| 'ELITE' }` | cash for the first 28 GD | creates DataSubscription and its live Dataset; renews automatically unless cancelled or cash short (then LAPSED, 3-GD grace) |
| `lab.unsubscribe` | `{ subscriptionId }` | — | stops renewal; the dataset stays and ages |
| `lab.bidPartnership` | `{ slotId, bid: Money }` | auction OPEN; tier ≥ T2 (T3 for reserve $2M slots); Reputation ≥ 40; bid ≥ reserve; cash hold of the bid | sealed bid; settles at the chapter start (§3.4.4) |
| `lab.scrape` | `{ domain, bloc, dquTarget }` | compute and cash; domain not ILLICIT under a data ruling (else the job is refused with the rule) | job of `0.5·dquTarget` PFd; dataset GREY on completion; flag roll (`PARAM.scrape_flag_prob`) |
| `lab.synthesize` | `{ modelId, domain, dquTarget }` | model READY or DEPLOYED, own lab | job `0.3·dquTarget` PFd; SYNTHETIC dataset with quality from §3.4.3 |
| `lab.mergeDatasets` | `{ datasetIds[], name }` | same domain; same owner | new Dataset; DQU summed; provenance chains concatenated; legalTag = worst; commonality DQU-weighted |
| `lab.deleteDataset` | `{ datasetId }` | not used by a RUNNING run; not under a 13 preservation order | removes it; deleting evidence under an order is 13 S2 (refused by the engine) |
| `lab.listDataset` | `{ datasetId, price, copies?, buyersAllow?: Id[] }` | source allowed (§3.9.6); lab ≥ T1 | 15 data-market listing; each sale produces a MARKET_COPY |
| `lab.research` | `{ node: ArchNode, leadResearcherId? }` | prereqs; tier gate; concurrent-project limit; cash ≥ PoC $; Reputation ≥ 60 for SECRET_SAUCE | ResearchProject + POC run queued; `AI_RESEARCH` |
| `lab.cancelResearch` | `{ projectId }` | ACTIVE | CANCELLED; 50% of PoC $ refunded only if the PoC run has consumed < 10% of its compute (`AI_RESEARCH` reversal); otherwise none |
| `lab.hire` | `{ candidateId, salaryPerGY, signingBonus, equityPct? }` | candidate in the lab's visible pool; employed < tier limit; offer ≥ the candidate's ask (stars: sealed highest offer within 1 GD) | Researcher joins at the next P9 hour; `AI_SIGNING` |
| `lab.fire` | `{ researcherId }` | employed | leaves after 1 GD; severance 28/364 of salary; loyalty of the others −2 |
| `lab.assign` | `{ researcherId, to: Id[] }` | each target is a run, project, deployment or `'SAFETY'` of the lab; the run's team size is within the tier limit | sets assignedTo; burnout rules apply |
| `lab.raise` | `{ researcherId, newSalary }` | ≥ current | loyalty +min(10, 50·raisePct) (12 §3.9.1 input) |
| `lab.planRun` | `{ kind, arch, baseModelId?, focus, purpose, computeBudget, datasetIds, hparam, checkpointing, researcherIds }` | read-only; checks are the same as `startRun` | returns the run-planner quote (§3.6.6): cost split, duration, pFail, P10/P50/P90; no state change; free; ≤ 30 per GH |
| `lab.startRun` | as `planRun` + `{ quoteHash, priority }` | arch unlocked; concurrent-run limit; data slots; team size; expected duration ≤ 60 GD; `quoteHash` is the latest quote at the current GH (otherwise re-quote); ILLICIT datasets allowed (crime) but never with a deployment mandate attached; cash ≥ data costs not yet paid + 1 GD of compute | run QUEUED → RUNNING at the next P9 hour; `pFailShown` and `mcsBandShown` stored |
| `lab.pauseRun` / `lab.resumeRun` | `{ runId }` | RUNNING / PAUSED | pause holds consumed compute; a paused run's data ages; more than 30 GD paused → CANCELLED |
| `lab.cancelRun` | `{ runId }` | QUEUED, RUNNING or PAUSED | CANCELLED; compute spent is lost; no insight credit |
| `lab.fineTune` | `startRun` with `kind: 'FINETUNE'` and `baseModelId` | base model owned (not licensed, not seized) | §3.6.5 |
| `lab.selfDistill` | `{ teacherModelId, priority }` | teacher owned; not a student with residue > 0.5 (this would only copy the residue) | SELF_DISTILL run §3.6.5 |
| `lab.studentDistill` | `{ source: { sessionId } \| { licenseId } \| { walkoutId }, datasetIds?, priority }` | the 12 capture exists and has not expired (7 GD); compute available; for a licence, `Q > 0` from DistillQuery jobs | STUDENT_DISTILL run §3.14; creates a StudentDerivation (SEALED) |
| `lab.distillQueries` | `{ licenseId, queriesPerGD }` | active PLAYER_API licence held by this lab; ≤ the cap minus the LicensedSignal use | adds a DistillQuery job; Q accrues per GD; a `noTrainClause` licence records a breach (12/13 evidence) |
| `lab.launder` | `{ studentModelId, level: 0..1, cleanDatasetIds }` | student has residue > 0.03; clean data ≥ `0.5·L·D*` | LAUNDER run §3.14.4 |
| `lab.evaluate` | `{ modelId, graphId?, kind: 'BACKTEST_HISTORICAL' \| 'WITHHELD_WORLD', window \| { worlds: 1..20 }, symbols? }` | compute for the cost (§3.12); withheld: current weekly set | Evaluation created when finished (batch, 19); results PRIVATE |
| `lab.saveGraph` | `{ graphId?, name, universe, nodes, edges, templateId? }` | structure is validated (§3.10.2) without deployment checks; ≤ 200 nodes; ≤ 400 edges | new StrategyGraph version; returns costPerEvalDU and any gate warnings |
| `lab.fromTemplate` | `{ templateId, choices: Record<string, string \| number> }` | template's gates | creates a graph (§3.10.5) |
| `lab.deploy` | `{ product, modelIds[1..3], graphId?, mandate?, autonomy, targetRefs, duAllocationPerEval, cadenceTicks, capital?, liveFeedIds, guardrails }` | deployment-slot limit; models owned or licensed (licensed only for LicensedSignal and ANALYST); graph validated (§3.10.2); character DU budget (§3.10.4); registration (§3.16.1); autonomy gates (DEEP_NETS for SEMI, RL for FULL); AiRule autonomy limits; mandate within licence (13) and leverage (07) limits; capital held from the account; inference compute available or autoBuySpot | Deployment at PAPER (trading) or active (other products); models DEPLOYED; emits `ai.deployed` (PRIVATE) |
| `lab.setStage` | `{ deploymentId, stage }` | advance only when the §3.12.5 criteria are met; demotion any time | changes the capital share |
| `lab.updateDeployment` | `{ deploymentId, graphId?, duAllocationPerEval?, cadenceTicks?, liveFeedIds?, guardrails?, capital? }` | a new graph re-runs validation and returns the deployment to PAPER unless the change is `riskOnly` (only Risk-family params changed) | applies at the next evaluation |
| `lab.setMandate` | `{ deploymentId, mandate: AiMandate }` | §2.11 limits; never ILLICIT | replaces the mandate; tightened limits apply at once, loosened ones after 1 GD |
| `lab.approveOrder` | `{ deploymentId, proposalId, approve: boolean }` | proposal OPEN (≤ 30 ticks old) | approve → intent submitted on the next tick under the owner's limits; reject → dropped |
| `lab.pause` | `{ deploymentId, flatten: boolean }` | — | stops evaluations; `flatten` liquidates via TWAP over 30 ticks |
| `lab.killSwitch` | `{ deploymentId \| 'ALL' }` | always allowed; never rate-limited | P1 of the same tick: cancels all resting agent orders and halts evaluations; positions are kept unless flatten is chosen |
| `lab.retire` | `{ deploymentId \| modelId }` | — | deployment RETIRED (capital released); a model RETIRED keeps its weights (A10) |
| `lab.setWatermark` | `{ modelId, strength: 0.3..1.0 }` | own original model | §3.14.5; applies to queries from the next GD and to future sessions |
| `lab.createDecoy` | `{ apparentMcs, apparentDomain, deceptionItemId }` | ≤ 1.5 × the best own model's MCS; a 12 DeceptionItem of kind HONEYPOT held | Model with `isHoneypotDecoy`; cannot be deployed for trading, licensed or registered |
| `lab.license` | `{ modelId, domains, pricePerGD, queryCapPerGD, termGD, exclusivity, noTrainClause, licenseeId? \| public: true, description }` | tier ≥ T2; model READY or DEPLOYED, not a decoy; registered if it meets the threshold; description moderated and must not state performance claims as numbers (15 advertising rule) | 15 listing or direct offer; on acceptance a ModelLicense with daily TRANSFER |
| `lab.revokeLicense` | `{ licenseId, cause }` | licensor; licence active | ends at the next day close; 13 contract dispute available to the licensee if `cause` is not a breach |
| `lab.offerNpcLicense` | `{ modelId, domain, bloc, pricePerGD }` | domain in the §3.9.5 list; tier ≥ T2 | enters the NPC licensing pool from the next day close |
| `lab.register` | `{ modelId, blocs[] }` | the model qualifies or the lab chooses to register voluntarily; cash for the fees | ModelRegistration per bloc; `AI_REGISTRATION`; public registry entry (`ai.registryUpdate`) |
| `lab.reportIncident` | `{ incidentId, text? }` | reportable incident | `reported = true`; 13 filing; leniency per 13 (self-report) |
| `lab.enterTournament` | `{ deploymentId, anonymous: boolean }` | a trading deployment of the lab; one entry per lab per week; division by tier | snapshot stored; entry OPEN until the week's start |
| `lab.createArena` | `{ invited: Id[2..16], gdLength: 2..10 }` | host compute for the fee | Arena LOBBY; invitees accept with `lab.joinArena { arenaId, deploymentId }` |
| `lab.secureModel` | `{ modelId, defenseDeploymentId }` | defense deployment active | binds it to the model's surface in 12's DefenseProfile |

Reject reason codes include `LAB_E_TIER`, `LAB_E_NODE`, `LAB_E_CASH`, `LAB_E_SLOTS`, `LAB_E_DU_BUDGET`, `LAB_E_POWER`, `LAB_E_SHORTAGE_GATE`, `LAB_E_QUOTE_STALE`, `LAB_E_GRAPH_INVALID`, `LAB_E_GATE`, `LAB_E_UNREGISTERED`, `LAB_E_AIRULE`, `LAB_E_MANDATE`, `LAB_E_LICENSE_SCOPE`, `LAB_E_CAPTURE_EXPIRED`, `LAB_E_DECOY`, `LAB_E_SEIZED`, `LAB_E_HELD` and `LAB_E_RATE`. Each rejection carries a human-readable explanation through 18's error copy.

Agent-generated intents (from P5) use `mkt.*` kinds with `origin: { deploymentId }`. They pass 05's normal validation, plus the mandate checks done first in 11:
- **Position:** the resulting position is ≤ `maxPositionPctOfCapital` and ≤ `maxPositionPctOfADV`.
- **Leverage:** ≤ `leverageMax`.
- **Loss stop:** the daily loss so far is below `dailyLossStop`.
- **Asset scope:** the asset is in an allowed class, not denied, and in a bloc listed in `blocsAllowed`.
- **Order size:** notional ≤ `guardrails.maxOrderNotional`.

An order that fails a check is dropped, and an exception is logged on the deployment.

---

## §5 Engine events

All events use 00 §5.6. Default visibility is PRIVATE to the lab's controller and the company's officers. SEALED items are kept for replay and for 13 discovery.

| Kind | Payload | Visibility |
|---|---|---|
| `ai.labUnlocked` | `{ chrId, labId }` | PRIVATE |
| `ai.tierChanged` | `{ labId, from, to }` | PRIVATE; the public registry band changes only through registrations |
| `ai.hardwareOrdered` / `ai.hardwareDelivered` | `{ clusterId, model, count, deliveryTick }` | PRIVATE |
| `ai.cardFailed` | `{ clusterId, model, count }` | PRIVATE |
| `ai.computeCrunch` | `{ partition, scale: s_partition, tick }` | PUBLIC (status bar: "Compute crunch, agents running at x%") |
| `ai.cloudPreempted` | `{ leaseId, lostShare, untilTick }` | PRIVATE |
| `ai.chipShortage` | `{ start \| end, leadTimeBand }` | PUBLIC (from 16/06 event) |
| `ai.dataAcquired` | `{ datasetId, source, dqu, legalTag }` | PRIVATE |
| `ai.subscriptionLapsed` | `{ subscriptionId }` | PRIVATE |
| `ai.partnershipAuction` | `{ chapter, slots: { slotId, domain, bloc, reserve }[] }` | PUBLIC at open |
| `ai.partnershipAwarded` | `{ slotId, winnerPublicName, price }` | PUBLIC (a public contract award, like a concession, 01) |
| `ai.scrapeFlagged` | `{ jobId, claimantNpcId }` | PARTIES (lab, 13) |
| `ai.researchStarted` / `ai.researchDone` | `{ labId, node }` | PRIVATE; `researchDone` for FRONTIER_STACK or SECRET_SAUCE also emits PUBLIC `ai.frontierMilestone { labPublicName, nodeClass: 'FRONTIER' \| 'UNIQUE' }`, since a frontier lab is newsworthy (16). The lab may suppress this by holding `PARAM.stealth_lab_rep_cost = 5` Reputation in escrow (it is refunded after 2 chapters without an incident) |
| `ai.researcherHired` / `ai.researcherLeft` | `{ researcherId, name, star, cause: 'FIRED' \| 'QUIT' \| 'POACHED' \| 'WALKOUT' }` | PRIVATE; a star's move is PUBLIC (`ai.starMoved { name, toLabPublicName }`) |
| `ai.runStarted` | `{ runId, kind, arch, computeBudget, pFailShown, mcsBandShown }` | PRIVATE |
| `ai.runProgress` | `{ runId, consumedShare, etaTick }` | PRIVATE, hourly (not stored in the event log; it is a projection) |
| `ai.runPaused` | `{ runId, cause: 'NO_COMPUTE' \| 'PLAYER' }` | PRIVATE |
| `ai.runCompleted` | `{ runId, outcome: 'SUCCEEDED' \| 'PARTIAL' \| 'FAILED', modelId?, mcs?, lostCompute?, insightGained? }` | PRIVATE; `outcomeRoll` and `failAtFraction` SEALED |
| `ai.modelCreated` | `{ modelId, codename, arch, mcs, focus }` | PRIVATE |
| `ai.evaluationDone` | `{ evaluationId, metrics, overfitFlag }` | PRIVATE |
| `ai.deployed` / `ai.stageChanged` / `ai.retired` | `{ deploymentId, product, stage }` | PRIVATE |
| `ai.healthAlert` | `{ deploymentId, alert, factors: { freshness, regimeFit, liveFeed, duUtilisation } }` | PRIVATE |
| `ai.orderProposed` | `{ deploymentId, proposalId, intentPreview, expiresTick }` | PRIVATE |
| `ai.mandateBlock` | `{ deploymentId, rule, attemptedNotional }` | PRIVATE |
| `ai.killSwitch` | `{ deploymentId, cause: 'PLAYER' \| 'DRAWDOWN' \| 'DAILY_LOSS' \| 'INCIDENT' }` | PRIVATE |
| `ai.rogueEpisode` | `{ deploymentId, startTick, endTick }` | PRIVATE (owner alert); the AiIncident is SEALED until reported or audited |
| `ai.incident` | `{ labPublicName, kind: 'SAFETY_INCIDENT', bloc }` | PUBLIC (filing rule, §3.15.2); details PARTIES (lab, 13) |
| `ai.registryUpdate` | `{ labPublicName, codename, band, domainClass, autonomy, bloc, status }` | PUBLIC (13 registry) |
| `ai.auditOpened` / `ai.auditFinding` | `{ labId, modelId, findings }` | PARTIES (lab, 13) |
| `ai.licenseListed` | `{ listingId, labPublicName, band, domains, pricePerGD, description }` | PUBLIC (15 market) |
| `ai.licenseSigned` / `ai.licenseEnded` | `{ licenseId, licensorId, licenseeId }` | PARTIES |
| `ai.licenseBreach` | `{ licenseId, clause: 'NO_TRAIN' \| 'CAP' }` | PARTIES (licensor, 13) once 12 detects it; SEALED before |
| `ai.npcLicenseRevenue` | `{ labId, domain, bloc, amount }` | PRIVATE (daily) |
| `ai.studentCreated` | `{ modelId, route }` | PRIVATE; the StudentDerivation is SEALED |
| `ai.poisonLoss` | `{ deploymentId, amount }` | PRIVATE (the victim sees "unexplained regime-change loss"; poison is diagnosed only by a scan or audit) |
| `ai.tournamentOpen` / `ai.tournamentResults` | `{ tournamentId, division, results: { rank, displayName, score }[] }` | PUBLIC (L11: score only) |
| `ai.arenaResults` | `{ arenaId, results }` | PARTIES (participants) |
| `ai.aiRule` | `{ bloc, kind, params, fromTick, toTick, sourceEventId }` | PUBLIC (from 16) |
| `ai.trustedLabChanged` | `{ labPublicName, trusted }` | PUBLIC |
| `ai.securityProfile` | `{ labId, ap, aiTier, dpAi, scanTier }` | to 12 only (internal, not in the player feed) |

---

## §6 NPC behaviour

### §6.1 NPC labs (30 at launch, §3.17)

Each NPC lab is a 16 named actor with fixed parameters: `archetype ∈ {QUANT_SHOP, BIG_TECH, STATE_LAB, ACADEMIC, BOUTIQUE_SECURITY, OPS_VENDOR}`, a home bloc, a tier, `cleanliness ∈ [0, 1]` (the share of the lab's actions that stay clean) and `aggression ∈ [0, 1]`.

The labs' daily decisions use the stream `npc/lab/<id>/<GD>`.
1. **Compute:**
   - Target owned compute = `1.2 × tierRunMidpoint / 30` PFd per GD.
   - The lab buys hardware from NPC vendors when it is below 80% of target and its treasury is ≥ 2× the order cost.
   - STATE_LAB labs ignore shortage gates in their home bloc.
2. **Data:**
   - Keep `D*` of the next planned run.
   - Buy broker data first; bid for partnerships at `U(0.9, 1.6) ×` reserve when tier ≥ T2.
   - Scrape when `cleanliness < 0.6`.
3. **Runs:**
   - One run per schedule interval (§3.17) at the tier's midpoint size.
   - Hparam CAREFUL; checkpointing on at T3 and above.
   - The NPC run uses the same formula and draws as a player's.
4. **Research:** researches the next node when it holds 3× the PoC $ in treasury and its tier allows. It never researches above its fixed tier (an NPC lab's tier is a 16 parameter that grows only through 16 world events).
5. **Talent:** bids for one star per chapter with probability `0.3 + 0.1·tier`. The offer is `U(1.0, 1.4) ×` the star's ask.
6. **Products:**
   - QUANT_SHOP and BIG_TECH run 2–6 trading deployments built from the 12 templates.
   - Every NPC lab offers NPC_BUSINESS licences in 2 domains.
   - BIG_TECH and ACADEMIC labs also list PLAYER_API licences at `refPrice · U(0.8, 1.5)`, with `noTrainClause` at probability 0.7.
   - BOUTIQUE_SECURITY labs sell security services through 09.
7. **Security:**
   - Every NPC lab runs a defense deployment at its tier (12 DefenseProfile).
   - 20% of NPC labs hold a honeypot decoy.
   - NPC labs with `aggression > 0.6` and `cleanliness < 0.5` run 12 ops against player labs, following 12 §6.
8. **Governance:**
   - NPC labs register as required.
   - Safety incidents follow the player formula with safetyCoverage `U(0.3, 0.9)`.
   - Their incidents produce PUBLIC events and give 16 news material.

### §6.2 NPC data brokers

There is one broker per (domain, bloc) plus 3 global brokers; names are in 22.
- **Packages:** each broker lists 6 archive packages at grades A (q 0.95), B (0.85) and C (0.70), at sizes from 100 to 1,000,000 DQU.
- **Feeds:** each broker offers the three feed tiers.
- **Prices:** prices follow §3.4.3, times `(1 + 0.3·(demandIndex − 1))`. The demandIndex is the ratio of the last 28 GD's sales to the trailing 364-GD mean, clamped to [0.7, 1.5].
- **Disruption:** a broker can be the target of a 16 event called "data provider outage". During the outage its feeds stop appending for `U(1, 5)` GD and subscribers' liveFeed factor decays.

### §6.3 NPC hardware vendors

Four vendors are named in 22. Each sells all models with stock limits per chapter: `PARAM.npc_vendor_stock_dx900 = 40` pods and `PARAM.npc_vendor_stock_dx300 = 2,000` cards per vendor per chapter at launch, both growing 10% per chapter.

Orders beyond stock wait in a queue, served first in first out. A shortage halves the stock limits.

### §6.4 NPC clouds and colocation

There are 3 NPC cloud providers per bloc, whose total supply belongs to 06, plus 2 colocation providers per bloc at `PARAM.colo_price_per_mw_gd`. They never refuse service, except when supply is exhausted (06 utilisation = 1). In that case new SPOT leases are refused with `LAB_E_CLOUD_FULL`.

### §6.5 NPC licensees

NPC businesses (09/16) buy NPC_BUSINESS licences only through the pool in §3.9.5. They churn at 5% per GD to the best alternative in the logit.

### §6.6 NPC regulators

Each bloc regulator (13) runs audits per §3.16.2 and publishes registry updates. It reacts to 16 AiRules. After a public safety incident it raises that bloc's audit probability for the domain class by ×2 for 28 GD.

### §6.7 Star researchers

The 40 named luminaries (22) have preferences:
- `prefersClean`: they refuse labs with an ILLICIT conviction.
- `prefersFrontier`: they need tier T3 or higher.
- `prefersBloc`: a home bloc gives +10% acceptance.

Accepting an offer goes through the logit `2·ln(offer/ask) + 0.5·[preferences met] − 1.0·[violated]`.

---

## §7 Screens

17 owns the layouts. 11 defines what the screens show. All of them sit in the Lab section of the **Shadow** sub-palette (17), and Lab elements in the city view (data-center props, 10) link here. Every number on these screens is the player's own private data unless it is marked public.

1. **Lab Overview**: tier, with the next tier's NW and arch requirements; a summary of compute (owned, reserved, spot, idle, utilisation); data (total effective DQU by domain, legal mix); talent (head count, S_team by specialty, burnout warnings); model and deployment counts; the DU budget meter (`used / DU_cap`, with the 2,000 hard cap); safety coverage; trusted-lab status; open exceptions; tomorrow's accrual forecast (energy, cloud, salaries, subscriptions, licences, registration).
2. **Compute**:
   - Clusters by site, with cards by model, failures and repairs, power draw against capacity, PUE, energy contract and cost per PFd.
   - Hardware orders and delivery ETAs, plus the vendor catalog with stock and lead times.
   - Cloud leases (spot price chart from 06, preemption risk at the current utilisation, reserved commitments).
   - P2P leases in and out, and the external sales setting.
   - The allocation waterfall for the current game hour (§3.3.5 steps 1–5) and the priority editor.
3. **Data**: datasets with effective DQU, a freshness bar, domain, legal tag, commonality and provenance chain (own); subscriptions and renewals; the partnership auction (slots, reserve, own bids, last chapter's awards); scrape and synthesis jobs; data-market listings; a "D* coverage" gauge for a planned run size.
4. **Research Tree**: the node graph (§3.5) with state, prerequisites, cost and duration (with the researcher speed-up applied), and what each node unlocks. The SECRET_SAUCE node shows the lab's signature once researched.
5. **Talent**: employees (skill, specialty, salary, loyalty, burnout, assignments); the candidate pool with refresh countdown; the star listing with a countdown and the sealed-offer form; and each specialist's effect on the formulas (for example, "ΔA +0.42").
6. **Run Planner**: the controls are kind, arch, focus, purpose, compute budget (a slider with the tier band shaded), dataset picker (with the D* ratio and balance shown live), hparam, checkpointing and team. Outputs are cost split, duration, pFail with each factor broken out, the MCS P10/P50/P90 fan, and the "what if +50% compute / +50% data" deltas. Active runs show progress, ETA and a pause/cancel control. This screen is the "one more run" pull.
7. **Models**: lineage tree (parents, fine-tunes, students); per model: MCS, specMult by domain, freshness per domain, trained regime vs the current one, provenance shares, watermark, registrations and licences. A health meter for each deployment binding shows effMcs factors.
8. **Strategy Graph Editor**: a block palette by family (gated blocks are locked, with the reason shown); a canvas with typed ports; a live DU cost counter against the allocation; a universe picker with priority order; a validation panel; a template wizard; version history (deployed versions are locked); and "Explain this graph", a plain-language walk-through generated from the block definitions.
9. **Evaluation**: run backtests or withheld-world sets with a cost quote; results show equity curve, metrics (§2.8), in-sample flag, overfit warning, paper versus backtest tracking error, capacity and edge half-life.
10. **Deployments**: per deployment, the stage ladder with advance criteria, capital, P&L, drawdown, the health meter (factor bars and alerts), DU utilisation ("running at x% of budget"), order proposals with approve and reject (ADVISORY/SEMI), the mandate editor and the kill switch (always visible, one tap with confirmation). The exceptions inbox offers the A07 options.
11. **Analyst Panel**: a docked side panel that also appears on the 05 trading screens. It shows, for each watchlist symbol, the public estimate next to the model estimate with 90% bands, conviction, risk flags and text summaries (TRANSFORMER+).
12. **Licensing Market**: browse licences (public band, domains, price, cap, clauses, licensor description); own listings; licensee view with query usage; NPC licensing pool shares and revenue by domain and bloc.
13. **Tournament and Arenas**: this week's division, entry form, live standings during the batch (score only), past results, titles; arena lobby and results.
14. **Governance**: registrations by bloc, fees, incidents and reports, audits and findings, active AiRules affecting the lab's deployments, the trusted-lab checklist (each requirement with a pass or fail tick), and the public registry browser (all labs' public entries).
15. **Security bindings**: the AP, DP_ai, AP_media and scanTier numbers sent to 12, with which models produce them; 12 owns the Cyber Command screen and links here.

All screens obey 18's accessibility rules. The run planner and graph editor have keyboard paths. Every formula factor has a tooltip that states the factor's name and its current value, never a real technique.

---

## §8 Edge cases

1. **Lab tier drops below a deployment's needs.** This cannot happen through NW, because peak NW never demotes. It can happen through a seizure of the only FRONTIER_STACK model, or when the company owning the lab is sold. Existing deployments keep running with their current gates until their next version change. New gated actions are refused.
2. **The controller character changes** (company lab, new CEO or controlling holder). `controllerChrId` updates at the next day close. DU now draws on the new controller's budget. If that budget is exceeded, deployments scale down proportionally by `s = budget/Σ`, and the new controller gets an exception listing them.
3. **Company acquisition (09 M&A).** The lab, its nodes, models, datasets (licences checked: BROKER and PARTNERSHIP data transfer only if the licence allows assignment, which it does in the case of whole-company transfers), researchers (each rolls loyalty −10), registrations (re-registration within 7 GD, otherwise SUSPENDED) and licences (contracts assign per 15) all transfer.
4. **Two runs finish on the same hour.** Outcome draws use separate streams per run, in run-id order. Results never depend on processing order.
5. **Hardware delivery when the site is full** (because the cap was reduced, or the site was sold, 10). The cards are delivered to storage, incurring no draw and providing no throughput. The owner must move them or sell them. Storage is free for 28 GD, then `PARAM.hw_storage_fee_share = 0.2%` of price per GD.
6. **Site property foreclosed or sold under the cluster (10).** The cluster goes offline at transfer. The cards move to storage and to the old owner's inventory, while the site stays with the new owner. Running runs on it pause.
7. **Energy price spike (06).** The energy cost per GD can exceed the value of the training. The planner shows the new cost, and the auto-pause option `pauseIfEnergyAbove` (per cluster) can stop training allocation (step 4) while inference continues.
8. **Spot lease cash shortfall at billing.** At the hourly billing, if available cash falls short, the spot lease ends and runs slow. A RESERVED fee shortfall becomes a 07 overdraft and then a payables default (07/13).
9. **Dataset deleted mid-run.** Refused while it is in use. If a 13 seizure removes an ILLICIT dataset mid-run, the run continues with the DQU already ingested (the snapshot at start), and the evidence is recorded.
10. **Data ruling turns SCRAPE into ILLICIT in a bloc.** Existing models keep their provenance at training time. New runs that include those datasets count them as ILLICIT. Trading deployments already running are unaffected, unless the ruling says "retroactive" (16 decides this), in which case they must be retrained within 28 GD or they are blocked from that bloc.
11. **Student derived from a teacher that is later retired or deleted.** The student is independent. Lineage noise keeps the teacher's `lineageRootId`, and the SEALED derivation stays.
12. **Licence ends mid-evaluation.** Calls fail from the next evaluation. LicensedSignal outputs NaN, the graph treats it as zero weight, and the health alert NO_FEED is raised. Analyst entries go blank.
13. **A graph's universe asset is delisted or halted (05, 09).** Its symbols drop to zero target. Orders for halted assets are refused by 05, and an exception is raised. A delisted asset is removed from the universe in the next version, automatically and as a riskOnly change.
14. **DU budget exceeded by adding a scan schedule (12).** The scan is refused unless deployments are scaled down first. 12 shows the DU needed.
15. **Hostile drain larger than 20%.** Capped at 20% by 12. If several drains apply, they are summed and capped.
16. **Partition crunch with zero player demand.** Never triggers. `s_partition` stays 1 when demand is ≤ cap.
17. **Tournament entry deployment retired before the run.** The snapshot is already stored, so the entry stands.
18. **Arena host leaves (account closed).** The arena is cancelled and fees are refunded as compute credit, without cash.
19. **The weekly withheld set rotates during a multi-world evaluation request.** The request uses the set that was current at submission. Results are tagged with the set id.
20. **Model seized by 13 while deployed.** The deployment halts at the next P5 and flattens via TWAP over 30 ticks under 13 supervision. Licences on the model are suspended and licensees refunded pro rata.
21. **Honeypot decoy targeted by the owner's own alt account.** Same-household or linked-account rules apply (15/13). No cross-account loot is credited, and the attempt is a 13 S2 matter.
22. **Run planner quote changes between plan and start** (spot moved, a dataset aged an hour). `quoteHash` mismatch returns `LAB_E_QUOTE_STALE` with the fresh quote. A one-tap re-confirm submits it.
23. **Lab owner goes bankrupt (07/13).** Hardware and datasets (assignable ones) become estate assets, and models stay with the estate. Licences continue only if the estate's administrator keeps paying the inference cost. Deployments flatten.
24. **Offline player.** Runs, research, subscriptions and deployments continue on the server. Kill switches and mandate stops remain enforced. Proposals in ADVISORY expire, so no trades happen without approval.
25. **Solo mode.** The lab runs on the same rules. NPC labs supply the competition and the licensing market.
26. **Fine-tune of a licensed model.** Not allowed (`LAB_E_LICENSE_SCOPE`), because weights never change hands.
27. **Ensemble members from different lineages but identical data.** Overlap is 1, so the ensemble gives no bonus. Only diverse data pays.
28. **Specialist model used outside its domain.** It gets `specMult` 0.40. The gate checks use effMcs, so the block becomes locked if it falls below 80% of the gate at the next re-check (hourly). The deployment then goes to PAUSED with an explanation.
29. **Leeched compute credit expires during a run.** The run uses it first. Unused credit is lost at expiry, and the run continues on other compute.
30. **Researcher assigned to a run that fails.** Burnout +10, loyalty −3. This is offset by the insight credit message ("the team learned from it").

---

## §9 Exploits and counters

| # | Exploit | Counter |
|---|---|---|
| X1 | **Alt-account self-licensing to farm NPC licensing or launder money** (one account licenses its model to an alt at an inflated price) | Licence payments are TRANSFER (no faucet); 15 related-party and wash checks on linked accounts; NPC_BUSINESS revenue depends on effMcs and price, never on player-to-player volume |
| X2 | **Synthetic data farming** (an infinite DQU loop from one's own model) | Collapse rule §3.4.6 makes marginal synthetic DQU negative above 40%; synthetic quality ≤ 0.85 and a function of MCS |
| X3 | **Tournament collusion** (entering several alts in one division to push or pull a market) | One entry per lab, one lab per character; linked accounts (15) cannot both enter a division; scores use Sharpe and drawdown, not P&L share; no cash rewards |
| X4 | **DU budget evasion** by spreading deployments across many characters or companies | DU_cap is per controlling character; company labs draw on the controller; 15 linked-account rules count alts as one controller for DU purposes when they are confirmed linked |
| X5 | **Reselling broker data** bought once | BROKER and PARTNERSHIP listings are refused; MARKET_COPY of a resold copy keeps the original's source tag and is refused again |
| X6 | **Front-running own clients through the analyst or licence** (licensor sees licensees' queries) | Licensors see only aggregate query counts per GD, never symbols or timing (L11); queries are evaluated in P5 from t−1 state, so no information about a client's intent exists before matching |
| X7 | **Reading other players' positions through a hidden signal** | No signal contains player holdings, orders or strategy (§3.8.1, L11); NPC maker inventory is NPC-only and t−1 |
| X8 | **Look-ahead in backtests or withheld worlds** | Backtests use archived committed state and fixed noise streams; withheld worlds come from secret seeds unrelated to the live world's future entropy (20); in-sample windows are flagged |
| X9 | **Stage-skipping**: deploying full capital without paper trading | Staging is enforced by the engine (`setStage` criteria); only ADVISORY can skip paper |
| X10 | **Infinite cheap students by repeated SELF_DISTILL** | Each self-distillation keeps 90% of MCS, so the student is always weaker than its teacher; compute cost 5%; no capability gain, only inference savings |
| X11 | **Reserved-cloud arbitrage** (reserve at a fixed price during a crunch, then resell P2P) | Cloud leases cannot be re-leased (only owned clusters lease P2P); idle reserved capacity cannot be sold to the world pool |
| X12 | **Research by proxy** (letting a big alt lab research then transferring nodes) | Nodes transfer only with the whole company (09 M&A), with 13 related-party review; the M&A costs and re-registration apply |
| X13 | **Honeypot as an attack** (creating decoys with fake high MCS to bait rivals into crimes for 13 rewards) | Decoys only harm those who commit a 12 crime; the decoy owner gets no reward from 13 beyond the normal victim's evidence; apparent MCS ≤ 1.5× own best |
| X14 | **Watermark stripping by many laundering passes** | Residue floor 0.03 (§3.14.4); each pass costs compute and cuts retention; detection probability at 0.03 stays at `1 − e^(−0.09) ≈ 8.6%` per audit |
| X15 | **Registration dodging** by splitting capital into deployments below $50M | Registration threshold applies to the sum of capital across deployments using the same model or its lineage within a lab |
| X16 | **Partnership squatting** (winning slots to deny rivals, never using the feed) | Fees are paid in full; incumbents get only a 10% credit; Reputation ≥ 40 eligibility; the slot can only be held for one chapter per auction |
| X17 | **Tournament model leaks** (studying winners) | Results show score only; the snapshot never leaves the batch worker; no replay is public |
| X18 | **Compute-crunch griefing** (one player saturates the partition to slow others) | `s_partition` scales everyone equally; DU_cap per character is ≤ 2,000, so one character cannot hold more than 2,000/3,000,000 of a partition; 06 prices spot higher under crunch |
| X19 | **Kill-switch latency abuse** (keeping a rogue agent on to profit, then claiming it was rogue) | Rogue episodes are drawn from SEALED streams and logged; a claimed rogue episode without the log is no defence (13) |
| X20 | **Pumping public NPC licensing via fake MCS claims** | Licence descriptions cannot state numeric performance; the market shows the registry band, which the engine computes |
| X21 | **Starter compute farming** with new characters | One grant per character, at Lab unlock, which needs $100k NW; 15 linked-account rules |
| X22 | **Hardware buyback arbitrage** (buy from a player fab cheaply, sell to NPC at 60% book) | NPC buyback uses book value, which starts at the price paid. Book value is capped at the NPC catalog price, so a cheap purchase yields a cheap buyback |

---

## §10 Acceptance tests

1. A character's NW first reaching $100,000 at a day close creates exactly one Lab at T0 with LINEAR unlocked and 200 PFd of starter compute (reason `AI_STARTER_COMPUTE`, FAUCET). A second crossing creates nothing.
2. With peak NW $25M and TRANSFORMER as the highest node, `lab.tier = 2`. After MOE completes, it is 3. With peak NW $900k and MOE, the tier is 1.
3. Calibration: with balance 1.15 and no researcher bonus, the §3.6.1 formula gives MCS within ±2% of the §3.6.1 table for each tier row (7.8, 29, 120, 344, 1,094, 2,690).
4. `balance = 1.15` for ρ_D in [0.8, 1.25]; `balance = 0.60` for ρ_D ≤ 0.25 or ≥ 4; and it is monotone between those.
5. The precision function gives `ρ(20) = 0.83 ± 0.01`, `ρ(150) = 0.50`, `ρ(600) = 0.25 ± 0.01` and `ρ(3000) = 0.08 ± 0.01`.
6. Two models with commonality 1.0 and different lineages produce identical estimate errors for the same key and tick. With commonality 0, their errors are independent (correlation over 10,000 draws < 0.05).
7. DU_cap: a T2 controller with owned compute of 37,500 PFd/GD has `DU_cap = 125`. With 0 owned compute it has 100. At T5 with any compute it never exceeds 2,000.
8. Spot, P2P-in and leeched compute do not change DU_cap (test with each added alone).
9. Hardware: 100 DX100 at PUE 1.3 and $0.10/kWh yield 84,000 PFd/GD and an energy cost of $16,380/GD (± $1).
10. Drawing beyond site capacity: `lab.buyHardware` that would exceed `powerCapMW` once delivered is rejected with `LAB_E_POWER`.
11. Allocation: with insufficient compute, security inference is served before trading inference, which is served before training. A training run with zero allocation for 24 GH becomes PAUSED_NO_COMPUTE.
12. Data decay: a SENTIMENT dataset of 1,000 DQU at age 14 GD has an effective DQU of 500 (± 0.5).
13. Synthetic share of 0.5 gives `collapseMult = 0.70`. At a share of 0.40 or less, `collapseMult = 1`.
14. The run planner's P10/P50/P90 match the empirical quantiles of 10,000 simulated outcomes from the same distribution within ±3%.
15. Failure: with failBase 0.08, QUICK hparams, no checkpointing and an average team (S_team 50), pFail = 0.08 · 1.6 · 1.0 · 1 · 1.0 = 0.128. 10,000 seeded draws give 0.128 ± 0.01.
16. Checkpointing: in a failed run with checkpointing, the total consumed compute is ≤ 1.15·C + 0.30·C.
17. FINETUNE: model with C_cum 10,000 and D_cum 200 fine-tuned with C_ft 2,000 and D_ft 100 yields C_cum' 11,000 and D_cum' 200.
18. SELF_DISTILL of an MCS 500 teacher yields MCS 450 and inferenceMult 0.40, with no residue.
19. Laundering: teacher 300, P 0.85, retentionRaw 0.85 and L = 1 produce retention 0.5525, a student MCS of 165.75 (displayed 166) and residue `max(0.03, 0.8·1.0·0.3) = 0.24`.
20. Session distillation of a teacher above the attacker's arch ceiling is capped at the ceiling (T2 attacker: 250).
21. Query distillation: with teacherMcs 400, Q50 = 4,000, and Q = 4,000 gives P = 0.85·(1 − e^−1) ≈ 0.537.
22. A DistillQuery on a licence with `noTrainClause` creates a breach record (SEALED) on the first query.
23. Honeypot poison 0.4 makes the student's trading effMcs 60% of its unpoisoned value. A regime change costs 0.8% of deployed capital (≤ 10% per GD). One clean FINETUNE halves the poison to 0.2.
24. Freshness never goes below 0.30. liveFeed goes 1.0 → 0.5 seven GD after a feed detaches, with a floor of 0.20.
25. Gate re-check: a QuoteTwoSided deployment whose MICROSTRUCTURE effMcs falls below 40 (80% of 50) is paused within one game hour with an explanation.
26. Graph validation rejects a cycle, an unconnected input, a gated block without the gate, a universe above the tier limit, a cost above the allocation and a missing DrawdownStop on SEMI_AUTO or FULL_AUTO.
27. Graph cost: the DU cost per evaluation equals the sum in §3.10.1 over the universe size and maximum orders. For example, PriceVolume + Technical + ZScore + TargetWeight + PositionLimit + LimitOrder over 20 symbols costs 20·(0.5 + 1.0 + 0.25 + 0.5 + 0.1 + 0.25) = 52 DU.
28. When effective DU is below the cost, symbols are dropped from the bottom of the priority list until the evaluation fits, and the health meter reports the percentage.
29. Determinism: replaying the same world from the same seed and intent log yields identical run outcomes, model MCS, agent intents and evaluation metrics (02 replay hash).
30. Observation rule: a test graph that tries to read a price from the current tick receives the value at end of t−1. A static check fails any block definition that references uncommitted state.
31. L11: no event, API response or screen visible to a player other than the owner contains another lab's MCS, graph, positions, orders, P&L or datasets. The registry shows only bands. A tournament shows only scores. An automated scan of all PUBLIC and PARTIES event payloads for the forbidden fields finds none.
32. Licensors see only aggregate query counts per GD per licence.
33. Kill switch: `lab.killSwitch` submitted at tick t cancels all of the deployment's resting orders before P6 of tick t, and no agent intent from that deployment appears from tick t onward.
34. Mandate: an agent order that would breach `maxPositionPctOfCapital` is dropped and logged. Over 1,000 random graphs, no order violates the mandate.
35. Staged deployment: a trading deployment cannot reach STAGE_10 before 2 GD of paper trading (except ADVISORY). Breaching drawdown at 50% of the stop demotes by one stage automatically.
36. Registration: deploying an MCS 210 model on a bloc's assets without registration is rejected with `LAB_E_UNREGISTERED`. Splitting the same model into two deployments below $50M each, with a combined $60M, still requires registration.
37. A safety incident emits a PUBLIC `ai.incident` with only the lab public name, kind and bloc. It halts the deployment for 1 GD and applies Reputation −5 (14).
38. Rogue probability for FULL_AUTO with all five guardrails, regimeFit 1 and safetyCoverage 1 is `0.002 · 0.3 · 0.5 = 0.0003` per GD.
39. NPC licensing pool: the shares over offered models sum to 1 in each (domain, bloc), and the pool size matches `$150,000 · aiRaceIndex · N_a/10,000` per GD.
40. Tournament: a division's 10-GD batch run is reproducible from its seed. Rewards contain no cash. Linked accounts cannot both enter one division.
41. Collapse and DU: at a 3,000,000 DU/tick partition cap with 4,000,000 requested, every deployment runs at 0.75 and an `ai.computeCrunch` is emitted.
42. Researchers: a skill-90 star costs $30,000·e^4.5·1.5 ≈ $4.05M per GY. ΔA from one star ARCHITECTURE researcher of skill 90 is 0.5·0.81 + 0.5 = 0.905.
43. Partnership auction: the highest sealed bid at or above the reserve wins. With an incumbent bidding 1.0 and a challenger bidding 1.05, the incumbent's effective bid is 1.1, so the incumbent wins and pays 1.0.
44. Scrape flags: over 10,000 scrape jobs, the share flagged is 0.03 ± 0.005.
45. Inference cost: an MCS 120 trading agent at 100 DU/tick consumes 0.8·120·sqrt(101) ≈ 965 PFd/GD.
46. Weights never change hands: no intent other than 09 company transfer or 12 theft outcomes changes a model's `labId`.
47. Offline: a player offline for 24 GD returns to find runs completed, subscriptions renewed or lapsed per cash, and no ADVISORY trade executed.
48. Old-timer conversion: CLASSIC_ML research takes 16 GD with no ARCHITECTURE researchers, and 16·(1 − 0.30·0.9) = 11.68 GD with an S_arch of 90.
