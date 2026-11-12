# Unit: durable Broker order idempotency (not just the last 50)

**Branch:** `eng/broker-idempotency`  
**Base:** `43127f9e` (`eng/broker-headroom`)  
**Worktree:** `/workspace/avalon/broker-idempotency`  
**When written:** 2026-11-11 23:45:55 Europe/Paris — before product-code edits.  
**Board:** M1-06 (approved V1 board, `/workspace/avalon-m0/V1-BOARD.md` and `docs/v1/V1-BOARD.md`): place/cancel must be **idempotent** on duplicate submit / reconnect (**no double fill**).

## Why this unit

On `43127f9e`, decided intents are one ring: `MAX_INTENTS = 50` (`src/server/player/privateState.ts`). `decidePlace` / `decideCancel` look up a key only in that ring (`replayOf`). The 51st new decision drops the oldest key. A retry of that key is treated as a **new** order: a new `intentId`, a new fill, and cash moves again. That violates M1-06.

The `me` / ledger receipt window can stay last-50 (Q4 keepLast). Idempotency itself cannot.

### Readiness flags checked on `43127f9e` (not this unit)

| Flag | Status on this base | Why not this unit |
|---|---|---|
| Order idempotency window (last 50) | **Live.** `replayOf` uses the 50-long `intents` ring only. | **This unit.** Core trade loop, real double-fill. |
| Day expiry / stop-order UI | **Live.** Server refuses stop / non-day TIF (`MKT_ORDER_TYPE_UNSUPPORTED`); docs: “day orders have no session close yet.” Ticket still offers Stop / Stop limit. | Day close is a separate session-rules unit. Stop buttons are ticket UI; Avalon Builder UI is on `ui/broker-ticket-entry`, `ui/account-first-step`, `ui/broker-trade-sheet` — leave them. |
| GET that rewrites the store | **Live on Wire only.** `GET /api/wire` calls `resolveDueWireStatements` and may `persist()` verdicts. Broker `GET /api/broker/me` and `GET /api/market` do not write cash, holdings, or orders. | Wire verdicts, not the order door. |
| Clock resetting on restart | **Partly fixed, rest disclosed.** Tick resumes from persisted `lastTick`; a restart is still a new epoch for the quote *walk* (virgin marks + rematerialized residuals). Tests and LAUNCHPAD.md treat that as a V1 choice, not a bug. | Do not reopen a disclosed clock-epoch design here. |

Recent `origin/ui/*` and `origin/sys/*` branches do not own Broker idempotency (UI is ticket/sheet/copy; Systems is banking/FX/credit/flags-off).

## Smallest observable outcome

After **more than 50 later decisions** on the same account (enough to evict the first receipt from the last-50 ring):

