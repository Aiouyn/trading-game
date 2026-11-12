# Card 16: close Settings after sign-up so the goal/guide is visible

Written 12 Nov 2026, 01:36 Europe/Paris (CET), before any implementation. This is the only file changed by the first commit. Timestamp taken from `date` on the box (Europe/Paris).

## Value and scope

Playtest e30f6822, shots `d07_A_after_signup_0s.png` and `d08_A_home_signed_in_0s.png`, and log: a new player clicks Sign in (which opens Settings → Account), creates an account, and Settings stays frontmost. After `goto('/')` it is still on top (Appearance) and covers Portfolio's "YOUR GOAL" and first-trade guide. Phase B of the same playtest even had to "close settings" before it could continue.

Reproduced on this base (`abf14e57`), unfixed, production `next start` :3374, 1440×900: after UI sign-up, `top=win-settings` and URL `/settings`; after `goto('/')`, Settings still frontmost and its rect overlaps `pf-goal`. See `/workspace/avalon/evidence/ui-settings-after-signup/repro-base/`.

`AccountSettings` already switches to the signed-in Account panel after `authSession.register` but never closes or lowers the Settings window (or the phone Settings app). The goal/guide itself is Builder's — this card does not change it. After a successful sign-up only (not a failed attempt, and not a later Sign-in of an existing account), close Settings: desktop removes the window, phone returns to home, so the goal/guide is visible. The player can reopen Settings from the account chip.

Base `abf14e57f719689e1a94a65223c6f24ab71a6ae0`. Branch `ui/settings-after-signup`, worktree `/workspace/avalon/ui-settings-after-signup`. Forge (trading-game bot) `<forge@trading-game.local>`. Unset `GIT_*` for npm-test and Git subprocesses. No push, PR, or merge. Stay off the goal/guide body, the ticket's order-type/TIF, card 10 safe-area files, Boards, the engine, Broker deep-link reuse (card 15), and the analytics consent prompt (card 17).

## Sketch

1. A small helper next to `openAccountSettings` (auth chrome): close the Settings window on desktop, or clear `phoneApp` when it is Settings on phone.
2. `AccountSettings` calls it after a successful `register` only. Login stays on the signed-in Account panel. A failed register leaves Settings open with the error.
3. Closing Settings persists through the existing window-save path, so a later `/` does not restore Settings on top (the d08 case).

## Acceptance and proof plan

- Fail-first unit: after a successful register with Settings already open, the helper / submit path leaves no Settings window (desktop) or no Settings phone app; the goal/guide is not mounted or changed by this code. A failed register keeps Settings open. Login does not close Settings.
- Fail-first e2e (desktop 1440): `/` → Sign in → Create account with a fresh handle. `win-settings` is gone, `pf-goal` and `pf-guide` are visible, and Settings does not overlap them. A subsequent `goto('/')` still has no Settings window on top. On the current tree this fails (Settings stays frontmost and overlaps the goal).
- lint, typecheck, build, check-hooks, route-budget (`/broker` ≤ 220,160 B, report B; expect unchanged vs base), ledger map-no-dup, npm test, all with `GIT_*` unset. Hook flags must be unset for the no-flag build / check-hooks.
- Clean e2e in a scratch worktree with fresh `.data`, ports 3300–3399 never 3199: the new spec plus a small desktop settings/auth cohort if one already covers Sign in (`tests/e2e/settings` and/or M2-01 only if it stays green without depending on Settings staying open). Delete the scratch afterwards.
- Evidence under `/workspace/avalon/evidence/ui-settings-after-signup/`. Do not push.
