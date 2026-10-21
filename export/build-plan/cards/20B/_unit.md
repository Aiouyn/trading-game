# Unit 20B - Whole-game verification (stage S10)

Purpose: the half of the Truth Machine (20) that needs the whole game. It builds harness worlds over the production engine with every unit loaded, drives the 47 test-agent archetypes strictly as players, runs the exploit hunts H01-H35 with their oracles and the finding lifecycle, computes every balance band of 20 §3.7 and §3.8, runs equivalence over partition counts, hosts, toolchains and the browser build, captures and minimizes regression cases, runs the shadow verifier, live monitors and canary, the load, chaos, deploy and restore drills, playtest evidence and the sandbox rules, publishes the Integrity Report with outcome verification and the exploit disclosure programme (engine module '20'), and orchestrates the release gates G0-G5 and the stage gates. Depends on every unit (19 §12.2); 20A supplies the framework.

## Tasks (build order)
1. T20B-01 Whole-game invariant catalogue, negative-test coverage, ledger fault tests
2. T20B-02 Harness host: worlds, presets, populations, player-level agent driver, probes, mirror
3. T20B-03 Regression capture, ddmin minimization, FAST/NIGHTLY tiers, run-file import
4. T20B-04 Equivalence {1, 4, 16} + random map, resume, hosts, toolchain, browser, version replay
5. T20B-05 Structural gates: commerce graph, bundle and manifest scans, intent sync, no sandbox import
6. T20B-06 Agent toolkit and HONEST archetypes A01-A15
7. T20B-07 LIFECYCLE A26-A30 and OPTIMIZER A16-A19, A24, A31, A32
8. T20B-08 RULE_PROBE A33-A45 and timezone fixtures
9. T20B-09 CONFLICT A20-A23, A25 and ADAPTIVE A46, A47 with the CEM learner
10. T20B-10 Oracles, hunts H01-H35, findings, exposure query, hunt farm
11. T20B-11 Band runner, metric registry, common metrics, market and ecology bands
12. T20B-12 Economy, money, wealth, macro and institution bands
13. T20B-13 Business, property, AI, conflict and law bands
14. T20B-14 Fairness, privacy and experience bands with delta audit and inference probes
15. T20B-15 Comeback and ad faucet bands
16. T20B-16 Experiments: factorial, adaptation, GEV tails, crisis scenarios, prose independence
17. T20B-17 Shadow verifier, canary, live monitors, exposure job
18. T20B-18 Module '20': report and credit intents, Integrity Report, outcome verification, disclosure
19. T20B-19 Load, chaos, deploy and restore drills
20. T20B-20 Playtests and sandbox and solo rules
21. T20B-21 Gate orchestration G0-G5, stage gates, tm events, dashboards, §9 counters

## Internal DAG
02 → 03, 04, 06; 03 → 04, 10, 17, 21; 06 → 07 → 08, 09; 07, 08, 09 → 10; 10 → 11 → 12, 13, 14, 15, 16, 17; 11 → 20; 10 → 18; 17 → 19; 01, 03, 04, 05, 10-20 → 21. From 20A: T20A-01 → 01; T20A-03 → 01, 02, 03, 10, 11, 21; T20A-04 → 02, 03, 04, 17; T20A-05 → 01, 02, 10, 11, 18, 20, 21; T20A-06 → 05. From 02: T02-21 (TestWorld, CORE_MODULE) and T02-14/16/17/18 throughout.

## Exports to downstream units
- `apps/harness`: `buildHarnessWorld`, `POP_TEMPLATES`, agent registry and 47 archetypes, `HUNTS` and oracles, `launchBands()` with every band of 20 §3.7-§3.8, `runBand`, `equivalenceRun`, `ShadowVerifier`, `runGate`, `hotfixGate`, `stageComplete`, dashboard read models for 21's console.
- `packages/engine/truth` (module '20'): intents `acct.report.exploit`, `acct.integrity.optin_credit`; events `tm.report.filed`, `tm.integrity.published`; views `tm.report.get`, `tm.report.list`, `tm.verify.outcome`. `apps/jobs/integrity`: weekly and chapter Integrity Report.
- `tools/truth/gates`: `truth:structural`; `apps/harness` scripts `truth:catalogue`, `truth:regress:fast|nightly`, `truth:gate G0..G5`.

## Acceptance tests by task
T20B-01: 20#1, 2, 3 · T20B-02: 14 · T20B-03: 28 · T20B-04: 6, 7, 8 · T20B-05: 9, 10, 11, 37 · T20B-11: 15, 16, 21, 22 · T20B-12: 20, 24, 25 · T20B-13: 23 · T20B-14: 12, 13 · T20B-15: 17, 18, 19 · T20B-16: 26, 31 · T20B-17: 29 · T20B-18: 33, 34, 38 · T20B-19: 30, 32 and 02#40 · T20B-20: 35, 36. The framework tests 20#27, 39, 40 live in 20A, and 20#4 and 20#5 in T02-16. Invariants: none owned here (INV-STR-002..005 and 010 belong to 19 and 21; this unit runs their checks at whole-game level in T20B-05).

## Registry gaps
None. The "phase_budget_ms_" warning comes from the verbatim spec text `PARAM.phase_budget_ms_P0 … P14` in 02 §3.5.1 and 24 R27; the 15 real keys phase_budget_ms_P0..P14 exist in 23.

## Spec gaps
20 §3.7.3 refers to "the nine NPC rival fund bands of Tape §1", "the ten rumor bands of Tape §2" and the world-event bands of Tape §3; the Tape document is not part of the spec set, so T20B-11 registers the criteria 20 lists by name (seven rival, five rumor, seven event criteria) and the remaining ones must be supplied by the spec owner.
