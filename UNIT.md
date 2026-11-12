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

# Card 29 — Signed-in Home hero says Net worth, not “Demo balance”

**When:** 12 Nov 2026, 06:55 Europe/Paris (CET)
**Branch:** `ui/signed-in-hero-copy`
**Base:** `origin/main` `1fd4a6d9cc27a61dfd28ddc6288bf1ecd6ea6f3e` (PR114 after PR111/113)
**Identity:** Forge (trading-game bot) <forge@trading-game.local>
**Tier:** low (copy). Not opening a PR. No push this pass.

## Player outcome

A signed-in player looking at Home sees the same “Net worth” hero the spec describes, not “Demo balance” and not “Starter account: $10,000 (demo placeholder, not a live balance).” Their cash and positions are already described in Account as saved on the server. The main screen should not contradict that, and it should not look like a throwaway demo.

## Grounding

- `export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md:257` — Home widget: “NET WORTH label + rank chip, serif 44 px NW, today’s change, sparkline, rank progress bar.” The label is Net worth. There is no “Demo balance” line and no $10k “not a live balance” disclaimer on this widget.
- Same file :240 — desktop status strip: net worth (mono) with today’s %. Not a “Demo balance” tag.
- Settings › Account already says “Account, cash, and position quantities are saved on the server.” (`src/apps/settings/strings.ts` `accountDisclaimer`; tests in `m1-01-account.test.tsx`). The hero copy is stale relative to that.
- `docs/v1/M1-01-AUTH.md:15` still says mock trading is not a server save and “Account may show starter cash placeholder only.” That note is about Account, and Account has already moved on. It is not a license to label the Home hero a fake balance.
- `docs/v1/REVIEW-LESSONS.md` entry 19: while `/api/auth/me` is held, `isSignedIn()` is false. First paint must not flash “Demo balance” or the $10k disclaimer, and must not invent a signed-in number. Guest chrome (Net worth) is the honest unknown-session path.

## Scope (tiny copy)

- Phone Home widget: the label is `S.netWorth` for signed-in and guest. Remove `phone-demo-disclaimer` (`S.starterPlaceholder`) from the signed-in hero.
- Desktop status strip: drop the signed-in “Demo balance” tag (`strip-demo-tag`). Show today’s % next to NW, as the spec and the guest strip already do.
- Do not retouch the signed-in today slot or the $20k rank bar — that is card 25 (`ui/signed-in-home-today`).
- Do not rewrite Account or M1-01-AUTH.md in this card.

## Acceptance / proof

- Fail-first unit: a signed-in Phone Home / StatusStrip still says “Demo balance” and the starter disclaimer before the fix; after the fix the hero label is “Net worth”, `phone-demo-disclaimer` is absent, and `strip-demo-tag` is absent. The $10,000 starter amount may still appear as the NW figure; it is not captioned as a demo placeholder.
- Auth / first paint: hold `/api/auth/me` — first paint has no “Demo balance”, no “not a live balance” / starter placeholder, and no account handle. After the session resolves signed-in, still no those phrases on the hero or strip.
- Official-flag e2e on fresh `.data` (register a handle) plus production play at 1280 and 390 with screenshots.
- Lint, typecheck, build, check-hooks, unit, ledger-no-dup, route-budget, e2e. No push.
