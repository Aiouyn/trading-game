# 12 — Conflict and Intelligence

Owner module: 12. Status: complete specification, 2026-10-18.
Scope (00 §1): attack surface, abstract cyber and espionage ops, resolution math, hidden sessions, defense, detection, honeypots, market-conduct conflict.
Hands off to 13 (evidence grading, investigation, courts, sanctions, regulators, insurance claims, anti-grief enforcement).

**Tone and safety rule (binding on builders and content writers).** Every op in this module is a named game verb resolved by numbers: cost, preparation time, a success probability, a detection probability, an evidence yield, a cooldown. No op text, tooltip, help page, news template or Academy lesson may describe a real-world technique, tool, product, vulnerability or method. Flavor text uses corporate-thriller language about outcomes ("the Siphon is connected", "a mole is in place"), never about mechanisms. All institutions, firms and laws are fictional (L6). Content age rating 16+ (L5).

**Time conversions used throughout.** 1 real minute = 12 ticks. 1 real hour = 1 game day = 720 ticks (L9). 1 real day = 17,280 ticks. Game hour = 30 ticks. Durations that the old vision stated in real time stay in real time and are stored in ticks.

---

## §1 Purpose

1. Make wealth attackable and defendable so that the richest players have an edge but never immunity (L2 floor 1%).
2. Make crime a priced business: every op shows its expected cost, success band, detection band and the sanction schedule it maps to (13 §3.9). Target: a competent criminal's chapter outcome is 0.8–1.2× a competent honest player's, at 2–4× the variance (20 balance bands).
3. Implement Mathis's hidden-session model (L3): quiet intrusions plant concealed entries that accrue progress toward a 0.85 ceiling until noticed and disconnected; offline slows accrual; defense AI auto-scans by tier.
4. Provide the intelligence layer: scouting, dossiers, informants, counter-intelligence, so information is a contested resource.
5. Provide market-conduct conflict (squeezes, false stories, short campaigns, rebuttals) as first-class adversarial play that the regulator (13) polices.
6. Emit every fact as an event so that evidence is discoverable later (13) and nothing is ever perfectly clean.

Design principles kept from the old vision 03 §0: crime has EV; every op leaves evidence; rich have an edge not immunity; victims have recourse; no permanent ruin; punch-up cheap, punch-down expensive; legibility before commitment; every flow tagged; abstract fiction only.

---

## §2 Entities

All types follow 00 §3.1–3.2. `Id` is a string id. `Tick` is an integer. `Money` is bigint micro-dollars.

### §2.1 Surface units

```ts
type SurfaceClass =
  | 'TREASURY' | 'BUSINESS' | 'COMPUTE' | 'MODEL' | 'DATASET'
  | 'STAFF' | 'VENDOR_LINK' | 'ALLIANCE_LINK' | 'PUBLIC_PROFILE' | 'PHYSICAL';

interface SurfaceUnit {
  id: Id;                      // 'su_' + ulid
  ownerId: Id;                 // chr or cmp; resolves to a chr via ownerId chain (00 §5.3)
  class: SurfaceClass;
  refId: Id;                   // the business, model, dataset, staff member, vendor contract, alliance, property
  valueMoney: Money;           // marked value at last recompute (what is at stake)
  exposureWeight: number;      // float64, default per class (§3.1 table)
  budgetUnits: number;         // defense budget units allocated to this unit (float64 >= 0)
  coverage: number;            // derived each recompute: clamp(budgetUnits / 1.0, 0.3, 1.3)
  patch: number;               // freshness 0.6..1.1 (§3.5)
  lastRecomputeTick: Tick;
}
```

Surface units are created and destroyed by the owning modules' events (business bought → BUSINESS unit; model deployed → MODEL unit). 12 subscribes to these events in P10 and keeps the table in sync. One unit per referenced thing, except TREASURY (one per character plus one per alliance treasury) and PUBLIC_PROFILE (one per character).

### §2.2 Defense profile

```ts
interface DefenseProfile {
  ownerId: Id;                      // chr (alliances have their own, see SOC)
  layers: {
    perimeter: boolean;  endpoint: boolean;  staffTraining: boolean;
    monitoringLevel: 0|1|2|3|4|5;   // §3.4
    backups: boolean;   deceptionItems: Id[];   // honeypot/canary ids
    legalRetainerGrade: 0|1|2|3|4|5; incidentResponseRetainer: boolean;
  };
  annualSpend: Money;               // sum of layer costs annualized (§3.4)
  totalBudgetUnits: number;         // = annualSpend / PARAM.defense_unit_price
  allocationMode: 'AUTO_EVEN' | 'AUTO_VALUE' | 'MANUAL';
  defenseModelId: Id | null;        // the deployed cyber-defense model (11), provides DP_ai and scan tier
  dpAi: number;                     // from 11, cached each game hour
  scanTier: 0|1|2|3|4|5;            // from the defense model's AI tier
  irActiveUntilTick: Tick;          // incident response boost window
  heatShieldUntilTick: Tick;        // §3.10 (granted by 13 §3.12 rules)
  lockdownCooldownUntil: Tick;
  lastDeepScanTick: Tick;
  physicalSecurityGrade: 0|1|2|3|4|5; // from lifestyle homes (14), defends PHYSICAL only
}
```

### §2.3 Attack capability

```ts
interface AttackCapability {
  ownerId: Id;
  attackModelId: Id | null;    // cyber-attack model (11)
  ap: number;                  // Attack Power from 11: round(security_MCS * q), q in [0.8,1.3]
  aiTier: 0|1|2|3|4|5;         // drives live-session cap (§3.7.4)
  opBanUntilTick: Tick;        // set by 13 sanctions
  crewGrade: 0|1|2|3|4|5;      // physical crew hired for E5 (§3.9)
}
```

AP ranges per tier (RESOLVED-NUMBERS B2, kept): T0 5–20, T1 20–60, T2 60–200, T3 200–600, T4 600–2,000, T5 2,000–5,000. `DP_ai` = 0.8 × AP at equal tier (11 owns the model output).

### §2.4 Op

