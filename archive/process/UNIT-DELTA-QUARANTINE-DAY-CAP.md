# UNIT-DELTA: count quarantined paid rows toward the daily cap

**Branch:** `eng/calibration-test-speed`  
**Base:** `76dfb1a3c6e8ded5403806168749e20d70dcd6c1` (`eng/statement-resolve`)  
**Worktree:** `/workspace/avalon/calibration-test-speed`  
**When written:** 2026-11-11 21:41:55 Europe/Paris — before product-code edits.  
**Owner:** Gatekeeper bounded PASS on a3630659 with one non-blocking qualification: `postsOnDay` counts only readable rows, so after a paid row is quarantined a player can post more that day than the 3-cap allows. Fold the fix in as the first commit on this branch. Do not reopen `eng/player-statements`. The calibration-speed unit follows on this same branch after this delta.

The post **charge path is otherwise unchanged**: same `withLock`, same `$500` debit, same `(accountId, key)` idempotency, same one persist, no `applyShock`. This delta only changes *what counts* toward `WIRE_POST_DAY_CAP`.

## Defect

`postsOnDay` / `remainingPostsToday` iterate `wirePosts` only. A paid row that fails parse is quarantined (B2) and disappears from that list, so a player who already paid for a now-unreadable post can still place three more the same game day (four charges).

## Contract

- Count **quarantined paid rows** toward the daily cap. A quarantined `wirePosts` row is paid: only an accepted post was stored there, and it typically still carries (or can be paired with) an `ACCEPTED` intent.
- A row belongs to the poster when `quarantined.accountId` or `row.accountId` matches, or when an `ACCEPTED` intent for that account pairs with it (`postId`, or the only unused quarantine for that account when the stored id was corrupted).
- Day comes from `row.tick` when it is a safe integer. If the tick cannot be read, **fail closed** and count the paid slot toward *today* (do not allow an extra post).
- An `ACCEPTED` intent whose post is not in the readable list is the same paid slot: count it once, paired with a quarantine row when possible, never twice.
- `remainingWirePostsToday` and the cap check in `postWireStatement` use this count. Readable posts on other days are unchanged. Replay of a stored key is still 409 `STORED_UNREADABLE` / idempotent replay, not a new charge.
- A later game day does not count a quarantined row whose tick is clearly on a previous day.

## Acceptance

1. After one paid row is quarantined, a further two posts the same day are accepted and a fourth is `DAY_CAP`; cash is $500 × 3, not × 4. Public list has the two readable rows only.
2. The same after the intent is also unreadable (quarantined post still counts by account + tick).
3. `remainingToday` after one quarantined paid row is 2, not 3.
4. A quarantined paid row whose tick is the previous game day does not consume today's cap.
5. Existing B2 probes still pass (no 500, no double-charge, quarantine preserved).

## Not in this delta

05/13 on FALSE, Voices, 16:557, 18:204, POLICY/RECOVERY, 07/FX, meme-failure farm. Calibration-test speed and alpha-telemetry are later commits on this stack, not this delta.
