# V1 Phase 3: status

Scope: Phase 3 (player tools and learning) of `C:/Users/Mathis/.claude/plans/expressive-sprouting-aurora.md`, and the lead decisions in the Phase 3 decisions file (summarised in section 3 so the record lives in this repo).
Branch: `v1`. Status date: 2026-10-10. Measured at `3d43d22` (v1 after the last Phase 4 stage A merge). The Phase 3 slices are on v1 at `04985f9` (`p3/c1`) and `afe3c87` (`p3/c2`). This file was committed after `3d43d22`.
Status words as in `docs/V1-PHASE1.md`: **Done** (built and tested), **Partial** (built, with named gaps), **Not built** (no code on v1), **Deferred** (moved on purpose), **Decided** (lead decision recorded).

**Phase 3 is closed on v1 for code.** The gate slice (C1) and the polish slice (C2) are merged. Items still marked Partial or Not built are named below.

## 1. Merge step

Order: `p3/c1`, then `p3/c2`, each `--no-ff`. Both merged cleanly (no conflicts). Each merge was followed by `npx next typegen`, `npx tsc --noEmit` and `npx vitest run --maxWorkers=4`, all passing.

| Branch | Head merged | Merge commit | Notes |
|---|---|---|---|
| `p3/c1` (gates, privacy) | `5030e60` | `04985f9` | 25 files. Adds `foldBlur: 2`, the least-squares R1 attacker, the research-desk and no-reveal hunts, `tests/e2e/no-leak.spec.ts`, and the suite-wide `testTimeout: 60_000` in `vitest.config.ts`. |
| `p3/c2` (polish) | `63b2c1a` | `afe3c87` | 32 files. Includes `9d99f06` and the review repair `63b2c1a`. |

Already on v1 from earlier no-ff merges: `p3/a1` (`cd1d78f`), `p3/a2` (`94f343a`), `p3/a3` (`b3cf081`), `p3/b1` (`71540b9`), `p3/b2` (`11fcab1`), `p3/b3` (`24e280c`), `p3/b4` (`0e42cb2`).

Commits added to v1 in the Phase 3 run before the merges:
- `94f6cf6` and `7439dc3`: explicit 60 s timeouts on the replay tests that time out under host load. The list is in section 4.1.
- This file.

## 2. Phase 3 items

### 2.1 Learning loop

| Item | Status | Commits | Notes |
|---|---|---|---|
| M07 daily close, "THE PORT AVALON CLOSE", with priced-in chips | Done | `65ac2bd` (day record and card data), `6c83360` (card) | Opens once per game day for an online player. An offline player's close waits in Messages. Chips show the band only, never the share. "Done" carries no chip. |
| M08 benchmark ghosts (GX buy-and-hold, seeded random monthly picks, 63-day momentum) | Done | `65ac2bd`, `bb88760` | Price-only benchmark: dividends and interest are taken out, fees kept. Ghosts start at the first close, so a day-1 intraday trade counts for the player only (open item 9). |
| M17 luck vs skill | Done | `6c83360` | Portfolio panel reads the API change values. |
| M09 journal and replay ("If held") | Done | `ce30913`, `b23e642` | A trade shows as pending until its day closes. With an analyst hired: attribution bar, and the waterfall sums to the trade total. Senior adds flow by pool and headlines. |
| Why-it-moved ladder, rung 1: free one-liner | Partial | none for an asset move | A free one-sentence explanation exists for a closed trade (journal, `tripLine`). No free one-liner for an asset's move was found on the Broker (open item 5). |
| Why-it-moved ladder, rung 2: hired analyst (Junior $300 per game week, Senior $2,000) | Done | `65ac2bd`, `ce30913` | Paid a week ahead, no refund. A short due day lapses the analyst with one line and no debt. Numbers in `src/content/learning.ts`. |
| Why-it-moved ladder, rung 3: Research Desk at R3 ($50,000 once, $5,000 per game week) | Done | `ce30913` | Unlock at Operator. A lapsed desk locks but its files stay readable. Queries clamp to closed days on the server. |

### 2.2 Trading

