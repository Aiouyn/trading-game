# 20 — Verification and Balance (the Truth Machine)

Owner module: 20. Status: complete specification, 2026-10-18.
Scope (00 §1): invariants, unit and property tests, the simulation harness, game-balance test agents, balance bands, regression seeds, release gates. Also owned here: partition-equivalence and determinism verification, exploit hunts, population and adaptation experiments, tail calibration, human playtest protocol, the live shadow verifier, the exploit disclosure programme and the public integrity report.
Depends on: 00 (conventions, §5 contracts), 02 (engine `step()`, RNG streams, safe mode, snapshots, replay), 03 (ledger, reason codes, balance sheets), 19 (packages, partitions, `TickRecord`, `logicalStateHash`, harness host role, bot SDK). Consumed by: every module (each registers invariants and bands here), 19 (gates for toolchain upgrades and deploys), 21 (Truth Machine dashboard, compensation by replay, exploit report handling).

Sources kept: original vision 03 §16 (balance harness and bands), 02 §10 (anti-cheat telemetry), 01 §8.4 and §14.3 (wealth curves), MASTER-BIBLE PART VII §11 (B01–B11) and §13 R06, ROADMAP §2.9 risks R1–R5 and Q5, the repository Tape specs (acceptance, ecology hunts, exploit hunts, crowd gate, learnability bands, bankruptcy and ad farming bands, self-impact mark pump), V3 Part 8 (the Truth Machine) and Part 11 (a Truth Machine gate at the end of every build stage).

**Safety and wording rule (binding).** The "adversarial" side of this module consists of **game-balance test agents**: scripted or self-tuning simulated players that use only the intents and views a real player has, and that try to earn more than the rules intend. Their "attacks" are game moves (orders, contracts, game verbs such as Whisper, Tap, Siphon) inside the simulation. Nothing in this module describes, tests or teaches attacks on real systems. Security testing of the real servers is a separate engineering activity owned by 19 §9 and is out of scope here.

**Time conversions used throughout.** 1 tick = 5 real seconds = 2 game minutes. 1 game day = 720 ticks = 1 real hour. 1 real day = 17,280 ticks = 24 game days. 1 game year = 262,080 ticks ≈ 15.17 real days. 1 chapter = 56 real days = 1,344 game days ≈ 3.69 game years (00 §5.1). Harness worlds run as fast as the host allows; "a 5-year run" means 5 game years of ticks regardless of wall time.

---

## §1 Purpose

1. **Prove the world is honest.** Every tick, the engine checks that money and assets are conserved, that every movement has a reason, that nobody's collateral is pledged twice and that ownership adds up (B02). A violation never commits: the tick is rolled back, replayed in safe mode, and if still failing the world halts and a reproducible case is filed (V3 Part 8).
2. **Prove the world is one world.** The same seed and the same intents produce the same logical state hash whether the world is run as 1, 4 or 16 partitions, on any supported host, after any replay (L1, 19 §1.2). `DEFAULT (Mathis may override)`: the equivalence set is {1, 4, 16} partitions on every nightly run.
3. **Hunt exploits before players do.** Game-balance test agents with player-level permissions only (B03) run continuously against staging worlds and production mirrors, trying every exploit class in §3.6 across every institution of 07, 08 and 09. Every exploit found becomes a permanent regression case (B06).
4. **Keep the game in balance.** Every tunable outcome that matters (crime EV, wealth curves, market statistics, crisis frequency, bank failure rates, ad and bankruptcy faucets, learnability of edges) has a numbered band with a seed count. A release ships only when its bands pass (03 §16, Tape specs).
5. **Keep evidence honest.** Unit tests, authored model calculations, engine simulations, human playtests and live telemetry answer different questions and are reported separately, never merged into one "it works" claim (B07).
6. **Gate every change.** Pull requests, build units, nightly integration, adversarial and balance runs, releases (every production deploy) and chapter-boundary parameter changes each pass a named gate, G0 to G5 (§3.9). 19 uses G1–G4 as the stage gates of its build order (19 §12.4) and requires G2 for toolchain upgrades; both uses follow §3.9. 19 cites "the G2 gate (20 §3.9)" for toolchain upgrades; that gate is defined there.
7. **Make trust visible.** A public, diegetic **Integrity Report** (§3.12) publishes money supply, invariant results, exploit-fix history and compensation totals, so players can see the game is fair (V3 Part 8).
8. **Separate edges from defects.** Strong legal performance, sometimes-successful crime and temporary scarcity are not defects (F06, R06). Every band carries a class (§3.7.1) that says whether a breach means an accounting defect, unwanted dominance, an intended-risk mis-tuning, a calibration miss or an experience problem, and each class has its own response.

---

## §2 Entities

All types follow 00 §3.1–3.2. `Id` is a string id, `Tick` an integer, `Money` a bigint in micro-units. Truth Machine entities live in the platform and harness stores (19 §11 tables `tm_*`), not in engine state, except `InvariantResult` which is part of every `TickRecord` (19 §2.2).

### §2.1 Invariants

```ts
type InvariantScope =
  | 'TICK'        // checked at P13 of every tick, before commit
  | 'PHASE'       // checked at the end of a named phase (cheap structural checks)
  | 'DAY_CLOSE'   // checked at t = 719 after accruals (heavier aggregate checks)
  | 'SNAPSHOT'    // checked when a snapshot is written (full scans)
  | 'OFFLINE'     // checked by the shadow verifier or nightly jobs over stored logs
  | 'STATIC';     // checked in CI over source code and build graph

type InvariantSeverity =
  | 'FATAL'       // tick must not commit; rollback, safe mode, halt if persistent
  | 'QUARANTINE'  // the culprit intent or entity is isolated; tick commits without it
  | 'ALERT';      // tick commits; on-call paged; case filed

interface InvariantDef {
  id: string;                    // 'INV-LED-001' etc. (§3.1); stable forever, never reused
  module: string;                // owning module number, e.g. '03'
  scope: InvariantScope;
  severity: InvariantSeverity;
  phase?: string;                // for PHASE scope, e.g. 'P7'
  description: string;           // one sentence, English, shown in the case file
  costClass: 'O1' | 'O_TOUCHED' | 'O_ENTITIES' | 'O_LOG';   // O_TOUCHED = proportional to entities written this tick
  sampling: 'NEVER';             // invariants are never sampled; every check runs every time (§3.2.6)
  sinceEngineVersion: string;
}

interface InvariantResult {      // one per tick, embedded in TickRecord.invariantResults (19 §2.2)
  checked: number;               // number of invariant evaluations performed
  failed: string[];              // InvariantDef ids that failed (empty on a healthy tick)
}

interface InvariantViolation {
  violationId: string;           // 'tmv_' + ulid
  invariantId: string;
  tick: Tick;
  partitionId: string;
  attempt: 'NORMAL' | 'SAFE_MODE';
  entityIds: Id[];               // entities involved (at most 64 listed; full list in the bundle)
  observed: string;              // canonical string of the failing quantity, e.g. "sum=−1200000 ccy=FDL"
  expected: string;
  culpritIntentIds: Id[];        // filled by bisection (§3.2.3), may be empty
  outcome: 'QUARANTINED' | 'RECOVERED_IN_SAFE_MODE' | 'PARTITION_HALTED' | 'ALERT_ONLY';
  caseId: string;                // RegressionCase created for it (§2.6)
}
```

### §2.2 Determinism and equivalence

```ts
interface EquivalenceRun {
  runId: string;                 // 'tme_' + ulid
  seedRef: SeedRef;              // §2.5
  engineVersion: string; paramsVersion: number; contentVersion: number;
  intentLogUri: string;          // the sealed intent batches replayed
  ticks: { from: Tick; to: Tick };
  partitionCounts: number[];     // DEFAULT [1, 4, 16]
  hostProfiles: string[];        // e.g. ['linux-x64-node24', 'linux-arm64-node24']
  result: 'PASS' | 'FAIL';
  firstDivergence?: {
    tick: Tick; phase: string;
    partitionCount: number; hostProfile: string;
    entityId: Id;                // first entity (canonical order) whose hash differs
    field: string;               // first differing field path
  };
}

interface ShadowVerifierState { // the live replayer (§3.11.1)
  verifierId: string;
  followingWorld: string;        // production world id
  lastVerifiedTick: Tick;
  lagTicks: number;              // live tick − lastVerifiedTick
  mismatches: number;            // since start of chapter; must be 0
  mode: 'SAME_VERSION' | 'CANDIDATE_VERSION';
}
```

### §2.3 Tests and evidence

```ts
type EvidenceCategory =
  | 'E1_UNIT'          // a pure function returns the expected value for fixed inputs
  | 'E2_PROPERTY'      // a property holds over generated inputs (fast-check)
  | 'E3_MODEL'         // an authored calculation (spreadsheet, script) outside the engine
  | 'E4_SIMULATION'    // the real engine ran headless worlds with test agents
  | 'E5_PLAYTEST'      // humans played a build
  | 'E6_LIVE';         // telemetry from the production world

interface TestRecord {
  testId: string;                // e.g. '05.AT.12' for module 05 acceptance test 12, or a file path + name
  module: string;
  category: EvidenceCategory;
  systemExercised: string[];     // engine packages or apps actually executed, e.g. ['engine/markets','engine/ledger']
  unimplementedDependencies: string[];   // stubs used; non-empty means the result cannot certify those systems
  result: 'PASS' | 'FAIL' | 'SKIPPED';
  commit: string; ranAt: Date; durationMs: number;
  artifacts: string[];           // uris: logs, screenshots, run bundles
}
```

### §2.4 Harness worlds and test agents

```ts
type WorldPreset =
  | 'MICRO'     // 1 bloc, 1 city, 30 instruments, 0 named actors: unit-like scenarios, < 1 s per game day
  | 'SMALL'     // 2 blocs, 3 cities, 80 instruments, 60 named actors
  | 'STANDARD'  // the full launch world of 00 §5.7 (5 blocs, 15 cities + Isla Serena, 400 instruments, 600 actors)
  | 'MIRROR';   // a pseudonymized fork of the latest production snapshot (§3.5.7)

interface HarnessWorldSpec {
  worldId: string;               // 'hw_' + ulid
  preset: WorldPreset;
  seedRef: SeedRef;
  engineVersion: string; paramsVersion: number; contentVersion: number;
  paramOverrides: Record<string, unknown>;   // only keys in 23; every override is printed in the report
  partitions: number;            // 1 unless the run is an equivalence or load run
  population: PopulationSpec;
  horizon: { gameDays: number } ;
  startWorldAgeDays: number;     // 0 = genesis; >0 = fast-forwarded with background agents first
  shocks: ScheduledShock[];      // forced world events for scenario runs (16 event kinds); empty = natural
}

interface PopulationSpec {
  agents: { archetype: ArchetypeId; count: number; params?: Record<string, number> }[];
  joinSchedule: 'ALL_AT_START' | { kind: 'POISSON'; perGameDay: number } | { kind: 'COHORTS'; atGameDays: number[] };
  startingCashOverride?: Money;  // absent = 00 §5.9 ($5,000)
}

interface ScheduledShock { atGameDay: number; eventKind: string; params: Record<string, unknown> }

type ArchetypeId = string;       // catalogue in §3.5.3, e.g. 'A01_PASSIVE', 'A17_ALT_RING'

interface TestAgentDef {
  archetype: ArchetypeId;
  family: 'HONEST' | 'OPTIMIZER' | 'RULE_PROBE' | 'CONFLICT' | 'LIFECYCLE' | 'ADAPTIVE';
  cadenceTicks: number;          // how often it decides (it may still hold standing orders between)
  permissions: 'PLAYER';         // always PLAYER: same intents, same views, same rate limits (§3.5.2)
  policy: string;                // id of the policy implementation in apps/harness/agents
  defaultParams: Record<string, number>;
  oracle?: string;               // exploit oracle id when the agent is a hunter (§3.6.2)
}

interface HarnessRun {
  runId: string;                 // 'hr_' + ulid
  purpose: 'BAND' | 'HUNT' | 'POPULATION' | 'ADAPTATION' | 'CALIBRATION' | 'LOAD' | 'CHAOS' | 'EQUIVALENCE' | 'REGRESSION' | 'SCENARIO';
  worlds: HarnessWorldSpec[];
  seedSet: SeedSetId;
  seedCount: number;
  bandIds: string[];             // bands evaluated by this run
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED_TO_RUN';
  evidence: 'E4_SIMULATION';
  startedAt: Date; finishedAt?: Date;
  hostWallSeconds: number;
  results: BandResult[];
  findings: FindingId[];         // exploit findings opened by this run
}
```

### §2.5 Seeds, scenarios and regression cases

```ts
type SeedSetId = 'DEV' | 'VALIDATION' | 'WITHHELD' | 'REGRESSION' | 'PLAYER_PRACTICE' | 'PLAYER_WITHHELD' | 'TOURNAMENT';

interface SeedRef {
  set: SeedSetId;
  index: number;                 // 0-based index inside the set
  // the 256-bit world seed is derived, never stored in clear outside the gate service:
  // seed = SHA-256("tycoon-seed" ‖ set ‖ index ‖ setSalt[set])
}

interface SeedSetDef {
  set: SeedSetId;
  saltHolder: 'TEAM' | 'GATE_SERVICE' | 'SERVER_ONLY';
  saltRotation: 'NEVER' | 'PER_CHAPTER' | 'PER_WEEK';
  size: number;                  // how many indices are defined
  visibleTo: ('DEV' | 'CI' | 'GATE' | 'PLAYERS')[];
}

interface RegressionCase {
  caseId: string;                // 'rc_' + ulid
  title: string;
  source: 'INVARIANT' | 'HUNT' | 'BAND' | 'EQUIVALENCE' | 'SHADOW' | 'PLAYER_REPORT' | 'SUPPORT' | 'PLAYTEST';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  bundle: ReproBundle;
  expected: 'INVARIANTS_HOLD' | 'BAND_PASS' | 'HASH_EQUAL' | 'INTENT_REJECTED' | 'CUSTOM';
  expectedDetail?: string;       // e.g. "intent ti_… rejected with MKT_SELF_MATCH"
  status: 'OPEN' | 'FIXED' | 'WONT_FIX_BY_DESIGN';   // WONT_FIX requires a 24 decision id
  decisionRef?: string;          // 24 entry when WONT_FIX_BY_DESIGN
  tier: 'FAST' | 'NIGHTLY';      // FAST runs on every pull request (≤ 30 s each)
  createdAt: Date; fixedInCommit?: string;
}

interface ReproBundle {
  engineVersion: string; paramsVersion: number; contentVersion: number;
  seedRef: SeedRef | { inline: string };   // inline only for DEV/REGRESSION seeds
  startSnapshotUri?: string;     // absent = genesis
  intentBatchesUri: string;      // canonical batches from start to failure tick
  entropyRevealsUri: string;     // revealed entropy for the replayed range (19 §3.12)
  failureTick: Tick;
  expectedLogicalHashBefore: string;   // hash at failureTick − 1
  minimized: boolean;            // true after delta-debugging (§3.10.4)
}

interface Scenario {             // named authored setups (S01–S08 of the bible, crisis templates, onboarding)
  scenarioId: string;            // 'SC_COLD_CHAIN', 'SC_CRISIS_SECURITIZATION', ...
  description: string;
  world: HarnessWorldSpec;
  scriptedSteps: { atGameDay: number; actor: ArchetypeId | 'SCRIPT'; intentKind: string; payload: unknown }[];
  checks: string[];              // band ids or acceptance-test ids evaluated
}
```

### §2.6 Bands and findings

```ts
type BandClass =
  | 'ACCOUNTING'     // breach = a defect (money from nothing, broken conservation); never shipped
  | 'DOMINANCE'      // breach = one path beats the rest without matching risk; fix the rule
  | 'INTENDED_RISK'  // breach = a risky but legitimate path (crime, leverage) is mis-tuned; retune params
  | 'CALIBRATION'    // breach = the world's statistics are off target; retune model params
  | 'EXPERIENCE'     // breach = players are harmed or confused (griefing, rookies hit); fix design
  | 'PERFORMANCE';   // breach = latency or throughput budget missed

interface BalanceBand {
  bandId: string;                // e.g. 'MKT.kurtosis', 'CON.crime_ev_ratio'; stable forever
  module: string;                // owner of the system measured
  class: BandClass;
  metric: string;                // exact definition id in the metric registry (§3.7.2)
  lower?: number; upper?: number;   // inclusive; either may be absent
  unit: string;
  seeds: 20 | 60 | 200;          // seed count for the release gate
  horizonGameDays: number;
  preset: WorldPreset;
  population: string;            // id of a PopulationSpec template (§3.5.4)
  aggregation: 'MEDIAN' | 'MEAN' | 'SHARE' | 'MAX' | 'MIN' | 'COUNT' | 'P95' | 'P99';
  gate: 'G0' | 'G2' | 'G3' | 'G5' | 'INFO';   // the lowest gate at which it blocks (§3.9); INFO never blocks
  activeWhen: string;            // feature flag or module id; a band for an unbuilt system is never shown as PASS
  source: string;                // provenance, e.g. 'vision 03 §16', 'Tape ecology hunts §4', 'DEFAULT'
}

interface BandResult {
  bandId: string; runId: string;
  value: number;
  ci95?: [number, number];       // bootstrap 95% interval over seeds
  pass: boolean;
  seedsUsed: number;
  worstSeeds: SeedRef[];         // up to 5, for regression capture
}

type FindingId = string;         // 'tmf_' + ulid
interface Finding {
  findingId: FindingId;
  huntId: string;                // §3.6 id, e.g. 'H07_SELF_IMPACT_MARK_PUMP'
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  excessValue: Money;            // oracle-measured value extracted beyond the rules' intent, per agent per game year
  reproducible: boolean;         // reproduced on ≥ 3 seeds of VALIDATION
  status: 'OPEN' | 'MITIGATED' | 'CLOSED' | 'ACCEPTED_EDGE';   // ACCEPTED_EDGE needs a 24 decision (F06)
  regressionCaseId?: string;
  ownerModule: string;
  liveExposure?: { charactersSuspected: number; firstSuspectTick?: Tick };   // filled by §3.11.3
}
```

