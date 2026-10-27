# Stages and gates

Source: 19 §12.2 (build units and hard dependencies), 19 §12.4 (stages), 20 §3.9 (gates G0–G5), 20 Rule 3.9.5 (Truth Machine pieces per stage). Units inside a stage may be built in parallel once their own hard dependencies are done. A unit may start only when every unit it hard-depends on has passed G1.

## Gates

| Gate | When | What must pass |
|---|---|---|
| **G0 Pull request** | every commit / PR | typecheck, lint (determinism + import boundaries), static invariants INV-STR-001..010, all unit tests, property tests at 200 cases, protocol contract tests, FAST regression cases, a 30-game-day MICRO world with all invariants on, 2-partition equivalence on it, G0 bands |
| **G1 Unit gate** | each build unit when declared complete, and on any change to it | all the unit's acceptance tests green; its property tests at 10,000 cases; a passing negative (fault-injection) test for every FATAL invariant it registers; its FAST and NIGHTLY regression cases |
| **G2 Integration gate** | nightly on main, and to close most stages | G0; golden replay of fixture logs; every invariant over a 30-game-day headless world with all units so far (SMALL world before S2 is done, STANDARD after); partition equivalence {1, 4, 16} + one random map; x64 vs arm64; browser vs Node hash; NIGHTLY regressions; G2 bands at 20 seeds; e2e at 1440 and 390 px; no-leak delta audit |
| **G3 Adversarial and balance** | each stage completion that names it; each release candidate | G2 on the same commit; G3 bands on VALIDATION and WITHHELD seeds; adaptive DOMINANCE/CALIBRATION re-runs; every active exploit hunt at 60 seeds with no open HIGH or CRITICAL finding in the systems under test; for a module switched on for the first time a 1-chapter STANDARD run with POP_EXPLOIT and a specialist playtest |
| **G4 Release** | every production deploy | G3; load and chaos gates (T52–T54); restore drill (T48); version replay of the last production game day; French coverage 100%; accessibility audit with zero serious violations; playtest record for changed onboarding or new screen family; 720-tick canary with zero unintended divergence; rollback artefact |
| **G5 Chapter boundary** | 7 real days before each chapter boundary | long-horizon bands (10k+ agents, late joiners), population experiments, diff runs for every parameter change in the boundary bundle, integrity report chapter summary |

Waivers: never for ACCOUNTING checks, FATAL invariant tests, equivalence checks or INV-STR checks. Others only at G3/G4 with two signers and a 24 decision reference.

## Stages

| Stage | Units (build in this order; arrows = must precede) | Gate to leave the stage | Truth Machine pieces that must exist |
|---|---|---|---|
| **S0 Foundations** | 19A → 23, 22A, 20A → 02 → 03 | G2 on an empty world: 30 game days of ticking, ledger invariants, replay test T3 | invariant framework, INV-LED-*, INV-ENG-* |
| **S1 Platform core** | 19B, 14A, 04 → 13A, 15A, 16A → 19C → 17A | G2; drills T21–T24; a logged-in client sees the clock and its `me` channel | |
| **S2 Markets** | 05 → 06A → 07A → 07B → 06B, 06C | G2 with NPC liquidity; T12, T13, T54 | INV-MKT-*, market bands |
| **S3 Real economy** | 10A → 09A, 10B → 09B | G2; businesses and properties settle across CITY and PLAYER partitions | |
| **S4 Institutions** | 08 | G3 for S2–S4 (credit, CCP default waterfall, fund runs exercised by the swarm) | INV-CCP/BNK/FND/INS, hunts H09–H13, H30–H32 |
| **S5 AI and adversarial** | 11 → 12 → 13B | G3 including T28 and T15 | INV-CON-*, INV-LAW-*, conflict bands |
| **S6 Living world** | 16B → 16C | G2; causal news coverage per 16's tests | |
| **S7 Status and social** | 14B → 15B | G3 for social exploits (collusion, alt funneling signals) | INV-SOC-*, INV-PRG-*, hunts H01–H04 |
| **S8 Experience** | 17B → 18, 22B | 17's and 18's acceptance tests; T55 | |
| **S9 Operations and scale** | 21, 19D | G4: T26, T48, T52, T53, T59 | INV-STR-002..004, FAU.* bands |
| **S10 Whole-game verification** | 20B | G4 over the full game; release | full G4 |