1. Replaying the **first** idempotency key with the **same** request returns the original `intentId` and `IntentResult`. Cash, positions, and fill count are unchanged (no second fill).
2. Replaying that same key with a **different** request is still **409** `IDEMPOTENCY_CONFLICT`. Still no extra fill.
3. `GET /api/broker/me` (and the place reply's ledger) still exposes at most **50** intent receipts and **50** fills. The durable journal is not a new public ring.
4. A process restart over the same store still honours (1) and (2).
5. `first_trade` telemetry does not fire again merely because earlier accepts have left the last-50 receipt ring.

Existing same-key replay and 409 behaviour inside the 50-window stays unchanged. Charge path, taker fee, and the 215 KB first-load cap stay unchanged.

## Plan

Keep `intents` as the last-50 receipt ring for `me`. Persist a separate durable idempotency journal (`idempotency`: every decided key + fingerprint + result) on the v2 private ledger as an optional field (old saves: seed the journal from the existing ring; no forced v3 bump). `replayOf` and the first-accept check read the journal, not only the ring. Cap the journal high enough for V1 play (fail closed if full — never re-execute a dropped key).

## Acceptance

1. UNIT.md is written first (this file), before product-code edits.
2. Official unit coverage: a 51st (or later) decision evicts the first receipt from the `me` ring; replaying the first key still matches (1)–(2) and (4)–(5) above; the ledger view still has ≤ 50 intents.
3. Exact-head checks: lint, typecheck, build, check-hooks, route-budget /broker, ledger map-no-dup, official `npm test`. Preview :3199 stays 200.
4. One affected e2e batch on a clean temp tree, fresh `.data`, free port (not :3199 / :3102), desktop and phone: Broker order path (`BR-4`, and `BR-5` if cancel/limits are in scope).
5. Stray-init; normal push, no force, no PR, no merge, no contact with Gatekeeper. Evidence-only handoff.

---

<!-- Merged from main (latest unit on main). Both unit notes are kept. -->

# Card 25: signed-in phone Home shows today's change and progress to $20,000

Written 12 Nov 2026, 06:31 Europe/Paris (CET), before any implementation. This is the only file changed by the first commit. Timestamp taken from `date` on the box (Europe/Paris).

## Value and scope

A signed-in player on phone Home sees their saved net worth, but the today slot is replaced by “Your trades, cash and positions are saved on the server.” (`S.demoTradingNote`), and `next = signedIn ? null` hides the rank progress bar. The guest Home already shows today's change, a sparkline, and “Next: {rank} · {nw} / {target}”. V1 M2-02 is “grow $10k” with a visible NW target; 17 §3.2.3 says the phone Home widget is NET WORTH, today's change, sparkline, and the rank progress bar (“Next: Mogul · $412.9k / $5M”). For a new signed-in account that target is Hustler at $20,000 (RANK_THRESHOLDS[0], starter rank R0).

Player outcome: after signing in, phone Home shows today's change (and percent) from the live `me` channel, and the next-rank bar toward $20,000, using the same presentation as the guest widget. The saved-account note can stay as muted context under the hero; it must not occupy the today slot.

Front-end only. Do not change `/api/auth/me`, rank thresholds, or `me.todayChg` / `me.todayPct` sources. Do not invent a sparkline series: the existing Sparkline stub is a flat dashed no-data line (`17-UX` :441); it may be shown honestly, never with made-up points.

## Exact base, branch, and identity

- Branch `ui/signed-in-home-today`, worktree `/workspace/avalon/ui-signed-in-home-today`.
- Base `origin/main` `98939480a24654f729a260de4c3ad0b9f5693f9a` (fetched this turn). The brief named `d2875ef3`; main has since taken PR111 (card 19) and PR113. Phone Home's signed-in widget already lives on this tip. PR105 (`f62bc63b`) adds a later first-trade guide on the same file and is not needed for this behaviour.
- Verify Forge (trading-game bot) `<forge@trading-game.local>` as author and committer. Unset every `GIT_*` variable for npm-test and Git. No push.

## Grounding and sketch

`isSignedIn` is true only for `auth.status === "signed_in"`. The today row and `next` are branched on that flag, so a signed-in player loses the live change and the $20k bar. `applySignedInDemo` already seeds starter rank R0 and `todayChg` / `todayPct` (then the server `me` channel updates them).

1. Chosen: when `signed_in`, render today's change the same way as the guest row (`MoneyText` + `PctText` from `me.todayChg` / `me.todayPct`), and compute `next` with `nextRankTarget(rank)` for signed-in too. Keep the starter / saved-account copy out of the today slot.
2. Rejected: inventing sparkline points. Rejected: pulling card 23's unknown-session skeleton into this card — different behaviour, already queued. This card only adds signed-in rows inside the `signed_in` branch, so they do not appear while `auth.status === "loading"`.
3. Auth-loading check (REVIEW-LESSONS 19): hold `/api/auth/me` and assert first paint has no account handle, no signed-in today-from-starter, and no “Next: Hustler” bar. Guest today/rank may still flash until card 23; that is out of scope here and must not regress further.

## Acceptance and proof plan

- Fail-first unit: a signed-in PhoneHome (starter channels, known `todayChg` / `todayPct`, rank R0) shows those exact today figures in `data-testid=today`, and `rank-next` names Hustler with the live NW and $20,000. The today slot is not only `demoTradingNote`. The same test fails on this base.
- Guest end state unchanged: canned today change and “Next: Owner / Mogul” still match existing `phone.spec` cases.
- Loading: hold `/api/auth/me`; first paint has no `account-chip-home` and no Hustler rank-next from a signed-in session.
- Play-through: production build, desktop 1280 and phone 390, signed-in Home screenshots. Official checks with `GIT_*` unset. Affected e2e in a clean scratch worktree with fresh `.data`. Evidence under `/workspace/avalon/evidence/signed-in-home-today/`. No push.