### §2.7 Release gates and playtests

```ts
type GateId = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5';

interface GateRun {
  gateRunId: string;             // 'tmg_' + ulid
  gate: GateId;
  subject: { commit: string; engineVersion?: string; paramsVersion?: number; contentVersion?: number; moduleId?: string };
  checks: { checkId: string; category: EvidenceCategory; required: boolean; result: 'PASS' | 'FAIL' | 'SKIPPED'; detail?: string }[];
  verdict: 'PASS' | 'FAIL';
  waivers: { checkId: string; decisionRef: string; approvedBy: string[] }[];   // ACCOUNTING checks can never be waived
  signedOffBy: string[];         // staff ids (21 §3.1 roles)
  createdAt: Date;
}

interface PlaytestSession {
  sessionId: string;             // 'pt_' + ulid
  build: string;
  cohort: 'BEGINNER' | 'TRADER' | 'QUANT' | 'FINANCE_PRO' | 'GAME_DESIGNER' | 'ACCESSIBILITY';
  participants: number;
  scenarioId: string;            // §2.5
  measures: Record<string, number>;   // §3.13.2 measure ids
  notes: string;                 // de-identified observations
  evidence: 'E5_PLAYTEST';
}
```

### §2.8 Public integrity report

```ts
interface IntegrityReport {      // published weekly (§3.12); immutable once published
  reportId: string;              // 'ir_' + chapter + week, e.g. 'ir_C03W5'
  coversRealDays: { from: Date; toExclusive: Date };
  coversTicks: { from: Tick; toExclusive: Tick };
  money: {
    m0ByCcy: Record<string, Money>;   // base money at end (03)
    m2ByCcy: Record<string, Money>;   // broad money at end (03, 07)
    faucetsByReason: Record<string, Money>;
    sinksByReason: Record<string, Money>;
    stabilizer: { error: number; levers: Record<string, number> };   // 03/04
  };
  systemic: Record<string, number>;   // 07 systemic indicators: aggregate leverage, CCP default-fund usage, funding stress
  integrity: {
    ticksRun: number; ticksMissed: number;
    invariantEvaluations: number; invariantFailures: number;
    safeModeTicks: number; quarantinedIntents: number;
    shadowVerifiedThroughTick: Tick; shadowMismatches: number;
  };
  fixes: { fixId: string; publicTitle: string; severity: string; foundBy: 'TEST_AGENTS' | 'PLAYER_REPORT' | 'STAFF' | 'INVARIANT'; compensatedCharacters: number; clawbackTotal: Money; compensationTotal: Money }[];
  enforcement: { warnings: number; clawbacks: number; tempBans: number; bans: number };   // counts only (21 §3.7)
  adGrantsTotal: Money;          // 21 §3.14
  freshStartsTotal: Money;       // 14
  commitments: { entropyRootsPublished: number; revealsPublished: number };   // 19 §3.12
}
```

---

## §3 Rules and formulas

### §3.1 The invariant catalogue

**Rule 3.1.1 (registration).** Every engine module exports `invariants.ts` (19 Rule 3.1.3). Each export is an `InvariantDef` plus a pure check function `check(ctx: InvariantCtx): InvariantOutcome`. `InvariantCtx` gives read access to the tick's pending writes (the store's write set), the queued postings for P13, the pre-tick committed state and the tick's events. Check functions are pure, deterministic and allocation-bounded; they follow the same determinism lint rules as engine code (19 §3.6.2). The ids below are the launch catalogue; modules may add more (new ids, never reused). The owner listed is the module whose rule the invariant protects; 20 owns the framework and the catalogue numbering.

**Rule 3.1.2 (notation).** `Σ` over postings means over all postings queued in this tick for P13. `bal(a, ccy)` is the balance of account `a` in currency `ccy` after the tick's postings are applied. "Holder" means the entity whose balance sheet holds an asset (03).

#### §3.1.3 Ledger and money (owner 03)

| Id | Scope | Severity | Invariant |
|---|---|---|---|
| INV-LED-001 | TICK | FATAL | Double entry: for every `entryId`, Σ debits = Σ credits, per currency. No single-sided posting exists |
| INV-LED-002 | TICK | FATAL | Every posting has a `reason` registered in 03's reason-code table, and that code's class is exactly one of FAUCET, SINK, TRANSFER, CREDIT_CREATE, CREDIT_DESTROY, REVALUE (00 §5.4) |
| INV-LED-003 | TICK | FATAL | Base money: ΔM0(ccy) over the tick = Σ FAUCET amounts(ccy) − Σ SINK amounts(ccy), exactly, in micro-units. No other class changes M0 |
| INV-LED-004 | TICK | FATAL | Broad money: ΔM2(ccy) − ΔM0(ccy) = Σ CREDIT_CREATE(ccy) − Σ CREDIT_DESTROY(ccy) |
| INV-LED-005 | TICK | FATAL | TRANSFER postings move value only between two non-`sys` entities or between a non-`sys` entity and a `sys` clearing account that nets to zero within the same tick |
| INV-LED-006 | TICK | FATAL | REVALUE postings never touch cash or deposit accounts (marks only) |
| INV-LED-007 | TICK | FATAL | Every posting's `amount` > 0 and is an integer number of micro-units; zero and negative postings are rejected (direction is carried by debit/credit) |
| INV-LED-008 | TICK | FATAL | No cash or deposit account is negative unless the holder has an overdraft or credit facility (07) recorded for that account, and the negative balance ≤ the facility limit |
| INV-LED-009 | TICK | FATAL | Postings commit only at P13; no module wrote a balance directly (the store write set contains no balance field changed outside the ledger writer) |
| INV-LED-010 | DAY_CLOSE | FATAL | Trial balance: across all entities, Σ assets − Σ liabilities − Σ equity = 0 per currency (03 chart of accounts) |
| INV-LED-011 | DAY_CLOSE | ALERT | Every FAUCET and SINK reason code's daily total is within its 23 alarm range; `ACCT_REWARDED_AD` (lots tagged `AD_GRANT`) above 0.01% of the day's net mint pages on-call (21 §3.14.9) |
| INV-LED-012 | TICK | FATAL | Conversion rule: every Money value created this tick came through `toMoney` (00 §3.1); detected by the store's provenance tag on Money writes |
| INV-LED-013 | SNAPSHOT | FATAL | Recomputing every balance by folding the postings archive from genesis (or the last verified snapshot) equals the snapshot's balances |
| INV-LED-014 | TICK | FATAL | Restricted-cash lots (14 `RestrictedCashLot`, tags `AD_GRANT`, `FRESH_START`): Σ lot remaining ≤ the holder's cash balance, and no posting for a use the tag forbids (21 §3.14.6, 14) consumed a lot inside its window (FIFO) |

#### §3.1.4 Balance sheets, ownership and collateral (owners 03, 06, 07, 08, 09)

| Id | Scope | Severity | Invariant |
|---|---|---|---|
| INV-BS-001 | TICK | FATAL | Net worth is derived, never stored: any stored NW field is a cache that equals the derivation from the balance sheet at that tick (V3 2.1) |
| INV-BS-002 | TICK | FATAL | A character's equity may go negative only if this tick contains a recorded cause event (liquidation shortfall, judgment, default) referencing that character (V3 Part 8) |
| INV-BS-003 | TICK | FATAL | Units outstanding: for every security, Σ holdings across all holders (including treasury stock and the CCP) = units outstanding recorded by the issuer (06) |
| INV-BS-004 | TICK | FATAL | Ownership chain: every entity has exactly one `ownerId` chain ending at a `chr`, `npc`, `gov` or `sys` (00 §5.3), and the chain has no cycle |
| INV-BS-005 | TICK | FATAL | Equity stakes in any company sum to exactly 100% of issued shares (no over-issuance by contract, 09) |
| INV-BS-006 | TICK | FATAL | Collateral is never double-pledged: each collateral unit (cash, security lot, property, collectible, receivable) has at most one active pledge record across loans, repo, margin, securities lending and contracts (07) |
| INV-BS-007 | TICK | FATAL | Rehypothecation only where permitted: a pledged unit re-used by the secured party appears only under a product type whose 07 rules allow re-use, and the chain length ≤ `PARAM.inv_rehypo_max_chain = 1` |
| INV-BS-008 | TICK | FATAL | Consolidation: intercompany balances eliminate exactly; a group's consolidated NW never exceeds Σ standalone NW of its members minus intercompany equity (03 consolidation, I06) |
| INV-BS-009 | TICK | FATAL | Every property, business and Unique collectible has exactly one holder (10, 09, 14) |
| INV-BS-010 | TICK | FATAL | Escrow: assets in a contract escrow (15) are not counted as available to either party for any other use |
| INV-BS-011 | TICK | FATAL | Holds: for every character, Σ active holds (open orders, pending intents, cross-partition transfers in flight) ≤ available balance before the holds (19 §3.5.3) |
| INV-BS-012 | TICK | FATAL | Cross-partition money: every hold placed for a cross-partition transfer is either settled or released within `PARAM.inv_xpart_settle_max_ticks = 2` ticks (00 §5.7) |

#### §3.1.5 Markets, clearing and finance (owners 05, 06, 07, 08)

| Id | Scope | Severity | Invariant |
|---|---|---|---|
| INV-MKT-001 | PHASE P6 | FATAL | Uniform price: all fills of one asset's batch auction in one tick have the same price (05) |
| INV-MKT-002 | PHASE P6 | FATAL | No self-match: a fill never has the same beneficial owner on both sides (05; linked-account matches are flagged, not blocked, per 15) |
| INV-MKT-003 | PHASE P6 | FATAL | Fill quantity: per asset per tick, Σ buy fills = Σ sell fills; no fill exceeds its order's remaining quantity; limit orders never fill through their limit |
| INV-MKT-004 | PHASE P6 | FATAL | Halted assets produce no fills (05 halts, 21 §3.3) |
| INV-MKT-005 | TICK | FATAL | Every printed price is > the asset's floor and finite; circuit-breaker bounds of 05 hold |
| INV-MKT-006 | PHASE P6 | FATAL | Ordering inside a tick depends only on `orderKey` (19 §3.4.4), never on arrival time or gateway |
| INV-CCP-001 | PHASE P7 | FATAL | Novation: for each cleared trade, the CCP holds equal and opposite positions, and its net position per contract is zero |
| INV-CCP-002 | PHASE P7 | FATAL | Default waterfall order: losses are allocated strictly in 07's layer order (defaulter margin, defaulter fund contribution, CCP capital, mutualized fund, then assessments); no layer is touched while an earlier one has capacity |
| INV-CCP-003 | PHASE P7 | FATAL | Variation margin nets to zero across all members each tick |
| INV-BNK-001 | DAY_CLOSE | FATAL | A bank's reported capital ratio equals the recomputation from its balance sheet; a bank below its minimum is in the 07 resolution state, never "ACTIVE" |
| INV-BNK-002 | TICK | FATAL | Every loan origination posts CREDIT_CREATE equal to the deposit created; every repayment of principal posts CREDIT_DESTROY |
| INV-FND-001 | DAY_CLOSE | FATAL | Fund NAV = (Σ marked assets − Σ liabilities) / units outstanding, within one micro-unit per unit (08) |
| INV-FND-002 | TICK | FATAL | A fund manager can never withdraw investor assets except through 08's fee and redemption rules (ROADMAP M42; property test over 10k random action sequences, §3.4.3) |
| INV-FND-003 | TICK | FATAL | Securitization waterfall: SPV cash distributions follow the tranche priority of the deal and never exceed collections (08) |
| INV-INS-001 | TICK | FATAL | Insurer claim payments come from the insurer's balance sheet or reinsurance recoverables; an insurer with insufficient funds enters 08 run-off, never pays from nothing |

#### §3.1.6 Conflict, law and fairness rules (owners 12, 13, 14, 15)

| Id | Scope | Severity | Invariant |
|---|---|---|---|
| INV-CON-001 | PHASE P10 | FATAL | Breach probability for any resolved op is ≥ 0.01 when AP ≥ DP_eff/8 and ≤ 0.90 always (L2, 12 AT 2–3) |
| INV-CON-002 | PHASE P10 | FATAL | No hidden session's progress P exceeds 0.85 (L3) |
| INV-CON-003 | PHASE P10 | FATAL | Concurrent hostile sessions per victim ≤ 3; per attacker ≤ tier cap (12) |
| INV-CON-004 | PHASE P10 | FATAL | Cash loot per op ≤ min(10% of victim liquid cash, 2% of victim NW) before the r-scaling (03 §13.2, 12 AT 17) |
| INV-CON-005 | PHASE P10 | FATAL | No op resolves against a character inside its 72 h protection, dormant, or ineligible Rookie-zone state (12 AT 22) |
| INV-CON-006 | TICK | FATAL | All loot between characters posts as TRANSFER; no op mints base money (12 AT 20) |
| INV-CON-007 | PHASE P10 | FATAL | Hostile and legitimate connection entries serialize identically (12 AT 13): the client delta schema has no field that differs by hostility |
| INV-LAW-001 | PHASE P11 | FATAL | Held never exceeds 24 real hours per verdict (17,280 ticks) online; in the sandbox and practice worlds Held never applies (13 §3.10, §3.15) |
| INV-LAW-002 | PHASE P11 | FATAL | Crime and court never take a character below $5,000 liquid plus one T1 business (03 §13.5 floor); excess becomes garnishment |
| INV-LAW-003 | PHASE P11 | FATAL | Fines are computed on max(NW at offense, NW at verdict) (03 §14 #6) |
| INV-LAW-004 | TICK | FATAL | Reputation is never an input to verdict probability, fine size or legal fee (MASTER-BIBLE decision 5): enforced by the dependency graph of 13's verdict function (STATIC check INV-STR-006) plus a runtime check that the verdict function's declared inputs match |
| INV-SOC-001 | TICK | FATAL | Ladder rewards, tournament rewards and challenge rewards never post money (01 §14.4); any posting with a reward reason other than the listed non-cash ones fails |
| INV-SOC-002 | TICK | FATAL | Challenge portfolios are ring-fenced: no posting moves value between a challenge portfolio and any real-economy account (02 §2.4) |
| INV-SOC-003 | TICK | FATAL | P2P caps by account age (15) hold for every P2P transfer and contract payment |
| INV-PRG-001 | TICK | FATAL | Rank never decreases (14); a character's rank equals the 14 threshold function of its peak liquidation-value NW, where the peak uses the crowd-exit valuation (§3.6, H08) |
| INV-PRG-002 | TICK | FATAL | Purchased cosmetics never enter Prestige, Reputation, Notoriety, NW or any engine state (L7); the engine has no entity or field that references an entitlement (also STATIC INV-STR-002) |

#### §3.1.7 Engine structure, determinism and privacy (owners 02, 19)

| Id | Scope | Severity | Invariant |
|---|---|---|---|
| INV-ENG-001 | TICK | FATAL | Write ownership: every entity written this tick was written only by its owning module (19 Rule 3.1.3 ownership tables) |
| INV-ENG-002 | TICK | FATAL | RNG discipline: every random draw came from a named 02 stream; the per-stream draw counters advanced only by draws recorded in the tick's RNG ledger |
| INV-ENG-003 | TICK | FATAL | ID determinism: every id created this tick equals `hash(worldSeed, kind, creationTick, sequence)` (00 §3.2), and no id collides with an existing id |
| INV-ENG-004 | TICK | FATAL | Event sequence: event `seq` values in the tick are dense from 0 and in canonical order (19 §3.6.4) |
| INV-ENG-005 | TICK | FATAL | Visibility: no `PRIVATE`, `PARTIES` or `SEALED` event, and no field derived from one, appears in a delta addressed to a recipient outside its `partyIds` (L11). Checked by the delta builder's recipient filter assertion at P14 |
| INV-ENG-006 | TICK | FATAL | Phase discipline: no module read a value written later in the same tick's pipeline than its own phase (00 §5.2), detected by the store's phase stamps |
| INV-ENG-007 | TICK | FATAL | Time: the tick number is exactly previous + 1; calendar hooks fired exactly at their boundary ticks (02) |
| INV-ENG-008 | OFFLINE | FATAL | Replay: re-running any committed tick range from its snapshot and batches reproduces every `TickRecord.logicalStateHash` (§3.3) |
| INV-ENG-009 | OFFLINE | FATAL | Partition equivalence: 1, 4 and 16 partitions give identical `logicalStateHash` sequences and identical canonical event streams (§3.3.3) |
| INV-ENG-010 | TICK | ALERT | Phase budgets: no phase exceeded its wall-time budget of 19 by more than 2×; a tick whose total exceeds `PARAM.tm_tick_alert_ms = 3500` pages on-call |

#### §3.1.8 Static (CI) invariants (owners 19, 20, 21)

| Id | Invariant |
|---|---|
| INV-STR-001 | `packages/engine/**` imports nothing outside its allowed set (19 Rule 3.1.2): no Node built-ins, no network, no clock, no filesystem, no `Math.random`, no `Date`, no `platform`, no `ui` |
| INV-STR-002 | **Purchase code can never import the engine package.** No file under the commerce paths (`apps/web/store/**`, `apps/jobs/commerce/**`, `packages/platform/commerce/**`, 21 §3.13) has a direct or transitive import of `packages/engine` or of any package that itself imports it. Checked on the resolved module graph, not by grepping. `DEFAULT (Mathis may override)`: this is a hard CI failure with no waiver path |
| INV-STR-003 | The engine never imports `packages/platform/commerce`, the entitlement tables' schema module, or the ad module |
| INV-STR-004 | The world process's runtime configuration contains no credentials for the commerce schema or the ad-network keys (deployment manifest check, 19 §3.14) |
| INV-STR-005 | Every intent kind registered in `packages/protocol` has a validator and a handler in exactly one engine module, and an entry in that module's spec "Player intents" section (doc-sync check over the spec's intent list exported to `docs/intents.json`) |
| INV-STR-006 | Function-input whitelists: 13's verdict, fine and fee functions have no parameter of type Reputation or Prestige; 12's breach and detection functions have no parameter of type Prestige (heat multiplies exposure only, MASTER-BIBLE decision 4) |
| INV-STR-007 | Every PARAM read in code exists in the 23 registry with a default and a range; every 23 key is read somewhere or marked `RESERVED` |
| INV-STR-008 | Every string shown to players is a key present in both `en` and `fr` catalogues (L8); French coverage 100% at G4 |
| INV-STR-009 | No content string in 22 or the i18n catalogues matches the real-brand block list (L6, 21 §3.8.3) |
| INV-STR-010 | No code path in `packages/engine` or `apps/web` produces a random reward amount for anything bought or watched (L7, L5): the reward functions for ads and purchases are constants or table lookups, checked by an AST rule that forbids RNG calls in `rewards/**` |