```ts
type OpKind =
  // cyber (numbered as in the old vision, renamed to abstract verbs)
  | 'C01_SURVEY' | 'C02_LURE_STAFF' | 'C03_LOCKOUT' | 'C04_DATA_SIPHON'
  | 'C05_MODEL_SESSION' | 'C06_QUERY_DISTILL' | 'C07_COMPUTE_LEECH'
  | 'C08_ORDER_TAP' | 'C09_JAM_AI' | 'C10_MOLE_FEED' | 'C11_VENDOR_PIVOT'
  | 'C12_FALSE_STORY'
  // espionage
  | 'E1_BRIBE' | 'E2_PLANT_MOLE' | 'E3_POACH' | 'E4_WALKOUT'
  | 'E5_BREAK_IN' | 'E6_ALLIANCE_LEAK' | 'E7_INFORMANT' | 'E8_DUE_DILIGENCE'
  // market conduct (§3.11)
  | 'M1_SHORT_CAMPAIGN' | 'M2_SQUEEZE' | 'M3_PUMP_PROMOTE' | 'M4_REBUTTAL';

type OpStatus = 'PLANNED' | 'PREPARING' | 'RESOLVED_SUCCESS' | 'RESOLVED_FAIL'
              | 'CANCELLED' | 'BLOCKED';

interface Op {
  id: Id;                       // 'op_' + ulid
  kind: OpKind;
  attackerId: Id;               // chr (or ali for joint ops: leader chr + participants)
  participants: Id[];           // joint op contributors, max PARAM.joint_op_max_contributors = 5
  targetOwnerId: Id;            // victim chr (or cmp/asset owner for market ops)
  targetUnitId: Id | null;      // chosen surface unit; null = engine picks weakest covered (§3.3)
  strength: 'WHISPER' | 'TAP' | 'SIPHON' | null;   // session ops only
  launchTick: Tick;
  resolveTick: Tick;            // launchTick + prepTicks
  costPaid: Money;
  apUsed: number;               // combined AP at launch
  dpEffAtResolve: number | null;
  pBreach: number | null;
  rollBreach: number | null;    // the RNG draw (stored for replay and court, SEALED)
  pDetect: number | null;
  detected: boolean | null;
  status: OpStatus;
  resultRef: Id | null;         // session id, loot posting entry ids, etc.
  evidenceSeeded: number;       // evidence points written to 13 (§5)
}
```

### §2.5 Hidden session

```ts
interface HiddenSession {
  id: Id;                       // 'hs_' + ulid (internal, never sent to victim client)
  publicLabel: string;          // rotating random label shown in Connections (00 §3.2)
  victimOwnerId: Id;
  victimModelId: Id;            // for C04 the dataset's host model, for C07 the compute pool's model
  attackerId: Id;
  opId: Id;
  payload: 'MODEL' | 'DATA' | 'COMPUTE' | 'ORDERS';
  strength: 'WHISPER' | 'TAP' | 'SIPHON';
  coverKind: ConnectionKind;    // drawn from the victim's own legitimate mix (§3.7.5)
  openedTick: Tick;
  expiresTick: Tick;            // openedTick + PARAM.session_max_lifetime_ticks
  hEff: number;                 // effective hours accrued (float64)
  progress: number;             // P in [0, 0.85]
  offlineStretchGain: number;   // P added during the current offline stretch (cap 0.08)
  flagged: boolean;             // set by a successful scan
  status: 'ACTIVE' | 'FROZEN' | 'DISCONNECTED' | 'PULLED' | 'EXPIRED' | 'VOIDED';
  closedTick: Tick | null;
  closeReason: 'VICTIM_DISCONNECT' | 'QUARANTINE' | 'LOCKDOWN' | 'ATTACKER_PULL'
             | 'LIFETIME' | 'LINKED_ACCOUNTS' | 'DORMANT' | 'COURT_ORDER' | null;
}
```

### §2.6 Connection entry (what the victim sees)

```ts
type ConnectionKind = 'OWN_WORKER' | 'DATA_FEED' | 'LICENSEE' | 'ALLIANCE_SHARE'
                    | 'VENDOR' | 'EXCHANGE_GATEWAY';

interface ConnectionEntry {          // identical serialization for legit and hostile
  label: string;                     // rotating codename + region, e.g. 'AMBER-42 · Port Avalon'
  kind: ConnectionKind;
  firstSeenGameHour: number;         // game-hour precision only
  lastHandshakeGameHour: number;
  loadPct: number;                   // share of model DU budget, 1 decimal
  status: 'ACTIVE' | 'REKEYING' | 'FLAGGED';
  userTag: 'NONE' | 'TRUSTED' | 'WATCH';
  userNote: string;                  // max 280 chars, private
}
```

Server-side, each entry maps to either a legitimate source (`LegitConnection { id, modelId, kind, sourceRef, loadPct, openedTick }`) or a `HiddenSession`. The mapping table is never serialized to any client.

### §2.7 Clue and decoy events

```ts
type ClueType = 'SLOWDOWN' | 'ODD_USAGE' | 'OFF_HOURS_HANDSHAKE';
interface AnomalyEvent {
  id: Id; ownerId: Id; modelId: Id; tick: Tick;
  type: ClueType;
  namedLabel: string | null;         // only OFF_HOURS_HANDSHAKE names an entry
  magnitudePct: number;              // e.g. "dipped 6%"
  durationGameMin: number;
  // server-only:
  real: boolean;                     // SEALED; true if emitted by a hostile session
  sessionId: Id | null;              // SEALED
}
```

### §2.8 Deception items

```ts
type DeceptionKind = 'HONEYPOT_BASIC' | 'HONEYPOT_ADVANCED' | 'HONEYPOT_FRONTIER'
                   | 'CANARY_DATASET' | 'CANARY_BRIEFING';
interface DeceptionItem {
  id: Id; ownerId: Id; kind: DeceptionKind;
  hostRefId: Id;                // decoy model id, or the dataset carrying canary records
  poison: number;               // 0.20 / 0.40 / 0.60 for honeypots, 0 otherwise
  createdTick: Tick; upkeepPerGameDay: Money;
  trippedBy: Id[];              // attacker ids (SEALED)
}
```

### §2.9 Staff loyalty (espionage surface)

12 reads staff from 09 and 11. It owns one field per staff member:

```ts
interface StaffLoyalty {
  staffId: Id; employerId: Id;
  loyalty: number;              // 0..100, recomputed daily at t = 719 (§3.9.1)
  turned: boolean;              // SEALED: is a mole / bribed
  turnedBy: Id | null;          // SEALED
  moleOpId: Id | null;
}
```

### §2.10 Intelligence items

```ts
interface IntelItem {
  id: Id; holderId: Id;
  source: 'SURVEY' | 'DOSSIER' | 'INFORMANT' | 'MOLE' | 'ORDER_TAP' | 'ALLIANCE_FEED' | 'LEAK';
  subjectId: Id;
  createdTick: Tick; expiresTick: Tick;
  fields: Record<string, unknown>;   // e.g. { unitCount: 22, dpBand: '300-450' }
  accuracy: number;                  // probability the content is true (shown as a band)
  provenance: 'CLEAN' | 'GREY' | 'ILLICIT';  // ILLICIT = obtained by a crime; trading on it is insider (13)
}
```

### §2.11 World hack rate

```ts
interface WorldConflictState {
  hackRate: number;            // successful hostile ops per 1,000 active characters per game day, EMA
  zeroDayActiveUntil: Tick;    // §3.6
  pandemicActive: boolean;     // cyber-pandemic crisis flag (04 crisis catalog)
}
```

Published each game day as a public macro variable consumed by 04 (crisis trigger), 05/06 (security sector demand), 08 (premiums) and 16 (news).

---

## §3 Rules and formulas

Everything in §3 runs in phase **P10 conflict** of the tick pipeline (00 §5.2), after P9 real and before P11 law. P10 reads state committed by earlier phases and the current tick's earlier phases; it writes only 12's entities plus ledger postings queued for P13 and evidence rows queued for 13's P11. Op RNG draws come from the `conflict` RNG stream (02 owns stream derivation: `streamHash(worldSeed, 'conflict', tick)`), so every roll is replayable.

