# Unit 02 - Time engine core (stage S0)

Purpose: the deterministic heart of TYCOON. Calendar and sessions, dmath and fixed-point money, RNG streams and ids, commit-reveal entropy (24 R28 epoch form), intake and fair order, the undo-log Store with table ownership, snapshots, the module contract of GLOBAL-CONTEXT G6 (with the `LedgerProvider` port that unit 03 fills), the 15-phase pipeline across partitions with barriers and two-phase commit, the safe-mode ladder (24 D417), `stepWorld`, replay and restore, admin directives, the real-time scheduler, read-only queries, and `TestWorld`/`createTestWorld` (G6) that every later unit tests with. Built after 20A (19 §12.2): the invariant framework, failure-ladder algorithms and seed/regression formats come from 20A and need no engine.

## Tasks (build order)
1. T02-01 Primitives: types, SortedMap/SortedSet, cmpStr, sortBy, hashes, canon re-export, determinism lint
2. T02-02 dmath part 1 (exp/ln family) and the bigint reference vector generator
3. T02-03 dmath part 2 (trig, erf, normInv, lgamma, Black-Scholes, solvers, Cholesky)
4. T02-04 fixed.ts money, qty and price arithmetic
5. T02-05 Calendar, holidays, business days, sessions, display formats
6. T02-06 RNG streams, registry, RngManager (INV-ENG-002)
7. T02-07 Ids, Merkle, tick entropy, epoch commit-reveal buffer (INV-ENG-003)
8. T02-08 Intake: envelopes, seal, fair order, rate limits, gateway batches
9. T02-09 Store: tables, ownership, undo, phase stamps, hashes (INV-ENG-001, 006)
10. T02-10 Snapshots, manifest, restorable selection, retention
11. T02-11 Module contract (G6 verbatim), LedgerProvider port, module set
12. T02-12 Pipeline runner P0-P14, core tables, event sequencing (INV-ENG-004)
13. T02-13 Boundary hooks, consequences, core events, delta filter (INV-ENG-005, 007)
14. T02-14 Partitions in process, rounds and barriers, rebalance (INV-ENG-009)
15. T02-15 Cross-partition legs, holds plumbing, two-phase commit, fixture ledger
16. T02-16 Safe-mode ladder, quarantine, halt verdicts (INV-ENG-010)
17. T02-17 stepWorld, TickRecord, genesis, replay, restore, failover (INV-ENG-008)
18. T02-18 Admin directives, cutovers, migrations, maintenance (R29), shadow selection
19. T02-19 Real-time scheduler, CATCHUP/REANCHOR, skew, HALT/RESUME
20. T02-20 Read-only queries and screen view models
21. T02-21 Core ModuleDef, params, barrels, TestWorld/createTestWorld

## Internal DAG
01 → 02 → 03; 01 → 04 → 05; 01,02,03 → 06; 05,06 → 07; 07 → 08; 04 → 09; 05,06,09 → 10; 05-09 → 11; 05-09,11 → 12; 11,12 → 13; 09,11-13 → 14; 11,12,14 → 15; 12-15 → 16; 07,10,12,14-16 → 17; 12,13,17 → 18; 05,12,13,16-18 → 19; 05,07,08,11,12,17,19 → 20; 09-17,19,20 → 21. From 20A: T20A-01 → 06,07,09,11,12,13,14,16,21; T20A-02 → 16; T20A-03 → 16,17; T20A-04 → 14,17.

## Exports to downstream units
- `@tycoon/engine/core`: every G6 name (types, SortedMap/SortedSet, dmath, fixed, sha256, canonEncode, calendar, Rng, Store, PhaseCtx, ModuleDef, defineModule), the `LedgerProvider` / `LedgerPartition` port with optional `testHooks`, `ModuleServices` (ledger, calendarEvents, spawnCharacter), `stepWorld`, `replay`, `createWorld`, partition maps, scheduler, directives, queries, `CORE_MODULE`, `coreParams`.
- `@tycoon/engine/core/testing`: `TestWorld`, `TickOutcome`, `createTestWorld` (G6 exact), `createEngineTestWorld` (superset), fixture ledger for engine tests only.
- Core events `core.*` (02 §5), core views `core.view.*`, queries `core.clock.get`, `core.calendar.get`, `core.header.get`, `core.receipt.get`, `core.integrity.verify`.

## Acceptance tests by task
T02-01: 13 · T02-03: 14 · T02-04: 15-17 · T02-05: 1-8, 10 · T02-06: 18, 19, 42 · T02-07: 20, 21 · T02-08: 22-25 · T02-10: 33 · T02-13: 9, 26 · T02-14: 12 · T02-15: 27, 28 · T02-16: 29-31 (and 20#4, 20#5) · T02-17: 11, 32 · T02-18: 36-39 · T02-19: 34, 35, 41. 02#40 (launch load test, 5,000 CCU + 40,000 agents) lives in 20B's load gate (T20B-20) because it needs the whole game. Invariants INV-ENG-001…010 are implemented in the cards above and all registered by T02-21.
