# UNIT-DELTA-HMAC — second B1 attempt, restore 15-tick handoff, honest B4 claim

Written: 2026-11-11 18:54:25 +0100 (Europe/Paris). Plan for the targeted fix of Gatekeeper NO-GO on **a0003b1d**. This is a second attempt at B1; the first attempt's premise is checked below and rejected. Product edits on `eng/claims-resolve` follow this file. It is not backdated.

Gatekeeper REVIEW: `/workspace/avalon/evidence/launchpad/gatekeeper/a0003b1d/REVIEW.md`. `eng/claims-authors` farm work stays paused until this batch is pushed.

## B1 — the first sealing premise was wrong

The first fix prefixed a 32-byte server secret into the existing FNV-1a key (`rumor:${secret}:${seed}:kind:id`). That does not seal the draw. FNV-1a collapses every key, including the secret, into a **32-bit** prefix state. An attacker who sees only public Wire resolutions (id + realized/eased) can search that 32-bit class and, on five random worlds, predicted **417/425** later truths versus a majority baseline of **251/425**. Lengthening the secret does not widen the state. Passing the old seed-only predictor is not proof of secrecy.

**Replacement:** do not route the secret through FNV anywhere. Sealed draws use `node:crypto` **HMAC-SHA256(secret, seed|kind|id)** — the secret is the HMAC key, the message is `seed|kind` or `seed|kind|id`. Uniforms and the 1..5 horizon integer are taken from digest bytes (53-bit unit in [0, 1), or the first 32 bits modulo the span). The 32-byte hex secret, persistence, injection-in-tests, and "not on the API or in the client bundle" contracts are unchanged.

Rerun Gatekeeper's unmodified `repros/gk-public-state.c` (first 100 public resolutions train, later labels only score) and `repros/unmodified/predict-client.mjs`. Report the hit rate against the majority baseline. The expected honest result is that the 32-bit FNV-state search finds **no** consistent prefix, and the seed-only client predictor remains no better than chance.

## B3 — put the 15-tick handoff back

The immediate "X minus retained belief" net closed overshoot but is not 05:870 / 05:1011. New confirms must:

1. Unwind this claim's retained `b_c` so the mark is fact-only (other claims' overlays stay).
2. Print `X` against that fact-only integer mark (`applyConfirmed` / `shockedMinor`).
3. Release `b_c` linearly over `PARAM.mkt_belief_handoff_ticks` (15), `start * (left / 15)`, including the confirm-tick `stepRelease`.

The integer mark must stay in the `X + remaining b_c` envelope and must not follow the path of applying `X` to the still-inflated pre-confirm mark. Restore a unit test that asserts that 15-tick series on integer marks, and that after 15 ticks the mark equals the printed `X` (TIDE recovers to `effect.to`). Per-claim sum, ±0.5 cap, false 60-tick HL, and integer remainder carry stay.

## B4 — withdraw the continuation-hash claim

Boot hydration already matches: restored tick, `parseWireSnapshot` non-null, rumor snapshot hash at the cut. That is **boot-hydration equivalence**, not continuous-vs-restart identity after further steps. After restart, a new quote epoch rematerializes printed belief onto virgin marks (`shockFeed` re-rounding); Fear diverges at the next hour because GX is a new walk with retained day-open/history. Do not claim post-restart continuation hashes match, and do not claim 16:564 "**never past real due time**" — this slice still has no candidate event / due-tick input, so that clause is not verified. Tick alignment, backwards-tick rejection, and parser remains.

## Process

Same checks (lint, typecheck, build, check-hooks, route-budget /broker, ledger map-no-dup, npm test). Affected e2e once in a clean temp worktree, fresh `.data`, free port, never :3199/:3102; delete that temp worktree after the run. Push `eng/claims-resolve` normally. Update the delta handoff. Do not contact Gatekeeper.
