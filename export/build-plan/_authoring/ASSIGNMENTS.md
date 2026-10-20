# Card-writing assignments (wave 1)

| Writer | Units (card folders) | Module files to read fully | Invariants to own (20 §3.1) |
|---|---|---|---|
| W01 | 19A, 23, 19B, 19C, 19D | 19, 23 | INV-STR-001, INV-STR-004, INV-STR-005, INV-STR-007 |
| W02 | 02, 20A, 20B | 02, 20 | INV-ENG-001 … INV-ENG-010, INV-STR-006, INV-STR-008, INV-STR-009 |
| W03 | 03 | 03 | INV-LED-*, INV-BS-001, 002, 004, 008, 011, 012 |
| W04 | 04, 16A, 16B, 16C | 04, 16 | (none in 20; register 04/16 module invariants if their spec defines any) |
| W05 | 05 | 05 | INV-MKT-* |
| W06 | 06A, 06B, 06C | 06 | INV-BS-003 |
| W07 | 07A, 07B | 07 | INV-CCP-*, INV-BNK-*, INV-BS-006, INV-BS-007 |
| W08 | 08 | 08 | INV-FND-*, INV-INS-* |
| W09 | 09A, 09B | 09 | INV-BS-005 |
| W10 | 10A, 10B | 10 | INV-BS-009 |
| W11 | 11 | 11 | (11's own) |
| W12 | 12, 13A, 13B | 12, 13 | INV-CON-*, INV-LAW-* |
| W13 | 14A, 14B, 15A, 15B | 14, 15 | INV-PRG-*, INV-SOC-*, INV-BS-010 |
| W14 | 17A, 17B | 17 (+ §7 Screens of every module) | (none) |
| W15 | 18, 21 | 18, 21 | INV-STR-002, INV-STR-003, INV-STR-010 |
| W16 | 22A, 22B | 22 | (none) |

Special contracts:
- W02 (unit 02) implements GLOBAL-CONTEXT G6 exactly (core primitives, Store, PhaseCtx, ModuleDef, defineModule, Rng, TestWorld/createTestWorld in `packages/engine/core/testing.ts`). 20A owns the invariant registry framework and regression-seed format that createTestWorld uses.
- W03 (unit 03) implements GLOBAL-CONTEXT G7 exactly (LedgerApi, HoldApi, registerEntity) and wires `ctx.ledger` / `ctx.holds`.
- W01 (19A) creates the monorepo skeleton every later task writes into, including package.json scripts `lint`, `typecheck`, `test` used in G1, and the determinism eslint rules; 19B hosts the engine of 02 in the world process.
- W14 (17B): one task per screen group (per app of 17 §7), each citing 17's screen sections plus the owning module's §7 and naming the views it consumes; the 17B unit also contains the per-module "screens land" tasks so every module's §7 is covered.
- W16 (22): one transcription task per catalog section (data file + zod schema + count tests), generator tasks for procedural content. 22 has no numbered acceptance tests: put checks in each card's Test plan and leave `tests: []`.