### §3.1 Surface model

Each surface unit carries a value and an exposure weight. Default exposure weights by class:

| Class | `exposureWeight` default | Loot on breach |
|---|---|---|
| TREASURY | 1.0 | cash (capped §3.8.2) |
| BUSINESS | 0.8 | cash, data, downtime, ransom |
| COMPUTE | 0.7 | leeched compute (capped §3.4-C07) |
| MODEL | 1.0 | distillation session |
| DATASET | 0.9 | dataset copy |
| STAFF | 0.6 | mole access, leaks |
| VENDOR_LINK | 1.2 | pivot to vendor's clients |
| ALLIANCE_LINK | 0.9 | lateral movement, intel |
| PUBLIC_PROFILE | 0.5 | targeting attractiveness (never looted; raises exposure) |
| PHYSICAL | 0.7 | collectible / device (defended by physical security only) |

Totals and exposure (kept from old vision 03 §2.3):

```
S_total   = Σ_units ( (valueMoney_unit / 1e6) ^ 0.5 · exposureWeight_unit )   // value in dollars under the sqrt
unitCount = 3 + businesses + dataCenters + 0.5·staff + models + 2·sharedVendors + allianceLinks
heatMult  = 1 + heatBonus(prestige)      // 14 owns prestige; heatBonus = clamp(0.02·(PP-2000)/1000, 0, 0.12)
S_exposed = S_total · heatMult
```

Heat multiplies **exposure only** (how findable/attractive the character is to NPC crews and opportunists, §6), never the breach logit or the detection roll (locked decision, bible row 4). Recompute per character once per game hour, staggered by `hash(ownerId) mod 30` (00 §5.1).

Worked surface counts (targets, from old vision; informational, not binding): R2 ~9 units, R3 ~22, R4 ~48, R5 ~98, R6 ~140.

### §3.2 Breach probability

The core resolution is a logistic on log2 of the AP/DP ratio, so one doubling of AP over effective DP is +1 logit at every scale:

```
p_breach = floor + (ceiling − floor) · σ( log2(AP / DP_eff) + b_op )
σ(x)     = 1 / (1 + e^(−x))
floor    = PARAM.breach_floor = 0.01        // L2, applies only if AP ≥ DP_eff/8, else floor = 0
ceiling  = PARAM.breach_ceiling = 0.90
```

`b_op` is the per-op bias in the §3.9 catalog. Session ops add the strength bias on top of `b_op` (§3.7.1). At parity (AP = DP_eff) and b_op = 0, p_breach = floor + 0.89·0.5 ≈ 0.455.

Floor gate rule: if AP < DP_eff/8, the floor term does not apply and `p_breach = (ceiling−floor)·σ(...)` can fall below 1% (a hopelessly under-powered op is allowed to be near-impossible). If AP ≥ DP_eff/8, p_breach is clamped to at least 0.01 (no fortress).

### §3.3 Effective Defense Power

```
DP_eff = (DP_ai + DP_money + 10) · coverage · patch · SOC · IR

DP_ai      = DefenseProfile.dpAi                      // from 11; 0 if no defense model
DP_money   = 40 · sqrt(defense_spend_per_game_year / 10,000)   // dollars; sqrt = diminishing depth
coverage   = coverage_of_the_targeted_unit            // = clamp(unit.budgetUnits / 1.0, 0.3, 1.3)
patch      = unit.patch                               // 0.6..1.1 (§3.5)
SOC        = 1 + 0.2 · allianceSocLevel               // allianceSocLevel 0..3 (§3.4)
IR         = 1 + 0.5 · (now < irActiveUntilTick ? 1 : 0)
```

Weakest-covered-unit rule: when `Op.targetUnitId` is null, the engine picks the unit of the target that minimizes `DP_eff` over that owner's units in the op's attackable classes (cyber ops cannot target PHYSICAL; E5 targets only PHYSICAL). This is the heart of the wealth story: a whale buys depth per unit (sqrt in dollars) but breadth (coverage, linear in budget units) is the scarce resource. Coverage is capped at 1.3, so the weakest unit always lags and the floor always bites.

Budget allocation: `totalBudgetUnits = annualSpend / PARAM.defense_unit_price` (default $10,000/unit). In `AUTO_EVEN` each unit gets `totalBudgetUnits / unitCount`. In `AUTO_VALUE` units get budget proportional to `valueMoney^0.5`. In `MANUAL` the player sets per-unit budget (sum capped at `totalBudgetUnits`).

Joint ops: `AP_combined = AP_max + 0.5·Σ(other participants' AP)`, capped at `PARAM.joint_op_max_contributors = 5` contributors.

### §3.4 Defense stack and costs

Annual (game-year) costs; posted at day close pro-rata (one game day = 1/364 of a game year).

| Layer | Cost (per game year) | Effect |
|---|---|---|
| Perimeter | PARAM.perimeter_cost_per_unit = $2,000 · unitCount | enables DP_money base |
| Endpoint | $1,000 · unitCount | +0.15 coverage cap room (raises effective budgetUnits per unit by 15%) |
| Staff training | $5,000 · staffCount | −40% success on C02/C10/E1/E2 against this owner |
| Monitoring/SOC level L (0–5) | $20,000 · 2^L (L5 = $640k) | +`10·L` to detection `monitoring` term (§3.7.6); L≥2 enables in-house review (13 §4) |
| Backups | $10,000 · businessCount | C03 ransom loot becomes $0; lose 1 game hour of that business |
| Deception item | one-time: honeypot $30k/$120k/$400k; canary $30k + upkeep | §3.6 evidence + poison |
| Legal retainer grade G | $50,000 · G (G5 = $250k, plus elite = $2M for G5+) | −20% legal fees, faster incident response (13) |
| Incident Response retainer | $100,000 per activation | sets `irActiveUntilTick = now + 6 game hours`, IR = 1.5 |

Alliance SOC (02 §7.2): a Corporation-tier alliance buys SOC level 0–3 for `$50,000 · 4^level` per game year from the alliance treasury; every member gets that `allianceSocLevel`.

### §3.5 Security debt (patch decay)

Each unit's `patch` decays toward 0.6 without upkeep: `patch -= PARAM.patch_decay_per_real_day = 0.02` per real day (applied at day close, scaled per game day as 0.02/24). Paying the current game-year perimeter+endpoint+monitoring bill restores `patch` toward 1.1 at `+0.05` per real day up to the paid cap. A lapsed cybersecurity contract (a VENDOR_LINK that ends) is public via filings (15), readable by OSINT (§4), so neglect is a tell.

### §3.6 Zero-day world events and deception

