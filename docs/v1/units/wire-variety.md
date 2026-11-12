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

Recorded after the fix, checks, e2e and proofs, in a later docs commit.