| Item | Status | Commits | Notes |
|---|---|---|---|
| M10 keyboard trading | Done | `9f170c6`, `84b484b` | `/` focuses search, B and S set the side, 1 to 4 pick the order type, Enter asks for a one-line confirm and a second Enter sends, Esc cancels. Bound on `event.code`, only in the focused window. A quick-Enter setting (off by default) sends a single Enter for orders under 10% of cash. |
| M11 run files (export and import) | Done | `dbeeb32`, `3954dee`, `eae7ce4` | Practice, scenario and challenge runs. Schema and config versioned, size and command caps, digest. Never ranked. |
| M13 reason-coded ledger | Done | `65ac2bd`, `c8b2253`, `9f170c6` | Eight reason codes: order, stop, liquidation, settlement, option_expiry, dividend_reinvest, recurring_buy, block_slice. Keeps 1,000 fills and 500 round trips per player. |
| M18 scenarios | Done | `dbeeb32`, `3954dee` | Six seeds: contraction-week s3, overheating s8, flash s66, earnings-heavy s1, quiet s2, crypto-winter s5. Client sandbox, unranked, fully isolated (`src/sandbox`). |
| M19 weekly seed challenge | Done (board local) | `dbeeb32`, `3954dee`, `1a4f8b4` | Seed from the ISO week and a public salt. One attempt per ISO week, claimed durably on the player record. The board is local in V1. |
| Liquidation line on the chart | Done | `9f170c6`, `84b484b` | Margin and short positions only. Drawn at the engine's own margin trigger, on mid. |
| Block trade | Done | `9f170c6`, `bb88760` | TWAP over N ticks, Institutional rank only. Slices are booked by fill. An unfilled remainder gets retries, then stops with a partial notice. Expected cost from `estimateFill` per slice. No discount. |
| Recurring buys | Done | `9f170c6` | Fixed dollars every N game days, cash only. A short-cash slot is skipped with a reason. |
| DRIP (dividend reinvestment, opt-in per position) | Done | `9f170c6`, `84b484b` | Carries the exact dividend the engine credits. Survives a reload. |
| Practice account | Done | `dbeeb32`, `eae7ce4` | Paper money in a client sandbox. Never in net worth, rank, boards or the live economy. |

### 2.3 Help

| Item | Status | Commits | Notes |
|---|---|---|---|
| Learn app: ten two-minute lessons, glossary | Done | `eae7ce4`, `1a4f8b4` | Each lesson is a short read plus one check that runs in its own sandbox. Completion is stored on the server player record. The check runs in the browser: a known limit, recorded in `learn.ts` (open item 11). |
| Simple-mode guardrail: 20% of cash cap on every buy below R1 (Hustler) | Done | `65ac2bd`, `bb88760` | Server and ticket apply the same rule, also when onboarding is skipped. |
| Optional goal ladder, off by default | Done | `eae7ce4`, `1a4f8b4` | Opt-in under Settings. Progress comes from the server. Rungs: `goal-nw20k`, `goal-profit`, `goal-hold3`, `goal-nw250k`. |
| Always-busy calendar | Done | `65ac2bd`, `eae7ce4` | At least three real dated items in the next two game days (`calendarFor`). Nothing invented. |

### 2.4 Text (decisions section 5)

Partial. Done: the `TextProvider` interface and a template provider, with the daily close, the desk memo and the trade line (`65ac2bd`, `ce30913`). A banned-word test covers every `work.*`, `goal.*` and `dayclose.*` key, the French list as well, and the wire headlines the close can embed (`bb88760`). Not done: journal sentences and lesson copy are not in the provider (`bb88760` open note). The other roles (newsroom, executives, rivals, moderator) are Phase 7.

### 2.5 Privacy fixes (decisions section 0)

All six Done, in `911f371` with the review round `24f77f8`:
- P1: NPC accounts are flagged at creation and repaired on load. Their fills clear as Retail, never Players or You.
- P2: depth Retail follows the explain fold. Harness in `src/engine/explain.test.ts`.
- P3: short interest is computed on the server, every 12 ticks, sent on change and in each welcome.
- P4: the public-records list is in `docs/V1-PRIVACY.md` section 1, and `src/world/privacy-doc.test.ts` pins it.
- P5: a new world draws its seed at first boot and stores it in the database. An explicit `SEED` wins. The sandbox seed prefix is `sbx:`, and import refuses any other seed (`dbeeb32`).
- P6: the localStorage allowlist is `tg-prefs` and `tg-token`.

### 2.6 Gates (plan)

Done on v1 (gate slice C1, `04985f9`). The R1 strong attacker, the research-desk hunts and the no-reveal checks are on v1 and pass in the unit run. L2 and L5 are checked end to end in `tests/e2e/no-leak.spec.ts`. L6 is not applicable: there is no autopsy code. See section 4.2 for hunt results and section 4.3 for the no-reveal checks.

