# Port Avalon — Handover

Snapshot: 2026-10-21, 16:45 Paris time (UTC+2). Main at `37c10580f6b778eff1c2ae0314fd075f9e8fdc7a`.

## 1. What this is
Port Avalon is a persistent multiplayer fictional finance tycoon. The player starts with $5k and a cracked phone, trades 183 assets, builds businesses across 13 sectors, owns property in an isometric 3D city, and climbs ranks from R0 Broke to R6 Dynasty. 1 game day (GD) = 1 real hour. Chapters run 8 weeks. UI: Quay OS shell, Ink & Brass design system, EN and FR.

Where things live:
- `src/engine`, `src/world`, `server/`, `packages/engine/*`: engine, world, backend (Engine Dev).
- `src/shell`, `src/components`, `src/components/apps`: UI (Front Dev). Next.js 16: read `AGENTS.md` first, it has breaking changes.
- `prototypes/cities`, `packages/citygen`: 3D city (City Dev).
- `packages/content`: content data.
- `export/`: V3 spec (25 modules) and the build plan.
  - `export/build-plan/BUILD-ORDER.md`: 399 tasks, 32 units, stages 0-9.
  - `export/build-plan/STAGES-AND-GATES.md`: stage gates.
  - `export/build-plan/RUNBOOK.md`, `GLOBAL-CONTEXT.md`: how to work, shared context.
  - `export/build-plan/cards/<unit>/<task>.md`: one spec card per task, with ACs.
  - `export/build-plan/packs/`: context packs per unit. `tools/`: card checker and lint tools.
- `export/ledger-ref/errata.md`: the decisions register, E-1 to E-78. Errata override the spec.
- `export/ledger-ref/`: ledger catalog, leg policy, binding tests.
- `handover/roles/*.md`: one system prompt per bot.

## 2. Team
Owner: Aiouyn. Talks only to the Producer.

| Role | Does | Never |
|---|---|---|
| Producer | Owner's only contact. Owns plan of record, decisions register, stage gates, dispatch, merges. | Decides owner calls; writes specs or code a teammate owns. |
| Designer | Core loop, progression, onboarding, pacing, social, news/NPC content, EN+FR writing. | Code, engine math, deep systems, visuals. |
| Quant | Price engine, markets, macro, central banks, sinks/faucets, balance. Proves every number with sims. | Code dispatch, game feel, UI. |
| Systems | Banking, credit, ledger, funds, insurance, companies (13 sectors), cities and property rules, AI Lab, adversarial. State model + invariants + exploit analysis per mechanic. Maintains cards and errata. | Dispatch, price math, progression. |
| Studio | Ink & Brass, Quay OS, every screen, charts, motion, icons, city art. Mockups and screen ACs. | Dispatch, rules or numbers. |
| Engine Dev | Code: engine, world, server. Branch `eng/<unit>`. | UI, city code, rules or numbers. |
| Front Dev | Code: Next/React UI, shell, apps, i18n. Branch `ui/<unit>`. | Engine/world/server, unapproved visuals. |
| City Dev | Code: Three.js city, citygen, city perf. Branch `city/<unit>`. | Engine/world/server, other apps' UI, unmeasured perf numbers. |
| QA | Go/no-go on every PR and stage gate, with evidence and mutants. | Fixing code it judges; passing on claims it didn't run. |

## 3. Working rules
1. One task per engineer at a time.
2. No file overlap between engineers' tasks.
3. Every task has a spec card with ACs before dispatch.
4. QA gates every PR: runs the ACs and mutants on the exact head SHA. GO or NO-GO with evidence.
5. Merge main into branches. Never rebase.
6. No fixes inside merge commits. Hand-resolved conflicts are listed in the PR body.
7. Exactly one env block in `next.config` and one in the Playwright `webServer`.
8. Test hook params are gated at build time. A no-flag build has 0 hook strings.
9. Use the Playwright lock file; don't run Playwright suites concurrently on one machine.
10. Merge with `gh pr merge N --merge --match-head-commit <full sha>`. Merge commits only.
11. Never force-push.
12. Owner calls go to the owner, as one crisp question.
13. Each engineer works in its own worktree; never in another's.
14. Before "done": typecheck, lint, Vitest (and Playwright for UI/city), results pasted in the PR.
15. PR body must match the diff exactly (files, PNGs, resolutions).

