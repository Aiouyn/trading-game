# UNIT-DELTA: fail closed on a present but non-parseable `rumors` object

**Branch:** `eng/claims-statements`  
**Base:** `cb2c813e8e511fcbd37f73463b2d7b638eb61bae`  
**Worktree:** `/workspace/avalon/claims-statements`  
**When written:** 2026-11-11 19:41:34 Europe/Paris — before product-code edits.  
**Owner:** Gatekeeper bounded PASS (qualified) on cb2c813e and 90e8cae7, arrived through the parent. Apply this small batch on `eng/claims-statements` first, then restack `eng/wire-first-story`.

This delta does not replace UNIT.md. It tightens fail-closed, corrects a citation, and records a handoff correction for 90e8cae7.

## 1. Present but non-parseable `rumors` must fail closed

Gatekeeper (cb2c813e REVIEW): qualification, not a blocker — `normalizeRumorSnapshot({})` returns `undefined` (fails source/claims parse) rather than throw. `LiveMarket` starts as a pre-rumor world, and the first `step` persists a **new** key (claims were never parseable, so none are re-keyed). The stated contract is fail-closed when “a rumors snapshot exists.” A parseable snap is fail-closed; a non-parseable `rumors` key is treated as absent.

**New contract:**

- **No `rumors` key at all** on the storm-world snapshot (key absent): still the pre-rumor upgrade path. Generate a 64-hex key on first book start, persist it, run as today.
- **`rumors` key is present** and the value is not a valid rumor snapshot — including `{}`, `null`, a non-object, or an object missing or invalid required fields (source, claims array, lastTick shape, etc.): **do not** treat it as absent, **do not** generate a new key, **do not** start the book or the world. Log the same style of loud server error (`console.error` with the `[rumorClaims]` prefix) and throw `MissingRumorSecretError` or a sibling corrupt-store error. Leave the store file bytes (hash and mtime) untouched.
- A **parseable** rumors snapshot whose `secret` is missing or empty stays on the existing `MissingRumorSecretError` path (unchanged).
- Tests may still inject `opts.secret` / `rumorSecret` to recover a parseable snap that only lacks a secret. Injection does not recover a non-parseable object.

Required fields for a valid rumor snapshot are those `normalizeRumorSnapshot` already requires to return a book (usable secret, a source with id/accuracy/hits/resolved, a claims array — empty is allowed, a well-shaped lastTick). Individual skippable claim/belief rows stay skippable; the object as a whole must parse.

## 2. Citation correction (05:860 vs 12:520)

Gatekeeper: the rebuttal **term** is **05:860** (`rebuttal = 0.5` for an unverifiable denial, `1` for a verifiable 12 M4 rebuttal). **12:520** describes the M4 path (counsel/PR, filings, a 13 case). It is a scope cite for what this slice leaves out, not a second definition of the 0.5 term.

Update UNIT.md, the statements handoff, and any product comments that pair them as “05:860 / 12:520” for the 0.5 term, so the two roles stay distinct.

## 3. 90e8cae7 handoff correction (no product change)

Gatekeeper: `farmUnit` is exported and used in tests to show HMAC ≠ FNV, but `planFarmDay` hashes with seed-only `rumorHash`, not `farmUnit`. That is a handoff overclaim, not a spec miss.

Append a correction to the existing claims-authors GK-HANDOFF, keeping the original text. No farm product change in this batch.

## Acceptance

1. `normalizeRumorSnapshot(undefined)` is still `undefined`. `normalizeRumorSnapshot({})`, `null`, a non-object, and an object missing source or claims fail closed (throw, loud log, no new key).
2. A FileStormWorldStore copy whose storm JSON has `rumors: {}` (or `rumors: null`, or rumors present with invalid fields) throws on `LiveMarket` construct / `load`; the file’s hash and mtime are unchanged; no new secret is written.
3. A storm snapshot with **no** `rumors` key still starts and generates a 64-hex key.
4. A parseable snap with an empty/missing secret still throws `MissingRumorSecretError` (existing tests stay green).
5. Denial math, live `storyAt` schedule, M1-05 golden, and digest4000 are unchanged (this is a boot-guard only). Wire behaviour is unchanged, so affected e2e is not required unless a test is edited for the new throw.
6. Repo checks (lint, typecheck, build, check-hooks, route-budget /broker, ledger map-no-dup, npm test) and a proof of (1)–(3).

## Not in this unit

The 30-second Wire clarity bar (`eng/wire-first-story`), 12 M4, player statements, analyst notes, POLICY/RECOVERY, 07/FX, meme-failure farm. No 16:564 due-time claim. No overall GO.
