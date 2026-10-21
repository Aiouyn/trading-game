# Runbook: building TYCOON one task at a time

This is the procedure for turning the build plan into the game with an AI coding model (or several). It assumes nothing about the model except that it can read one pack (up to about 60k tokens), write files in the repository, and run shell commands. A model that cannot run commands can still be used: you run the commands and paste the output back.

## 1. One-time setup

1. Clone `https://github.com/Aiouyn/trading-game` and create a branch per stage (`build/S0`, `build/S1`, …). The rebuild starts from an empty tree apart from `vision/` (L14: old code is ignored; move it to `legacy/` or delete it in the first commit of S0).
2. Copy the `build-plan/` folder into the repository as `docs/build-plan/` so every model session can open its pack by path, and so progress is versioned with the code.
3. Install Node 24 LTS and pnpm. Services needed from S1 onward (PostgreSQL 18, Valkey 8, NATS JetStream, ClickHouse, S3-compatible storage) come from the docker-compose file that task T19A creates.
4. Open `BUILD-ORDER.md`. It lists every task in an order where each task's dependencies are already done. Work top to bottom. Tasks inside one stage that do not depend on each other may run in parallel sessions.

## 2. The loop for one task

1. **Pick** the next task in `BUILD-ORDER.md` whose dependencies are all marked done.
2. **Start a fresh model session** (no leftover context from earlier tasks). Give it exactly two things: the prompt below and the task's pack file `packs/<UNIT>/<TASKID>.md`.
3. **Let it implement.** It writes the files listed in the card and runs the checks in GLOBAL-CONTEXT G1.
4. **Verify yourself** (or with a second model acting as reviewer, see §4): run the checks again on a clean checkout of the branch. Never trust a model's claim that tests pass.
5. **Commit** with message `T05-03: <title>` and tick the task in `BUILD-ORDER.md`.
6. If the model reports `MISSING EXPORT` or `BLOCKED`, do not let it improvise. Fix the upstream task (re-run it with the missing export added to its card) or fix the card, rebuild the pack (`python3 tools/assemble.py --check <id> --write`), and run the task again.

### Prompt to give the model (copy as is, then attach the pack)

```
You are implementing one task of a large TypeScript monorepo, the game TYCOON.
Everything you need is in the attached task pack. Read all of it before writing code.
Rules:
- Implement exactly the task card: create the listed files, export exactly the listed Exports.
- Follow GLOBAL CONTEXT (the first part of the pack) for every name, package and API.
- The SPEC EXCERPTS are the game rules. Implement them completely and exactly; never simplify,
  skip a branch or leave a TODO. Use DEFAULT values where the spec says DEFAULT.
- The DECISIONS AND RULINGS section overrides the excerpts where they differ.
- Read every number from the PARAMETERS rows through ctx.params; never hard-code it.
- Write a test for every acceptance test listed, named with its id (e.g. "05#8 ...").
- Do not modify files that belong to other tasks. If something you need is missing,
  stop and report "MISSING EXPORT: <task> <symbol>".
- When done, run: pnpm -w lint && pnpm -w typecheck && pnpm -w test
  and fix everything until green. Then print the report from GLOBAL CONTEXT G12.
```

For a model with a small output limit, add: "Write one file per reply. After each file, wait for 'next'."

## 3. Choosing a model per task

The plan is designed so that each task fits a 128k-context model with room to spare (packs target ≤ 45k tokens). Size is not the only risk: some tasks are hard to get exactly right, and a subtle error there spreads to everything built on top.

| Risk | Units | Advice |
|---|---|---|
| **Critical foundations** | 19A, 02 (determinism, dmath, store, pipeline, RNG, snapshots), 03 (ledger, holds, reason codes), 19B (world host, partitions, recovery) | Use the strongest model available, or have a strong model review every diff. These must be bit-exact; the property tests and replay tests in their packs are the safety net. |
| **Hard numerics / algorithms** | 05 (batch auction, impact), 06B (derivatives pricing), 07B (CCP margin, default waterfall), 08 (NAV, tranches), 11 (strategy-graph VM, training), 04 (macro model), 16B (actor decision models) | Strong or mid model; always run the numeric example tests in the pack before accepting. |
| **Standard game rules** | 09, 10, 12, 13, 14, 15, 16A/C, 18, 21 | Mid-size models are fine when the pack's tests are run every time. |
| **Mechanical** | 23 (params), 22B (content transcription), 17B (screens from a design system), i18n | Small fast models are fine. |

No model should be trusted on its own report. The guarantee comes from running the pack's tests and the stage gates, not from the model.

## 4. Review protocol (second model or human)

For each finished task, a reviewer gets the same pack plus the diff and answers these questions; any "no" sends the task back:

1. Are all files in the card present, and nothing outside the card changed (except allowed helpers)?
2. Do the exports match the card's Exports block exactly (names, parameter order, types)?
3. Is there one test per assigned acceptance test, named with its id, and does each test actually check the stated condition (not a weaker one)?
4. Are all numbers read from params, all money bigint micro-units, all floats converted with `toMoney`/`toQty`/`toPrice`?
5. Does `pnpm -w lint` pass (determinism rules), and is there no `Math.random`, `Date`, unsorted iteration, or `JSON.stringify` in engine code?
6. Are every edge case and exploit counter the card lists implemented and tested?
7. Is any spec rule in the excerpts missing, simplified, or implemented with different numbers?

## 5. Unit and stage gates

- **Unit done (G1):** every task of the unit is done; `pnpm -w test --filter <package>` is green; all the unit's acceptance tests pass in a TestWorld (19 Rule 12.4.1: in the partitioned headless world, not only unit tests); each invariant the unit registers has a passing negative test (20 Rule 3.9.4).
- **Stage done:** run the stage gate listed in `STAGES-AND-GATES.md` with all earlier stages enabled. Do not start the next stage's tasks that hard-depend on this stage until the gate is green. Tasks of the next stage that do not depend on the stage may start earlier.
- The gates G0–G5 are themselves built by tasks (units 20A and 20B, plus 19's CI tasks). Until 20B exists, run the G2 equivalent with the commands the 20A tasks provide.

## 6. When the spec seems wrong

The precedence rule is: 24 Decisions register > the owning module > 23 Parameter registry > other text; 22 wins on content names and counts. If a model finds a genuine contradiction that precedence does not settle, stop that task, record the question in `QUESTIONS.md` with the task id, and decide it (a DEFAULT is acceptable; record it in 24 later). Do not let the model decide silently.

## 7. Tracking progress

`BUILD-ORDER.md` is the tracker: one row per task with stage, unit, dependencies, pack size and a checkbox. Commit it with each task. To regenerate it after a card changes: `python3 tools/order.py`. To check plan coverage after editing cards: `python3 tools/coverage.py` and `python3 tools/assemble.py --all`.