### §3.2 Invariant execution and failure handling

**Rule 3.2.1 (when checks run).** TICK invariants run in P13 after postings are staged and before commit, on every partition, over that partition's write set; the aggregate ones (INV-LED-003, -004) are computed per partition as partial sums and summed by COORD at the P13 barrier before COORD issues commit (19 §3.3). PHASE invariants run at the end of their phase on the partitions of the kind that runs that phase. DAY_CLOSE invariants run in P13 of the tick with tick-of-day 719. SNAPSHOT invariants run in the snapshot writer against the serialized state before upload; a failing snapshot is not uploaded and the previous one stays current. OFFLINE invariants run in the shadow verifier (§3.11.1) and in nightly jobs.

**Rule 3.2.2 (failure ladder for FATAL).** When any FATAL invariant fails on tick `T`:
1. The partition reports `PhaseDone(P13, failed=[ids])`. COORD does not commit `T` anywhere; every partition calls `rollback(T)` (19 §2.6).
2. **Safe-mode replay** (02): COORD re-runs tick `T` from the committed state of `T − 1` with every partition in single-threaded safe mode (extra assertions on, per-phase invariant checks for every scope, phase outputs logged in full).
3. If safe mode passes all invariants, its result commits with `TickRecord.safeMode = true`, a `tm.safe_mode.recovered` event is emitted (internal) and a RegressionCase of severity HIGH is filed with the normal-mode failure (the discrepancy between modes is itself a determinism defect).
4. If safe mode fails, COORD runs **bisection** (Rule 3.2.3) to find culprit intents.
5. If bisection isolates culprit intents, those intents are **quarantined** (Rule 3.2.4) and tick `T` commits without them.
6. If bisection finds no culprit (the failure happens with zero player intents, i.e. a system defect), COORD sets world status `HALTED_EXCHANGE` (19 `WorldStatus`), clients show the diegetic "Trading halted by the Exchange" overlay (17), on-call is paged at incident level INC-1 (21 §3.17), and the world waits at tick `T − 1` committed. Resume needs a hotfix deploy that passes the FAST regression for this case (§3.9 G4 hotfix path).
7. In every branch, an `InvariantViolation` record and a RegressionCase with a full ReproBundle are written.

**Rule 3.2.3 (bisection).** Let `B` be tick `T`'s sealed intents in canonical order (system inputs are never bisected out; they are re-applied in all trials). Trials re-run tick `T` in safe mode with a subset of `B`:
```
candidates = B
while |candidates| > 1 and trials < PARAM.tm_bisect_max_trials (default 24):
    half = first ⌈|candidates|/2⌉ of candidates (canonical order)
    if run(T, intents = B − half) passes: candidates = half          // culprit is inside half
    else if run(T, intents = B − (candidates − half)) passes: candidates = candidates − half
    else: break                                                       // interaction between both halves
culprits = candidates if run(T, B − candidates) passes else ∅
```
Total bisection wall time is bounded by `PARAM.tm_bisect_budget_ms = 20000`; if the budget runs out with no culprit, branch 6 of Rule 3.2.2 applies. Bisection uses only the intents of tick `T`; it never drops intents of earlier ticks. Because ordering inside a tick depends only on `orderKey` (INV-MKT-006), removing intents does not reorder the rest.

**Rule 3.2.4 (quarantine).** A quarantined intent is rejected with `IntentResult.status = 'REJECTED'`, `rejectCode = 'SYS_QUARANTINED'` and the localized message "This action could not be processed and has been sent for review. Nothing was charged." Its actor is not penalized and not flagged for cheating on that basis alone. A second quarantine for the same `(actorId, kind)` within `PARAM.tm_quarantine_repeat_window_ticks = 17280` (1 real day) places a temporary block on that intent kind for that actor until a staff member clears it in the admin console (21 §3.6), because a reproducible culprit may be an exploit in progress. The quarantined intents and their actors are attached to the RegressionCase.

**Rule 3.2.5 (QUARANTINE-severity invariants).** Some invariants name a single entity as the fault (for example INV-BS-011 holds exceeding balance for one character). For these, the partition rejects the specific intent or phase message that produced the write, re-runs only that entity's work for the phase (the store supports per-entity undo within a tick), and the tick continues. If the per-entity re-run still fails, escalate to Rule 3.2.2.