Notes:
- 17B (screens) is listed in S8 as the final completeness pass, but each module's screens may be built as soon as that module's views exist (19 §12.2). BUILD-ORDER.md places each 17B task right after the units whose views it consumes.
- 22B (full catalogs) is listed in S8, but every catalog task that a module's genesis or tests need is placed before that module in BUILD-ORDER.md (catalog data is a dependency, not polish).
- 19 Rule 12.4.1: a unit is done only when its acceptance tests pass in the partitioned headless world, its params are in 23, its content needs are in 22, its screens are in 17B's tracking list and its invariants are registered with 20.
- 19 Rule 12.4.2: no placeholder rules. A unit built before an event-edge producer exists uses fixture events in tests; production code never contains rules that differ from the spec. If a hard dependency is missing, the unit waits.

## Hard dependencies (19 §12.2)

| Unit | Contents | Hard dependencies |
|---|---|---|
| 19A | Monorepo, toolchain, lint rules, protocol skeleton, canonical encoder, CI | – |
| 23 | packages/params: registry, loader, validator, all params | 19A |
| 22A | packages/content: catalog schemas, public/server split, generators scaffold | 19A |
| 20A | Truth Machine core: invariant registry, headless runner, regression-seed format, property presets | 19A |
| 02 | Time engine: clock, calendar, pipeline, RNG, detmath, store, undo log, snapshots, step() | 19A, 23, 22A, 20A |
| 03 | Ledger: chart of accounts, postings, reason codes, holds, statements, consolidation, taxes | 02 |
| 19B | World host on one machine: coordinator, partitions as workers, bus, durability, recovery, commit-reveal | 02, 03 |
| 14A | Character, account link, ranks, license state, protection, restricted cash | 03 |
| 13A | Sanctions and Held registry, P1 checks | 03, 14A |
| 15A | Contract engine core: clauses, escrow via holds, anchor rule, filings core | 03, 14A, 19B |
| 19C | Gateway, protocol channels, auth, sessions, keys, HTTP API, projector, client shell | 19B, 14A |
| 17A | Design system: tokens, shell, components, tick pulse, navigation | 19C |
| 04 | Macro, central banks, sovereigns, FX regimes, crises | 03 |
| 16A | Aggregate economy (hh, frm, row), causal news framework, world scheduler | 04 |
| 05 | Market microstructure | 03, 04, 14A, 13A |
| 06A | Spot assets: equities, ETF shells, bonds, FX, commodities, collectibles | 05 |
| 07A | Banking, credit, deposits and runs, interbank, lending, repo, sec lending, prime brokerage | 03, 04, 06A |
| 07B | Clearing house, novation, margin, default waterfall | 07A, 06A |
| 06B | Derivatives (cleared via 07B) | 07B |
| 06C | Crypto and DeFi | 06A, 07A |
| 10A | Cities, districts, properties, addresses, procedural city, map data | 03, 04, 22A |
| 10B | Mortgages, development, property exchange, growth | 10A, 07A |
| 09A | Business catalog, demand, operations, staff, supply chains, NPC contracts | 10A, 03, 04 |
| 09B | Company building, corporate finance, IPOs, M&A, LBOs, restructuring | 09A, 06A, 07A, 15A |
| 08 | Funds, ETF creation/redemption, securitization, ratings, insurance, cat bonds | 06B, 07B, 09A, 10B |
| 11 | AI lab, strategy-graph VM, mandates | 05, 06A, 14A, 19B |
| 12 | Conflict and intelligence | 11, 09A, 10A, 13A |
| 13B | Investigations, courts, regulators, surveillance, claims, anti-grief | 12, 05, 07B, 08, 13A, 15A |
| 16B | Named NPC actors, decision models, dynasties | 16A, 08, 09B, 10B |
| 16C | Politics, lobbying, history, eras, technology, secrets | 16B, 13B |
| 14B | Lifestyle, Prestige, Reputation, Notoriety, clubs, hosting, Legacy, succession | 14A, 10B, 13B |
| 15B | Boards, leagues, chapters, alliances, chat, Wire, spectating, challenges, anti-cheat | 15A, 14B, 16A, 19C |
| 17B | Every screen | 17A + the module of each screen |
| 18 | Onboarding, Academy, help, explainability, sandbox | 17B, 05, 09A, 14A, 16A |
| 19D | Scale-out, rebalancing, failover, expert API, PWA, native, edge | 19C, 11, 15B |
| 21 | Admin console, live events, patches, support, moderation, Atelier store and pass, ads, privacy, compliance | 19C, 15B, 14B |
| 22B | Full content catalogs | 22A + each consuming module's schema |
| 20B | Full swarm, experiments, balance bands, release gates | all units above |
