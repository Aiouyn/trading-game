# Unit: resume the market path across a server restart

**Branch:** `eng/market-restart-marks`  
**Base:** `919cdb6d` (`eng/broker-day-expiry`)  
**Worktree:** `/workspace/avalon/market-restart-marks`  
**When written:** 2026-11-12 00:12:07 Europe/Paris — after reading the current restart behaviour, before product-code edits.  
**Board:** M1-05 (approved V1 board): one shared, deterministic quote path (`same seed → same path`). Players should see **one persistent world**.

## What players see on a restart today (`919cdb6d`)

`lastTick` already persists (storm-world store: storms, Fear/regime, shock residuals, ERP leftovers, rumors). The **quote walk does not**.

On boot, `LiveMarket` builds a `ShockFeed` at the persisted tick (`startTick: resume`) with **virgin marks**: each catalog `last` is the fixture `base` (HALC `4218` = 42.18), `rng` / `Draws` start at the seed, listed-coin `MemeProcess` starts at its listing price, and `CandleRecorder` is a new random `epoch` with no bars. Residuals, ERP and confirmed rumor X are then **rematerialized onto those virgin marks**. The clock does **not** replay the walk from tick 0 (by design: `bootstrapTo` is bookkeeping-only so history does not reprice a new epoch).

So this is **not** “prices already persist and only internal RNG state resets.” Both the last prices and the walk state reset; only the tick (and adjacent bookkeeping) resume.

| What a player sees | On restart today |
|---|---|
| Last prices | **Jump** toward catalog base, plus rematerialized residuals — not the last walk. |
| Unrealized P/L, net worth, leaderboard | **Jump with the marks** (they are mark-to-market on `/api/market`). |
| Chart / candle history | **Snaps back**: a new epoch, empty bars; the first bar opens at the new last. The chart already tells the client “since when it has data.” |
| Tick / calendar | Continues from persisted `lastTick`. |

`eng/wire-read-only` is a parallel worker: this unit does not touch Wire statement code. Broker order/expiry code is read-only here.

## Smallest observable outcome

After a mid-session process restart over the same store:

1. The last price of each already-quoted asset is the last price from before the restart. The next ticks continue that walk: the same persisted state plus the same number of steps yields the **same quotes** (deterministic).
2. Candle history continues: the same bars (open/high/low/close/volume) and the same live close, not an empty new epoch at catalog base.
3. Two accounts (and two readers of `/api/market`) see the **same** shared quotes after the restart, as they did before.
4. Because marks continue, mark-to-market P/L, net worth and the leaderboard do not jump solely because the process restarted.
5. A **corrupt** path snapshot **fails closed** (same class as a corrupt rumor snapshot: do not boot a silent virgin market). An **absent** path field (old storm-world files, or no file) is the **upgrade path**: today’s virgin-at-`lastTick` behaviour, then the path is saved going forward.
6. Writes stay **atomic** (temp + rename), in the existing storm-world persist.

Charge path, broker place/cancel/expiry, and Wire statement resolution are unchanged. First-load budget stays within 215 KB / 205 KB target.

## Plan

Extend the storm-world snapshot with an optional `path` (marks, serializable walk/RNG state, candle bars). The file store already uses temp + rename. On load, if `path` is present and valid, hydrate the feed and the candle recorder and **do not** rematerialize shocks/rumors onto virgin marks (the persisted last already includes them). If `path` is absent, keep the current upgrade behaviour. If `path` is present but unreadable, refuse like `refuseCorruptRumorSnapshot`. Persist `path` in the same `saveStormWorld` already called on each clock step.

Do not replay the walk from tick 0 (slow, and this stack already chose not to reprice a boot that way). Do not edit broker execution or Wire statement modules except to read them.

## Acceptance

1. UNIT.md is written first (this file), before product-code edits.
2. Official unit coverage of (1)–(5): mid-session restart continues last and candles; two readers see the same quotes; a second restart on the same store still matches; same state + N steps matches a control clock that never restarted; a corrupt `path` fails closed; an absent `path` still boots (upgrade).
3. Exact-head checks: lint, typecheck, build, check-hooks, route-budget /broker, ledger map-no-dup, official `npm test`. Preview :3199 stays 200.
4. One affected e2e batch on a clean temp tree, fresh `.data`, free port (not :3199 / :3102), desktop and phone: market/chart path (`BR-7` candle/chart specs if present, otherwise the Broker specs that read live marks).
5. Stray-init; normal push, no force, no PR, no merge, no contact with Gatekeeper. Evidence-only handoff.
