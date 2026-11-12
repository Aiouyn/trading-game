# UNIT-DELTA-FARM — farm on a0003b1d (sealed secret, 16:564 horizon, integer-carry)

Written: 2026-11-11 18:35:04 +0100 (Europe/Paris). Plan for finishing the 20-author farm on `eng/claims-authors` after Gatekeeper B1–B4 landed on the base. Product farm edits follow this file; it is not backdated.

`UNIT.md` was written against 4606e7ae (compressed 12× horizon, public-seed draws). The branch was rebased onto **a0003b1d**. This delta supersedes only the bits the base changed. The observable farm outcome in UNIT.md is unchanged.

## Follow the base; do not reintroduce rejected deviations

- **Horizon:** farm rumors use the same true 16:564 U(1,5) game days as the desk (`TICKS_PER_DAY` × U(1,5) = 720..3600 ticks). The 12× compression disclosed in UNIT.md is gone with 4606e7ae. `retainStories` already on the base keeps pending and just-resolved farm rows on the Wire.
- **Sealed truth:** farm `hiddenAccuracy` and `isTrue` (and false-kind / horizon draws) use the persisted server-only secret, injectable in tests. Not on the API or in the client bundle. `farmAccuracy` / `drawFarmIsTrue` take the secret. Author names, the 8-a-day plan, and publish ticks stay seed-deterministic.
- **Belief / confirm / false release:** farm claims are ordinary per-claim positions on the base book: overlapping sum and ±0.5 cap, integer-mark remainder carry, confirmation nets `X` minus that claim's retained belief, false 60-tick HL. Farm pending overlay is still 16:566 impulse × 05 spread × 1-game-day fade (zero at cred 0.5). Desk stays 05 Beta(2,2).
- **Restart:** resume from persisted lastTick (base contract). Persist the 20 authors (accuracy + record), farm claims, belief marks, and lnV with storm-world. Mid-run stop/start rematerializes printed belief and X without doubling. `parseWireSnapshot` after restart is non-null.

## Unchanged from UNIT.md

20 authors, 8 rumors per full game day generated at the previous day close (only once that close is ≥ START_TICK), catalog-equity subjects, `{source} hears that {claim}`, public record + E-56 band, no `channels.ts` / `schema.ts`, no player statements / analyst notes / F15, same checks and affected e2e.

## Process

Restore stash@{0} farm WIP onto b3c898ed, resolve `clock.ts` / `rumorClaims.ts` against the base design, finish tests/proofs/e2e, push normally, write GK-HANDOFF. Delete temp e2e worktrees after the run. If Gatekeeper findings on a0003b1d arrive, fix those first on `eng/claims-resolve`.
