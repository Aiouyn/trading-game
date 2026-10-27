# Trading Game: project export

Snapshot taken 2026-10-20 18:22 UTC of everything produced in the "Trading Game" project. It is a copy only: the build plan was still being written when this was taken, so later work will not be in here.

## What is in each folder

### `vision-review/` (finished)

| File | What it is |
|---|---|
| `VISION-REVIEW.md` | First evaluation of the original `/vision` folder. |
| `VISION-V2.md` | Second version of the vision. Rejected, kept for reference only. |
| `VISION-V3.md` | The current vision: "the most advanced financial game", nothing cut. |
| `complete/00` to `complete/24` | The complete V3 game spec, 25 files (~3 MB). This is the source of truth. |
| `complete/_notes/` | Working notes for each spec file. |

How to read the spec:
- Start with `00-INDEX-AND-CONVENTIONS.md` (conventions, cross-module contracts, tick pipeline).
- Precedence when files disagree: `24-DECISIONS-REGISTER` wins, then the module that owns the topic, then `23-PARAMETER-REGISTRY`, then any other text. `22-CONTENT-CATALOGS` wins on content counts and names.
- `24` §5 lists decisions Y1 to Y12 that need your yes before launch.

### `build-plan/` (in progress)

A step-by-step plan detailed enough for a weaker AI model to build the game one task at a time, derived from spec `19` §12 (38 build units, stages S0 to S10, gates G0 to G5).

| Path | Status |
|---|---|
| `GLOBAL-CONTEXT.md` | Done. The shared contract every task follows (packages, names, core APIs). Some additions proposed in `_authoring/RECONCILE-TODO.md` are not merged in yet. |
| `RUNBOOK.md` | Done. How to run the plan with an AI model, task by task, including the prompt to use. |
| `STAGES-AND-GATES.md` | Done. Stages, gates and what must pass at each gate. |
| `_authoring/` | Internal files used to write the cards: writer assignments, card brief, writer prompt, and the reconciliation to-do list. |
| `tools/` | Python scripts: `assemble.py` builds task packs from cards, `order.py` the build order, `coverage.py` checks spec coverage, `spec.py` helpers. |
| `packs/` | Barely started (2 packs in `02`). Packs are generated from the cards by `tools/assemble.py`. |
| `cards/` | 230 task cards written. See below. |

Card units at snapshot time:

| Unit | Area | Status |
|---|---|---|
| 02 | Time engine core | Done (21 cards) |
| 03 | Ledger and accounting | Done (29 cards) |
| 05 | Markets and price engine | Done (23 cards) |
| 06A, 06B, 06C | Asset classes | Done (18, 11, 9 cards) |
| 19A, 19B, 19C, 19D | Tech architecture: repo, server, gateway, tooling | Done (5, 16, 11, 9 cards) |
| 20A, 20B | Verification and balance | Done (6, 21 cards) |
| 23 | Parameter registry | Done (8 cards) |
| 04 | Macro, central banks, sovereigns | In progress (18 cards, no unit summary yet) |
| 07A | Banking, credit, clearing | In progress (8 cards) |
| 07B | Banking, second half | Not started (empty folder) |
| 08 | Funds, structured products, insurance | In progress (10 cards) |
| 09A | Businesses and companies | In progress (7 cards) |
| 09B, 10A, 10B, 11, 12, 13A, 13B, 14A, 14B, 15A, 15B, 16A, 16B, 16C, 17A, 17B, 18, 21, 22A, 22B | Businesses part 2, real estate, AI lab, conflict, law, progression, social, living world, screens, onboarding, liveops, content | Not started |

Still to do after the cards: assemble every pack, write `BUILD-ORDER.md`, check coverage against every spec module, and reconcile the interfaces between tasks (`_authoring/RECONCILE-TODO.md` lists what is known so far).

A unit "Done" has its `_unit.md` summary. A card in an "In progress" unit may still be revised.
