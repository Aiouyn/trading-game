# UNIT-DELTA — claims-resolve Gatekeeper batch (B1–B4)

Written: 2026-11-11 18:21:24 +0100 (Europe/Paris). Plan for the fix batch on `eng/claims-resolve`. Product edits follow this file; it is not backdated.

Gatekeeper NO-GO on `4606e7ae` (REVIEW.md). All four blockers plus the two named backlog items are one batch. No PR, merge, deploy, cloud, or owner-PC. Do not contact Gatekeeper. After the batch: checks, affected e2e once on a clean store, push normally, update GK-HANDOFF (delta).

## B1 — seal truth behind a server-only secret

`hiddenAccuracy` / `isTrue` (and the horizon / false-kind draws) are derived from a persisted random server secret, never from the public market seed alone. The secret lives only in the storm-world rumors snapshot (server file). It is not on `GET /api/market`, `GET /api/wire`, or any client bundle. Tests inject the secret so draws stay deterministic. `repros/predict-client.mjs` (public seed + item id, no server import) must do no better than chance.

## B2 — horizon is 16:564 as written

`RUMOR.horizonUnit` is `TICKS_PER_DAY` (720). Resolve is `U(1,5)` game days = 720..3600 ticks. The 12× (`STORY_EVERY * 2`) compression is removed. Pending and just-resolved rumor rows are retained on the Wire so a 1–5 day horizon cannot be sliced off by `STORY_KEEP`.

## B3 — integer-mark recovery, overlapping sum, no confirm overshoot

Per-claim belief positions (05:864–865): overlapping claims sum, then cap ±0.5; a resolve converts only that claim's contribution.

The book tracks the integer mark contribution actually printed, with remainder carry (same idea as ERP leftover). False release and a full unwind therefore converge to the pre-rumor mark; remainders are not dropped when a single tick's log is too small to move a minor.

On confirmation, apply `X −` the retained belief of that claim so the mark never holds both (05:870 / 1011). The 15-tick handoff is that immediate transfer: no mid-handoff overshoot. False release stays a 60-tick half-life.

Tests use real integer marks, including the TIDE 55.30 case.

## B4 — resume the feed from persisted lastTick

The storm-world scheduler already persists `lastTick` and continues from it. The feed will do the same: construct `ShockFeed` with `startTick` from `rumors.lastTick ?? storms.lastTick` when that value is a safe integer ≥ `START_TICK`. The quote walk remains a new epoch (virgin marks + rematerialized residual / ERP / confirmed X / printed belief). Restored rumor ticks then line up with the response tick, so `parseWireSnapshot` after restart is non-null. `RumorBook.advanceTo` rejects a backwards tick (no step, `lastTick` unchanged).

Proof: a continuous run and a stop/restart have identical rumor-snapshot hashes at both cut points (pending belief and, for a false claim, release state). Mid-true-handoff ticksLeft no longer exist because confirmation nets immediately.

## Backlog in this batch

- ItemDetail "Applied once at" uses the resolve tick (`slots.appliedTick` on a confirmed rumor). NEWS still uses `item.tick`.
- Handoff correction: the M1-09 **server unit test WAS edited** in `4606e7ae` (forecast rumors, shared rumor book on the ref feed, first effect-bearing story). The browser spec was not.

## Out of scope

Full 15/16 farm (paused on `eng/claims-authors`; rebase after this batch). NEWS value layer. POLICY/RECOVERY, 07/FX, meme-failure farm.
