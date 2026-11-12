# Card 23: do not show guest rank or Sign in while the session is unknown

Written 12 Nov 2026, 02:28 Europe/Paris (CET), before any implementation. This is the only file changed by the first commit. Timestamp taken from `date` on the box (Europe/Paris).

## Value and scope

The card 18 audit found that while `authSession` is still `{ status: "loading" }` (the `/api/auth/me` cookie check has not resolved), the desktop strip already paints boot rank chrome: `Quay 2 · Owner` in `data-testid=release`, the `R2 · Owner` chip (`rank-chip`), and a Sign in button (`sign-in-entry`). The phone Home widget does the same with the rank chip and the Sign in CTA. `isSignedIn` is only true for `signed_in`, so loading is treated as a guest. A signed-in player therefore sees a fake rank and a Sign in prompt for a frame (or longer, if `/api/auth/me` is slow).

REVIEW-LESSONS (`origin/main` @ `5d320e04`) lesson 19: tests must watch the unknown-session and first-paint path, not only the settled state — hold `/api/auth/me` and assert the first paint. Lesson 7: skeletons never show fake numbers. An unknown session must render a muted skeleton, not guest chrome. Findings become tests.

Front-end only: presentation of StatusStrip / PhoneHome (and any matching phone status chrome) while `auth.status === "loading"`. Do not change `authSession`, `/api/auth/me`, login, or guest/signed-in end states once the session has resolved. Independent of card 18 (clock-first-load); this card does not touch the clock and does not need that change.

## Exact base, branch, and identity

- Branch `ui/auth-loading-chrome`, worktree `/workspace/avalon/ui-auth-loading-chrome`.
- Base `3146e1029721fc3fb3b0ff0374589d182650d433` — current tip of `origin/eng/broker-idempotency` (fetched this turn). This is the first candidate and it already has the chrome (`StatusStrip` / `PhoneHome` / `authSession` status `"loading"` default). `origin/main` @ `5d320e04` also has the same pattern but is a divergent lineage; the UI stack is higher. Recorded so a restack is obvious if PR105 moves.
- Verify Forge (trading-game bot) `<forge@trading-game.local>` as author and committer. Unset every `GIT_*` variable for npm-test and Git. No push.

## Grounding and sketch

`authSession` starts as `{ status: "loading" }`. `useAuthSession`'s server snapshot is also loading. `isSignedIn` is false until `signed_in`. StatusStrip then chooses the guest release line (`Quay ${RANKS.indexOf(rank)} · ${RANK_NAMES[rank]}`) and the guest rank-chip + Sign in. PhoneHome's widget does the same. The boot store rank is R2 / Owner (`mockChannels`).

1. Chosen: while `auth.status === "loading"`, replace that guest chrome with a muted, static skeleton (no animation, no invented rank or Sign in). Desktop: the `release` label and the right-side rank/Sign in cluster. Phone: the widget rank chip and Sign in CTA. After `signed_out`, today's guest chrome is unchanged. After `signed_in`, the handle / saved-balance chrome is unchanged.
2. Rejected: leaving the guest chrome up and hoping `/api/auth/me` is fast. Rejected: hiding the whole strip. Rejected: pulling card 18's clock first-paint change — the clock is a different hold (`/api/market`).

## Acceptance and proof plan

- Fail-first e2e: hold `/api/auth/me` on desktop and phone; first paint (after `quay-ready`, settled with two rAF — no fixed sleep, and do not await infinite chart animations) shows no rank name, no R-chip, and no Sign in. Then the same tests pass on the fix.
- Guest end state after a 401: Sign in and the R2 chip are still there, as today's `m1-01-auth-chrome` and `phone.spec` already check.
- Signed-in end state after a real session: handle shown, no Sign in, no boot rank chip, no `R2 · Owner`.
- Play-through: a natural signed-in load (register, then a fresh page with the cookie, no held `/api/auth/me`) is polled with rAF until auth resolves; guest chrome must never appear. Official checks with `GIT_*` unset. One clean e2e in a scratch worktree with fresh `.data` (new spec). Evidence under `/workspace/avalon/evidence/ui-auth-loading-chrome/`. No push.
