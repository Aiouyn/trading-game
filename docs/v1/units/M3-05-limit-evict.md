# Unit: do not reset a live limit to make room for a new key

**Branch:** `eng/infra-rate-limits-backup`  
**Follows:** `95cbbf99`.  
**Board:** M3-05. Gatekeeper: at `QUAY_MUTATION_MAX_KEYS`, eviction dropped the earliest live window and cleared that key's count.

## Goal

A key that is already at its limit stays limited for the rest of its window. The map may drop expired windows and, if it still needs room, the live entries with the lowest counts that are still under their limit. If every remaining key is inside its window and at or over its limit, a new key gets 429 and nothing is evicted.

## Files

- `src/server/mutationLimit.ts`
- `tests/unit/server/m3-05-mutation-limit.test.ts`

No edits under `src/server/auth/*`, `src/app/api/auth/*`, `src/server/broker/*`, Wire statement code, or `src/server/telemetry/*`.

## Acceptance

1. This note is committed before the product edits.
2. After an IP or player is at its cap, a flood of other keys does not make that IP or player succeed again.
3. When the map is full of live at-limit keys, another new key is 429 and the map size stays at the cap.
4. A live under-limit entry can still be dropped to admit a new key. The at-limit entry is not the one dropped.

## How to verify

Set `QUAY_MUTATION_IP_LIMIT=1` and `QUAY_MUTATION_MAX_KEYS=3` with `QUAY_TRUST_PROXY=1`. Spend the one hit for `203.0.113.10`, fill the other two slots, then send new rightmost hops. Those are 429, and `203.0.113.10` is still 429 until the window passes.
