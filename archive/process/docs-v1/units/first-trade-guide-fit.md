Moved from UNIT.md on 12 Nov 2026 (Europe/Paris) per Builder's rule, on the merge of origin/main f8f51ad9 (PR105) into this branch. Original text and date below are unchanged.

# Card 22: first-trade guide last line and Hide guide must fit

Written 12 Nov 2026, 02:09 Europe/Paris (CET), before any implementation. This is the only file changed by the first commit. Timestamp taken from `date` on the box (Europe/Paris).

## Value and scope

After a new player creates an account, step 3 of the first-trade guide ("Place the order to confirm it…") and its "Hide guide" link are cut by existing Trade-layout Portfolio chrome. Gatekeeper qualified this on card 16 (`19e1fdf8`, shot `launchpad/gatekeeper/19e1fdf8/shots/desktop-after-signup.png`): the Portfolio window's bottom edge cuts through the last line, and Hide guide is below the fold.

## Base (lowest branch that already has the guide)

`origin/eng/broker-idempotency` (PR105) @ `7aaefce8df2fbc92cc181ae3fc804ecd32fd48b1` after `git fetch`. `src/apps/portfolio/GoalGuide.tsx` is on this head, and the clip reproduces here, so this is the base (no fall back to the `abf14e57` stack). Card 16 is not on this base: a UI sign-up leaves Settings open, which is a separate issue. Close Settings (or sign in through the auth API) and the Portfolio window still clips the guide. Product measurements, production `next start` :3382, fresh `.data`, evidence `evidence/ui-first-trade-guide-fit/repro-pr105/`:

- Desktop 1440×900, Trade layout, at rest (scrollTop 0): step 3 text overflows the Portfolio `.win-body` by 29.83 px; Hide guide overflows by 65.83 px. The body can scroll (361 / 706). Shots `desktop-1440-after-close-settings.png` and `desktop-1440-portfolio-window.png`.
- Phone 390×844, after opening the guide from home: step 3 and Hide guide are fully visible and do not overlap the edge bar. Body can scroll because Overview content sits below the guide (719 / 938).
- Phone 360×640, same path: step 3 is fully visible; Hide guide overlaps the edge bar by 11.08 px (`phone-360x640-portfolio.png`).

This card does not change the ticket's order-type/TIF controls, the Portfolio Orders list, Trade layout split, the engine, or the server. It only makes the guide's last line and Hide guide visible in the existing chrome at these sizes.

Branch `ui/first-trade-guide-fit`, worktree `/workspace/avalon/ui-first-trade-guide-fit`. Forge (trading-game bot) `<forge@trading-game.local>`. Unset `GIT_*` for npm-test and Git subprocesses. No push, PR, or merge. Read `evidence/review-lessons/gatekeeper-draft.md` before the unit (lessons used here: measure after motion settles; fail-first; do not paint a fake clock/price/guide while auth is still loading — the guide already mounts only once the session and ledger are known, and the test waits for that).

## Sketch

1. Tighten the first-trade guide (spacing and/or the stacked Open Wire / Open Broker controls) so the full guide, including step 3 and Hide guide, sits inside the Trade-layout Portfolio window body at 1440×900 without the player having to scroll, and so Hide guide clears the phone edge bar at 360×640.
2. Leave Overview's hero and the rest of the portfolio body as they are. Do not steal height from Wire or change window chrome.

## Acceptance and proof plan

- Fail-first e2e, no fixed sleep before the layout assert (wait for `getAnimations()` to finish, then 2 rAF). After a signed-in load with a real session (not while auth is `loading`), measure step 3's last line (`pf-guide-step-3`) and Hide guide (`pf-guide-hide`) against the overlapping chrome: desktop 1440×900 vs the Portfolio `.win-body` visible box; phone 390×844 and 360×640 vs the phone app body and the edge bar. At rest (no test-driven scroll), both nodes must be fully visible and must not overlap the window frame, edge bar, or other chrome. On this unfixed head the desktop 1440 and phone 360×640 cases fail; phone 390 already passes and must stay passing.
- lint, typecheck, build, check-hooks, route-budget (`/broker` ≤ 220,160 B, report B), ledger-no-dup (map-no-dup), npm test, all with `GIT_*` unset. Hook flags unset for the no-flag build / check-hooks.
- Clean e2e in a scratch worktree at the same SHA with fresh `.data`, ports 3300–3399 never 3199: the new spec plus M2-01 (affected first-trade guide). Delete the scratch afterwards.
- Play the sign-up path in a real browser (desktop 1440 and phone 390 / 360×640), save before/after screenshots and NOTE.md under `/workspace/avalon/evidence/ui-first-trade-guide-fit/`. Do not push.
