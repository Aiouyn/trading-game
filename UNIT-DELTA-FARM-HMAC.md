# UNIT-DELTA-FARM-HMAC — farm on b8257aaf (HMAC sealed draws, 15-tick handoff)

Written: 2026-11-11 19:04:20 +0100 (Europe/Paris). Plan for finishing the 20-author farm on `eng/claims-authors` after the HMAC / 15-tick batch landed on the base. Product farm edits follow this file; it is not backdated.

`UNIT.md` was written against 4606e7ae. `UNIT-DELTA-FARM.md` was written against a0003b1d (secret-prefixed FNV, immediate confirm net). The branch is now rebased onto **b8257aaf**. This delta supersedes only the bits the base changed. The observable farm outcome in UNIT.md is unchanged.

## Follow the base

- **Sealed draws:** every farm sealed value (author `hiddenAccuracy`, claim `isTrue`, and the shared horizon / false-kind draws) uses `HMAC-SHA256(secret, seed|kind|id)`. The secret is the HMAC key, never an FNV input. `farmAccuracy` is `HMAC(secret, seed|farm-acc|sourceId)`; farm truth is `HMAC(secret, seed|farm-true|sourceId|id)`. Public schedule (`planFarmDay`, names, 8-a-day publish ticks) stays seed-only FNV, with no secret in those keys.
- **Handoff:** farm confirms use the base 15-tick release. Unwind this claim's `b_c`, print `X` on the fact-only mark, release `b_c` linearly over 15 ticks. Per-claim sum, ±0.5 cap, integer remainder carry, and false 60-tick HL stay. Desk stays 05 Beta(2,2); farm pending overlay stays 16:566 impulse × 05 spread × 1-game-day fade.
- **Restart proofs** are **boot-hydration equivalence** (restored tick, `parseWireSnapshot` non-null, rematerialized lnV / authors / no double-applied X). Do not claim continuous-vs-restart hashes after further steps (new quote epoch). Do not claim 16:564 “never past real due time.”

## Unchanged from UNIT.md / UNIT-DELTA-FARM.md

20 authors, 8 rumors per full game day generated at the previous day close (only once that close is ≥ START_TICK), catalog-equity subjects, `{source} hears that {claim}`, public record + E-56 band, no `channels.ts` / `schema.ts`, no player statements / analyst notes / F15, same checks and affected e2e. Temp e2e worktrees are deleted after the run. If Gatekeeper findings on b8257aaf arrive, fix those first on `eng/claims-resolve`.
