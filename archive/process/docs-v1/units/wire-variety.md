# UNIT: Wire stories draw a seeded no-repeat deck with varied magnitudes

Written 2026-11-12T01:25:10+01:00 Europe/Paris, before any product or test code on this branch. Branch `sys/wire-variety`, base `81b5b1445cade5411f186f8738a1c956a1cce914` (`eng/broker-idempotency`). Worktree `/workspace/avalon/sys-wire-variety`. This unit has no root UNIT.md; the root `UNIT.md` on the base belongs to broker idempotency and is left untouched.

## Player outcome and scope

In a ten-minute play, the Wire no longer repeats the same headline with the same price move every five to six real minutes. Story selection is a seeded shuffle with a no-repeat window, and each appearance scales its catalog move by a draw in the existing macro severity band, still deterministic for a seed. The M1-09 grid, crisis watch/outcome pairing, residual unwind, and quote RNG are unchanged. Auth, broker and Wire statement code are not edited. No new system is mounted.

## Sources and the gap

- Playtest of `eng/broker-day-expiry` `e30f6822` (screenshot `/workspace/playtest/e30f6822/d34_A_play_10min`): "Avalon Bank beats earnings" published at ticks 27694, 27754 and 27814, each AVB +2%; the oil shock and the bank crisis repeated too, so news was predictable by minute 10.
- Avalon Builder assignment: make story selection draw from the seeded RNG with no-repeat or cooldown windows and varied magnitudes, still deterministic per seed, using the existing macro systems.
- `docs/v1/V1-BOARD.md:44`: M1-09 "News moves prices; deterministic replay."
- `src/market/wireStories.ts` `catalogStoryAt`: company index is `hash(seed:co) + quartet*2 + step/2 + cycle*3 (mod 8)`. For the official seed that congruence repeats the same company every 10 slots (60 ticks, 5 real minutes) at those three ticks. Crisis order is `hash(seed:order) + quartet + cycle (mod 4)`, a rotation by one each cycle, and every catalog `bp` is a constant, so a repeat is always the same move.
- Existing tools this unit uses, rather than a new scheduler: the file's own `hash` (FNV-1a, "drawing it never touches the quote RNG"); Fisher-Yates already used in the wider engine; the macro severity band `0.6..1.4` with `U = (severity − 0.6)/0.8` in `packages/engine/macro/rules/crisisCatalog.ts:2,30`; storm-style cooldown as the pattern for "don't re-fire the same kind immediately" (`src/server/market/storms.ts`, 7 game days — here the window is one 16-slot cycle, which is the right scale for the M1-09 cadence).
- `export/vision-review/complete/04-MACRO-CENTRAL-BANKS-SOVEREIGNS.md:1033`: demo-crisis residuals still decay on their own schedules. This unit does not move residual half-lives or crisis kinds.

## Acceptance checks