**Rule 3.2.6 (no sampling).** Invariants are never sampled or skipped for performance. If the invariant budget threatens the tick budget, the response is optimization or more partitions, never fewer checks. Budget: `PARAM.tm_invariant_budget_share = 0.10` (invariants may use up to 10% of P13's budget at the STANDARD preset and 100k CCU target, measured in the load gate §3.14).

**Rule 3.2.7 (ALERT-severity).** The tick commits; an internal `tm.invariant.alert` event is emitted; the Truth Machine dashboard shows it; on-call is paged for INC-3 or higher per 21 §3.17's table; a RegressionCase of severity MEDIUM is filed.

### §3.3 Determinism and partition equivalence

**Rule 3.3.1 (hashes).** 19 defines two hashes per tick: `worldHash` (Merkle root over partition hashes, depends on the partition map) and `logicalStateHash` (partition independent, 19 §3.6.6). The Truth Machine's equivalence claims are always about `logicalStateHash` plus the **canonical event stream digest** `eventDigest(T) = SHA-256(canonical encoding of all EngineEventRow of tick T in seq order, excluding originPartition)` and the **posting digest** `postingDigest(T)` defined the same way over committed postings sorted by `(entryId, debitAccount, creditAccount)`.

**Rule 3.3.2 (the equivalence statement).** For any seed, params version, content version, engine version and sealed intent log, the triple `(logicalStateHash(T), eventDigest(T), postingDigest(T))` is identical for every tick `T` when the world runs as **1, 4 or 16 partitions** (`PARAM.tm_equivalence_partition_counts = [1, 4, 16]`, `DEFAULT (Mathis may override)`), on every supported host profile, and when resumed from any snapshot instead of genesis. This is INV-ENG-009.

**Rule 3.3.3 (how partition maps are chosen for the test).** For a partition count `k`:
- `k = 1`: everything in one partition (one process, one worker).
- `k = 4`: COORD; one PLAYER partition; one MARKET partition holding all asset groups; one partition holding CITY, FINANCE, CCP and ACTOR shards.
- `k = 16`: COORD; 4 PLAYER hash ranges; 4 MARKET asset groups (equities, rates and FX, commodities and crypto, derivatives); 3 CITY groups; FINANCE; CCP; ACTOR; plus one spare that receives a partition move at a snapshot boundary mid-run (exercises 19 §3.5.6 rebalancing).
A nightly run also draws one **random partition map** with 2–24 partitions from stream `tm:partitionmap` (harness RNG, not world RNG) so the property is tested beyond the three fixed shapes.

**Rule 3.3.4 (first-divergence search).** On a mismatch at tick `T`, the runner compares per-entity hashes (19 `Snapshot.logicalEntityHashes`, computed on demand at `T`) between the runs, sorts differing entity ids canonically, then replays tick `T` phase by phase on both configurations and reports the first phase whose outputs (phase messages, events, postings) differ for the first differing entity, down to the first differing field path. The result fills `EquivalenceRun.firstDivergence` and a CRITICAL RegressionCase.

**Rule 3.3.5 (host profiles).** Supported host profiles are the cross product of CPU architecture {x64, arm64} and the pinned Node.js minor (19 Rule 3.1.4). Every nightly G2 runs equivalence on both architectures. A toolchain upgrade (Node minor, V8 flags, dependency of `engine/core`) runs a 7-game-day STANDARD world on old and new toolchains and compares all three digests every tick (part of G2).

**Rule 3.3.6 (version replay).** Every deploy of a new engine version runs the last full game day of production on the candidate version against the production intent batches (02 §3.3 of the old vision, 19). Ticks must be identical except where the release notes declare an intended behaviour change; for intended changes, the candidate's divergence must start at or after the change's effective tick (changes take effect only at the declared tick, never retroactively, 21 §3.4).

**Rule 3.3.7 (sandbox and Academy worlds).** The browser sandbox (19 §3.17) and Academy practice worlds (18) run the same `packages/engine` bundle. A G2 check runs a 30-game-day MICRO world in the browser build (headless Chromium, Web Worker) and in Node and compares `logicalStateHash` every tick.

### §3.4 Test layers and evidence categories

**Rule 3.4.1 (evidence never merges).** Every report (gate run, band report, module status, integrity report) groups its claims by `EvidenceCategory` and states `systemExercised` and `unimplementedDependencies`. A claim backed only by E3 (an authored calculation) is labelled "modelled, not run". A simulation that used a stub for module X cannot certify X (B07). A gate counts a check only in the category it was run in.

**Rule 3.4.2 (E1 unit tests).** Every rule in every module spec that contains a formula or a worked example has a unit test with that example as a fixture (golden test). Every acceptance test numbered in a module's §10 that is a pure-function statement is an E1 test named `<module>.AT.<n>`. Floating tolerance in model math is `1e-9` relative unless the spec says otherwise; Money comparisons are exact.

**Rule 3.4.3 (E2 property tests).** Each engine module ships property tests with fast-check (19 Rule 3.1.4) for at least the properties below. Each property runs `PARAM.tm_property_runs_pr = 200` generated cases on pull requests and `PARAM.tm_property_runs_nightly = 10000` nightly, with the failing case shrunk and saved as a RegressionCase.

| Module | Required properties |
|---|---|
| 02 | `step` is a pure function of (state, batch, entropy); serialization round-trips byte-identically; RNG streams are independent (drawing more from stream A never changes stream B's sequence) |
| 03 | any random sequence of valid postings keeps INV-LED-001..010; consolidation of any random group tree eliminates intercompany exactly; `toMoney` is round-half-to-even for every float in [−1e15, 1e15] |
| 05 | for any random order book, the batch auction clears at a price that maximizes executed volume (05's rule), respects all limits, and is invariant to permutation of orders with equal `orderKey` order |
| 06 | put-call parity, futures basis and ETF NAV relations hold within fees for any generated market state (01 §9 parities by construction) |
| 07 | any random sequence of loans, repayments, margin calls and defaults keeps INV-BS-006, INV-CCP-001..003, INV-BNK-002; the waterfall order holds for any loss size |
| 08 | a fund manager acting through any random sequence of allowed intents never ends with investor assets in the manager's own account beyond fees (ROADMAP M42: 10k sequences) |
| 09 | business valuation after any upgrade-and-sell loop never exceeds cost (01 §9: 15% haircut, 70% upgrade reflection) |
| 12 | `p_breach ∈ [0.01, 0.90]` for AP ≥ DP_eff/8; P ≤ 0.85; loot caps hold for any r |
| 13 | fine = f(max(NW_offense, NW_verdict)); floor never breached; Held ≤ 24 h |
| 15 | collusion graph voiding is idempotent; P2P caps hold for any sequence of transfers and contract payments |
| 19 | canonical encoding is injective on the intent schema; signature verification rejects any single-bit change |
| 21 | ad eligibility: for any sequence of NW changes and ad completions within a local day, grants ≤ 10 and each grant only on a day whose start-of-day NW < $1,000 (§3.7.9 bands) |

**Rule 3.4.4 (E4 simulation tests).** Everything in §3.5–§3.8. Every E4 run records its HarnessRun and is reproducible from its seeds.

**Rule 3.4.5 (contract tests).** `packages/protocol` schemas are tested in both directions (client encodes → server decodes; server deltas → client store) for every intent kind and channel, including the error codes. A protocol version bump requires the previous minimum client to pass the contract suite or to be force-updated (17 forced update).

**Rule 3.4.6 (e2e).** Playwright suites (19) run the web client against a STANDARD staging world at 1440 px and 390 px. Required e2e families: onboarding first session (18), Broker order lifecycle, every CostConfirmSheet and HoldToConfirm flow (17), Boutique purchase (21) with the sandbox store backends, rewarded-ad offer visibility (21 §3.14), privacy export and deletion (21 §3.10), no-leak checks (Rule 3.4.7), accessibility (axe, zero serious violations).

**Rule 3.4.7 (no-leak checks, L11).** A family of automated checks proves nothing leaks a player's strategy, style or holdings:
- **Delta audit:** for a STANDARD world with 200 test agents, every delta sent to agent A is checked against the set of facts A is entitled to (own state, public events, PARTIES events with A as party, filings, espionage results A legitimately obtained). Any other fact is a failure. Implemented by tagging every engine field with its visibility class and asserting at the gateway encoder in the harness build.
- **Inference probe:** an OPTIMIZER agent (A24, §3.5.3) is rewarded for predicting another agent's holdings from everything it can see. Its prediction accuracy must not exceed the accuracy of a baseline predictor that sees only public filings and aggregate flow (band PRV.inference_lift, §3.7.10).
- **Client storage:** the client stores no other player's private data in IndexedDB, localStorage or caches (e2e, adapted from the Tape `assertNoLeak` convention).
- **Hidden sessions:** INV-CON-007 plus a byte-diff test of `me.connections` payloads with and without a hostile session (12 AT 13).

### §3.5 The simulation harness and game-balance test agents

**Rule 3.5.1 (the harness host).** `apps/harness` (19) builds headless worlds from `HarnessWorldSpec`, runs them with the production `packages/engine` bundle, drives test agents through `packages/sdk`'s bot SDK, and writes HarnessRun results to ClickHouse (`tm_runs`, `tm_band_results`, `tm_findings`). Harness worlds have no wall clock: the tick driver advances as soon as all phases finish. A harness world never connects to production stores, buses or players. Harness seeds come only from DEV, VALIDATION, WITHHELD and REGRESSION sets (§3.10).

**Rule 3.5.2 (player-level permissions only, B03).** A test agent is a character created through the normal account and character flow of the harness world. It:
1. submits only intents of registered kinds, through the same P1 validation, rate limits (20 intents per tick, 2,000 DU per tick for its AIs, 00 §5.5) and license gates as a human;
2. observes only through the same channels and read views a client of that character could subscribe to (17 channel table, 19 `queryView` with a `ViewerContext` of that character);
3. has no access to engine internals, other agents' state, RNG streams, the world seed or future entropy;
4. may coordinate with other agents only through in-game means (contracts, alliances, chat messages in the harness chat channel), except agents of a declared ring (A16–A18), whose coordination is out-of-band by design because real alt rings coordinate out-of-band;
5. is subject to the same anti-cheat detection as players (15), and the detection outcome is itself measured (bands SOC.*).
Only **probe** instrumentation (the delta audit, oracles) reads full state, and probes never feed information back to agents during a run.

**Rule 3.5.3 (archetype catalogue).** Launch catalogue; each archetype is a policy in `apps/harness/agents/<id>.ts` with the listed parameters drawn per agent from the ranges (stream `tm:agentparams`). Decisions use only the agent's observations. Families: HONEST (play as intended), OPTIMIZER (maximize NW by any legal-or-not game move), RULE_PROBE (target one rule boundary), CONFLICT (use 12/13 game verbs), LIFECYCLE (join late, go dormant, bust, return), ADAPTIVE (self-tuning, §3.5.5).

| Id | Name | Family | What it does (game moves only) | Key parameters (range) |
|---|---|---|---|---|
| A01 | Passive investor | HONEST | Buys a diversified basket monthly, holds, rebalances quarterly | equity share 0.4–0.9 |
| A02 | Active trader | HONEST | Trades momentum and value signals on 5–20 names, uses stops | lookback 5–63 days, stop 3–12% |
| A03 | Quant | HONEST | Builds strategy graphs (11) with factor signals; validates on withheld practice seeds before deploying | DU budget per tier, capital 10–60% |
| A04 | Macro trader | HONEST | Expresses rate, FX and curve views from 04 releases | leverage 1–3× |
| A05 | Credit investor | HONEST | Buys bonds, CDS, tranches; distressed buying after defaults | max rating drop tolerance |
| A06 | Business builder | HONEST | Buys and upgrades businesses (09), hires, expands cities | reinvest share 0.5–0.95 |
| A07 | Founder | HONEST | Founds a company, raises, IPOs, does M&A and LBOs (09) | leverage at LBO 3–6× EBITDA |
| A08 | Property investor | HONEST | Buys, mortgages, develops property (10) | LTV 0.5–0.8 |
| A09 | AI lab | HONEST | Runs the 11 pipeline; licenses models; defends | training share of income 0.1–0.5 |
| A10 | Banker | HONEST | Charters a bank (07), sets lending policy, manages liquidity | target capital ratio, loan growth |
| A11 | Fund manager | HONEST | Runs a player fund (08), raises from other agents | strategy class, fee 1/10–2/20 |
| A12 | Insurer | HONEST | Writes cover and buys reinsurance (08) | retention share |
| A13 | Market maker | HONEST | Quotes two-sided markets, manages inventory (05, 06) | quote width, inventory limit |
| A14 | Lifestyle spender | HONEST | Spends a share of income on 14's catalogue, hosts | spend share 0.05–0.4 |
| A15 | Whale defender | HONEST | Top-wealth agent investing heavily in defense (12) | defense share of income |
| A16 | Alt ring | OPTIMIZER | 2–6 linked accounts funnelling value to a main via P2P, contracts, off-market trades, staged lawsuits | ring size, funnel channel mix |
| A17 | Collusion pair | OPTIMIZER | Two "rivals" who trade, sue, insure and "hack" each other to move value | channel mix |
| A18 | Wash ring | OPTIMIZER | Linked accounts trading with each other to lift marks, volume or peaks | clip count 1–720 |
| A19 | Greedy optimizer | OPTIMIZER | Greedy search over all intents each game day for maximum one-day expected NW gain under its observations | search width |
| A20 | Opportunist (crime) | CONFLICT | Runs 12's ops when the shown EV is positive; launders per 12 rules | risk appetite 0.2–0.9 |
| A21 | Serial pressure | CONFLICT | Targets one victim repeatedly within the rules' limits | target selection rule |
| A22 | Alliance raider | CONFLICT | Coordinates joint ops with alliance mates | alliance size 3–20 |
| A23 | Litigator | CONFLICT | Files cases (13), including weak ones, sells cases, buys cases | filing threshold |
| A24 | Inference probe | OPTIMIZER | Predicts other agents' holdings and strategies from everything it can see (Rule 3.4.7) | model class |
| A25 | Market-conduct probe | CONFLICT | Squeezes, false stories, short campaigns, ramping using only player-available verbs (12 market-conduct) | campaign size |
| A26 | Newcomer | LIFECYCLE | Follows the onboarding path of 18, small and cautious | — |
| A27 | Late joiner | LIFECYCLE | Joins at world age 30, 180, 365 game-days-equivalent of real time and plays A06 or A02 | join age |
| A28 | Dormant returner | LIFECYCLE | Plays 2 weeks, goes dormant 14/30/90 real days, returns | absence length |
| A29 | Broke player | LIFECYCLE | Keeps NW under $1,000 by spending, watches the maximum ads, takes fresh starts | strategy to stay eligible |
| A30 | Bust farmer | LIFECYCLE | `yolo_bust`: all-in on highest-vol licensed asset; busts when NW < $1,000, takes fresh start and best perk, repeats (Tape §4) | — |
| A31 | Tournament overfitter | OPTIMIZER | Tunes a strategy graph on public practice seeds to maximize tournament score (11) | search budget |
| A32 | Exit-scam manager | OPTIMIZER | Runs a fund and tries every allowed intent sequence to extract investor value (08, ROADMAP Q6) | — |
| A33 | Mark pumper | RULE_PROBE | Splits buys into K clips to lift its own mark and peak (Tape §6) | K ∈ {1, 30, 720} |
| A34 | Ad timer | RULE_PROBE | Moves its timezone, device clock and NW around local midnight to get more than 10 ads or ads while ineligible | — |
| A35 | Restricted-cash probe | RULE_PROBE | Tries every forbidden use of `AD_GRANT` and `FRESH_START` cash inside the window | — |
| A36 | Rookie hunter | RULE_PROBE | Tries to target protected, Rookie-zone, dormant and offline players | — |
| A37 | Collateral juggler | RULE_PROBE | Pledges the same asset across loan, repo, margin and contract escrow in one tick and across ticks | — |
| A38 | Appraisal inflater | RULE_PROBE | Inflates property and collectible appraisals through related-party sales, then borrows against them | — |
| A39 | Consolidation gamer | RULE_PROBE | Builds holding structures with intercompany loans, cross-holdings and circular ownership to inflate group NW | — |
| A40 | Insurance stager | RULE_PROBE | Insures, then arranges losses through linked accounts or its own ops | — |
| A41 | Rival front-runner | RULE_PROBE | Computes NPC rival funds' next picks from public data and trades ahead (Tape §1) | K, N ticks |
| A42 | Event timer | RULE_PROBE | Trades world-event phases (crash buyer, flash dip, bubble timer; Tape §3) | hold horizon |
| A43 | Rumor follower | RULE_PROBE | Trades every rumor blind, and tracked sources (Tape §2) | source threshold |
| A44 | Concession squatter | RULE_PROBE | Tries to keep a unique concession or bottleneck forever (F04, 01 §14.2) | — |
| A45 | Stabilizer gamer | RULE_PROBE | Times activity around stabilizer lever changes and NWI rebases | — |
| A46 | NPC exploiter | ADAPTIVE | Learns the response of named NPC actors (16) and NPC liquidity (05) and trades against it | — |
| A47 | Generic adaptive | ADAPTIVE | Policy search over the whole intent space with a NW reward (§3.5.5) | — |

**Rule 3.5.4 (population templates).** Bands name a population template. Launch templates (counts are per 1,000 agents; a STANDARD band run uses 2,000 agents unless stated):

| Template | Mix |
|---|---|
| POP_BASELINE | A01 150, A02 150, A03 60, A04 40, A05 30, A06 150, A07 40, A08 100, A09 50, A10 10, A11 20, A12 10, A13 20, A14 60, A15 10, A20 40, A23 20, A26 40 |
| POP_CONFLICT | POP_BASELINE with A20 120, A21 30, A22 60 (in 3–20 alliances), A15 30, A23 40 replacing A01 and A14 proportionally |
| POP_EXPLOIT | POP_BASELINE plus 5% hunters of the hunt under test (A16–A47) |
| POP_LATE | POP_BASELINE for 365 days, then cohorts of A27 joining at days 365, 395, 425 |
| POP_INSTITUTIONAL | POP_BASELINE with A10 40, A11 60, A12 30, A13 40 |
| POP_BROKE | POP_BASELINE plus A29 50 and A30 50 |

**Rule 3.5.5 (adaptive agents, B05).** ADAPTIVE agents tune their own parameters during a run. Their learner is a cross-entropy method over the agent's parameter vector θ:
```
every PARAM.tm_adapt_epoch_days (default 21) game days:
    sample M = PARAM.tm_adapt_population (default 32) parameter vectors θ_i ~ N(μ, diag σ²)
    each θ_i drives one sub-account (separate character) for the epoch
    reward R_i = ln(NW_end / NW_start) − λ · maxDrawdown_i      (λ = PARAM.tm_adapt_dd_penalty = 0.5)
    elite = top ⌈0.2·M⌉ by R; μ ← mean(elite θ); σ ← max(σ_min, std(elite θ))
```
Rewards use only quantities the agent can observe about its own sub-accounts. Exploit hunts swap the reward for the hunt's oracle score (§3.6.2). Adaptive agents are how the harness tests that "frozen bots cannot hide a broken market" (V3 Part 8): every band in classes DOMINANCE and CALIBRATION at G3 runs once with 10% of the population replaced by A47 and must still pass.

**Rule 3.5.6 (NPC realism checks).** Named NPC actors (16) and NPC institutions must respect their own balance sheets (W04): INV-BS-* apply to NPCs exactly as to players. In addition the harness reports NPC-only worlds (zero player agents, 5 game years, 60 seeds) for the CALIBRATION bands of §3.7.3–3.7.5: the living world must be plausible with no players.

**Rule 3.5.7 (mirror worlds).** A MIRROR world forks the latest production DAILY snapshot into the harness. Before the fork is usable, a pseudonymizer replaces every handle, company name, fund name, alliance name and free text with deterministic placeholders (`P-000123`), drops chat, and keeps all economic state. Mirror worlds are used for exploit hunts on real distributions and for compensation counterfactuals (21 §3.6). Access: TM_ENGINEER role only (21 §3.1), logged; mirror worlds are deleted after `PARAM.tm_mirror_retention_days = 14` real days. Test agents in a mirror world act only on agents created for the run; existing (pseudonymized) characters continue on a scripted "hold and accrue" policy.

**Rule 3.5.8 (no test agents in production).** Test agents never run in the production world. The only non-human non-NPC actors in production are player AIs (11) and the house AIs of the weekly tournament (11), which are disclosed as such.

### §3.6 Exploit hunts

**Rule 3.6.1 (what an exploit is).** An exploit is a repeatable pattern of player-available moves that extracts value the rules do not intend, measured by an **oracle**. Following F06 and R06, a pattern that earns more by taking more risk, by using an overlooked niche with limited capacity, or by successful crime that carries its intended detection and sanction risk is not an exploit; it is checked by the bands instead.

**Rule 3.6.2 (oracles).** Each hunt uses one or more oracles over the hunting agents' accounts:
- **O-MINT (money from nothing):** over the hunt window, Σ NW gains of the hunting agents − Σ faucet postings they received − Σ NW losses imposed on identifiable counterparties (TRANSFER postings to them) − market P&L explained by the 05 cause vector (market, sector, news, flow, noise). Any residual > `PARAM.tm_oracle_mint_tolerance = 0.001` × traded notional is a finding (ACCOUNTING class).
- **O-RISKFREE (dominance without risk):** the pattern's per-epoch return beats the population median by > `PARAM.tm_oracle_excess_min = 0.5` percentage points per game day on ≥ 70% of WITHHELD seeds while its maximum drawdown is < 25% of the median agent's (DOMINANCE).
- **O-CAP (a rule cap exceeded):** any observed value above a rule's cap (ads per day, loot per op, P2P per day, fresh starts per window, sessions per victim) (ACCOUNTING).
- **O-LEAK (information not entitled):** the inference probe's lift over the baseline (PRV.inference_lift) (EXPERIENCE, L11).
- **O-PEAK (rank or peak lifted by own impact):** the peak equity reached minus the peak the same holdings would reach at frictionless counterfactual mids (Tape §6) (ACCOUNTING).
- **O-SHIELD (protection bypassed):** any resolved op, lawsuit or forced action against a protected state (INTENDED behaviour is zero) (EXPERIENCE).
- **O-GRIEF (harm far above cost):** victim NW loss / attacker cost > `PARAM.tm_oracle_grief_ratio = 20` on > 1% of attempts (EXPERIENCE).

**Rule 3.6.3 (hunt catalogue).** Each hunt names its agents, its oracle(s), the counters already designed in the owning module and the band that must hold. A hunt is **active** from the moment its target system passes G1 for the first time and runs on every G3 and in the continuous hunt farm (Rule 3.6.5).

| Hunt | Target | Agents | Oracle | Designed counter (owner) |
|---|---|---|---|---|
| H01 Alt funnel | P2P, contracts, off-market trades | A16 | O-MINT, O-CAP | P2P caps by account age, 2% P2P tax, off-market price flag > 10% from fair value, linked-account voiding (15, 01 §9) |
| H02 Collusion lawsuits and settlements | 13 courts | A17 | O-MINT | settlements between linked accounts voided; court fees are sinks (13) |
| H03 Fake hacks between friends | 12 ops | A17 | O-MINT | linked-account sessions void on plant and add an S4 flag (12 AT 16) |
| H04 Wash trading | 05 matching | A18 | O-MINT, O-PEAK | no self-match; cross-alt matches flagged; shared daily impact tally (05) |
| H05 Arbitrage loops | 06 parities | A19, A47 | O-RISKFREE | parities by construction, NPC arbitrageurs, fees > residual (01 §9) |
| H06 Buy-upgrade-sell loop | 09 valuation | A19 | O-MINT | 15% NPC haircut, 70% upgrade reflection (01 §9) |
| H07 Self-impact mark pump | 05 impact and marks | A33 | O-PEAK | shared per-tick and per-day impact tallies across accounts; marks for rank use crowd-exit valuation (Tape §6, ROADMAP must-fix) |
| H08 Alt-lifted whale peak | 14 rank, peak | A16 + A33 | O-PEAK | liquidation value for peak, rank and licenses = exit against the asset's whole crowd, not one account (ROADMAP must-fix) |
| H09 Collateral double-pledge | 07 | A37 | O-MINT | INV-BS-006, single pledge registry (07) |
| H10 Appraisal inflation | 10, 14 collectibles, 07 lending | A38 | O-MINT | related-party transactions excluded from appraisal comps; lending values use NPC appraisal with haircut (10, 07) |
| H11 Consolidation inflation | 03, 09 | A39 | O-MINT | consolidation elimination, cycle ban (INV-BS-004, -008) |
| H12 Insurance staging | 08, 12 | A40 | O-MINT | shared-cluster flag, S4, policy voided (03 §14 #5) |
| H13 Fund exit scam | 08 | A32 | O-MINT, O-CAP | custody makes theft impossible; betrayal only via market abuse prosecutable as S5 with the manager's first-loss stake paying first (resolves ROADMAP Q6 as option A, the recommendation, `DEFAULT (Mathis may override)` and consistent with 08) |
| H14 Bankruptcy farming | 14 fresh start | A30 | O-RISKFREE, O-CAP | once per 8 weeks, Reputation −10, leverage 1× for 7 days, perk ≤ $2,500 non-cash, 7-day clawback lookback (ROADMAP §2.6) |
| H15 Ad farming and ad timing | 21 rewarded ads | A29, A34, A35 | O-CAP | start-of-local-day eligibility, server counter, timezone change limit, restricted lots (21 §3.14) |
| H16 Restricted-cash leakage | 03 lots, 12, 07, 15 | A35 | O-CAP | FIFO lots, forbidden-use checks in P1 (INV-LED-014) |
| H17 Rookie and dormant targeting | 12, 13 protections | A36 | O-SHIELD | 72 h protection, Rookie zone, dormant untargetable (12 AT 22) |
| H18 Dogpile and serial griefing | 12 cooldowns | A21, A22 | O-GRIEF, O-CAP | 1 success per pair per 24 h, dogpile cap 3 per 24 h, heat shield (03 §13.3–13.4) |
| H19 Malicious prosecution | 13 | A23 | O-GRIEF | filer pays costs on loss, Reputation hit, 3-strike filing lock (03 §14 #19) |
| H20 Insider-tip farming | 16 rumors, 13 surveillance | A43 | O-RISKFREE | publication price effect, ECA insider points (ROADMAP §2.5) |
| H21 NPC rival front-running | 16 rival funds | A41 | O-RISKFREE | rebalances spread over ticks with jitter on stream `rival:<id>`, ADV caps (Tape §1) |
| H22 World-event timing | 16 events | A42 | O-RISKFREE | randomized recovery share, low time and give-back point (Tape §3) |
| H23 Tournament overfitting | 11 tournament | A31 | O-RISKFREE (on secret seeds vs practice) | secret committed seeds, revealed after results (ROADMAP §2.4) |
| H24 Information inference | all views | A24 | O-LEAK | serialization privacy, coarse bands, refresh limits (L11) |
| H25 Market manipulation for profit | 05, 12 market conduct | A25 | O-RISKFREE (net of expected sanction) | surveillance score, ECA, disgorgement (12, 13). Profitable-before-sanction is allowed; profitable after expected sanction at the band's rate is a finding |
| H26 Bottleneck squatting | 01 §14.2 concessions, 09 supply | A44 | O-RISKFREE | 8-week concessions re-auctioned, NPC entry ∝ margin, antitrust at 60% share (01 §9) |
| H27 Stabilizer and NWI timing | 03/04 stabilizer | A45 | O-RISKFREE | lever changes are slow PI steps, clamped, published in advance at day close (01 §8.2) |
| H28 NPC predictability | 05 liquidity, 16 actors | A46 | O-RISKFREE | seed-jittered NPC parameters, NPC size ≤ 0.5× ADV per tick (ROADMAP R5) |
| H29 Hidden-session farming | 12 sessions | A17, A20 | O-MINT, O-CAP | linked victims give nothing, P ≤ 0.85, overnight cap +0.08 (12) |
| H30 Credit-cycle and bank exploitation | 07 player banks | A10 + A19 | O-MINT, O-RISKFREE | capital rules, deposit insurance limits, resolution, related-party lending limits (07) |
| H31 Securitization games | 08 SPVs, rating agencies | A11 + A19 | O-MINT, O-RISKFREE | tranche waterfall, rating model independence, risk retention (08) |
| H32 Margin and liquidation sniping | 07 margin, 05 | A19, A47 | O-RISKFREE | liquidation at fair value with a band, not the crashed print (01 §9) |
| H33 Offline income | 09 offline cap | A19 | O-MINT | offline cap 8 h (16 h with manager) (02 §3.5) |
| H34 Compute corner | 11 compute market | A19 | O-RISKFREE | elastic NPC cloud supply, position caps on compute futures, antitrust (01 §9) |
| H35 Generic search | everything | A47 | all oracles | the hunt that finds what nobody thought of; every finding opens a named hunt |

**Rule 3.6.4 (finding lifecycle).**
1. A hunt run's oracle crosses its threshold on a seed → candidate finding.
2. The harness replays on 3 VALIDATION seeds; if reproduced on ≥ 2 of 3, the Finding is opened (`reproducible = true`), a minimized RegressionCase is created (§3.10.4) and the owning module is notified.
3. Severity: CRITICAL if O-MINT residual > $1M per agent per game year at the STANDARD preset or any O-CAP violation of a money cap; HIGH if O-RISKFREE excess > 2 pp per game day; MEDIUM for O-LEAK lift > 0.05 or O-GRIEF; LOW otherwise.
4. CRITICAL and HIGH findings trigger the **live exposure check** (§3.11.3) within 1 real hour.
5. The fix ships through the normal gates; the Finding moves to MITIGATED when the RegressionCase passes, CLOSED after one full chapter of hunt-farm runs without recurrence.
6. `ACCEPTED_EDGE` (a strong but legitimate edge, F06) requires a decision recorded in 24 naming the capacity limit that bounds it.

**Rule 3.6.5 (the continuous hunt farm).** Between gates, the harness keeps `PARAM.tm_hunt_farm_worlds = 32` worlds running (DEFAULT size for launch; scales with budget) on rotating DEV and VALIDATION seeds, each running POP_EXPLOIT with the hunts of the systems changed in the last 14 real days weighted ×3. Findings from the farm follow Rule 3.6.4.

### §3.7 Balance bands

**Rule 3.7.1 (band classes and responses).** Every band has a class (§2.6). When a band fails at a gate:

| Class | Can ship? | Who responds | Allowed response |
|---|---|---|---|
| ACCOUNTING | Never; no waiver | owning module | fix the code or rule; the band never moves |
| DOMINANCE | No at G3; G5 may waive for one chapter with a 24 decision naming the capacity bound | owning module + 24 | change the rule (costs, capacity, crowding), never hide the path |
| INTENDED_RISK | No at G3 unless the miss is ≤ 10% of the band width; then G5 retunes params at the next chapter boundary | owning module | retune parameters inside 23 ranges |
| CALIBRATION | Same as INTENDED_RISK | owning module | retune model parameters |
| EXPERIENCE | No at G3 | owning module + 17/18 | change design (protections, UI, pacing) |
| PERFORMANCE | No at G3 | 19 | optimize or scale; never cut invariants (Rule 3.2.6) |

A band is never widened to make a failing build pass (Tape rule). A band may be changed only by a 24 decision with its reason, effective from the next G3.

**Rule 3.7.2 (metric registry).** Each band's `metric` id resolves to an exact computation in `apps/harness/metrics/<id>.ts`, over HarnessRun outputs (postings archive, events, TickRecords, agent NW series). Common definitions:
- `NW(a, d)`: the agent's NW at day close of game day `d` (03 derivation).
- `multiple(a)`: `NW(a, end) / NW(a, start)`.
- `beat share vs BH`: share of seeds on which a strategy's multiple (or Sharpe) exceeds the equal-weight buy-and-hold basket's (`bh`, Tape harness definition: equal-weight stock basket, whole shares, market orders, same fees, from the same tick).
- `Sharpe`: annualized Sharpe of daily returns net of fees, `× √252` with 252 trading days per game year equivalent (5 trading days × 52 weeks = 260; the harness uses 260; `PARAM.tm_trading_days_per_year = 260`).
- Wealth curves use "engaged" agents: HONEST family agents acting at least once per game day for the equivalent of 1–2 real hours per real day (`PARAM.tm_engaged_active_hours_per_real_day = 1.5`).
- Real-time quantities (per real day, per chapter) are converted with 00 §5.1.

#### §3.7.3 Markets and ecology (owner 05, 06; Tape ecology and learnability specs)

| Band | Metric | Band | Class | Seeds | Gate |
|---|---|---|---|---|---|
| MKT.kurtosis | excess kurtosis of daily returns, median over assets | > 3 | CALIBRATION | 60 | G3 |
| MKT.vol_cluster | corr(|r_t|, |r_{t−1}|) daily, median | > 0.15 | CALIBRATION | 60 | G3 |
| MKT.vol_volume | corr(|daily return|, traded value) | 0.30–0.60 | CALIBRATION | 60 | G3 |
| MKT.autocorr | daily return autocorrelation | −0.05–0.05 | CALIBRATION | 60 | G3 |
| MKT.reversal_ic | rank IC of 1-day return vs next day | −0.05–0 | CALIBRATION | 60 | G3 |
| MKT.momentum_ic | rank IC of 63-day return vs next 21 days | 0–0.04 | CALIBRATION | 60 | G3 |
| MKT.vol_ratio | realized vol / target vol per asset, median | 0.85–1.40 | CALIBRATION | 60 | G3 |
| MKT.index_cagr | world equity index CAGR, median over seeds, events on | 0–12% | CALIBRATION | 60 | G3 |
| MKT.max_strategy_beats_bh | highest share of seeds on which any simple public strategy (momentum, contrarian, random, value_gap, news_drift, rumor_blind) beats BH after fees | ≤ 0.70 | DOMINANCE | 60 | G3 |
| MKT.learn_value_gap_beat | value_gap beats BH on Sharpe | 0.40–0.60 (0.50–0.70 once ecology publish-price lands, per Tape) | DOMINANCE | 60 | G3 |
| MKT.learn_value_gap_edge | median Sharpe edge over BH | ≤ +0.05 (≤ +0.15 with ecology on) | DOMINANCE | 60 | G3 |
| MKT.learn_regime_split | ≥ 1 regime beat-rate > 0.65 and ≥ 1 < 0.40, each with ≥ 10 seeds | holds | CALIBRATION | 60 | G3 |
| MKT.crowd_decay | after signed flow > 10% of ADV over the prior 21 game days by a crowd of 100 × $250k (and a $25M single): crowded beat < 0.55 and ≤ uncrowded − 0.05 | holds | DOMINANCE | 60 | G3 |
| MKT.stacked_signals | two stacked public signals beat BH | ≤ 0.70 | DOMINANCE | 60 | G3 |
| MKT.self_impact_clip_ratio | own price lift from 720 clips / from 1 clip, same notional | ≤ 1.5 | ACCOUNTING | 20 | G2 |
| MKT.self_mark_peak_pump | peak after laddered buy − frictionless peak | ≤ 0 (tolerance 0.1% of notional) | ACCOUNTING | 20 | G2 |
| MKT.ladder_roundtrip_ev | median ladder round-trip P&L after fees | ≤ 0 | DOMINANCE | 20 | G2 |
| MKT.parity_residual | max ETF/basket, put-call, futures-basis and FX-triangle residual after fees, any tick | ≤ 0 exploitable | ACCOUNTING | 20 | G2 |
| MKT.halt_rate | circuit-breaker halts per asset per game year, median | 0.2–3 | CALIBRATION | 60 | G3 |
| MKT.news_drift | news_drift strategy beats BH | ≤ 0.70 | DOMINANCE | 60 | G3 |
| MKT.rival_* | the nine NPC rival fund bands of Tape §1 (single impact path, ADV cap, median multiple 0.4–2.5×, mirror ≤ 0.70, front-run median P&L ≤ 0, no look-ahead, ignores player) | as Tape §1 | mixed (ACCOUNTING for path, DOMINANCE for mirror/front-run) | 20/60 | G3 |
| MKT.rumor_* | the ten rumor bands of Tape §2 (true share 0.47–0.63, per-seed max ≤ 0.75, blind EV ≤ 0, insider flag rate 1.00, no truth leak) | as Tape §2 | mixed | 200 | G3 |
| MKT.event_* | the world-event bands of Tape §3 (counts, overlap 0, majors 80–180 per 200 × 5 y, crash farm ≤ BH, flash dip EV ≤ 0, bubble timer ≤ 0.70, no end leak) | as Tape §3 | mixed | 200 | G3 |

#### §3.7.4 Economy, money and wealth (owners 03, 04, 14)

| Band | Metric | Band | Class | Seeds | Gate |
|---|---|---|---|---|---|
| ECO.wealth_median_d{1,7,21,56} | median engaged agent NW at account age 1/7/21/56 real days | target × [0.5, 2.0]; targets $15k, $500k, $20M, $300M (01 §8.4) | CALIBRATION | 60 | G3 |
| ECO.wealth_top1_d{1,7,21,56} | top-1% engaged NW | target × [0.5, 2.0]; targets $50k, $5M, $400M, $10B | CALIBRATION | 60 | G3 |
| ECO.wealth_top001_d{7,21,56} | top-0.01% (STANDARD with ≥ 10k agents) | target × [0.33, 3.0]; $40M, $3B, $100B | CALIBRATION | 20 | G5 |
| ECO.wealth_long_d{180,365} | median and top-1% at 180 and 365 days | × [0.5, 2.0] of $2B/$60B and $6B/$120B (01 §14.3) | CALIBRATION | 20 | G5 |
| ECO.growth_decel | median daily growth on day 1 vs week 8 | day 1 ≥ 40%, week 8 ≤ 8% (target ~60% → ~5%) | CALIBRATION | 60 | G3 |
| ECO.top_growth_y1 | median daily growth of top-1% at account age 365 | ≤ 0.5% | DOMINANCE | 20 | G5 |
| ECO.whale_riskfree | any agent > $100B NW sustaining > 2%/day for ≥ 7 game days with max drawdown < 5% | 0 occurrences (01 §14.3: treated as exploit) | DOMINANCE | 20 | G5 |
| ECO.stabilizer_error | |e| = |M/M_target − 1| at day close, P95 over a chapter | ≤ 0.10 | CALIBRATION | 60 | G3 |
| ECO.stabilizer_lever_rate | largest per-day change of any lever | ≤ its 23 step clamp | ACCOUNTING | 60 | G3 |
| ECO.net_mint_share | net mint / money supply per game day, median | 0–0.5% | CALIBRATION | 60 | G3 |
| ECO.legal_sink_share | fines + court fees + NPC legal fees / money supply per game year | 0.5–1.5% (03 §16) | CALIBRATION | 20 | G3 |
| ECO.gini_active | Gini of NWI over active agents at day 56 | 0.75–0.95 (`DEFAULT`) | CALIBRATION | 60 | G3 |
| ECO.top1_share | top-1% share of player wealth at day 56 | 25–60% (`DEFAULT`) | DOMINANCE | 60 | G3 |
| ECO.player_share_of_world | Σ player NW / NPC world wealth at launch and day 56 | ≈ 1/50 at launch; ≤ 10% at day 56 (01 §14.1) | CALIBRATION | 20 | G3 |
| ECO.nwi_consistency | NWI board order = order by NW ÷ money-supply index | 0 mismatches | ACCOUNTING | 20 | G2 |
| ECO.reward_faucet | money posted by any ladder, tournament or challenge reward | $0 (INV-SOC-001) | ACCOUNTING | 20 | G2 |

#### §3.7.5 Macro and institutions (owners 04, 07, 08)

| Band | Metric | Band | Class | Seeds | Gate |
|---|---|---|---|---|---|
| MAC.inflation_mean | per-bloc mean CPI inflation over a chapter, median over seeds | 1.0–4.0% per game year (target 2%; SRL 2.0–8.0%) `DEFAULT` | CALIBRATION | 60 | G3 |
| MAC.recession_rate | recessions (2 negative quarters) per bloc per chapter | 0.25–0.70 `DEFAULT` | CALIBRATION | 60 | G3 |
| MAC.major_crisis | P(≥ 1 major crisis per chapter) | 0.25–0.45 (target 35%, 01 §5.6) | CALIBRATION | 200 | G3 |
| MAC.storm_rate | storms per game quarter | 0.6–1.5 (target ~1, ROADMAP §2.8) | CALIBRATION | 60 | G3 |
| MAC.crisis_telegraph | major crises with ≥ 8 real hours of visible precursors | 100% | EXPERIENCE | 200 | G3 |
| MAC.no_major_final_48h | majors starting in the final 48 real hours of a chapter | 0 | EXPERIENCE | 200 | G3 |
| MAC.sovereign_default | P(any sovereign default per chapter) | 0.02–0.10 `DEFAULT` | CALIBRATION | 200 | G3 |
| MAC.policy_rate_path | policy rates stay in each bank's 04 corridor; no negative rate below 04's floor | 0 violations | ACCOUNTING | 60 | G2 |
| FIN.npc_bank_failures | NPC bank failures per chapter (world) | 0–3 `DEFAULT` | CALIBRATION | 200 | G3 |
| FIN.bank_run_rate | runs reaching central-bank facility per chapter | 0.1–1.5 `DEFAULT` | CALIBRATION | 200 | G3 |
| FIN.ccp_mutualized_use | chapters in which the CCP mutualized layer is touched | ≤ 1 in 3 chapters (P ≤ 0.33) `DEFAULT` | CALIBRATION | 200 | G3 |
| FIN.procyclical_margin | in simulated crashes, margin rises with vol and forced deleveraging deepens the drawdown vs a fixed-margin counterfactual | drawdown deepening 5–40% `DEFAULT` | CALIBRATION | 60 | G3 |
| FIN.credit_cycle | lending-standard index correlation with output gap | 0.3–0.8 `DEFAULT` | CALIBRATION | 60 | G3 |
| FIN.player_bank_roe | median player-bank ROE per game year | 4–18% `DEFAULT` | DOMINANCE | 60 | G3 |
| FIN.fund_manager_extraction | value extracted by A32 beyond fees | $0 | ACCOUNTING | 60 | G2 |
| FIN.tranche_pricing | senior tranche loss rate in a correlation-shock scenario vs modelled | ratio 1.5–6 (the "correlation was higher than modelled" event emerges) `DEFAULT` | CALIBRATION | 60 | G3 |
| FIN.insurance_loss_ratio | NPC insurer loss ratio | 60–80% (03 §16) | CALIBRATION | 60 | G3 |
| FIN.etf_discount_crisis | max ETF discount to NAV in a liquidity crisis scenario | 1–10% `DEFAULT` | CALIBRATION | 60 | G3 |

#### §3.7.6 Businesses, property, AI (owners 09, 10, 11)

| Band | Metric | Band | Class | Seeds | Gate |
|---|---|---|---|---|---|
| BIZ.t1_payback | B1 (T1) business payback in game days, median, net of all opex at reference crowding | 4–9 (09 §3.1.2 base 6 game days; ROADMAP Q2 resolved as option A by 09, the owner; ruling in 24, `DEFAULT (Mathis may override)`; the experience target stays BIZ.hustler_time) | CALIBRATION | 60 | G3 |
| BIZ.hustler_time | real days for a median engaged newcomer to reach R1 Hustler ($20k) | 1–2 real days | EXPERIENCE | 60 | G3 |
| BIZ.upgrade_saturation | marginal income per $ of upgrade at the top tier vs the first | ≤ 0.35 (logit share saturation) | DOMINANCE | 60 | G3 |
| BIZ.npc_entry | NPC entrants per sector-city per game year vs sector margin | positive correlation ≥ 0.3 | CALIBRATION | 60 | G3 |
| BIZ.antitrust | share-of-sector > 60% sustained > 1 game quarter without an antitrust event | 0 | ACCOUNTING | 60 | G2 |
| PROP.gross_yield | median gross rental yield by tier | working 6–9%, mid 5–7%, prime 3.5–5.5%, trophy 1–3.5% `DEFAULT` | CALIBRATION | 60 | G3 |
| PROP.cap_rate_rate_beta | cap-rate change per 100 bp policy-rate change | +30 to +90 bp `DEFAULT` | CALIBRATION | 60 | G3 |
| LAB.training_roi | median ROI of a training run per tier | −20% to +60% per run, with ≥ 15% of runs negative `DEFAULT` | INTENDED_RISK | 60 | G3 |
| LAB.compute_share | player share of world compute demand | 10–20% (RESOLVED-NUMBERS C3c) | CALIBRATION | 20 | G3 |
| LAB.ai_vs_manual | median AI-only agent NW multiple / median manual A02 multiple at equal capital | 0.8–1.6 (powerful AI without killing manual play, 05 §12) `DEFAULT` | DOMINANCE | 60 | G3 |
| LAB.du_cap | DU used per partition per tick | ≤ 3.0M; per player ≤ 2,000 | PERFORMANCE | 20 | G2 |
| LAB.tournament_overfit | A31's score on secret seeds / on practice seeds | ≤ 0.8 median (overfitting does not transfer) | DOMINANCE | 60 | G3 |

#### §3.7.7 Conflict and law (owners 12, 13; all from 03 §16)

| Band | Metric | Band | Class | Seeds | Gate |
|---|---|---|---|---|---|
| CON.crime_ev_ratio | competent criminal vs honest chapter NW | 0.8–1.2 | INTENDED_RISK | 20 | G3 |
| CON.crime_variance | criminal chapter-NW variance / honest | 2–4× | INTENDED_RISK | 20 | G3 |
| CON.solo_breach_top1 | solo breach rate vs top-1% players per op | 1–8% | INTENDED_RISK | 20 | G3 |
| CON.coord_breach_top1 | coordinated (AP ≥ DP_eff) breach rate vs top-1% | 35–60% | INTENDED_RISK | 20 | G3 |
| CON.conviction_rate | convictions on attributed ops | 40–65% | INTENDED_RISK | 20 | G3 |
| CON.never_attributed | detected-but-never-attributed share | 30–50% | INTENDED_RISK | 20 | G3 |
| CON.wrongful_conviction | verdict vs ledger truth | < 3% | ACCOUNTING | 200 | G3 |
| CON.hit_3_per_day | players hit ≥ 3 times per real day | < 1% of active | EXPERIENCE | 20 | G3 |
| CON.rookies_attacked | rookies attacked in first 7 days | < 5% | EXPERIENCE | 20 | G3 |
| CON.top1_fall | top-1% losing ≥ 20% NW to non-hacking takedown routes per chapter | 5–15% | INTENDED_RISK | 20 | G3 |
| CON.bankrupt_by_crime | bankruptcies caused by crime or court below the floor | 0 | ACCOUNTING | 20 | G2 |
| CON.wanted_conviction | Most Wanted top-10 conviction rate | ≥ 50% | INTENDED_RISK | 20 | G3 |
| CON.session_lifetime | median hostile session lifetime (victim-online hours) | 6–18 | INTENDED_RISK | 20 | G3 |
| CON.p_at_disconnect | median P at disconnect | 0.15–0.35 | INTENDED_RISK | 20 | G3 |
| CON.p_over_06 | sessions reaching P ≥ 0.6 | < 10% | INTENDED_RISK | 20 | G3 |
| CON.legit_disconnects | disconnects hitting a legitimate entry | < 15% | EXPERIENCE | 20 | G3 |
| CON.overnight_cap | victims losing ≥ 0.08 P in one offline stretch | 0% | ACCOUNTING | 20 | G2 |
| CON.club_edge | club information edge EV after dues | ≤ 0 | DOMINANCE | 20 | G3 |
| CON.cyber_pandemic | player-caused pandemic triggers per chapter | ≤ 0.5 `DEFAULT` | CALIBRATION | 200 | G3 |
| LAW.held_max | Held duration | ≤ 24 real hours online; never applied in sandbox or practice worlds | ACCOUNTING | 20 | G2 |
| LAW.restitution_paid | share of restitution awards collected within 2 chapters | ≥ 70% `DEFAULT` | EXPERIENCE | 20 | G3 |

#### §3.7.8 Fairness, entry and paths (F01–F06; owners 09, 14, 15)

| Band | Metric | Band | Class | Seeds | Gate |
|---|---|---|---|---|---|
| FAIR.path_parity | each archetype family's (trading A02, business A06, property A08, AI A09, institution A10–A12, founder A07) median chapter NW multiple / cross-family median | 0.5–2.0 (F02) `DEFAULT` | DOMINANCE | 60 | G3 |
| FAIR.path_sharpe | best family's median Sharpe / median family's | ≤ 1.5 `DEFAULT` | DOMINANCE | 60 | G3 |
| FAIR.late_joiner | A27 joining at world age 365: median NW at account age 56 / launch-cohort median at account age 56 | 0.5–1.5 (F03, 01 §8.5 catch-up) | EXPERIENCE | 20 | G5 |
| FAIR.bottleneck_tenure | any single owner controlling > 40% of a critical input (compute, energy, port, exchange concession, chip fab) for > 1 chapter with no substitute entry | 0 (F04) | DOMINANCE | 20 | G5 |
| FAIR.first_winner_lock | correlation of day-7 rank with day-365 rank among top 100 | ≤ 0.8 `DEFAULT` | DOMINANCE | 20 | G5 |
| FAIR.league_mobility | players promoted at least once in their first 4 league weeks | ≥ 25% `DEFAULT` | EXPERIENCE | 20 | G3 |
| FAIR.newcomer_protection | newcomers suffering a hostile op in the protection window | 0 | ACCOUNTING | 20 | G2 |

#### §3.7.9 Faucets from comebacks and ads (owners 14, 21; Tape §4–5)

| Band | Metric | Band | Class | Seeds | Gate |
|---|---|---|---|---|---|
| FAU.bust_farm_mean_ratio | mean NW(A30) / mean NW(A01 solvent) at 8 and 24 weeks | ≤ 1.00 | DOMINANCE | 200 | G3 |
| FAU.bust_option_value | mean NW(A30) − mean NW(yolo without fresh start) | ≤ $5,000 per 8-week window | ACCOUNTING | 200 | G3 |
| FAU.fresh_start_per_window | fresh starts per 8 weeks per character | ≤ 1 | ACCOUNTING | 200 | G2 |
| FAU.rank_from_fresh_cash | rank threshold first crossed within 7 days of a fresh start because of `FRESH_START` cash (counterfactual) | 0 | ACCOUNTING | 200 | G3 |
| FAU.ad_grant_amount | every grant exactly $250 real (= $250 × MSI at the grant tick; $250 at MSI 1.0, 21 §3.14.3) and tagged `AD_GRANT` | 0 violations | ACCOUNTING | 200 | G2 |
| FAU.ads_per_local_day | grants per character per local day, including timezone changes, device clock changes, reconnects and multiple devices | ≤ 10 | ACCOUNTING | 200 | G2 |
| FAU.ad_eligibility_start_of_day | grants on a local day whose start-of-day rank-basis NW was ≥ $1,000 real, or to accounts younger than 24 h, guests, Held or suspended characters | 0 | ACCOUNTING | 200 | G2 |
| FAU.ad_gate_on_networth | a character with $900 cash and $5,000 in positions at local midnight is ineligible that day | 0 violations | ACCOUNTING | 20 | G2 |
| FAU.restricted_use | `AD_GRANT` or `FRESH_START` lot spent on ops, insider actions, margin, derivatives or P2P inside the window | 0 | ACCOUNTING | 200 | G2 |
| FAU.ad_faucet_share | `ACCT_REWARDED_AD` total / daily net mint (world) | alert > 0.0001 (0.01%) | CALIBRATION | 60 | INFO |
| FAU.ad_bust_stack | fresh start offered before ads; each at most once per bust episode | 0 violations | EXPERIENCE | 200 | G2 |
| FAU.ad_fixed_reward | any random reward amount, multiplier, spin or chest in ad or purchase paths | 0 (also INV-STR-010) | ACCOUNTING | — | G0 |

#### §3.7.10 Privacy and experience (owners 15, 17, 18)

| Band | Metric | Band | Class | Seeds | Gate |
|---|---|---|---|---|---|
| PRV.delta_audit | facts delivered to a recipient outside its entitlement | 0 | ACCOUNTING | 20 | G2 |
| PRV.inference_lift | A24 holdings-prediction accuracy − baseline accuracy (public filings and aggregate flow only) | ≤ 0.05 | EXPERIENCE | 20 | G3 |
| PRV.whale_watch_identity | Whale Watch / aggregate flow items that name or uniquely identify an account without an allowed disclosure (R04) | 0 | ACCOUNTING | 20 | G2 |
| SOC.alt_ring_detect | A16 rings detected by 15's anti-cheat within 7 real days | ≥ 90% (ROADMAP M37) | EXPERIENCE | 60 | G3 |
| SOC.false_alt_flags | HONEST agents sharing a household network profile flagged as alts (synthetic shared-IP fixture) | ≤ 2% | EXPERIENCE | 60 | G3 |
| UX.first_trade_time | scripted newcomer path: page load to first fill (17, 18) | < 90 s wall time | EXPERIENCE | e2e | G3 |
| UX.no_advice_words | rendered text containing "you should", "guaranteed", "risk-free", "buy now", "can't lose" (en) and the French list in 21 §3.16 | 0 | EXPERIENCE | e2e | G0 |
| UX.notification_cap | pushes per character per real day | ≤ 5; 0 inside quiet hours | EXPERIENCE | e2e | G2 |

### §3.8 Experiments and calibration

**Rule 3.8.1 (population experiments, B04).** Each chapter (G5) runs a factorial design on STANDARD worlds, 20 seeds per cell, 1 chapter horizon:

| Factor | Levels |
|---|---|
| Population (agents) | 2,000 · 10,000 · 25,000 (one partition's cap, 00 §5.7) |
| Starting wealth | $5,000 for all · log-normal around $5,000 (σ = 1) for the 20% who join with a fresh-start history |
| Mix | POP_BASELINE · POP_CONFLICT · POP_INSTITUTIONAL |
| Shock regime | natural · forced major crisis at day 20 · two forced storms per game quarter |

Reported (E4, never a gate unless a band covers it): Gini, top-1% share, entry success (share of A27 reaching median-for-age), crisis frequency, sector HHI per city, stabilizer error path, bank failures, CCP layer use, and the band set of §3.7 per cell. A cell whose bands fail opens a Finding of class DOMINANCE or CALIBRATION against the owning module.

**Rule 3.8.2 (adaptation experiments, B05).** Each G3 runs three adaptation runs per release: (a) capital ramp: A03 capital deployed into one public signal grows ×2 every game quarter from $250k to $256M; measure beat share per stage and execution cost per stage (expect monotone decay; band MKT.crowd_decay at the $25M stage); (b) rival entry: every 21 game days add 10 A47 agents to a world with a successful A03; measure the incumbent's edge half-life (reported); (c) regime change: force a monetary regime shift (04) at day 30; measure the recovery time of adaptive vs frozen agents (reported).

**Rule 3.8.3 (tail calibration with GEV, B11, resolved).** "GEV" is read as the generalized extreme value distribution and is used only to calibrate tails, never as world or NPC intelligence (resolves MASTER-BIBLE B11). Procedure, run in G2 for the CALIBRATION bands below:
1. From 200 NPC-plus-baseline seeds × 5 game years, take block maxima over game quarters of: (a) the world equity index's worst one-day loss, (b) the index's peak-to-trough drawdown within the quarter, (c) the NPC banking sector's quarterly loan-loss rate, (d) the NPC insurance sector's quarterly catastrophe loss ratio.
2. Fit GEV(μ, σ, ξ) by maximum likelihood (harness numeric code, not engine code).
3. Compare the fitted shape ξ and the 1-in-10-game-year return level to targets:

| Band | Series | ξ band | 1-in-10-year return level band |
|---|---|---|---|
| TAIL.index_day | (a) worst daily loss | 0.05–0.40 | 7–15% |
| TAIL.index_dd | (b) quarterly drawdown | 0.00–0.35 | 30–55% |
| TAIL.bank_losses | (c) loan-loss rate | 0.05–0.50 | 3–10% of loans `DEFAULT` |
| TAIL.cat_losses | (d) cat loss ratio | 0.20–0.70 | 120–300% of quarterly premium `DEFAULT` |

All four are `DEFAULT (Mathis may override)`, class CALIBRATION, gate G3. A miss is retuned through 04/07/08/16 shock parameters.

**Rule 3.8.4 (named crisis templates, resolves V3 Q4).** `DEFAULT (Mathis may override)`: named crisis templates (a securitization correlation shock, a repo run, a sovereign default with currency crisis, a bank run, a CCP member default, a stablecoin depeg) exist as **harness Scenarios** (`SC_CRISIS_*`) used for calibration and regression, as **SCENARIO challenge events** (15 §3.14) and as **Academy lessons and practice worlds** (18) for players to study (ruling in 24). In the live world crises are only emergent (16 decides their triggers); no template is ever forced on the live world.

**Rule 3.8.5 (agent-intelligence experiments, B10).** Memory-and-planning models for selected NPCs (16) are evaluated only as controlled harness experiments: a cell of 20 seeds with the model-driven actors replaced by 16's rule-based actors must show no band regressions and a per-tick cost within 16's budget before any live use. Any language-model output (B09) is presentation only; the harness asserts that removing all generated prose leaves the logical state hash unchanged over a 30-day run (TM AT 31).

### §3.9 Release gates

**Rule 3.9.1 (the six gates).** The numbering matches the stage gates 19 §12.4 already uses (G1 unit, G2 integration, G3 adversarial, G4 release) and adds G0 (pull request) and G5 (chapter boundary).

| Gate | Runs on | Wall budget | Contents (all required unless marked) |
|---|---|---|---|
| **G0 Pull request** | every pull request | ≤ 20 min | typecheck, lint (incl. determinism rules), INV-STR-001..010, all E1 unit tests, E2 properties at 200 cases, protocol contract tests, FAST regression cases, a 30-game-day MICRO world with INV-* on, 2-partition equivalence on that world, the G0 bands (UX.no_advice_words, FAU.ad_fixed_reward) |
| **G1 Unit gate** | each build unit of 19 §12.2 when it is declared complete, and again on any change to it | ≤ 2 h | all of the unit's acceptance tests (its module §10) green in their evidence category; its E2 properties at 10,000 cases; a passing negative test for every invariant it registers (Rule 3.9.4); its FAST and NIGHTLY regression cases |
| **G2 Integration gate** | main branch every real night; every toolchain upgrade (19 Rule 3.1.4) | ≤ 6 h | everything in G0; golden replay of the recorded fixture logs; every registered invariant over a 30-game-day headless world with all units built so far (STANDARD once S2 is complete, SMALL before); partition equivalence {1, 4, 16} plus one random map (Rule 3.3.3); host-profile equivalence on x64 and arm64 and, for toolchain upgrades, the 7-game-day old-vs-new comparison (Rule 3.3.5); browser-vs-Node hash check (Rule 3.3.7); all NIGHTLY regression cases; all bands with gate G2 at 20 seeds; e2e suites at 1440 and 390 px; the no-leak delta audit |
| **G3 Adversarial and balance gate** | each release candidate; each stage completion | ≤ 48 h | G2 green on the same commit; all bands with gate G3 at their seed counts on VALIDATION and WITHHELD seeds; adaptive re-run of DOMINANCE and CALIBRATION bands with 10% A47 (Rule 3.5.5); every active hunt at 60 seeds with **no open Finding of severity HIGH or CRITICAL** in the systems under test (19 §12.4 writes this as "no open exploit of severity S4+"; S1–S6 is the crime scale of 13, so the Truth Machine reads it as HIGH or above); GEV tail bands; adaptation runs (Rule 3.8.2); for a module turned on for the first time, a 1-chapter STANDARD run with POP_EXPLOIT and the specialist playtest of §3.13 |
| **G4 Release gate** | every production deploy | ≤ 72 h before cutover (hotfix: Rule 3.9.3) | G3 green on the same commit; load gate and chaos gate (§3.14); restore drill (snapshot + log recovery of a full partition set in staging, 19); version replay of the last production game day (Rule 3.3.6); French coverage 100% (INV-STR-008); accessibility audit with zero serious violations; playtest record for any changed onboarding or new screen family (§3.13); canary: one shadow verifier runs the candidate against live batches for `PARAM.tm_canary_ticks = 720` ticks with zero unintended divergence; a rollback artefact ready |
| **G5 Chapter boundary** | 7 real days before each chapter boundary, for parameter and content changes scheduled at the boundary | ≤ 5 real days | all bands with gate G5 (long horizons, 10k+ agents, late joiners); population experiments (Rule 3.8.1); every parameter change in the boundary bundle evaluated as a diff run (old vs new params, same seeds) with no band leaving its range; the integrity report's chapter summary |

**Rule 3.9.2 (verdicts and waivers).** A gate passes when every required check passes. Waivers: a check of class ACCOUNTING, any FATAL invariant test, any equivalence check and any INV-STR check can never be waived. Other checks may be waived only at G3 or G4 by two signers (one TM_LEAD, one module owner, 21 §3.1) with a 24 decision reference; a waiver lasts until the next G3 at most.

**Rule 3.9.3 (hotfix path).** For an INC-1 or INC-2 incident (21 §3.17) the hotfix gate is: G0 + the incident's RegressionCase + version replay of the last game day + the bands of the touched module at 20 seeds + the G4 canary shortened to `PARAM.tm_hotfix_canary_ticks = 60`. The full G3 and G4 run after the deploy within 48 real hours; if either fails, a follow-up fix is mandatory before the next normal release.

**Rule 3.9.4 (negative tests for invariants).** For each FATAL invariant, a fault-injection test feeds the engine a crafted state or crafted phase output (test-only hooks compiled out of production bundles, 02) that violates it and asserts that the tick does not commit and the failure ladder (Rule 3.2.2) runs. An invariant without a passing negative test does not count as checked.

**Rule 3.9.5 (stage gates of the build order).** 19 §12.4 groups build units into stages S0–S10 and names the gate that closes each stage. A stage is complete only when every unit in it has passed G1, the stage's named gate passes with all earlier stages enabled, and (V3 Part 11) the Truth Machine pieces the stage needs exist: S0 needs the invariant framework and INV-LED/INV-ENG; S2 adds INV-MKT and the market bands; S4 adds INV-CCP/BNK/FND/INS and hunts H09–H13, H30–H32; S5 adds INV-CON/LAW and the conflict bands; S7 adds INV-SOC/PRG and hunts H01–H04; S9 adds the commerce and ad checks (INV-STR-002..004, FAU.*); S10 is the full G4 over the whole game.

### §3.10 Seed sets, withheld worlds and regression

**Rule 3.10.1 (seed sets, B06).**

| Set | Size | Salt holder | Rotation | Visible to | Use |
|---|---|---|---|---|---|
| DEV | 1,000 | TEAM (in repo) | never | developers, CI | local work, quick checks, the first 20 of them in G0/G2 |
| VALIDATION | 1,000 | GATE_SERVICE | per chapter | CI (indices only) | G2/G3 band runs, finding reproduction |
| WITHHELD | 400 | GATE_SERVICE | per chapter; used seeds are retired after each G3 | G3 only | the judging set: bands are tuned on DEV/VALIDATION and judged on WITHHELD |
| REGRESSION | grows | TEAM | never | CI | seeds attached to RegressionCases |
| PLAYER_PRACTICE | 10,000 | TEAM | never | players (via Quant Lab and Academy, 11, 18) | player backtests and practice worlds |
| PLAYER_WITHHELD | 1,000 | SERVER_ONLY | per chapter | never revealed | Quant Lab "withheld-world validation" for player strategies (11, V3 Part 4): players submit a strategy, the server runs it on these seeds and returns only aggregate statistics |
| TOURNAMENT | 3 per week | SERVER_ONLY | per week; committed before lock, revealed after results | revealed after results | weekly AI tournament (11, ROADMAP §2.4) |

The live world's seed is not in any set; it is server-only (19 §3.12) and never used by the harness except through MIRROR forks (which start from a snapshot, not from the seed).

**Rule 3.10.2 (no tuning on WITHHELD).** A WITHHELD seed's per-seed results are never shown to developers; G3 reports show only aggregate band values and pass/fail. The worst WITHHELD seeds of a failing band are copied into VALIDATION (re-salted) for debugging, and the WITHHELD set is refilled from fresh indices.

**Rule 3.10.3 (regression capture).** Every failure from an invariant, an equivalence check, a band's worst seed (when the band fails), a finding, the shadow verifier, a player exploit report, a support ticket with a reproducible game defect or a playtest-found defect becomes a RegressionCase with a ReproBundle. Cases are permanent; a case is deleted only if its engine version can no longer be loaded, and then it is re-expressed on the current engine first (re-recorded by replaying the scenario).

**Rule 3.10.4 (minimization).** Before a case joins the FAST tier, the harness minimizes it by delta debugging over (a) ticks (start from the latest snapshot ≤ failure tick that still reproduces), (b) intents (ddmin over the batch range, keeping system inputs), (c) agents (drop agents whose removal keeps the failure). Minimized cases that run in ≤ 30 s join FAST; others stay NIGHTLY.

**Rule 3.10.5 (run files from the sandbox).** A player's exported run file (19 §3.17, the old M11 format: engine version, config hash, seed, ordered intents, final hash) can be attached to a bug report (21 §3.6). Support converts it into a RegressionCase by replaying it headless; a tampered file is detected by the final-hash mismatch and the report is still triaged on its description.

### §3.11 Live verification

**Rule 3.11.1 (the shadow verifier).** At least one shadow verifier (`PARAM.tm_shadow_verifiers = 1`, a dedicated `harness`-role host in the same EU data centre, 21 §3.18) follows the production world: it loads the latest DAILY snapshot, then consumes sealed IntentBatches and entropy reveals from the bus and re-executes every tick with 4 partitions (a different partition count from production whenever production runs ≠ 4; otherwise 1). After each tick it compares `logicalStateHash`, `eventDigest` and `postingDigest` with the production TickRecord.
- Lag target: `lagTicks ≤ PARAM.tm_shadow_max_lag_ticks = 720` (one game day). Lag above 2× pages on-call (INC-3).
- Entropy: the verifier receives reveals only after they are public (19 §3.12), so the lag is at least the reveal delay; it never holds the live seed.
- A mismatch is an INC-1: the shadow verifier halts, the production world continues (production is authoritative), a CRITICAL RegressionCase is filed with both TickRecords, and a hotfix investigation (Rule 3.9.3) starts. A second shadow verifier on the other CPU architecture breaks ties: if it agrees with production, the first verifier's host is suspect; if it agrees with the first verifier, production is suspect and staff decide on a halt (21 §3.3).

**Rule 3.11.2 (live monitors).** The integrity telemetry of 02 §10.3 and 03 §16 runs as live monitors over the event stream (projector consumers), each with an alert threshold. Launch monitors: money minted vs destroyed per tick by reason code; top 20 wealth deltas per game day with cause breakdown; P2P flow graph anomalies (15); contract defaults; flagged accounts; tick timing per phase; ops per hour by type; breach and detection rates by tier band; case outcomes vs ledger truth; dogpile-cap hits; heat-shield activations; protection-window early exits; top 20 attacker-victim pairs; ad grants per hour; fresh starts per hour; quarantined intents per hour. Each monitor's live value is compared with the band of the same metric (E6 vs E4); a live value outside its band for `PARAM.tm_live_band_breach_days = 3` game days in a row opens a Finding tagged `E6_LIVE`.

**Rule 3.11.3 (live exposure check).** When a CRITICAL or HIGH Finding opens, the Truth Machine scans the production event store for the finding's signature (the hunt's pattern expressed as an event query, written with the finding) over the last chapter, lists suspected characters with the value extracted (oracle applied to their accounts), and hands the list to 21 §3.6 (compensation and clawback) and §3.7 (enforcement). Suspected characters are not punished on a pattern match alone: 21's process decides, distinguishing good-faith discovery from repeated abuse.

### §3.12 The public Integrity Report

**Rule 3.12.1 (content and cadence).** Two publications share one data source. The **daily bulletin** is 19 Rule 3.12.5's signed report published by the jobs service every game day (money by reason class, M0/M2, systemic indicators, invariant counts, entropy commitments and reveals, audit-log chain head). The **weekly Integrity Report** (`IntegrityReport`, §2.8) is published every league week (7 real days, aligned to 15's league week boundary) and adds the curated sections only 20 and 21 hold: fixes, compensation and clawback totals, enforcement counts, shadow-verifier status, ad and fresh-start totals; a chapter summary follows each chapter boundary. Diegetic framing: "The Exchange and Stabilizer Integrity Report", issued by the fictional Exchange Authority (L6). It appears in Markets › Integrity report (17 app 5) and on a public web page.

**Rule 3.12.2 (what it never contains).** No character, company, fund or alliance is named in the fixes or enforcement sections; fixes use public titles ("Valuation of upgraded businesses on resale corrected"); counts are aggregated and suppressed below `PARAM.tm_report_min_count = 5` (shown as "fewer than 5"). Nothing in it can reveal an individual's strategy or holdings (L11).

**Rule 3.12.3 (verification links).** The report lists the entropy commitments published in the week (19 §3.12) and links the public verification tool: any player can pick an event in which they are a party (a fill, a breach roll, a scan, a verdict roll) and verify that its random draw matches the committed and revealed entropy (19 owns the cryptography; the tool is a read view).

### §3.13 Human playtests (B08)

**Rule 3.13.1 (cohorts and scenarios).** Playtests are E5 evidence. Cohorts: BEGINNER (never traded), TRADER (trades real markets as a hobby), QUANT, FINANCE_PRO (banking, credit, funds), GAME_DESIGNER, ACCESSIBILITY (screen reader users, motor and low-vision users). Each G3 of a new module and each G4 that changes a screen family names the scenario and cohorts: onboarding (BEGINNER, 8 participants), each integrated scenario S01–S08 of the bible as harness Scenarios with live humans (2 cohorts, 5 each), institution consoles (FINANCE_PRO, 5), Lab and strategy graphs (QUANT, 5), Security and Court (GAME_DESIGNER + BEGINNER), Boutique and ad offer (BEGINNER + ACCESSIBILITY).

**Rule 3.13.2 (measures and thresholds).**

| Measure | Definition | G3/G4 threshold |
|---|---|---|
| PT.loop_understood | participants who explain the core loop correctly after 10 minutes | ≥ 75% (BEGINNER) |
| PT.first_trade | first fill within 90 s of start without help | ≥ 80% |
| PT.would_return | "Would you open it tomorrow?" yes | ≥ 60% `DEFAULT` |
| PT.confusions | distinct confusion points logged per session, median | ≤ 3; each becomes a ticket |
| PT.neglected_controls | controls on the tested screens never used by any participant | reported; reviewed by 17 |
| PT.mandatory_attention | minutes per real day a delegating player (S08) must attend to keep their empire running | ≤ 15 `DEFAULT` |
| PT.specialist_credibility | specialists rating "this behaves like the real thing" ≥ 4 of 5 | ≥ 60% (V3 Part 1: a finance professional, a quant, an engineer and a game designer find it credible) |
| PT.sus | System Usability Scale, median | ≥ 68 |
| PT.a11y_task_success | ACCESSIBILITY cohort completes the scenario's key tasks | ≥ 90% |

**Rule 3.13.3 (ethics).** Participants are adults (18+), consent in writing, are told nothing is real money, can stop at any time, and their data is de-identified within 7 real days (21 §3.10).

### §3.14 Load, chaos and performance gates

**Rule 3.14.1 (load gate).** A synthetic load driver (19 harness role) opens real WebSocket sessions through the gateway against a staging world on production-equivalent hosts. Profiles: LAUNCH (5,000 CCU, 25,000 agents including player AIs), TARGET (100,000 CCU, the 19 architecture target). Each session behaves like a POP_BASELINE agent at 1.5× the real intent rate and subscribes to the channels a real client of that archetype uses. Pass criteria at each profile over 72 real hours: zero missed ticks; tick commit p99 ≤ `PARAM.tm_tick_p99_ms = 2500` (the old Phase 1 gate), p99.9 ≤ 4,000 ms; delta delivery p99 ≤ 800 ms after commit; zero ledger mismatch (INV-LED-*) and zero shadow mismatch; invariant cost ≤ 10% of P13 (Rule 3.2.6).

**Rule 3.14.2 (chaos gate).** In a staging world under LAUNCH load: kill a PLAYER partition's process (recovery from snapshot + replay ≤ 60 s, the world waits at the tick boundary, zero divergence after recovery); kill the active coordinator (standby takes over within 3 missed heartbeats, 19 Rule 3.2.3; zero double-sealed ticks); partition the bus for 10 s (world pauses, resumes, zero divergence); kill a gateway (clients reconnect and receive missed `me` deltas); restart PostgreSQL primary (failover; no intent lost because intents are in JetStream). Each scenario passes with zero invariant failures and zero shadow mismatch.

**Rule 3.14.3 (deploy drill).** A deploy between ticks with partitions rolling one at a time produces zero missed ticks (ROADMAP M52).

### §3.15 Sandbox and solo verification rules

These rules apply the planned defaults for offline play, all `DEFAULT (Mathis may override)`:
1. **No ranked solo play.** Nothing computed in the browser sandbox, an Academy practice world or an imported run file ever reaches a leaderboard, ladder, league, Hall of Fame, tournament, title of the online world or the integrity report (resolves ROADMAP Q5 and Risk R1). Check: the board writers accept scores only from `TickRecord`-backed production events (INV-SOC-004, below).
2. **Weekly challenges are server-only.** Weekly seed challenges and the weekly AI tournament run only on the server with TOURNAMENT seeds committed before the lock (resolves Q5 with no pre-server shared challenge; the entropy-drip idea N9 is not needed).
3. **Sandbox progress never carries over online.** No money, asset, rank, title, license, AI research, Reputation or any other sandbox state is imported into the online world (resolves ROADMAP Q4 more strictly than its option A: titles do not carry over either). Two account-level records are not game progress and stay where they are: Academy lesson completion flags and sandbox-only badges (19 Rule 3.17.4), shown only in the Academy and the sandbox and conferring nothing in the online world; and cosmetics bought with real money (21), which are account entitlements usable everywhere. Check: there is no intent kind and no import path from a run file or sandbox save into the online character; INV-STR-005's intent registry contains no `*.import_sandbox` kind.
4. **Held is off in the sandbox and in practice worlds.** A verdict there applies fines, op bans and the record only; no Held state is ever set (13 §3.10 owns the rule; resolves ROADMAP Q8 as option B; 19 Rule 3.17.4 and 18 §3.10.3 agree; ruling in 24). Check: band LAW.held_max; no `held` state exists on any sandbox or practice-world character.
5. **Ads never run in the sandbox** (21 §3.14.1): sandbox cash is not part of any economy.

Added invariant: **INV-SOC-004** (TICK, FATAL, owner 15): every board, ladder, league and tournament score update is derived from events of the production world (or of a server-run challenge world) whose `TickRecord` exists; there is no write path from client-submitted results.

### §3.16 The exploit disclosure programme

**Rule 3.16.1 (reporting).** Any player may report a suspected exploit or game defect through Help › Report a problem (21 §3.6) with category "Exploit". The report may include a tick range, entity ids they own, a description and optionally a sandbox run file.

**Rule 3.16.2 (safe harbour).** A player who reports an exploit within `PARAM.tm_disclosure_window_ticks = 17280` (1 real day) of first using it, and who did not use it on other players' accounts, keeps no gains (they are reversed by compensating entries, 21 §3.6) but receives no enforcement action. Repeated use after the report, or use beyond what was needed to confirm it (more than `PARAM.tm_disclosure_max_uses = 3` uses or gains above `PARAM.tm_disclosure_max_gain = $100,000` or 5% of NW, whichever is larger), loses the safe harbour.

**Rule 3.16.3 (rewards).** Verified, original reports earn cosmetic and recognition rewards only (L7, no cash, no Prestige): the profile title "Auditor" (first verified report), a "Fix credited" line in the next integrity report naming the player only if they opt in, and the cosmetic frame "Integrity Seal" for CRITICAL findings. No money faucet exists for reports.

---

## §4 Player intents

The Truth Machine adds very few player actions; most of its surface is read-only. Envelope per 00 §5.5 and 19 §2.3. Read requests use the 19 `req` message (no tick, no state change).

| Kind | Payload | Validation (P1) | Effect |
|---|---|---|---|
| `acct.report.exploit` | `{ description: string (20–4000 chars), tickFrom?: Tick, tickTo?: Tick, entityIds?: Id[] (≤ 20, must be own or public), runFileRef?: string }` | account FULL; ≤ `PARAM.tm_reports_per_day = 5` per real day; entityIds visible to the actor | Creates a support ticket of category EXPLOIT (21 §3.6) outside engine state; the engine records only a PRIVATE event `tm.report.filed` with the ticket id, so the safe-harbour clock (Rule 3.16.2) is provable |
| `acct.integrity.optin_credit` | `{ reportTicketId: string, credit: boolean }` | ticket belongs to the actor and is VERIFIED | toggles whether the player's handle appears in the integrity report's fix credits |

Read requests (no intent): `tm.report.get { reportId }` returns an IntegrityReport; `tm.report.list { from?, to? }`; `tm.verify.outcome { eventId }` returns the commitment, reveal and recomputed draw for an event the viewer is a party to (19 §3.12; refused with `TM_NOT_PARTY` otherwise).

Reject codes: `TM_REPORT_RATE_LIMITED`, `TM_REPORT_TOO_SHORT`, `TM_ENTITY_NOT_VISIBLE`, `TM_NOT_PARTY`, `TM_TICKET_NOT_VERIFIED`. Platform intent results for quarantine: `SYS_QUARANTINED` (Rule 3.2.4), `SYS_KIND_BLOCKED` (second quarantine in a day).

---

## §5 Engine events

Envelope per 00 §5.6. Truth Machine events are mostly internal platform events written to the `tm_events` table, not to the world event stream; the few world events are listed first.

| Kind | Visibility | Emitted when | Payload |
|---|---|---|---|
| `tm.report.filed` | PRIVATE (reporter) | `acct.report.exploit` accepted | `{ ticketId, tick }` |
| `tm.integrity.published` | PUBLIC | weekly and chapter reports | `{ reportId, coversTicks }` (Wire item "Integrity Report published", 16 news template `NEWS_INTEGRITY_REPORT`) |
| `tm.world.halted` | PUBLIC | Rule 3.2.2 step 6 | `{ tick, reasonCategory: 'SYSTEM_CHECK' }` (diegetic: "Trading halted by the Exchange") |
| `tm.world.resumed` | PUBLIC | after hotfix | `{ tick }` |
| `tm.intent.quarantined` | PRIVATE (actor) | Rule 3.2.4 | `{ intentId, tick }` |

Internal (`tm_events`, never sent to clients): `tm.invariant.failed {violationId, invariantId, tick, partitionId, attempt}`, `tm.safe_mode.entered {tick}`, `tm.safe_mode.recovered {tick}`, `tm.bisect.result {tick, culprits[]}`, `tm.invariant.alert {invariantId, tick}`, `tm.shadow.mismatch {tick, verifierId}`, `tm.shadow.lag {lagTicks}`, `tm.equivalence.failed {runId}`, `tm.band.failed {bandId, runId, value}`, `tm.finding.opened {findingId, huntId, severity}`, `tm.finding.status {findingId, status}`, `tm.gate.result {gateRunId, gate, verdict}`, `tm.exposure.listed {findingId, suspects}`, `tm.case.filed {caseId, source}`.

Consumers: 21 admin console (Truth Machine dashboard, incident paging), 19 observability, 16 news (`tm.integrity.published` and halts only), 17 (halt overlay).

---

## §6 NPC behaviour

NPCs have no Truth Machine actions. The module constrains them:
1. Every NPC entity is subject to the same invariants as players (INV-BS-*, INV-LED-*); NPC actors respect their balance sheets (W04, Rule 3.5.6).
2. NPC liquidity and NPC actor policies are tested by hunts H21, H28 and A46; any NPC rule that a test agent can predict well enough to profit risk-free (O-RISKFREE) is a finding against 05 or 16.
3. NPC-only worlds (no players) must pass the CALIBRATION bands (the world lives without the player, V3 Part 7).
4. House AIs in the weekly tournament (11) are reference rows, run on the same seeds and the same DU caps as entrants.

---

## §7 Screens

Player-facing (layouts in 17):
- **Markets › Integrity report** (17 app 5): the current weekly report, chapter summaries, archive; sections Money, System risk, Integrity, Fixes, Enforcement, Ads and fresh starts, Commitments. Charts of M0/M2 and faucet/sink split by class per week.
- **Verify an outcome** sheet: opened from any event row in which the player is a party (a fill, an op roll, a scan, a verdict): shows commitment hash, reveal, recomputed draw and "Matches" or "Does not match" (the latter opens a support ticket automatically).
- **Help › Report a problem › Exploit** form (21 owns the form; this module defines the fields in §4).
- **System overlay "Trading halted by the Exchange"** (17) during a Truth Machine halt, with the reason category "System check".
- **Profile** shows the "Auditor" title and "Integrity Seal" frame when earned.

Internal (admin console, 21 §3.3 module TRUTH):
- **Truth Machine dashboard:** live tick health (missed ticks, phase timings, invariant evaluations and failures per tick, safe-mode ticks, quarantines), shadow verifier lag and mismatches, open Findings by severity, latest gate runs per gate with verdicts, band trend charts (E4 vs E6 side by side for each metric that has both).
- **Case viewer:** a RegressionCase with its bundle, replay controls (step tick by tick, phase by phase), the first-divergence report and entity diffs.
- **Harness console:** launch HarnessRuns from templates, see queue and results, compare runs (diff of band results between two params versions).
- **Exposure list:** for a Finding, suspected characters with extracted value, handed to compensation and enforcement queues.

---

## §8 Edge cases

1. **Invariant failure on a chapter-boundary tick.** The boundary hooks (P2) re-run with the tick in safe mode; ladder settlement waits for the committed tick; the boundary is never skipped or doubled (INV-ENG-007).
2. **Failure while a cross-partition transfer is in flight.** The rollback of tick T releases holds placed in T; holds from T − 1 stay and settle in the replay (INV-BS-012 bounds them to 2 ticks).
3. **Bisection hits an intent pair that only fails together** (e.g. two linked accounts in the same tick): bisection breaks without a single culprit; if removing both passes, both are quarantined; otherwise Rule 3.2.2 step 6.
4. **The culprit is a system input** (an admin parameter change or ad grant): system inputs are never quarantined automatically; the world halts (step 6) and staff revert the system input through a new two-person `adm.*` input (21 §3.2).
5. **Shadow verifier falls behind by more than a game day** after a snapshot gap: it reloads the latest DAILY snapshot and continues; the skipped range is verified by a nightly OFFLINE replay job so no tick goes unverified for more than 2 real days.
6. **Engine version change mid-chapter.** Equivalence and version replay compare like with like: an `EquivalenceRun` never mixes engine versions; version replay uses intended-change effective ticks (Rule 3.3.6).
7. **A band's metric is undefined** for a seed (e.g. no recession happened, so recession length is undefined): the seed is excluded from that metric and `seedsUsed` reported; if fewer than 80% of seeds define the metric the run is extended with more seeds until 80% do or 3× the seed count is reached, then reported as `INSUFFICIENT_DATA` (counts as fail at G3 only for ACCOUNTING bands).
8. **A system is built but its flag is off in production.** Its bands and hunts run in G3 anyway (with the flag on in harness worlds); they block only the release that turns that flag on, not other releases.
9. **WITHHELD seeds exhausted mid-chapter** (too many G3 runs): fresh indices are drawn from the same salt; the set never reuses a retired index.
10. **A test agent hits a rate limit or a license gate.** That is data: the agent waits as a player would; hunts that need a license first progress the agent to it legitimately (or start from a fast-forwarded MIRROR character with that license).
11. **Player reports an exploit that is already a known Finding.** The report is linked to the Finding; safe harbour applies; the "Auditor" title is granted only to the first verified original report per Finding.
12. **Integrity report week with a world halt.** Missed ticks are reported (`ticksMissed`); the report states the halt duration and its public cause category.
13. **Browser sandbox on a device with non-IEEE behaviour.** The engine uses only the determinism-safe math of 02 (fixed-point where 02 requires, no transcendental functions outside 02's deterministic implementations); the browser-vs-Node check (Rule 3.3.7) covers the supported browser engines; an unsupported browser shows "This browser cannot run the practice world" instead of a divergent sandbox.
14. **Daylight-saving and timezone changes for local-day rules** (ads, quiet hours): the harness includes time-zone fixtures for DST transitions in Europe, America and Asia Pacific; FAU.ads_per_local_day must hold on 23- and 25-hour local days.

---

## §9 Exploits and counters

| # | Exploit of the verification system itself | Counter |
|---|---|---|
| E1 | Tuning to the test: developers overfit parameters to the seeds the gate uses | WITHHELD judging set, per-seed results hidden, retired after use (Rule 3.10.2) |
| E2 | Frozen bots hide a broken market (agents too dumb to find the edge) | adaptive A47 re-runs of every DOMINANCE and CALIBRATION band; generic hunt H35 (Rule 3.5.5) |
| E3 | Test agents with privileges find "exploits" no player could use, or miss ones only players can see | strict player-level permissions and views (Rule 3.5.2); probes never feed agents |
| E4 | Sampling invariants for speed lets a violation slip | sampling forbidden (Rule 3.2.6) |
| E5 | Partition-specific behaviour hides in the one shape production runs | equivalence at 1/4/16 plus a random map nightly; shadow verifier at a different count (Rules 3.3.3, 3.11.1) |
| E6 | Merging evidence: a modelled result reported as proof that a system works | evidence categories with `systemExercised`/`unimplementedDependencies` (Rule 3.4.1) |
| E7 | Widening a band to ship | bands change only by 24 decision; ACCOUNTING never waivable (Rule 3.7.1, 3.9.2) |
| E8 | A player farms the exploit-report programme (report trivial things, or abuse then report) | cosmetic-only rewards, first-original rule, safe-harbour limits on uses and gains (Rule 3.16) |
| E9 | A player crafts intents to trigger quarantines on others (e.g. by forcing a counterparty's intent to fail) | bisection quarantines only intents whose removal makes the tick pass; a second quarantine blocks only the culprit's own kind; staff review clears false blocks; quarantine is never a cheating flag by itself |
| E10 | Ranked results from tampered local saves | no ranked solo; board writes only from production TickRecords (INV-SOC-004) |
| E11 | Using the verification tool to learn others' random draws | `tm.verify.outcome` only for events where the viewer is a party; reveals are public only after the reveal delay (19 §3.12) |
| E12 | Mirror worlds leaking player data to staff | pseudonymization, TM_ENGINEER only, logged, 14-day retention (Rule 3.5.7) |
| E13 | Purchase code reaching into the economy | INV-STR-002..004, INV-PRG-002 (structural L7) |

---

## §10 Acceptance tests

1. Every engine module folder exports `invariants.ts`, and the catalogue ids INV-LED-001..014, INV-BS-001..012, INV-MKT-001..006, INV-CCP-001..003, INV-BNK-001..002, INV-FND-001..003, INV-INS-001, INV-CON-001..007, INV-LAW-001..004, INV-SOC-001..004, INV-PRG-001..002, INV-ENG-001..010 and INV-STR-001..010 are all registered and each has a passing negative test (Rule 3.9.4).
2. A crafted posting with debit ≠ credit in one entry prevents the tick from committing on every partition, triggers safe mode, and produces an InvariantViolation for INV-LED-001 and a RegressionCase with a ReproBundle that reproduces the failure headless.
3. A crafted FAUCET posting of $1 changes M0 by exactly 1,000,000 micro-units, and a crafted TRANSFER that changes M0 fails INV-LED-003.
4. A tick whose failure is caused by one crafted intent among 500 isolates that intent by bisection in ≤ 10 trials, rejects it with `SYS_QUARANTINED`, and commits the other 499 with the same results as a tick in which the bad intent was never submitted.
5. A failure with zero player intents (crafted system defect) halts the world: `WorldStatus = HALTED_EXCHANGE`, the public `tm.world.halted` event is emitted, and no further tick commits until resume.
6. For 20 SMALL seeds × 7 game days with recorded hunt-farm intents, `logicalStateHash`, `eventDigest` and `postingDigest` are identical at every tick for 1, 4 and 16 partitions and for one random 2–24 partition map.
7. Resuming any of those runs from a mid-run snapshot instead of genesis yields the same three digests at every later tick.
8. A 30-game-day MICRO world produces identical `logicalStateHash` every tick in Node (x64 and arm64) and in the browser Web Worker build.
9. The module graph check fails the build when any file under `apps/web/store/**`, `apps/jobs/commerce/**` or `packages/platform/commerce/**` imports, directly or transitively, `packages/engine` (INV-STR-002), and there is no configuration that waives it.
10. The engine bundle contains no import of the commerce or ad modules, and the world host's deployment manifest contains no commerce-schema or ad-network credentials (INV-STR-003, -004).
11. Every intent kind in `packages/protocol` maps to exactly one engine handler and appears in its module spec's intent list (INV-STR-005).
12. A test agent cannot read any field of another agent's private state: the delta audit over 20 seeds × 200 agents reports zero entitlement violations (PRV.delta_audit).
13. A24's holdings-prediction lift over the baseline is ≤ 0.05 on 20 seeds (PRV.inference_lift).
14. Each test agent's intents pass through the same P1 validation and rate limits as a human: a harness assertion counts zero intents accepted above 20 per tick per character and zero AI DU above 2,000 per tick.
15. H07: with A33 at K = 720 clips, MKT.self_impact_clip_ratio ≤ 1.5 and MKT.self_mark_peak_pump ≤ 0 on 20 seeds.
16. H08: a main's peak and rank are unchanged (within 0.1%) whether or not an alt buys the same asset after the main (crowd-exit valuation).
17. H14: FAU.bust_farm_mean_ratio ≤ 1.00 at 8 and 24 weeks and FAU.bust_option_value ≤ $5,000 per 8-week window on 200 seeds.
18. H15: across 200 seeds with A34 changing timezone, device clock and NW around local midnight, no character receives more than 10 ad grants in a local day, none on a day whose start-of-day NW was ≥ $1,000, and every grant is exactly $250 real ($250 × MSI) tagged `AD_GRANT`.
19. H16: zero acceptances of `AD_GRANT` or `FRESH_START` lots for ops, insider actions, margin, derivatives or P2P within their windows on 200 seeds.
20. H13: A32 extracts $0 beyond fees from investors over 10,000 random action sequences and 60 seeds.
21. On 60 VALIDATION seeds at POP_BASELINE, no simple public strategy beats BH on more than 70% of seeds after fees (MKT.max_strategy_beats_bh).
22. The crowd gate passes: the 100 × $250k crowd's crowded beat < 0.55 and ≤ uncrowded − 0.05 on 60 seeds (MKT.crowd_decay).
23. On 20 seeds with POP_CONFLICT, CON.crime_ev_ratio ∈ [0.8, 1.2] and CON.crime_variance ∈ [2, 4], and CON.wrongful_conviction < 3% on 200 seeds.
24. On 60 seeds, median engaged NW at account age 7 real days lies in [$250k, $1M] and at 56 days in [$150M, $600M] (ECO.wealth_median).
25. On 200 seeds of 1 chapter, the share of seeds with ≥ 1 major crisis lies in [0.25, 0.45], every major had ≥ 8 real hours of precursors, and none started in the final 48 real hours.
26. GEV fits for the four tail series produce ξ and 1-in-10-year return levels inside the TAIL.* bands on 200 seeds × 5 game years.
27. A G3 run includes WITHHELD seeds, reports only aggregates for them, and marks those indices retired afterwards; a second G3 never uses a retired index.
28. Every RegressionCase in the FAST tier replays in ≤ 30 s and reproduces its expected outcome on the current main branch.
29. The shadow verifier re-executes every production tick with a different partition count, stays within 720 ticks of live under LAUNCH load, and a crafted divergence on one entity is reported as `tm.shadow.mismatch` within one tick of the verifier reaching it.
30. Under the LAUNCH load profile for 72 real hours: zero missed ticks, tick commit p99 ≤ 2,500 ms, delta p99 ≤ 800 ms, zero invariant failures, invariant cost ≤ 10% of P13.
31. Removing all language-model-generated prose from a 30-game-day run (replacing it with template text) leaves `logicalStateHash` identical at every tick (B09: prose never creates economic truth).
32. Killing a PLAYER partition under load recovers within 60 s with zero divergence from the shadow verifier; killing the coordinator causes no double-sealed tick.
33. The weekly IntegrityReport contains every field of §2.8, names no character, company, fund or alliance, suppresses counts below 5, and its M0 change for the week equals Σ faucets − Σ sinks of the week to the micro-unit.
34. `tm.verify.outcome` returns a matching recomputed draw for a fill the viewer was party to and refuses (`TM_NOT_PARTY`) for an event they were not party to.
35. No board, ladder, league, tournament or Hall of Fame entry can be created from a sandbox run, a practice world or an imported run file: an attempt through every public API path is rejected and INV-SOC-004 holds on 20 seeds.
36. In the sandbox at any speed and in a practice world, a verdict that would carry Held online produces only its fine, op ban and record entry; the character is never Held (13 §3.10).
37. There is no intent kind, API path or support tool that imports sandbox state into an online character (registry scan plus admin-console audit).
38. A player who reports an exploit within 1 real day of first use and used it ≤ 3 times keeps no gains, receives no enforcement action, and receives the "Auditor" title if the report is the first verified one for that Finding; no money is posted.
39. Every gate run lists its checks grouped by evidence category; a simulation that stubbed a module lists it in `unimplementedDependencies` and cannot mark that module's acceptance tests as passed.
40. A failing ACCOUNTING band cannot be waived: a waiver request in the gate service is refused with an explicit error.
