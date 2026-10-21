# Unit 20A - Truth Machine framework (stage S0, built before 02)

Purpose: the engine-independent half of the Truth Machine (20). It defines how invariants are declared, catalogued and registered (the `InvariantDef` of 20 §2.1, the launch catalogue of 78 ids with their owning modules), the failure-ladder algorithms that 02's safe mode calls (bisection over intents, quarantine tracking, ladder decision; 24 D417), property-test presets, seed sets and seed derivation with a withheld ledger, the regression-case and repro-bundle formats, the harness world spec and headless runner loop (driven through a `HeadlessWorldDriver` interface, so it runs against fakes until 02 exists), the band, finding, waiver and gate-evidence framework, and the three static checkers INV-STR-006/008/009. Per 19 §12.2 this unit is built first: no card imports `@tycoon/engine/core`; it depends only on 19A (`canonEncode`, zod schemas) and 23 (params).

## Tasks (build order)
1. T20A-01 Invariant types, launch catalogue (78 ids), registry, runner
2. T20A-02 Bisection, quarantine tracker, ladder decision, property presets
3. T20A-03 Seed sets, seed derivation, withheld ledger, regression cases, repro bundles
4. T20A-04 Harness world spec, agent and run types, headless runner, run-file format
5. T20A-05 Bands, findings, waivers, gates and evidence reports
6. T20A-06 Static checkers INV-STR-006, INV-STR-008, INV-STR-009 and `truth:static`

## Internal DAG
01 → 02 → 03 → 04 → 05 → 06; 01 → 03; 01 → 06; 03 → 05. External: T19A (canon, schemas) → 01, 03, 04, 06; T23 → 02.

## Exports to downstream units
- `packages/engine/core/truth`: `InvariantDef`, `InvariantCtx`, `InvariantImpl`, `LAUNCH_CATALOGUE`, `InvariantRegistry`, `RegistryError`, `runInvariants`, `bisectCulprits`, `QuarantineTracker`, `decideLadder`, `propertyRuns`, `fcParams` (used by 02 and every engine unit's tests).
- `apps/harness/src/truth`: `SEED_SETS`, `deriveSeed`, `WithheldLedger`, `aggregateOnlyReport`, `RegressionCase`, `ReproBundle`, `HarnessWorldSpec`, `HeadlessWorldDriver`, `TickDigest`, `runHeadless`, `compareDigestStreams`, `RunFile`, `evaluateBand`, `requestWaiver`, `reportByEvidence` (used by 02 T02-14/16/17 and all of 20B).
- `tools/truth/static`: the INV-STR-006/008/009 checkers and the `truth:static` script (20B T20B-04 runs them in the gates).

## Acceptance tests by task
The framework-level tests of 20 live here: T20A-03: 20#27 · T20A-05: 20#39, 20#40. 20#4 and 20#5 need the engine's safe mode and live in T02-16 (it uses T20A-02's algorithms). Every whole-game test of 20 (swarm, bands, gates) is in 20B. Invariants owned here: INV-STR-006, INV-STR-008, INV-STR-009 (T20A-06).