- **Zero-day:** hooked to the cyber-pandemic crisis (04). On trigger, every unit's `patch −= 0.2` for `PARAM.zero_day_duration` (default 3–7 real days, drawn by the `world` stream). Emergency patch costs `$50,000 · unitCount` and cancels it for that owner. Security-sector equities and premiums spike (05/06, 08).
- **Player-triggered pandemic:** if `WorldConflictState.hackRate` crosses `PARAM.pandemic_hack_rate_trigger` (default 25 successful hostile ops per 1,000 active chars per game day) sustained for 1 real day, the crisis fires. The triggering coalition (top contributors to the spike) is referred to 13 as an S6 matter (manufacturing a pandemic). Short positions opened into the ensuing crash are flagged for disgorgement (13 §anti-exploit).
- **Honeypot:** a decoy MODEL unit that looks like a crown jewel to C01 survey. Breaching or running a C05 session on it is an automatic evidence hit (§5) and poisons any student trained from it (§3.8-C05). Honeypots cannot be licensed (15 blocks it), only exposed to survey, so honest licensees are never baited (13 anti-exploit #18).
- **Canary dataset:** fake records seeded into a real dataset (max 1 canary per 3 datasets). If a stolen copy is later resold, used to train, or listed on the data market, the canary trips and writes timestamped evidence.

### §3.7 Hidden sessions (L3, Mathis's model)

A successful **quiet** intrusion (C04 data siphon, C05 model session, C07 compute leech, C08 order tap) plants a `HiddenSession` instead of paying out. No alarm fires; the victim gains one more `ConnectionEntry` in the affected model's list. Loud ops (C03 lockout, C09 jam) resolve instantly and alert the victim on the tick (§3.9). C06 query-distill is not a hack (it uses a real license) and keeps the license route. Moles (E2/C10) are human-side (§3.9).

#### §3.7.1 Planting

Breach roll per §3.2. On success, the session is planted at the strength chosen at launch:

| Strength | `b_op` bias added | Accrual rate k (per effective real hour) | Victim DU drain | Clue rate (per real hour) | Scan multiplier m |
|---|---|---|---|---|---|
| Whisper | +0.5 | 0.02 | 2% | 0.03 | 0.6 |
| Tap | 0 | 0.05 | 5% | 0.07 | 1.0 |
| Siphon | −0.5 | 0.12 | 10% | 0.14 | 1.6 |

A failed breach plants nothing, leaves +5–15 evidence on the (attacker, victim, op) triple (§5), and has a 50% chance to emit one clue to the target (`conflict` stream).

#### §3.7.2 Accrual and ceiling

```
P(t)  = P_max · (1 − e^(−k · h_eff))         P_max = PARAM.session_ceiling = 0.85
h_eff = online_hours + 0.25 · offline_hours   // offline multiplier PARAM.session_offline_mult = 0.25
offline stretch cap: one continuous offline stretch adds at most +0.08 to P
```

`h_eff` is accrued in P10 each tick: `Δh_eff = (tickRealSeconds/3600) · (present ? 1 : 0.25)`, where presence is server-side (02 §4.2: an open authenticated socket or an intent in the last 15 real minutes). The attacker never sees presence. INACTIVE victims (14 real days without login, 15 §3.13; DORMANT starts at 30) freeze accrual.

Progress worth per payload:
- **MODEL (C05):** `student_MCS = teacher_MCS · min(P, retention_raw)`; then 11's laundering applies. Residue scales: `residue_raw = residue_base · (0.4 + 0.6·P/0.85)` (11 confirmed). Short session → weak student, faint residue; long session → strong student, easy to trace.
- **DATA (C04):** stolen copy quality = `dataset_quality · P`, provenance `ILLICIT` from tick one.
- **COMPUTE (C07):** loot builds at `drain% · victim_DU` per hour, capped by C07 cap (§3.9), transfer not mint.
- **ORDERS (C08):** nothing accrues; it is a live view of standing orders while connected.

When a session ends, the attacker keeps the current P. Max lifetime `PARAM.session_max_lifetime_ticks` = 7 real days.

#### §3.7.3 Session caps

- Per victim: at most `PARAM.sessions_per_victim_max = 3` hostile sessions from all attackers; total hostile DU drain capped at 20% (`PARAM.victim_drain_cap = 0.20`).
- Per attacker–victim pair: 1 session; after disconnect, a 24 real-hour re-plant cooldown.
- Per attacker by AI tier: T0–T1 1 live session, T2 2, T3 3, T4 4, T5 5.
- Rookie zone and the 72-hour new-player window block planting entirely (13 §anti-grief). Dormant accounts cannot be targeted.

#### §3.7.4 Linked-account void

If `linkedAccounts(attacker, victim)` is true (15 collusion graph), the session is `VOIDED` on plant, nothing accrues, and the scheme is flagged to 13 as an S4 laundering attempt (13 anti-exploit). Residue still ties any student to the source, so a laundered-via-alt student is traceable.

#### §3.7.5 Clues, decoys and the connection list

Each hostile session emits a clue at its clue rate. The server also emits benign decoy anomalies at `PARAM.decoy_rate_per_real_hour = 0.05` for every account (~1.2/day), whether or not anything is wrong. Real-clue shares (design targets): no hostile session 0%, one Whisper ~38%, one Tap ~58%, one Siphon ~74%.

Clue targeting: an off-hours-handshake clue names one entry; a real one names the hostile entry, a decoy names a random legitimate entry drawn fresh each time. Slowdown and odd-usage clues are account-level and name nothing. The tell is the same entry named repeatedly.

The real DU drain is always present (2/5/10%) and shows on the throughput gauge. Legitimate per-entry load runs 1–12% (from T2 up, ~1 in 4 ≥5%, ~1 in 10 ≥10%), so a Siphon's 10% does not stand out on load alone. Normal list sizes by tier (legit only): T0 2–4, T1 4–8, T2 8–15, T3 15–30, T4 30–60, T5 60–120. Legit churn per real day: T0 ~0.5, T1 ~1, T2 2–3, T3 4–6, T4 8–12, T5 15–25.

Serialization rule (anti-leak, 02 §4.2 / 15 anti-cheat): hostile and legit entries serialize identically (same fields, same rotating-label format, no hostile flag, no attacker id, no opened-tick precision beyond game-hour). The list refreshes at most once per game hour through the API. A hostile session's `coverKind` is drawn from the victim's own legit kind mix.

#### §3.7.6 Detection: auto-scans and manual scans

Auto-scans run on the defender's defense-AI tier. An auto-scan never flags a legitimate entry. On a hit, the entry is marked `FLAGGED` and a quiet security notification is sent.

```
p_scan = clamp( s_tier · m · sqrt(clamp(DP_eff / AP, 0.25, 4)), 0.02, 0.90 )
```

| Defense AI tier | Auto-scan cadence | s_tier |
|---|---|---|
| T0 | manual only | n/a |
| T1 | every 24 real hours | 0.15 |
| T2 | every 12 h | 0.20 |
| T3 | every 6 h | 0.25 |
| T4 | every 4 h | 0.30 |
| T5 | every 2 h | 0.35 |

`m` = session scan multiplier (Whisper 0.6, Tap 1.0, Siphon 1.6). A scan whose scheduled tick falls while the victim is offline still runs. Manual deep scan (any tier): $5,000 + 0.01% of NW, 30 real minutes, `s = 0.50`, 6-hour cooldown.

The incident detection roll (separate from attribution) for loud/quiet ops:
```
p_detect = 1 − e^( −(noise_op + monitoring + SOC_bonus + honeypot_hit·40) / 100 )
monitoring = 10 · monitoringLevel
```

#### §3.7.7 Disconnect, Quarantine, Lockdown

- **Disconnect one entry:** $1,000 + 0.02% of NW (cap $250k); the model re-keys for 5 real minutes. Disconnecting a `FLAGGED` entry is free. Disconnecting a legitimate entry triggers that contract's termination clause (15).
- **Disconnecting a hostile session:** attacker keeps current P; evidence onto the triple: +20 Whisper, +28 Tap, +35 Siphon, +10 if a scan had flagged it. Below the civil bar of 40 alone (13), so a second source is still needed.
- **Quarantine one model:** drops every session on it, pauses it 1 real hour. $2,000 + 0.01% NW, 6-hour cooldown per model.
- **Lockdown:** cuts every session (hostile and legit), pauses all the owner's AIs for 2 real hours, each legit counterparty costs $500 to reconnect, 24-hour cooldown, then a 12-hour shield against new sessions.

### §3.8 Loot, caps and sink/transfer tagging

#### §3.8.1 Reason codes (00 §5.4). All theft between characters is a TRANSFER; NPC-crew theft and fenced-goods haircut are SINK.

| Reason code | Class | Used by |
|---|---|---|
| `CONFLICT_RANSOM` | TRANSFER | C03 ransom paid victim→attacker |
| `CONFLICT_CASH_LOOT` | TRANSFER | treasury breach cash |
| `CONFLICT_COMPUTE_LEECH` | TRANSFER | C07 (value of leeched compute) |
| `CONFLICT_FENCE_HAIRCUT` | SINK | E5 fenced-goods 60% haircut destroyed |
| `CONFLICT_NPC_THEFT` | SINK | NPC criminal crews |
| `CONFLICT_OP_COST_NPC` | SINK | op costs paid to NPC services (recon tooling, crews) |
| `CONFLICT_OP_COST_PLAYER` | TRANSFER | op costs paid to a player-owned firm |
| `CONFLICT_BRIBE` | TRANSFER | E1 bribe to staff (staff is an NPC sink unless player-owned) |
| `CONFLICT_DEFENSE_SPEND` | SINK (to NPC) / TRANSFER (to player firm) | defense layer spend |

Model distillation, data copy and order taps move no money at plant time; their economic value shows up as the attacker's later PnL and as damages at court (13 §6).

#### §3.8.2 Caps (punch-up/punch-down, kept from old vision 03 §13.2)

```
r = NW_attacker / NW_victim
cashLootCap = min( 0.10 · victim_liquid_cash , 0.02 · victim_NW )
if r > 10:  loot × (10/r)^0.5 ;  noise += 10·log10(r/10) ;  damages × min(3, 1 + log10(r/10))
if r < 0.1: op cost −20% ; successful ops count on the Climber board
```

Non-cash loot (data, weights, compute) is not scaled by r (a whale's model is the prize that justifies the underdog's risk). C07 compute-leech cap (C3b): `min(5% of victim owned+reserved throughput per game day, 25% of attacker tier run-midpoint)`; usable only on the attacker's own runs, non-resellable, expires after 1 game day.

### §3.9 Op catalog

Cost = cash; prep in real time (stored as ticks); AP needed = minimum for a non-floor chance vs a typical same-tier target; noise adds to the detection roll; charge maps to a 13 severity tier. Session ops land loot via §3.7; others resolve on `resolveTick`.

| Kind | Verb | Cost | Prep | AP needed | b_op | Noise | Loot / effect | Session? | Charge |
|---|---|---|---|---|---|---|---|---|---|
| C01_SURVEY | Survey | $2k | 10 min | 5 | +2 | +5 | reveals unit list + DP band (fog lift) → IntelItem | no | S1 |
| C02_LURE_STAFF | Lure staff | $10k | 1 h | 30 | 0 | +15 | one STAFF unit's access; raises mole odds | no | S2–S3 |
| C03_LOCKOUT | Lockout | $40k | 2 h | 80 | 0 | +40 | business paused until ransom (transfer) or restore from backup | no (loud) | S3–S4 |
| C04_DATA_SIPHON | Siphon data | $25k | 2 h | 60 | 0 | +30 | dataset copy quality `q·P`, provenance ILLICIT | yes (DATA) | S3 |
| C05_MODEL_SESSION | Model session | $120k | 6 h | 200 | −1 | +55 | distillation `student = teacher·min(P,retention)` | yes (MODEL) | S4 |
| C06_QUERY_DISTILL | Query distill | $/query | 1–5 days | 40 | n/a | +8/day | student ≤ teacher·retention via a real license | no (license) | S4 (proven) |
| C07_COMPUTE_LEECH | Compute leech | $15k | 3 h | 90 | 0 | +25 | leeched PFLOP-days to own runs (capped) | yes (COMPUTE) | S3 |
| C08_ORDER_TAP | Order tap | $30k | 1 h | 70 | 0 | +20 | live view of victim standing orders → front-run next tick | yes (ORDERS) | S4 (market) |
| C09_JAM_AI | Jam AI | $20k | 1 h | 70 | 0 | +35 | pause victim AI 1–6 game hours (lost PnL) | no (loud) | S3–S4 |
| C10_MOLE_FEED | Mole feed | $50k + salary | 1–7 days | 50 | 0 | +3/day | persistent low-noise intel feed; one sabotage trigger | no | S5 |
| C11_VENDOR_PIVOT | Vendor pivot | $200k | 1–3 days | 150 | 0 | +45 | pivot to every client of a player-owned vendor firm | no | S4–S6 |
| C12_FALSE_STORY | False story | $80k | 4 h | 40 (media model AP) | n/a | +30 surveil | move a price via a false story to trade around | no | S5 (manip) |
| E1_BRIBE | Bribe | ≥0.5× annual wage | 1 day | — | — | — | one-time leak (dataset / 24h orders / model MCS) | no | S5 |
| E2_PLANT_MOLE | Plant mole | $50k + 1.5× wage | 1–7 days | — | — | +3/day | persistent feed; one sabotage | no | S5 |
| E3_POACH | Poach researcher | salary + bonus | 1 game day notice | — | — | — | the researcher + skill (legal; no data) | no | none |
| E4_WALKOUT | Walkout with files | E3 + bonus | — | — | — | — | data or weights carried out | no | S4 |
| E5_BREAK_IN | Break in | $20k–$500k | 2–12 h | crew grade | — | — | collectible (fenced 40%), device w/ 1-tick recon bonus | no | S3–S4 |
| E6_ALLIANCE_LEAK | Alliance leak | free (insider) | instant | — | — | — | intel feed, deal room, treasury balances | no | civil+S5 |
| E7_INFORMANT | Hire informant | $10k–$200k | 1 game day | — | — | — | a rumor/tip, 60–85% accurate | no | none to hire |
| E8_DUE_DILIGENCE | Due diligence | $5k–$500k | 6–48 h | — | — | — | public-record dossier (legal scouting) | no | none |
| M1_SHORT_CAMPAIGN | Short campaign | position + research cost | multi-day | — | — | +surveil | §3.11 | no | lawful if true; S5 if false |
| M2_SQUEEZE | Squeeze | position | multi-tick | — | — | +surveil | §3.11 | no | S5 if manipulative |
| M3_PUMP_PROMOTE | Pump & promote | media spend | hours | — | — | +surveil | §3.11 | no | S5 |
| M4_REBUTTAL | Rebuttal | $ (counsel/PR) | hours | — | — | — | §3.11 defensive | no | none |

Loud ops (C03, C09) alert the victim the same tick they land (via the `me` channel). Quiet ops may sit undetected for days.

#### §3.9.1 Staff loyalty

```
loyalty = clamp( 40 + 40·(wage/market_wage − 1) + 10·perks_level + 0.5·tenure_game_weeks
                 + 10·(employer_reputation ≥ 60) − 15·(employer_convicted_this_chapter) , 0, 100 )
```
Recomputed at day close. E1 resolves vs `p = σ(2·bribe/annual_wage − loyalty/25)`. E2/C10 success is a hiring-pool contest: the mole candidate must win the job; the target's HR vetting spend ($3k/hire) cuts win chance 30%.

### §3.10 Heat shield, cooldowns, dogpile cap (anti-grief, enforced here, owned jointly with 13)

- Same attacker vs same victim: 1 successful op per 24 real hours, max 3 attempts; each failed attempt +5–15 evidence.
- Dogpile cap: at most 3 successful ops against one victim per rolling 24 h from all attackers; after the third, the victim gets a 12-hour heat shield automatically.
- Heat shield: after any detected successful op, victim gets 12 real hours of DP_eff ×1.5 and +50% op cost for anyone targeting them.
- Offline (>30 min): loot caps halve; ransomware clock starts at next login.
- The 72-hour new-player window and the Rookie zone (until day 7 or $1M NW) block planting/targeting per 13 §anti-grief.

### §3.11 Market-conduct conflict

Market ops are first-class adversarial play policed by the ECA regulator (13) through a surveillance score the markets engine computes (05 owns `surveillanceScore(playerId, window) ∈ [0,100]`; 12 and 13 consume it). 12 defines the player verbs; it never fines.

- **M1 Short campaign.** Build a short position across ticks, then publish findings on the Wire (15). If the findings are **true** (verifiable against engine state), it is lawful research and the price reacts via the belief model (05 §6.3, 16): a story's effect depends on reach (prestige, §7.7 of 14), source credibility, evidence quality and the target's response, never a fixed drop. Skeptics can trade against it. If the findings are **false**, it is manipulation (S5) and feeds the surveillance score. Covering into a decline the campaigner engineered with false claims is disgorged on conviction (13).
- **M2 Squeeze.** Accumulate a corner in a thin name or a recalled short-borrow and force covering. The markets engine's position caps (05: 25% float NPC, 49% player, short-interest cap 50%) bound it; crossing into coordinated cornering raises the surveillance score and can draw a CMA antitrust/conduct case (13).
- **M3 Pump & promote.** Promote a holding through a player news outlet (05/09) while holding it, then sell. Buy-promote-sell overlap is exactly what the surveillance score keys on; S5 manipulation.
- **M4 Rebuttal (defensive).** A targeted company publishes a verifiable rebuttal, improves disclosure (15 filings), or files a case (13). Defenses cost resources and do not guarantee recovery.

Market ops leave surveillance evidence rather than cyber forensics evidence, so they are caught by the regulator path (13 §regulators), not by scans.

### §3.12 World hack rate

Each game day: `hackRate_EMA = 0.8·hackRate_prev + 0.2·(successful_hostile_ops_today / activeChars · 1000)`. Published as a macro variable (§2.11). Feeds the pandemic trigger (§3.6), security-sector demand (05/06), premiums (08) and news (16).

---

## §4 Player intents

Envelope per 00 §5.5. Namespace `ops.*` (and `intel.*` as a sub-namespace of ops). Rate limit 20 intents/tick/character (00 §5.5). Every intent shows its estimated success band, detection band, attribution band and the sanction it would face (13) before the player confirms (legibility principle). All validation runs in P1; effects in P10.

### §4.1 `ops.plan`
Payload `{ kind: OpKind, targetOwnerId, targetUnitId?, strength?, participants?, bountyLink? }`.
Validation: attacker not op-banned (`now ≥ opBanUntilTick`); target not dormant, not in the 72h window or Rookie zone unless `r ≤ 10` (Rookie) ; not a linked account (else allowed to plan but will VOID on plant and flag); session caps (§3.7.3) not exceeded; attacker holds the required capability (AP, a media model for C12, a crew for E5); funds available for cost. Effect: creates an `Op` in `PLANNED`, debits nothing yet, returns the four bands.
Edge: planning an op against your own accuser while a case is open is BLOCKED (op lock, 13 §pre-trial).

### §4.2 `ops.launch`
Payload `{ opId }`. Validation: op is `PLANNED` and still valid; prep budget paid. Effect: debits `costPaid` (reason `CONFLICT_OP_COST_*`), sets `PREPARING`, `resolveTick = now + prepTicks`. Preparation is cancellable (`ops.cancel`) for a 50% refund before `resolveTick`.

### §4.3 `ops.cancel`
Payload `{ opId }`. Only while `PREPARING`. Refund 50% of cost. Sets `CANCELLED`.

### §4.4 `ops.pull_session`
Payload `{ sessionId }`. Attacker ends their own session, keeping current P. Sets `PULLED`.

### §4.5 Defender intents
- `ops.scan_now { modelId }` — manual deep scan (§3.7.6): $5,000 + 0.01% NW, 30 min, cooldown 6h.
- `ops.disconnect { entryLabel, modelId }` — §3.7.7; fee shown; free if flagged.
- `ops.quarantine { modelId }` — §3.7.7.
- `ops.lockdown {}` — §3.7.7; hold-to-confirm; pauses all AIs 2h.
- `ops.tag_entry { entryLabel, modelId, tag, note }` — set `userTag`/`userNote`. No cost, no server-side effect on hostility.
- `ops.set_defense { layers, allocationMode, perUnitBudget? }` — update DefenseProfile; costs posted pro-rata at day close.
- `ops.activate_ir {}` — $100k, sets IR window.
- `ops.buy_deception { kind, hostRefId }` — place honeypot/canary.

### §4.6 Intelligence intents
- `intel.survey { targetOwnerId }` — alias of planning/launching C01; yields an `IntelItem` (unit list + DP band).
- `intel.due_diligence { targetOwnerId, depth }` — E8; legal dossier; always clean provenance.
- `intel.hire_informant { tipTopic }` — E7; returns an IntelItem with accuracy band.
- `intel.counter_intel { enable, canaryBriefingStaffId? }` — buy HR vetting, loyalty program, compartmentalization, exit clauses, canary briefings (§3.9.1, counter-intel table below).

### §4.7 Espionage intents
`ops.bribe`, `ops.plant_mole`, `ops.poach`, `ops.walkout_offer`, `ops.break_in`, `ops.alliance_leak` — each maps to E1–E6 with payloads naming the target staff/home/alliance. Validation checks loyalty/physical-security/role-permission as in §3.9.

Counter-intelligence menu (defender, via `intel.counter_intel`):

| Defense | Cost | Effect |
|---|---|---|
| HR vetting | $3k per hire | −30% mole win chance |
| Loyalty program | 5% of payroll | +10 loyalty all staff |
| Compartmentalization | −5% business efficiency | a turned staffer leaks one business, not the empire |
| Exit interviews + clawback | $1k per departure | E4 walkouts leave +20 evidence automatically |
| Canary briefing | $10k | feed a suspected mole a fake order; if traded on, +40 evidence |

---

## §5 Engine events

Envelope per 00 §5.6. Namespace `ops.*`. 12 emits these; 13 (court evidence), 16 (news), 17 (UI), 15 (boards) and 20 (truth machine) consume them.

| Kind | Visibility | Payload (key fields) |
|---|---|---|
| `ops.breach_resolved` | SEALED | opId, attacker, victim, unit, pBreach, roll, success |
| `ops.session_planted` | SEALED | sessionId, attacker, victim, model, strength, payload |
| `ops.session_progress` | SEALED | sessionId, P (hourly) |
| `ops.session_closed` | PARTIES (victim) + SEALED (attacker) | sessionId, closeReason, finalP, evidencePoints |
| `ops.incident_detected` | PARTIES (victim) | victim, unit, opKind (loud) or null (quiet), tick |
| `ops.clue_emitted` | PARTIES (victim) | ClueType, namedLabel?, magnitude; `real` SEALED |
| `ops.scan_result` | PARTIES (victim) | modelId, flaggedLabels[], clear |
| `ops.loot_posted` | SEALED | opId, ledger entry ids, reason, amount |
| `ops.deception_tripped` | SEALED | deceptionItemId, attacker, poison |
| `ops.staff_turned` | SEALED | staffId, employer, turnedBy |
| `ops.intel_created` | PRIVATE (holder) | IntelItem id, source, accuracy |
| `ops.market_conduct_flag` | SEALED | playerId, opKind, surveillanceScore |
| `ops.world_hack_rate` | PUBLIC | hackRate, pandemicActive |
| `ops.op_banned` / `ops.op_unbanned` | PARTIES | chr, until |

Evidence rows (consumed by 13): every op (including failures) writes an `EvidenceSource` to the (attacker, victim, op) triple with points and a "proves who/how-much" tag (13 §5 owns grading). 12 only supplies the raw source and points per the §3.9 noise and §3.7.7 disconnect tables; 13 applies decay (τ = 21 real days) and the case bars (civil 40, regulator 55, criminal 70).

---

## §6 NPC behaviour

### §6.1 NPC criminal crews
A background actor (`npc` kind) that attacks everyone so defense stays meaningful in quiet partitions. Each game day the crew scheduler (P3 world → P10 conflict) picks `ceil(PARAM.npc_crew_ops_per_1000_active · activeChars/1000)` targets (default 2 per 1,000 active chars per game day), weighting target choice by `S_exposed` (so heat and flashiness draw crews) and inversely by `DP_eff`. Crews run only C01–C04 and E5, never market ops. Their theft is a SINK (`CONFLICT_NPC_THEFT`). Crews ignore rookies and dormant accounts. Crew strength scales with the world hack rate (a hot world has bolder crews), bounded so a crew is roughly a T1–T3 attacker.

### §6.2 NPC defense (the quiet majority)
NPC firms, banks and dynastic households (16) carry a DefenseProfile sized to their wealth with `AUTO_VALUE` allocation and a defense model at a tier matching their resources, so attacking an NPC whale is as hard as attacking a player whale. NPC victims auto-scan, disconnect flagged sessions, and file with the regulator through 13's NPC litigant behaviour.

### §6.3 NPC informants and fixers (The Back Room)
E7 informants and E5 fences are NPC services gated by Notoriety ≥ 50 (14). Informant accuracy is drawn 60–85%. Fenced collectibles sell at 40% of value (60% haircut is a SINK). These are abstract service nodes; no real-world method is described.

### §6.4 NPC researchers and staff
Staff loyalty (§3.9.1) governs whether an NPC staffer can be bribed or turned. NPC employers raise wages and perks reactively when loyalty drops below 40 (16 decision model).

---

## §7 Screens

17 owns layouts; this lists the screens and what each shows.

- **Security Ops** (Shadow sub-palette, L4): empire-wide incident timeline; the suspect board (up to 5 candidates, 13 §investigation); the Connections list across all models with model/kind/tag filters; scans, Quarantine, Lockdown controls; heat-shield and IR state.
- **Connections panel** (per model, in the Lab; full detail in 14 §10.5): rows (kind glyph, rotating endpoint label, first-seen/last-handshake at game-hour precision, load bar, status chip, user tag), the throughput ring gauge with a 24h sparkline and expected band, the anomaly feed (clues and decoys rendered identically), the entry detail sheet (load sparkline, handshakes-by-hour strip, feed events naming the entry, note/tag).
- **Ops planner** (attacker side): op picker with the four bands (success, detection, attribution, sanction); for session ops, the three strength cards (Whisper/Tap/Siphon) with plain-language tradeoffs; joint-op participant picker; live sessions with a progress arc asymptoting to the 0.85 ceiling, lifetime countdown and Pull action. Victim presence is never shown.
- **Under-attack alert:** banner + push on a detected loud op or a defense-AI flag; never blocks the order pad.
- **Intelligence desk:** dossiers (E8), informant tips (E7), survey results (C01), the IntelItem list with accuracy bands and provenance tags; a "trade on this?" warning when provenance is ILLICIT (insider risk, 13).
- **Counter-intel panel:** HR vetting, loyalty program, compartmentalization, exit clauses, canary briefings, with staff loyalty readouts.
- **Market-conduct view:** the player's own surveillance-score gauge (self-only), active campaigns (M1–M3) and their public reach, rebuttal composer (M4).

---

## §8 Edge cases

1. **Victim disconnects a legit entry in a panic** — the contract's termination clause fires (15); the attacker's hostile session, if any, keeps accruing. Counter-value: Lockdown exists for "scared but unsure", at the cost of pausing one's own AIs.
2. **Attacker goes offline mid-session** — accrual is unaffected (it depends on the victim's presence, not the attacker's). The session still expires at its 7-day lifetime.
3. **Both parties offline** — accrual uses the 0.25 offline multiplier and the +0.08 per-stretch cap; no one wakes up fully copied.
4. **Target's net worth changes between plant and loot** — cash loot caps recompute at loot time; the punch-down tax uses `r` at loot time.
5. **Target dies/bankrupts during a session** — the session is `VOIDED`; any accrued model distillation already handed to the attacker's student stays (the student exists), but no further loot. Residue still traces it.
6. **Weakest-covered-unit ties** — break ties by lowest `valueMoney` then lowest unit id (deterministic for replay).
7. **Joint op where one participant is a linked account of the victim** — the whole op is flagged and VOIDed (collusion).
8. **A unit is created or destroyed between plan and launch** — if the chosen `targetUnitId` no longer exists at `resolveTick`, the engine re-picks the weakest covered unit of the same class; if none, the op resolves as FAIL with a partial refund.
9. **Floor gate boundary** — exactly at AP = DP_eff/8 the floor applies (≥ is inclusive).
10. **Market op with a true story that later becomes false** (the target fixes the issue) — the story was true when published, so no manipulation; later price recovery is normal (M4 counterplay).
11. **Honeypot licensed by mistake** — blocked at the market layer (15); a honeypot can never be a licensed product, so honest licensees cannot be baited.
12. **Op launched exactly as a sanction op-ban begins** — P1 validation re-checks the ban at launch; a ban that lands in P11 of the launch tick still lets the already-sealed op resolve (sanctions apply from the next tick).

---

## §9 Exploits and counters

| # | Exploit | Counter |
|---|---|---|
| 1 | Fortress whale buys until untouchable | sqrt DP_money, coverage ≤ 1.3, 1% floor, joint ops stack AP, 13 §12 non-cyber routes |
| 2 | Glass empire farmed | 90% ceiling, cooldowns, dogpile cap 3/24h, auto heat shield |
| 3 | Alt "hacks" main to launder | linked-account session VOID + clawback; residue still traces the student (§3.7.4) |
| 4 | Park sessions on offline players | 0.25× offline accrual, +0.08 per-stretch cap, 7-day lifetime, scans still run, dormant freeze |
| 5 | Datamine the connections list for hostile entries | identical serialization, rotating labels, ≤1 refresh/game hour, decoys |
| 6 | Mass-disconnect to dodge contract obligations | per-entry fee + each contract's termination clause; Lockdown pauses own AIs |
| 7 | Re-plant right after disconnect | 24h pair cooldown; evidence keeps stacking on the triple |
| 8 | Stack many Whispers on one whale | 3 hostile sessions/victim, 20% drain cap, per-tier live-session cap |
| 9 | Weak attacker uses only Whisper to hide forever | slow accrual (0.32 after a day), scans improve with DP_eff/AP, 7-day lifetime ends it |
| 10 | Compute-leech strip-mines a cluster | C07 cap: 5% victim daily throughput, 25% attacker tier run-midpoint, non-resellable, 1-day expiry |
| 11 | Honeypot abuse to bait honest licensees | honeypots can't be licensed, only exposed to survey |
| 12 | Whale buys every cyber firm (skeleton key) | vendor-link risk (§3.5), CMA flags >40% of world defense contracts (13), S6 for abusing client access |
| 13 | Serial griefing one victim | 1 success/24h per pair, failed attempts add evidence, punch-down tax |
| 14 | Dogpiling by a coalition | dogpile cap 3/24h, joint op counts once |
| 15 | Rookie farming | 72h window, Rookie zone, zero Most Wanted score (13/15) |
| 16 | Hiding behind protection while attacking | protection ends on the first op |
| 17 | Fake clue-reading bot alerts instantly | refresh limit + decoys mean a bot sees the same churn a human does |
| 18 | Manufacturing a cyber pandemic | triggering coalition referred to 13 as S6; short positions disgorged |
| 19 | Front-running tapped orders | C08 feeds surveillance; 100% disgorgement on conviction |
| 20 | Trading on ILLICIT intel | provenance tag on every IntelItem; trading on it is insider (13 S5) |

---

## §10 Acceptance tests

1. With AP = DP_eff and b_op = 0, `p_breach` computes to within 1e-6 of `0.01 + 0.89·0.5 = 0.455`.
2. For AP ≥ DP_eff/8, `p_breach` is never below 0.01 for any finite inputs; for AP < DP_eff/8 it may be below 0.01.
3. `p_breach` never exceeds 0.90.
4. Two runs from the same world seed produce identical breach rolls, session progress series and clue sequences for the same ops (determinism, 20).
5. A planted Whisper against a present victim reaches P ≈ 0.15 at 10 effective hours, 0.32 at 24 h, within 1e-3 (§3.7.2 reference points).
6. A Siphon run through an 8-hour offline stretch adds at most 0.08 to P (overnight cap).
7. No session's P exceeds 0.85 at any time.
8. A fourth concurrent hostile session on one victim is refused (cap 3); a second session on the same attacker-victim pair within 24h of a disconnect is refused.
9. A T4 attacker cannot hold a 5th live session (tier cap 4).
10. Total hostile DU drain on one victim never exceeds 20%.
11. An auto-scan never flags a legitimate entry in 1,000,000 scheduled scans across a simulated chapter.
12. `p_scan` for T5 defense (s=0.35) vs a Siphon (m=1.6) at DP_eff/AP=1 equals `clamp(0.35·1.6·1, 0.02, 0.90) = 0.56` within 1e-6.
13. Hostile and legitimate connection entries serialize to byte-identical schemas (no field distinguishes them); a diff of the wire payload reveals no hostile marker.
14. Decoy anomalies are emitted at ~1.2/day/account regardless of whether a hostile session exists (within statistical tolerance over a chapter).
15. Disconnecting a flagged entry costs $0; disconnecting an unflagged entry costs $1,000 + 0.02% NW capped at $250k.
16. A linked-account session VOIDs on plant, accrues nothing, and writes an S4 laundering flag to 13.
17. Cash loot on any single op never exceeds `min(0.10·liquid, 0.02·NW)`; at r=100 the loot multiplier is `(10/100)^0.5 ≈ 0.316`.
18. A C07 leech never exceeds 5% of the victim's owned+reserved daily throughput nor 25% of the attacker's tier run-midpoint, and the leeched compute expires after 1 game day.
19. Every op (success or fail) writes an evidence source to the (attacker, victim, op) triple; a failed op writes between +5 and +15.
20. All loot between two characters posts as a TRANSFER; NPC-crew theft and the E5 fence haircut post as SINK; no op mints base money.
21. An op launched by an op-banned attacker is refused in P1.
22. An op targeting a dormant, 72h-windowed, or (for r>10) Rookie-zone victim is refused.
23. A honeypot distilled by a thief sets the student's poison to the honeypot tier value (0.20/0.40/0.60) and writes a deception-tripped evidence event.
24. A true published M1 short-campaign story raises no surveillance flag; a false one raises the surveillance score and writes an S5 source.
25. Over a 20-seed chapter simulation, the crime EV ratio (competent criminal vs honest, chapter NW) lands in 0.8–1.2 and criminal variance is 2–4× honest (20 balance bands); median hostile-session lifetime 6–18 victim-online hours; median P at disconnect 0.15–0.35; sessions reaching P≥0.6 < 10%.
26. Solo breach rate vs top-1% players is 1–8% per op; coordinated (AP≥DP_eff) breach rate vs top-1% is 35–60%.
27. The world hack rate EMA updates each game day and crossing the pandemic trigger for 1 real day fires the crisis and refers the top contributors to 13 as S6.