## 3. Lead decisions

Summary of the Phase 3 lead decisions, by ID. "On v1" gives the commit where the decision is built, and whether it was tested. Where a ruling changed an earlier decision, the change is named.

| ID | Decision | On v1 |
|---|---|---|
| P1 | NPC accounts count as Retail. Players and soloYou count human accounts only. | Done, `911f371`. `npc-flow.test.ts`. |
| P2 | Depth Retail follows the explain fold. Subtracting depth from explain never reveals player flow. | Done, `911f371`, harness `24f77f8`. |
| P3 | Short interest is computed on the server and sent slowly, only on change. | Done, `911f371`. |
| P4 | The public-records list is written down in `docs/V1-PRIVACY.md`. | Done, `24f77f8`. |
| P5 | The live seed is drawn at first boot and kept in the database, never in source. | Done, `911f371`, `dbeeb32`. |
| P6 | localStorage allows only `tg-prefs` and `tg-token`. | Done, `911f371`. |
| D-1 | Factor-first desk waterfall: Market, Sector, News, Event, Flow, Company noise, Move. Parts sum to the close move exactly. | Done, `911f371`, `24f77f8`. Saves from before A1 show their value cause as Company noise (no split). |
| D-2 | Average cost, not FIFO. | Done, `65ac2bd`. |
| D-3 | Ledger keeps 1,000 fills and 500 round trips. A round trip closes at zero. A flip closes and reopens. | Done, `65ac2bd`, `c8b2253`. |
| D-4 | Three ghosts start at the player's day 1 with the starting cash, no haircut. Ruling change in `bb88760`: every non-trading cash move shifts ghosts and start cash by the same amount, so the benchmark measures trading only. | Done, `65ac2bd`, `bb88760`. |
| D-5 | Ghosts price on recorded closes. Delisted holdings settle as the player's do. | Done, `65ac2bd`. |
| D-6 | Percentile is the player's rank among the player and three ghosts. Ties rank against the player. "No trades yet" when there are none. | Done, `65ac2bd`. |
| D-7 | Close-card net worth is on liquidation value at the close tick. The benchmark equity basis is price-only (`bb88760`). | Done, `65ac2bd`, `bb88760`. |
| D-8 | The Done chip is removed from the Wire. | Done, `6c83360`. |
| D-9 | "Copy summary" copies plain text. No image export in V1. | Done, `6c83360`. |
| D-10, D-11 | No weekends and no speed toast. The world runs in real time, 24/7. | Applied by absence: there is no such code on v1. |
| D-12 | `explainMove` throws on an open or future day. The UI clamps the picker. | Done, `1a0f2ee` (engine), `ce30913` (desk). |
| D-13 | The desk locks only when upkeep lapses. There is no rank-loss lock. | Done, `ce30913`. `desk.test.ts`. |
| D-14 | Names: "Analyst notes" for the paid Broker reads, "Analyst" for the hired helper, "Signal pack" for the Lab product. | Partly checked: `analyst.title`, `broker.notesLocked` and `lab.signals.run` in `en.json`. |
| D-15 | "Players" means human accounts only. | Done, `911f371`. |
| D-16 | Explain archive: 252 game days of compact cause and part rows per asset. The detailed log keeps 21 days. | Done, `911f371`. |
| D-17 | Velvet's test ids are canonical. | Not re-checked in this run. |
| D-18 | The Event row shows on the desk and the analyst view when a world event moved the asset in the window. | Done, `911f371`. |
| D-19 | Analyst Junior $300 and Senior $2,000 per game week. Desk $50,000 once, then $5,000 per game week at R3. Paid a week ahead, no refund, lapse without debt, restricted cash cannot pay. | Done, `65ac2bd`, `ce30913`. Restricted cash has no writer yet (open item 7). |
| S2 | Close card contents, and an offline close waits in Messages. | Done, `6c83360`, `65ac2bd`. |
| S3 | M10 keyboard rules: Enter opens a one-line confirm and a second Enter sends. A quick-Enter setting, off by default, sends a single Enter for orders under 10% of cash. | Done, `9f170c6`, `84b484b`. The quick-Enter setting departs from the plan's "Enter-only" wording (open item 12). |
| S3 | Simple-mode cap on every buy below R1, not only the first trade (lead ruling). | Done, `65ac2bd`, `bb88760`. |
| S3 | Block trades need Institutional rank. Recurring buys and DRIP are plans placed through the normal order gate. | Done, `9f170c6`. |
| S4 | Learn: ten lessons. Goal ladder off by default. Always-busy calendar from real schedules. | Done, `eae7ce4`, `1a4f8b4`. |
| S5 | Text provider covers the daily close, the desk memo and the trade line, in en and fr. | Partial (section 2.4). |

