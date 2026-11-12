Moved from UNIT.md on 12 Nov 2026 (Europe/Paris) per Builder's rule, on the merge of origin/main f8f51ad9 (PR105) into this branch. Original text and date below are unchanged.

# Card 15: a /broker deep link must reuse the existing Broker window

Written 12 Nov 2026, 01:20 Europe/Paris (CET), before any implementation. This is the only file changed by the first commit. Timestamp taken from `date` on the box (Europe/Paris).

## Value and scope

Playtest e30f6822, shot `d40_A_deeplink_windows.png` and log: after the Trade layout already had one Broker window, three `goto('/broker')` deep links (with a `/portfolio` in between) left **4** Broker windows (`win-broker` × 4). The ticket, chart and first-trade path were buried in a stack.

`openApp` reuses a window only when the same Broker context is already open, or when the instance cap (Broker `maxInstances: 4`) is reached. A bare `/broker` deep link has no `?asset=` context, so each visit opens a new window up to the cap. QuayShell already documents the intended rule: after restore, a deep link should "open it, or focus and front the open instance (Audit A-8, 17A T4-04)" and "the deep-link effect below focuses the existing instance (17B S1-02, Audit A-8)". `store.open` already receives `{ deepLink: true }` but does not pass a reuse flag to `openApp`.

The cap of 4 stays for a deliberate second Broker (launcher / same-app open with a different ticker). Only the deep-link path reuses. `?asset=` on a deep link focuses the existing window (the one with that context, else the main instance) and applies the asset, without opening another.

Base `abf14e57f719689e1a94a65223c6f24ab71a6ae0`. Branch `ui/broker-deeplink-reuse`, worktree `/workspace/avalon/ui-broker-deeplink-reuse`. The earlier "card 15 desktop Broker audit" was dropped before any branch or worktree was created. Forge (trading-game bot) `<forge@trading-game.local>`. Unset `GIT_*` for npm-test and Git subprocesses. No push, PR, merge, or product changes outside window open/deep-link. Stay off the ticket's order-type/TIF, card 10 safe-area files, Boards, the engine, Settings-after-signup (card 16) and the analytics consent prompt (card 17).

## Sketch

