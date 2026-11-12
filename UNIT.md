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