## 4. Current state
Main: `37c10580f6b778eff1c2ae0314fd075f9e8fdc7a`.

Merged PRs (39):
- #2 Quay OS shell skeleton (Spec 1)
- #3 V3 ledger core: INV-LED-001..015 + T03-01..12 (packages/engine/ledger)
- #4 City: CityRenderer (Spec 2) — tiers, table view, render-on-demand, budgets
- #5 Unit 02 core: canonEncode, SortedMap, newId, params, intent envelope (packages/engine/core)
- #6 Task 3 (ledger-016): sysSide, escrow, accruals, cpPolicy, E-16, E-17 INV-LED-027, QA pr3i
- #7 Telemetry fps: number | null; drop city suites from ci.yml
- #8 City seam unblock: drop ambient @/city d.ts; cityId city_port_avalon
- #9 City seam: lock cityId to city_port_avalon
- #10 e2e: City seam test asserts observable behaviour (works with stub and real renderer)
- #11 17A T1: tokens, primitives (Button/Chip/Label/MoneyText), CSS split
- #12 CityWindow unit tests: visibility, reduced motion, dispose, ui.perf (fps null)
- #13 CityWindow: overlay setter + apply changes made while loading
- #14 17A T2: chrome, strip, shelf, tiles, 20 glyphs (+ T1 rulings 4 & 6)
- #15 17A T1 follow-up: Studio rulings 1, 2, 5, 7, 8 + T1-03 baselines
- #16 CityWindow hardening + E-26 cty_port_avalon
- #17 T04-01: macro schema (enums, types, ids, tables, bloc defaults, ports, events, streams)
- #18 17A T3: TickRing + MarketPhase
- #19 17A touch follow-up: glyph focus ring, 44px tile hit areas, y 40–48 tap test, ruling 4/8 guards, City Retry
- #20 T02-05: clock and calendar (D016 holiday table behind D071 flag, default OFF)
- #21 T04-02: macro calendar (meetings, releases, auctions, UTC bands)
- #22 17A T4: navigation (launcher, deep links, Trade <1264, phone back stack)
- #23 city: scope C-16 path check to City Dev branches
- #24 17A T5: notices and sheets (banner, pill, sheet, overlays)
- #25 T02-02: dmath part 1 (exp/ln family, reference vectors, golden hash)
- #26 city: Industrial Basin label on phone T0
- #27 T02-04: fixed-point and money conversion (roundHalfEven, toMoney, bigint helpers, allocate)
- #28 17A T6: shell mounts for Banner / WorldEventBanner / Sheet + typed alert/world-event feed (mock)
- #30 T22A-01: ContentView (packages/content) with peNorm0
- #31 T04-01b: region slugs, outputGapEstimate AR(1), 7-key public ruleTerms (flips #17)
- #33 T02-03: dmath part 2 (trig, erf family, normInv AS241, lgamma, Black-Scholes, solvers, Cholesky)
- #34 17B CH-00: shared mock contracts, mock feed, useChannel
- #35 17A T1 C4: make the /__ds axe check deterministic (palette transition race)
- #36 T02-06: RNG streams (xoshiro128**, seeding/mixing, variates, registry, RngManager, INV-ENG-002, CI scan) [stacked on #33]
- #37 T04-01b follow-ups: core roundHalfEven, pin GAPEST_SIGMA, assert genesis return
- #39 city e2e: deterministic ambient-stop and perf tests (fake clock)
- #40 17A C4: assert every ghost button renders
- #42 04 follow-ups 2: signed-zero rounding tests, #37 overflow note, E-61 SECTOR_ rename
- #43 Gate ?load=fail / ?retryMs= mock hooks at build time
- #44 ledger tests: lon_ ids, qty≠0 parking test, #6 correction