## 4. Gate results

### 4.1 Commands (on v1 at `3d43d22`, which includes all Phase 3 slices)

| Command | Result |
|---|---|
| `npx next typegen` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run`, default workers | Not re-run in this pass. The default 5 s per-test timeout is load-dependent: on a loaded host, long replay tests exceed it and then pass when run alone. This is not a standing failure. Since `5030e60`, `vitest.config.ts` sets `testTimeout: 60_000` for the whole suite, so the default-worker run is no longer bound by 5 s. |
| `npx vitest run --maxWorkers=4` | PASS. 120 files, 1256 tests pass, 1 skipped. |
| `npx eslint src scripts server` | 0 errors, 15 warnings. The warnings are the same as before (`react/jsx-no-literals` in `src/components/Welcome.tsx`, unused vars in `src/game/game.test.ts`). |
| `npm run build` | PASS (Next.js 16.4.0, Turbopack). |
| `npm run e2e` (with `E2E_BUILD_CMD="npx next build --webpack"`, ports 3211 and 8801) | PASS. 495 tests: 192 passed, 0 failed, 303 skipped (exit 0, 4.1 min). The skips are by design: each spec skips in the projects it does not cover (desktop-only specs on phone, phone-only on desktop, shell specs per viewport). |

Explicit 60 s timeouts (`timeout: 60_000` or `}, 60_000)`), now redundant with the suite-wide 60 s but harmless. The count is 56 lines in 19 test files:

| File | Count |
|---|---|
| `src/sandbox/runfile.test.ts` | 14 |
| `src/sandbox/sandbox.test.ts` | 5 |
| `src/engine/valuegap.test.ts` | 5 |
| `src/engine/indices.test.ts` | 4 |
| `src/engine/selfimpact.test.ts` | 4 |
| `src/world/shops.test.ts` | 4 |
| `src/game/server-wire.test.ts` | 3 |
| `src/world/desk.test.ts` | 3 |
| `src/engine/exploits.test.ts` | 2 |
| `src/engine/impact-tally.test.ts` | 2 |
| `src/sandbox/board.test.ts` | 2 |
| `src/engine/advanced.test.ts`, `src/engine/huge.test.ts`, `src/world/close-card.test.ts`, `src/world/close.test.ts`, `src/world/external-cash.test.ts`, `src/world/ledger.test.ts`, `src/world/text/banned.test.ts`, `src/world/world.test.ts` | 1 each |

The tests given a 60 s timeout in this run, net of the pension reversal in `7439dc3`, are:
- `src/engine/indices.test.ts`: "a listing younger than the review cycle waits for the next review"; "is announced on the Wire before it takes effect, and the membership changes only on the effective day"; "is deterministic: the same world replays the same index state and prices". The timeout on "the pension pool trades into the added name" was reverted to the default.
- `src/world/ledger.test.ts`: "keeps 1000 fills and 500 round trips, and the ledger survives a snapshot".

The first commit (`94f6cf6`) put the timeout on the pension test by mistake. The second (`7439dc3`) moved it to the two index tests above.

### 4.2 Hunts

Tape's research-desk hunts. The hunt ids are not used as test names on v1, so the mapping is given.

| Hunt | Test on v1 | Result |
|---|---|---|
| `explain_move_rejects_open_day` | `src/engine/explain.test.ts`: "rejects the open session day and anything after the last close" | PASS |
| `window_diff_no_isolate` | `src/engine/explain.test.ts`: harness over 20 seeds and adjacent windows | PASS |
| `desk_below_r3_absent` | `src/world/desk.test.ts`: "locks until the desk is unlocked at R3, and refuses a query before that". Covered under its own name, not the hunt id (open item 14). | PASS |
| `fold_solve` (R1, narrowed to the naive attacker) | `src/engine/fold-solve.test.ts` | PASS |
| Explain identity on the books | `src/world/trade-explain.test.ts` | PASS |
| R1 strong attacker (least squares on every public signal) | `src/engine/fold-lsq.test.ts` (on v1 from `04985f9`) | PASS at `foldBlur: 2` (section 5). With the blur at 0 it fails. |
| Research-desk hunts, 20 seeds (`src/engine/research-desk.hunts.test.ts`, `src/world/research-desk.hunts.test.ts`) | on v1 from `04985f9` | PASS in the unit run. The e2e spec `tests/e2e/research-desk-hunts.spec.ts` is in the e2e run (section 4.1). |
| No-reveal hunts (`src/world/no-reveal.hunts.test.ts`) | on v1 from `04985f9` | PASS. A short is never filed; a lifestyle purchase prints no line. |

### 4.3 No-reveal checks (Tape L1 to L6, `docs/team/specs/tape-acceptance.md` section 12)

| Check | On v1 | Result |
|---|---|---|
| L1, localStorage allowlist | `tests/e2e/no-leak.spec.ts` (end to end, from `04985f9`), and `src/world/privacy-doc.test.ts` pins the allowlist wording | PASS in the e2e run (section 4.1) |
| L2, zero requests to other origins | `tests/e2e/no-leak.spec.ts` | PASS in the e2e run (section 4.1) |
| L3, rivals show no positions | `tests/e2e/no-leak.spec.ts` for every broadcast frame to another client; `privacy-doc.test.ts` for the wording | PASS in the e2e run (section 4.1) |
| L4, no surface shows the player's positions | `tests/e2e/no-leak.spec.ts`. Public records are the list in `docs/V1-PRIVACY.md` section 1. | PASS in the e2e run (section 4.1) |
| L5, one download after run export | `tests/e2e/no-leak.spec.ts`: a run-file export makes exactly one download, changes no browser storage and sends no third-party request | PASS in the e2e run (section 4.1) |
| L6, autopsy only after opt-in | Not applicable in this release: there is no autopsy code in `src` (the skip reason is in `no-leak.spec.ts`) | Deferred |

## 5. R1 attacker numbers

R1 is the fold-attribution ruling: on a folded day, can public data isolate one lone account's flow? Two attackers exist.
- **Narrowed R1 (on v1).** A naive attacker that solves own = Retail minus the mean of prior public Retail readings. Its test passes on v1 (`fold-solve.test.ts`). It is the ruling in `docs/V1-PRIVACY.md` section 7.
- **Strong R1 (on v1 from `04985f9`).** A least-squares attacker on every public signal a client sees for one asset: depth on every closed day, explain parts, the public day list. It is scored over 20 seeds, 60 game days, the 21-day detailed window. The metric is the pooled correlation between its estimate and the true lone-account flow. The test requires correlation below 0.5 at 0.25 ADV a day or less, and below 0.75 above that.

**The ruling (lead, recorded in `docs/V1-PRIVACY.md` section 7):**
- Keep `ecology.foldBlur = 2`. The blur is a server-only draw on a human trade day. The price does not change, only the public attribution. The test that pins this is the close comparison with the blur off and on, in `src/engine/research-desk.hunts.test.ts`.
- The privacy guarantee covers lone-account flows of about 1 ADV a day per asset or less, where the strong attacker's pooled correlation stays under 0.5.
- Footprint argument: a larger flow leaves unavoidable public footprints in the day's volume and price, as in a real market. Those flows are outside this guarantee's scope.
- The noisier Retail row on folded days (a 2 ADV spread, shown in the Flow by type row) is accepted.
- Residual, stated plainly: by extrapolation (not measured), a lone flow of about 1.2 ADV a day or more would be recovered above correlation 0.5. That is the case the footprint argument covers. The per-day cap (`maxAdvPerTick`, 3 ADV) means a 3 ADV flow is not hidden.

**The measurements.** They were taken in the `p3/c1` tree before the merge. They measure the blur parameter `foldBlur` (the noise, in sd, on the public attribution of a folded day). Pooled correlation of the attacker's estimate with the true lone-account flow, 20 seeds. The gate is at or under 0.5.

| foldBlur (sd) | 0.05 ADV/day | 0.25 | 0.5 | 1 | Gate (strong R1) |
|---|---|---|---|---|---|
| 0 (no blur, the pre-ruling design) | 0.208 | 0.706 | 0.868 | 0.919 | FAIL at 0.25, 0.5 and 1 (test run `lsq-noblur.log`) |
| 0.5 | 0.086 | 0.395 | 0.650 | 0.827 | FAIL at 1 (JSONL only, no test run) |
| 1 | 0.046 | 0.224 | 0.428 | 0.662 | PASS (test run `lsq-final.log`, 4 of 4) |
| 2 (ruled, on v1) | 0.023 | 0.114 | 0.239 | 0.423 | PASS (test runs `lsq-b2.log` and `r1-run.log`, 4 of 4) |

The blur-0 row was measured with `FOLDBLUR=0` in the `p3/c1` tree, which differed from v1 in other ways at the time. The ruled value, blur 2, is on v1 now. `src/engine/fold-lsq.test.ts` runs in the v1 unit suite and passes (section 4.1). The privacy doc's table (`docs/V1-PRIVACY.md` section 7) gives the same blur 2 row, rounded to two decimals.

Open: the price claim is pinned by a test, but the sign-off on it is open (open item 3).

## 6. Measured on v1 (not repeated here)

- The Phase 3 vitest tests of all slices (A1, A2, A3, B1 to B4, C1, C2) are in the 1256 passing tests in section 4.1.
- The wealth-curve figures recorded in `65ac2bd` and `bb88760` (day 1 $20,495, day 7 $1,626,281) were measured before this run. They were not re-run here.

## 7. Open items

Owners are the team members named in the decisions file, or the lead.

1. **Closed: `p3/c1` merged** (`04985f9`). The R1 ruling (`foldBlur: 2`) is on v1 and `fold-lsq.test.ts` passes. Owner of any follow-up: Tape.
2. **Closed: `p3/c2` merged** (`afe3c87`). Owner of any follow-up: the author of the polish slice.
3. **Foldblur and prices.** The ruling says the blur changes only public attribution, and a test pins the close with the blur off and on. Sign-off that the price claim holds is still open. Owner: Quant, with lead sign-off.
4. **Default vitest concurrency on a loaded host.** The suite passes with `--maxWorkers=4` (1256 tests). The default 5 s per-test timeout is load-dependent. Since `5030e60`, `vitest.config.ts` sets a suite-wide `testTimeout: 60_000`, so the default run is no longer bound by 5 s. The explicit per-test timeouts (section 4.1) are now redundant. Removing them is optional. Owner: Tape.
5. **Free one-liner for an asset's move.** The Broker has no free one-liner for why an asset moved; only the journal's trade line is free. Owner: Forge (Broker) with Velvet's spec.
6. **Text provider scope.** Journal sentences and lesson copy are not in the provider. Owner: Phase 7 text work.
7. **Restricted cash has no writer.** Ad grants and fresh start are Phase 6, so restricted cash cannot pay analyst or desk dues yet. Owner: Phase 6.
8. **Alliance treasuries on the Wire.** Still open in `docs/V1-PRIVACY.md` section 2a. Needs a ruling. Owner: lead, with Ledger.
9. **Ghost start.** Ghosts start at the first close, so a day-1 intraday trade counts for the player but not the ghosts. Documented, not changed. Owner: Ledger, to confirm.
10. **Trading record bandwidth.** The trade record takes 20.2 KB of the 62.8 KB per-tick player payload with 50 fills and 5 closes. Send on change, not every tick. Owner: Forge (client store).
11. **Lesson checks run in the browser.** A known limit, recorded in `learn.ts`. Owner: Velvet and Forge, to accept or move to the server.
12. **Quick-Enter versus Enter-only.** The plan says "Enter-only execution". The quick-Enter setting (off by default) is a deliberate exception recorded in the decisions file. Owner: Velvet, to confirm.
13. **D-14 and D-17 names and test ids.** Not fully checked in this run. Owner: Velvet.
14. **Hunt id mapping.** `desk_below_r3_absent` has no test under its id on v1. Owner: Tape (rename or map).
15. **Phase 3 gates (C1).** Closed by the merge (`04985f9`). L6 is not applicable until an autopsy exists. Owner: Tape.
16. **Not reviewed in this run:** the French lesson copy and the screenshot tour of every app in four palettes (plan Phase 8 and 9). Owner: Velvet.

## 8. Commits

- `94f6cf6` test: explicit 60 s timeouts on the replay tests that time out under load (the first one landed on the pension test by mistake).
- `7439dc3` test: 60 s timeouts on the two index tests that time out under load; the pension test reverted to its original form.
- `04985f9` Merge `p3/c1` into v1 (gates, privacy).
- `afe3c87` Merge `p3/c2` into v1 (polish).
- This file (docs/V1-PHASE3.md), committed after `3d43d22`. The Phase 4 stage A status is in `docs/V1-PHASE4.md`.
