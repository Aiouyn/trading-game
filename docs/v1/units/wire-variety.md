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