1. Company `defId` does not recur inside one 16-slot cycle (8 company slots, 96 ticks / 8 real minutes). The official-seed 60-tick "Avalon Bank beats earnings" triple at 27694 / 27754 / 27814 is gone: those three ticks are not the same `defId`, and no company `defId` repeats at a 60-tick or 72-tick interval anywhere in a 10-minute window after `START_TICK`.
2. Across two appearances of the same company or the same crisis hit, published `bp` is not always the catalog constant. Each realization multiplies the catalog effect (and a RUMOR's `asserted`) by a severity in `[0.6, 1.4]`, rounded to a non-zero integer of the original sign. The same seed and tick always produce the same `bp`.
3. Crisis watch/outcome pairing is unchanged: a watch at step 1 is a no-effect forecast, the outcome two slots later is the hit or all-clear of the *same* crisis, and a company story sits in between. All four catalog crises still appear. `crisisHits` stays a seeded 3-in-4 and is not a promise.
4. The grid is unchanged: `STORY_EVERY` stays 6; `storyAt` is still null at and before `START_TICK` and off-grid; `catalogStoryAt` still serves boot history. Deterministic: same seed, same stories and magnitudes; a different seed differs. Selection draws only from `hash` and never from the quote RNG.
5. Restart and replay: two clocks with one seed publish the same Wire items and the same moved marks; a mid-run restart equals an uninterrupted control at the same tick (stories and quotes).
6. Demo-crisis residuals and the clock's apply-once path stay as they are. This unit touches story selection and published magnitudes in `src/market/wireStories.ts` plus tests and this UNIT. It does not edit auth, broker, Wire statement code, or `clock.ts`.
7. Lint, typecheck, build, check-hooks, route-budget (`BUDGET_PORT` in 3460–3469), map-no-dup and `npm test` pass. One affected Wire e2e runs in a fresh detached worktree with fresh `.data` on a port in 3460–3469, then that worktree is removed.

## Results

Recorded 2026-11-12T01:38:37+01:00 Europe/Paris, after the fix, checks, e2e and proofs, in this docs commit. Product SHA `85f165631940a1e678683629945fc1e9fc8a8b55`.

- The playtest ticks 27694 / 27754 / 27814 are no longer three copies of "Avalon Bank beats earnings" at AVB +2%. Official seed 17 now publishes `nmbs-contract` +267 bp, `kiln-demand` −314 bp, and `mrdn-recall` −166 bp at those ticks. No company `defId` repeats at a 60-tick or 72-tick interval in the 10-minute window after `START_TICK`. Each 16-slot cycle uses every company story and every crisis kind once.
- Published sizes vary: 12 definitions show more than one `bp` across 8 cycles, each in the catalog × [0.6, 1.4] band, same seed and tick stable. Forecasts still carry no effect; `crisisHits` is unchanged.
- The M1-09 grid, watch/outcome pairing, and residual apply path are unchanged. `clock.ts`, auth, broker and Wire statement code were not edited. Two clocks with one seed match tick-by-tick on stories and quotes. (Mid-run mark resume on this base is the `eng/market-restart-marks` card, not this unit.)
- The official-seed 60-GD GX path in the calibration fixture was regenerated (`tools/ci/regen-calibration-fixture.ts`). The calm walk is byte-identical to the pre-fix fixture (quote RNG untouched). Seed 17 events-on CAGR is 27.89% (was 20.79%); the calibration test still allows PASS or honest MISS for `index_cagr`.
- The existing farm-confirm unit was given a 15 s timeout. Isolated it already finished in ~4.1 s on this branch and ~3.0 s on the base; under the full 167-worker `npm test` it could tip the default 5 s.
- Checks (ports 3460–3469): lint 0, map-no-dup 13/13, typecheck 0, build 0, check-hooks 0 (487 files, 0 hits), `npm test` 166 passed / 1 skipped files, 2471 passed / 2 skipped tests, route-budget 196.5 KB gz / 215 KB on port 3460. Proof `tools/proofs/wire-variety.ts` exits 0 (evidence `/workspace/avalon/evidence/sys-wire-variety/proofs/`).
- Affected e2e `tests/e2e/17b/M1-09-wire.spec.ts` in a fresh detached worktree at `85f16563` with fresh `.data` on port 3464: 2 passed / 2 skipped / 0 failed (desktop journey and phone 390/520 fit; crossed project cases skipped by the spec). That worktree was removed.

## Delta: per-cycle reshuffle (written 2026-11-12T06:31:06+01:00 Europe/Paris, before any new product or test code)

The first pass shuffles once per seed, so the same eight company headlines (and the same crisis order) loop every 96 ticks / 8 real minutes. That is still a visible loop. This delta reshuffles each 16-slot cycle, still default-off in the sense that it only touches `src/market/wireStories.ts`, tests, this UNIT, the official calibration fixture if the events-on walk moves, and the proof runner. Auth, broker, Wire statement code, and `clock.ts` stay untouched. No new system is mounted.

### Design

- Each cycle's company order and crisis order is derived from `hash(seed, cycleIndex)` (the existing FNV-1a `hash`, keys `co:${cycle}` and `order:${cycle}`), **not** from a shared RNG stream that advances as cycles are drawn. `catalogStoryAt(seed, tick)` stays a pure function of its arguments. Jumping straight to cycle *k* must yield the same deck as walking every slot from cycle 0. A test fails if the shuffle depends on stream state.
- Consecutive cycles are not identical. The last company `defId` of cycle *n* is not the first company `defId` of cycle *n+1`; the last crisis kind of cycle *n* is not the first of cycle *n+1*.
- Company `defId` still must not recur at a 60-tick or 72-tick interval (the first-pass playtest periods). A repair against the previous cycle's already-derived deck may rehash under a deterministic attempt key (`co:${cycle}:rN`) until those constraints hold. That repair looks only at `hash(seed, ·)` and at previous cycles recomputed the same way; it does not consume stream state. Crisis watch/outcome pairing and `crisisHits(seed, cycle, quartet)` stay as they are.
- Magnitudes, the M1-09 grid, residual unwind, and "drawing it never touches the quote RNG" are unchanged.

### Acceptance checks

1. Over a 10,000-tick window after `START_TICK`, the published `defId` sequence is not periodic with any period *p* where `1 ≤ p ≤ 72` ticks (checked on the story grid). Consecutive 16-slot cycles do not have identical company `defId` lists or identical crisis-kind lists.
2. For several cycle indices *k* (including 0, 1, 7, and a cycle well past the first 10 minutes), the company and crisis decks obtained by calling `catalogStoryAt` only on ticks in cycle *k* equal the decks obtained by walking every story slot from cycle 0 through *k*. Same seed and tick stay stable under repeated isolated calls.
3. No company `defId` repeats at a 60-tick or 72-tick interval in the 10-minute window after `START_TICK`, and the official-seed playtest ticks 27694 / 27754 / 27814 are still not three copies of `avb-earnings`. Across a long window, consecutive cycles also respect the 60- and 72-tick gaps and the boundary rule above.
4. Existing checks still hold: every cycle still uses each company story and each crisis kind once; watch/outcome pairing is unchanged; severity stays in `[0.6, 1.4]`; the grid and hash-only selection are unchanged.
5. The official calibration fixture is regenerated if the events-on walk changes. The calm walk must stay byte-identical (quote RNG untouched). Events-on `index_cagr` and FROG closes are reported honestly (PASS or honest MISS; no hiding drift). Lint, typecheck, build, check-hooks, route-budget, map-no-dup, `npm test`, and the affected Wire e2e in a fresh worktree all pass.


### Delta results

Recorded 2026-11-12T06:46:13+01:00 Europe/Paris, after the fix, fixture regen, checks, e2e and proofs. Product SHA `530c3b0ffc4b4c66c173e8cdf5ac67f5d5858e15`.

- Each cycle's company and crisis order is derived from `hash(seed, cycleIndex)` (keys `co:${cycle}` / `order:${cycle}`, with a deterministic repair under `:rN` or a hash-seeded backtracking search). Jumping straight to cycles 0, 1, 7, 40, 85, 144, 166, 200, 366 and 400 equals a walk from 0. The rotate-reverse fallback missed legal decks on seeds 21 (cycle 144) and 27 (cycle 85); the backtracking search covers those. A module memo caches the chain; it does not change results.
- Over 10,000 ticks, the defId sequence is not periodic at any period ≤ 72 ticks. Consecutive cycles differ, with no company or crisis boundary repeat, and no company defId recurrence at 60 or 72 ticks. The official-seed playtest ticks 27694 / 27754 / 27814 publish `tide-downgrade` −153 bp, `mrdn-recall` −261 bp, and `orca-trial` −299 bp — still not three copies of `avb-earnings`.
- Existing ACs still hold: every cycle uses each company story and each crisis kind once; watch/outcome pairing, severity band, grid, and hash-only selection are unchanged. A LiveMarket rumor restart test now waits for the catalog TIDE confirmation (a farm rumor can confirm first under the new deck). The official calibration unit timeout is 60 s.
- The official calibration fixture was regenerated. The calm walk is byte-identical to the pre-delta fixture (quote RNG untouched). Events-on 12-seed 60-GD GX median CAGR is 24.92% (was 27.94%); seed 17 is 16.78% (was 27.89%). Status is an honest MISS vs the 0–12% band (disclosed, not a stop). FROG events-on still ends `near_zero` (last 1e-07); 29 of 60 closes moved (end/start 0.00116 vs 0.00134).
- Checks (Node v24.22.1, CI pin is 22): lint 0 (at fixture SHA `a73bfa08`), ledger-no-dup 13/13, typecheck 0, no-flag build 0, check-hooks 0 (487 files, 0 hits), `npm test` 166 passed / 1 skipped files, 2476 passed / 2 skipped tests, route-budget 196.5 KB gz / 215 KB on port 3520. Proof `tools/proofs/wire-variety.ts` exits 0 (evidence `/workspace/avalon/evidence/sys-wire-variety/cycle-shuffle/`).
- Affected e2e `tests/e2e/17b/M1-09-wire.spec.ts` in a fresh detached worktree at `530c3b0f` with fresh `.data` on port 3524: 2 passed / 2 skipped / 0 failed (desktop journey and phone 390/520 fit; crossed project cases skipped by the spec). That worktree was removed.


## Cut onto main (2026-11-12 11:16 Europe/Paris)

Branch `sys/wire-variety-main` is `origin/main` `f8f51ad9` plus this unit's own commits, cherry-picked with `-x` from `sys/wire-variety` `1606f024`. Root `UNIT.md` is unchanged from main; these notes live here.

- Conflicts: `calibration-unit.json` kept main's copy during the pick, and the old fixture commit `a73bfa08` was not picked. `launchpad-calibration.test.ts` kept main's copy, because main already has the 60 s timeout and the float-tolerant compare. So the picked `530c3b0f` now only changes `gk-rumor-claims.test.ts`. Intermediate commits carry main's fixture; the calibration unit is green only from the regeneration commit on.
- The fixture was regenerated on the cut branch as its own commit. The calm walk and params are byte-identical to main's fixture. Events-on 12-seed 60-GD GX median CAGR: **24.16%** on main (no wire-variety), **24.92%** after. Seed 17: 20.79% → 16.78%. Both are an honest MISS vs the 0–12% band (disclosed, not a stop; calibration is Builder's lane). The earlier "was 27.94%" was measured against the first-pass per-seed shuffle, not against main. FROG events-on still ends at 1e-07; 29 of 60 closes moved. The regenerated file is byte-identical to the one on `sys/wire-variety`.
- Check results for this head are in `/workspace/avalon/evidence/sys-wire-variety-main/`.

## Gatekeeper NO-GO fix on 82576f02 (2026-11-12 12:15 Europe/Paris)

Review: `evidence/launchpad/gatekeeper/82576f02/REVIEW.md` (B1 blocker, Q1 qual, two notes). Tests came first (`5584435c`, red on 82576f02), then the fix (`ad4264d5`), then the fixture (`ac4a931b`). This replaces the "60/72-tick lag ban" in the design above with a floor.

- **B1, floors.** Cross-cycle gap = 96 + 12·(q − p) ticks for a company at slot p then q, 96 + 24·(q − p) for a crisis. The old rule banned only 60/72, so 48/36/24 were legal (company min 24, crisis min 48 on all 8 probed seeds). New rule: every same-company repeat ≥ **84 ticks** (7 real minutes), every same-crisis repeat ≥ **72 ticks** (main's rotation). Why these numbers, measured with identity as the previous deck (`gk-fix/design/rules.mjs`):

  | company rule | legal next decks | share of repeats at the floor (8 seeds × 2083 cycles) |
  |---|---|---|
  | old (ban 60/72 only) | 7,189 | min gap 24 |
  | ≥ 48, ban 60/72 (Gatekeeper's example) | 1,633 | 48 |
  | ≥ 72 | 1,457 | ~27% at 72 |
  | **≥ 84 (chosen)** | **127** | ~62% at 84 |
  | ≥ 96 | 0 (only the identical deck) | infeasible |

  84 is the only floor ≥ 60 that keeps this unit's own acceptance check 3 and player outcome (no repeat at 60 or 72 ticks, i.e. not every 5–6 minutes), and the highest feasible one. The cost is rhythm: most companies come back at exactly 84 ticks, and about half of adjacent company pairs carry over to the next cycle (a uniform pick among the 127 decks would still put 44% at 84). Crises: ≥ 96 is infeasible (identity only), so 72 is the max; 7 legal next orders. The first==previous-last rule is now implied by both floors and is kept as a cheap guard.
- **Repair always finds a deck.** The backtracking search now prunes on prefixes (`acceptable` also judges a prefix). Proven by a unit that walks 24 seeds over 60 game days (450 cycles each) and by the far-jump unit (6 seeds up to cycle 400); none throws and both floors hold.
- **Q1.** Fisher-Yates draws `j = floor(fmix32(fnv) / 2^32 · (i + 1))`. 10k keys reach 24/24 crisis orders; 100k keys reach 91.5–91.6% of the 40,320 company decks on seeds 17/18/21/42 (uniform expectation 91.6%); before: 12/24 and ~3.9%. `hash` itself is unchanged, so severities and `crisisHits` are untouched (the pre-existing `crisisHits % 4` stays out of scope, as Gatekeeper noted).
- The `catalogStoryAt` comments now describe the chain and the cross-cycle floors. The jump==walk unit now uses fresh module instances (`vi.resetModules`), so the jump runs on an empty memo.
- Fixture regenerated on `ad4264d5`. Calm walk and params byte-identical. Events-on 12-seed 60-GD GX median CAGR: main 24.164759% → 82576f02 24.922542% → this fix **24.790757%**; seed 17: 20.790392% → 16.782608% → **22.991323%**. Still an honest MISS vs 0–12%; calibration is Builder's unit and was not tuned here. FROG last close 1e-07; 22/60 closes moved vs 82576f02.
- Evidence: `/workspace/avalon/evidence/sys-wire-variety-main/gk-fix/`.

## Gatekeeper q2: Avalon Bank's own earnings headline key (2026-11-12 18:06 Europe/Paris)

Review note on `a8c597ab`: Halcyon Shipping and Avalon Bank shared `wire.news.earningsBeat` ("beats earnings expectations"), seen 12 ticks apart at seed 17 ticks 27802 / 27814. A same-company 84-tick floor does not cover two companies with one key.

- **Copy.** Avalon Bank gets its own key `wire.news.earningsExpectations`. The English (and, until Studio writes French, the FR locale) is the verbatim NEUTRAL example headline for NewsKind EARNINGS in `export/vision-review/complete/22-CONTENT-CATALOGS.md:2713`: `{company} earnings {beatMiss} expectations`. The `beatMiss` slot is filled `beat` for this +200 bp NEWS story. No other verbatim bank-earnings headline exists in `export/vision-review/complete` (the name "Avalon Bank" does not appear there). Complete/ has no French example for this template, so FR uses that same cited line rather than invented copy.
- **Gap.** The shuffle also rejects any cross-company reuse of the same headline key sooner than `COMPANY_MIN_GAP_TICKS` (84), including prefixes during backtracking. Tests first (`310968dd`): red on main at 27802/27814 and 12-tick min gap over 10k ticks × 8 seeds; green after. The same assert is in `tools/proofs/wire-variety.ts`. 0 throws over 300 seeds × 2000 cycles, and a cold `catalogStoryAt` at cycle 10k under 3s, both run in that proof (a fresh process for the jump). They are not wall-clock unit tests: a <3s unit flakes under the ~194-worker vitest pool (sys-PLAN 18:12).
- Fixture: `npx tsx tools/ci/regen-calibration-fixture.ts` on this head is byte-identical to main `51611e5e` (sha256 `0b0f2b96763feadca5d5f41fc1e3794dd8833c57828ef2cb46319580f892dc69`). Calm walk, params, events-on 12-seed 60-GD GX paths and FROG closes are unchanged. Median CAGR **24.790756910682%**, seed 17 **22.991322747188914%**, still an honest MISS vs 0–12%; not tuned. No fixture commit (nothing to commit).