1. `wm.openApp(..., opts?: { reuse?: boolean })`: when `reuse` is set and any window of that app exists, focus it (prefer the same context, else the main instance, never a Portfolio "Journal") instead of creating one. If the deep link names a context, apply it to that window, keeping place and size (same as today's single-instance path).
2. `store.open` passes `{ reuse: true }` when `opts?.deepLink` is set.
3. Launcher / shelf opens without `deepLink` still stack up to the cap. Existing S1-11 tests stay valid.

## Acceptance and proof plan

- Fail-first unit: on the current `openApp`, a reuse (or equivalent) open of a second bare `/broker` after one window already exists adds a window; after the fix, count stays 1 and that window is focused. A `/broker?asset=HALC` deep-link reuse applies HALC to the existing window. A non-reuse open of a second ticker still opens a second window. At the cap, behaviour is unchanged.
- Fail-first e2e (desktop 1440, Trade layout): after `/` then three client-side or `goto('/broker')` visits (and one `/portfolio` in between, as the playtest), `win-broker` count is 1 and the Broker window is frontmost. On the current tree this is 4.
- lint, typecheck, build, check-hooks, route-budget (`/broker` ≤ 220,160 B, report B; test+wm only, expect unchanged vs base), ledger map-no-dup, npm test, all with `GIT_*` unset.
- Clean e2e in a scratch worktree with fresh `.data`, ports 3300–3399 never 3199, hardlinked `node_modules`: the new deep-link spec plus the existing desktop shell/window cohort that covers open/focus (`tests/e2e/shell/desktop.spec.ts` and any wm-resize tests if they open Broker). Delete the scratch afterwards.
- Evidence under `/workspace/avalon/evidence/ui-broker-deeplink-reuse/`. Do not push.

## Addendum — restore a minimized Broker on a deep-link reuse (Gatekeeper card 15 qual)

Written 12 Nov 2026, 01:47 Europe/Paris (CET), before any further implementation. This addendum is the only change in its commit. Timestamp taken from `date` on the box (Europe/Paris).

Gatekeeper passed `fef63191` with one qualification: a `/broker` deep link brings a minimized Broker window to the front but leaves it as a 32 px title bar (`WindowFrame.tsx` sets `height: win.collapsed ? 32 : rect.h`). Evidence: `/workspace/avalon/evidence/launchpad/gatekeeper/fef63191/shots/4-head-minimized-deeplink.png`. `openApp` (`wm.ts` ~99–102 / 117–120) and `store.open` (`store.ts` ~122) already reuse and `bringToFront` when `opts.reuse` is set, but they do not clear `collapsed`.

On a deep-link reuse (`opts.reuse`), restore the existing window: set `collapsed: false`, keep place and size, still apply a named `?asset=` context as today. Do not change shelf or launcher opens (no `deepLink` / no `reuse`): a minimized window stays minimized if those paths focus it (same-context or at the cap). Do not change the instance cap, phone, or ticket logic.

Fail-first unit: open Broker, collapse it, `store.open("broker", …, { deepLink: true })` — one window, frontmost, `collapsed: false`. A non-deep-link open that only focuses (same context, or at the cap) leaves `collapsed: true`. Fail-first e2e: Trade layout, collapse the Broker window, `goto('/broker')`, the window is frontmost and not a 32 px title bar. Evidence under `/workspace/avalon/evidence/ui-broker-deeplink-reuse/batch1/`. Official checks with `GIT_*` unset, one clean e2e with fresh `.data`. No push.

## Addendum, 12 Nov 2026 18:08 Europe/Paris (CET): merge with PR126 (card 34)

On origin/main 51611e5e, Positions Close calls `open("broker", asset, { deepLink: true })` so a locked Broker still opens, and card 34 needs that call to leave an existing Broker alone at the 4-window cap (shows "pos-close-cap" instead). Reusing on every `deepLink` retargeted the main Broker to the closed asset and failed 2 tests in tests/unit/17b/close-prefill-held.test.tsx. Reuse is now its own `reuse` option, passed only by the URL route opener in QuayShell. `/broker?asset=` links still reuse the Broker window. The in-app Close keeps card 34's cap rule, and a new unit test covers it.

Addendum 2, 18:58 Europe/Paris (CET): main's e2e tests/e2e/17b/close-prefill-held.spec.ts built its 4-Broker cap by booting `/broker?asset=` four times. That URL path is exactly what this card changes (reuse, playtest d40), so the fixture got 1 window instead of 4. The fixture now opens one Broker by link and three from the shelf tile (a plain open, no reuse), then frees a slot by closing the last Broker. The card 34 assertions are unchanged: cap notice, no HALC ticket, nothing held, no leftover Sell.

## Addendum 3, 12 Nov 2026 19:58 Europe/Paris (CET): BR-4-02 on PR #160 (CI run 43279120536)

BR-4-02 (desktop) boots `/broker?asset=HALC`, then the bare `/broker`, and expects a window with the asset picker. Card 15 reused the main Broker for every URL deep link, so the bare link only focused the HALC window and no picker appeared. Reproduced locally on 9c27bc5f (main 4424d3fd merged): 1 failed, 34 passed.

The BR-4 spec is right: with no asset, the player gets the picker. The reuse is narrowed in `wm.openApp`:
- A reuse link with an asset still focuses the window with that asset, otherwise the main instance, and applies the asset (playtest d40).
- A bare reuse link only reuses a Broker that has no asset yet (it already shows the picker). If no such window exists, it opens one picker window, as main does.

The d40 case still holds: the Trade layout Broker has no asset, so repeated bare `/broker` visits stay at one window. A new fail-first unit in wm.test.ts covers this (fails on 9c27bc5f, passes after). The BR-4 spec is unchanged.
