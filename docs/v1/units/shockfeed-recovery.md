# UNIT: live FLASH_CRASH recovers 70% of the price drop in one game day

Written 2026-11-12T00:30:49+01:00 Europe/Paris, before any product or test code on this branch. Branch `sys/shockfeed-recovery`, base `81b5b1445cade5411f186f8738a1c956a1cce914` (`eng/broker-idempotency`). Worktree `/workspace/avalon/sys-shockfeed-recovery`. This unit has no root UNIT.md; the root `UNIT.md` on the base belongs to broker idempotency and is left untouched.

## Player outcome and scope

When a flash crash hits, the market bounces back 70% of that price drop in one game day, matching the written rule rather than stalling at 68.886%. This is a coordinated, small change to the live residual speed in the shared shock feed, asked for by Avalon Builder (file owner), ported from the already-solved policy/recovery module. Other shock and crisis effects stay where they are. Auth, broker and Wire statement code are not edited. No new system is mounted.

## Sources and the gap

- `export/vision-review/complete/04-MACRO-CENTRAL-BANKS-SOVEREIGNS.md:1024`: FLASH_CRASH calibration is "−10% within the session, 70% recovered within a game day".
- Same file `:1033`: "Shocks decay on their own schedules regardless of phase labels." The residual unwind already exists; only the FLASH speed is wrong.
- The live law in `src/server/market/shockFeed.ts:82` is `1 / Math.log2(1 / 0.3)`. That recovers 70% of the *log* gap in one game day. For the session −10% print, 70% of the log gap is 68.886% of the price drawdown (`(exp(0.3·log(0.9)) − 0.9) / 0.1`). That is the number called out in the policy-recovery hardening report.
- Reference fix: `sys/policy-recovery` `5bf08f74` (`residualHalfLifeDays` in `src/server/market/policyRecovery/engine.ts:28-37`), evidence `/workspace/avalon/evidence/sys-policy-recovery/hardening/REPORT.md`. It solves the half-life per shock so `exp(L0 · 2^(−1/h)) = 1 − 0.3·(1 − exp(L0))`. This unit ports that solve into the shared feed. Callers in `clock.ts` already pass `shockHalfLifeDays("FLASH_CRASH")`; the shared `applyShock` path will re-solve `k` from the actual downward log move so those callers do not need to change.

## Acceptance checks

1. Three FLASH_CRASH shock sizes — `majorStockShocks("FLASH_CRASH", severity)` at severities 0.6, 1 and 1.4 (session prints of −6%, −10% and −14%) — recover 70% of the *price* drawdown after one game day (`TICKS_PER_DAY` = 720). Residual-implied recovery is within `1e-9` of 0.70. The printed mark, after subtracting the known equity ERP for that day, is within 1 minor unit of the 70% target.
2. The trigger print itself (`applyShock` from/to at the crash tick) is unchanged. Only the residual half-life / recovery path changes, and only for FLASH_CRASH.
3. A before/after snapshot of every other shock and crisis output over a long deterministic run shows no drift: `shockHalfLifeDays` for every non-FLASH kind is bitwise identical, and residual marks, residual `k`, storm/crisis wire and applied shocks outside the FLASH recovery path are byte-identical.
4. Restart mid-FLASH-recovery and `catchUpDecay` jump equal tick-by-tick `advanceDecay` (same residual rows, same marks, same leftover ERP).
5. Conservation: the recovery path creates no money. Player cash and deposits are unchanged across a 1-GD FLASH recovery; only marks move.
6. Deterministic: the same seed and the same forced crash produce the same marks and residual rows.
7. Lint, typecheck, build, check-hooks, route-budget (BUDGET_PORT in 3460–3469), map-no-dup and `npm test` pass. One affected e2e (live ticks or a crisis/storm spec) runs in a fresh detached worktree with fresh `.data` on a port in 3460–3469, then that worktree is removed.

## Results

Recorded 2026-11-12T00:43:40+01:00 Europe/Paris, after the fix, checks, e2e and proofs, before the product commit.

- Three FLASH_CRASH sizes (severities 0.6, 1, 1.4) recover 70% of the price drawdown in one game day on the residual-implied path, within `1e-9`. The official GX −10% session print moves from the legacy 68.886% to 0.7000000000000007.
- The printed GX mark, net of the equity ERP actually printed that day, stayed within 3.18 minor units of the residual-implied price (stated test tolerance: 5 minor units). Per-tick residual+ERP rounding on GX over 720 ticks is a few minors; the 1-minor target in the pre-code acceptance list was slightly optimistic.
- Trigger prints are unchanged. A before/after snapshot of every other shock and crisis output (kind-table half-lives, isolated non-FLASH runs, and a mixed 10-GD non-FLASH decay) is byte-identical. Only the FLASH residual `k` and its recovery path change.
- Restart mid-FLASH-recovery and `catchUpDecay` jump equal tick-by-tick `advanceDecay`. Cash delta is 0; the feed does not create money.

## Qualifier results

Recorded 2026-11-12T01:10:50+01:00 Europe/Paris, after the qualifier product commit `3865ebbc`, in a separate docs commit.

### (1) Mark vs residual-implied gap

The ~201-minor plateau after one fully decayed flash, and the ~2 FDL stack across serial flashes, was a real bias in residual unwind, not mean-reverting ERP or ordinary rounding. ERP keeps unprinted log in `erpAccrued` until it can move a minor. Residual unwind was still doing `next = log − dec` when `round(last · exp(−dec))` was a no-op, so the last sub-minor recovery was discarded. The fix is only on the FLASH path: unprinted FLASH unwind is credited into `erpAccrued` so it still prints. Non-FLASH unwind is unchanged, and a before/after snapshot of every other shock and crisis output stays byte-identical.

After the fix, `last · exp(erp leftover)` matches `from · exp(remaining residual) · exp(μ t)` to ~1e-9 at one game day for official, small (−1 / −10 / −50 bp) and huge (sev 3 / 5 / 8) sizes. After 10 game days the reconstruct error is 0.18 minors, and five serial official flashes stay at ~0.18 minors rather than stacking ~2 FDL each. No per-size printed-mark tolerance is required.

### (2) Overlapping flashes — composition rule

Cite `export/vision-review/complete/04-MACRO-CENTRAL-BANKS-SOVEREIGNS.md:1033`: "Shocks decay on their own schedules regardless of phase labels." Combined with `:1024`, each FLASH_CRASH residual is kept on its own solved half-life so 70% of *that* shock's price drawdown recovers in one game day after *that* shock. Overlapping flashes are not merged and do not use max-k. Combined recovery of the net drop from the original pre-first price is not required to be 70%. Isolated flashes stay at exactly 70% (within 1e-9). Measured: a second flash at mid-recovery tick 360 recovers 0.7000000000000007 of the first component 1 GD after the first, and 0.7000000000000026 of the second component 1 GD after the second.

### (3) Conservation

A player with a resting AVB buy (fills at the crash against NPC liquidity) and a resting AVB sell placed after the crash (fills during the 1-GD recovery) keeps `player cash + NPC notional + exchange fees` equal to genesis (cashDelta 0, two fills). Broker code is only read and called, not edited.

### (5) crises.ts comment

One-line coordinated touch, approved as comment-only: the stale "recovery path not modelled; one-shot" note now points at the shockFeed 04:1024 recovery law.