Open PRs:
| PR | Head | Branch | Status |
|---|---|---|---|
| #45 | ecd5e0f | eng/02-t09 | T02-09 Store. Fixes for QA NO-GO (E-73(4) key-fn copy, 7 test gaps, E-74 32-byte salt) pushed; with QA. |
| #46 | 0ca976b | eng/02-t11 | T02-11 module contract, stacked on #45. CI not green yet. |
| #47 | 7897241 | eng/e75-erfc | ERFC-CUTOFF expected value = 256-bit reference. Not yet QA'd. |
| #38 | 0a9a4a8 | ui/17b-set-02-08 | Front Dev re-merging main (after #34). |
| #29 | e7946ad | ui/17a-recent-sheet | Front Dev re-merging main; halt chip hit area. |
| #41 | 0142371 | city/e2e-determinism | City Dev fixing QA NO-GO: waits must be bounded and name what they wait for. |
| #32 | c235e96 | city/e2e-hook-flag | City Dev fixing QA NO-GO: conflicts with main, re-merge. |
| #1 | f1269af | claude/export-spec-and-build-plan-hr42zi | Old spec export. Superseded by this handover's `export/`. Do not merge. |

Progress: about 12 of 399 tasks done (stage 0, engine core unit 02 partly, early ledger, content layer, macro schema/calendar, UI shell, 3D city renderer).

## 5. Queues (in order)
Engine Dev:
1. #45 to GO.
2. #46 to GO.
3. lon_ prefix rename (AC-ID-LON-PREFIX).
4. NPC TRANSFER erratum: owner ruled "make it more realistic", so player-NPC flows become TRANSFERs to NPC sector accounts. Blocked on owner confirming the amendment to frozen ledger-core v0.7 (Systems writes it).
5. IR-2/3/4/7/8 for T10A-12 (persist sector placement, sectorKey/styleKey in map data, refuse excluded placements, `city.vis:<cityId>:<parcelId>` registry row, publish quayEdge/railAccess/crownParcel).
Also: #47 through QA.

Front Dev:
1. #38.
2. #29 (halt chip hit area).
3. AC-HOOKS-PROD (f5e5ecb staged).
4. Glyph-sheet PNG rebaseline on main (388→380, 1401→1361 px).
5. Delta not-a-container DeltaError test (`set /a/b/c` over scalar `b` must throw).
6. tonelint CI job.
7. copylint clock strings.

City Dev:
1. #41 (bounded waits).
2. #32 re-merge.
3. T0 first-picture perf. Profile first, measure on phone and desktop.
4. T10A-12 U1-U6: realistic sector placement (`packages/citygen/src/placement/**`). U6 may add 4 crown parcels (6 total in the business district); rest of map frozen.
5. T10A-13: transcribe `packages/content/data/district-flags.json` from Designer's values.

Quant: re-run the E-76 AC when MSI lands (average median margin is only 0.003).
Systems: write the ledger-core v0.7 NPC TRANSFER amendment; keep cards and errata current.
Designer: district-flag values for T10A-13.
Studio: review screenshots for T10A-12 U6 and UI PRs.
QA: #45, #47, then each PR as pushed.

## 6. Open owner decisions
1. Yes for City Dev to build the character unit (14A).
2. Confirm the ledger-core v0.7 amendment: player-NPC flows become TRANSFERs to NPC sector accounts.

## 7. Resume on Hermes
1. `git clone https://github.com/Aiouyn/trading-game && cd trading-game && git checkout handover/hermes` (or merge this PR first, then use main). Offline: `git clone trading-game.bundle` from the zip.
2. Read this file, then `export/build-plan/RUNBOOK.md` and `export/ledger-ref/errata.md`.
3. Create one bot per file in `handover/roles/`. Paste the file as its system prompt.
4. Give every bot the repo, a GitHub token (engineers and Producer need push; only Producer merges), and a shared channel or message path to the Producer.
5. Engineers: one worktree each (`git worktree add ../<role> -b <prefix>/<unit> origin/main`), install with the repo's package manager.
6. Start the Producer with: "Resume from HANDOVER.md section 5." It re-dispatches each queue head and asks the owner the two questions in section 6.
7. First check: run `gh pr list` and compare with section 4. Anything newer wins.
