# UNIT-DELTA: fail closed on an invalid claim row in a valid claims array

**Branch:** `eng/analyst-notes`  
**Base:** `35803f3f81eb70329cc3dbb0e0c08b20e7d227ff`  
**Worktree:** `/workspace/avalon/analyst-notes`  
**When written:** 2026-11-11 19:55:00 Europe/Paris — before product-code edits.  
**Owner:** Gatekeeper bounded PASS (qualified) on d23c141c, forwarded through the parent. Do not reopen `eng/claims-statements`. Fold this residual into the analyst-notes unit as its own small first product commit.

This delta does not replace UNIT.md. It tightens per-row claim parsing only.

## Residual

d23c141c REVIEW: a present but invalid `rumors` value now fails closed. Individual *claim rows* inside a valid `claims` array are still skipped when malformed (pre-existing parser). A snap that already has a valid `source`, a `claims` array, and a usable secret will boot even if some (or all) rows are dropped. The fail-closed contract in that delta was at the snapshot/key level, not per-row validation. Not a blocker; still a silent drop of claim state.

`normalizeRumorSnapshot` today `continue`s when a row is missing or not an object, or when required fields fail (id, defId, assetId, headlineKey, causeKey, publishTick, resolvesByTick, bp, a, cr, reach, isTrue, resolution). Those rows vanish and the book starts.

## New contract

- A `claims` array that is present and is an array (already required) must contain **only valid claim rows**. Any invalid row: **do not** skip it, **do not** start the book, **do not** generate a new key. Throw `CorruptRumorSnapshotError` (`RUMOR_SNAPSHOT_CORRUPT`), log the existing loud `[rumorClaims]` line, leave the store file bytes (hash and mtime) untouched.
- Valid `claims: []` still boots.
- A fully valid claims array still boots, including rows that only omit optional fields (`sourceId`, `factKind`, `channel`, `rebuttal`, `deniedAtTick`, `effect`, `slots`).
- `channel: "analyst"` is accepted as optional alongside `"farm"` and `"desk"` (needed by the notes slice; a valid older row without channel is unchanged).
- This delta does **not** tighten silent skips in `belief`, `beliefMarks`, `lnV`, `valueApplied`, or `sources` arrays. Those were not the forwarded qualification.
- Optional-field softening (a present `slots` that is not an object is ignored; a present `effect` that does not fully parse is dropped; a present but non-integer `deniedAtTick` becomes absent) stays as today. Only the whole-row `continue` paths become fail-closed.
- Missing/empty secret on an otherwise parseable snap stays `MissingRumorSecretError`. No `rumors` key remains the pre-rumor upgrade path.

## Acceptance

1. `normalizeRumorSnapshot` on a otherwise-valid snap whose `claims` contains a null row, a non-object, or a row missing/invalid any required field listed above throws `CorruptRumorSnapshotError` and does not return a book.
2. A FileStormWorldStore copy poisoned with such a row: `LiveMarket` does not start; file hash, mtime, and bytes are unchanged; no new secret is written.
3. `claims: []`, and a snap whose claims are all valid, still boot with the same secret. A snapshot with no `rumors` key still generates a key.

## Checks

Targeted tests for this parser path, plus the usual repo checks with the rest of the unit. No e2e for this commit alone (Wire/UI behaviour is unchanged until the notes commit).
