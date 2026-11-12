# Card 14: stop the M2-03 phone board from failing when the market has already ticked

Written 12 Nov 2026, 01:12 Europe/Paris (CET), before any test change. This is the only file changed by the first commit. Timestamp taken from `date` on the box (Europe/Paris).

## Value and scope

`tests/e2e/17b/M2-03-leaderboard.spec.ts` helper `selfMatches` polls `Promise.all(selfRow(page), ownNw(request))` and requires `s.tick === v.tick` and the displayed NW to equal `/api/broker/me` valued at `/api/market`. The board only re-reads `/api/leaderboard` every 5 s (`BOARD_POLL_MS`). The live market can advance one tick in that window. The Playwright API request for `/api/market` does not go through the page, so it can already be at N+1 while the DOM still shows N. The last clean-e2e failure on card 10 was exactly that: board tick 27710 vs `/me` (market) tick 27711, same NW `$9,999.84`, at the phone test's 520 px window `selfMatches` (line 154), 25 s timeout.

Test-only. No product, engine, CSS, or route changes. Do not touch the Broker ticket's order-type or TIF controls.

## Exact base, branch, and identity

- Branch `ui/m2-03-tick-sync`, worktree `/workspace/avalon/ui-m2-03-tick-sync`.
- Base `abf14e57f719689e1a94a65223c6f24ab71a6ae0` (card 8). The M2-03 spec is byte-identical on `eng/market-calibration` `110583b0`; abf14e57 is chosen because `ui/boards-next-up` is based here, so the clean e2e can also run that cohort in a scratch merge, and the flake was observed on the UI stack that includes this commit.
- Forge (trading-game bot) `<forge@trading-game.local>`. Unset every `GIT_*` variable for npm-test and Git subprocesses. Inspect new commits for stray init or hook fixtures. Never skip hooks. No push, PR, merge, or cloud agent.

## Sketch

1. Keep valuing the saved ledger independently (`/api/broker/me` + `/api/market`).
2. Do not treat a torn sample (board tick ≠ market tick) as a failed comparison. Pin the valuation at the live market tick, then wait until the board's `data-tick` equals that tick, and only then compare NW. If the board is still behind, wait for the next 5 s refresh rather than retrying the same torn Promise.all assertion.
3. Fail-first: force the old `Promise.all` assertion to fail with a page-only delay on `/api/leaderboard` so the DOM tick lags the APIRequestContext market read (the same split as production). Record that failure, then ship the wait-for-same-tick helper without the delay.

## Acceptance and proof plan

- `selfMatches` only compares NW when the board and the market read share one tick. Torn samples are skipped.
- A deterministic probe of the old assertion, with a route delay, fails with a tick mismatch of the 27710 vs 27711 shape. The same probe with the new helper is not required to pass under a delay that never lets the board catch up; the official test has no injected delay.
- lint, typecheck, build, check-hooks, route-budget (`/broker` ≤ 220,160 B, report B), ledger map-no-dup, npm test, all with `GIT_*` unset. Unchanged budget expected (test-only).
- Clean e2e in a scratch worktree with fresh `.data`, ports 3300–3399 never 3199, hardlinked `node_modules`. Run `tests/e2e/17b/M2-03-leaderboard.spec.ts` with `--repeat-each=5`. Also run `tests/e2e/17b/boards-next-up.spec.ts` after an evidence-only scratch merge of `ui/boards-next-up`. Delete the scratch afterwards.
- Evidence under `/workspace/avalon/evidence/ui-m2-03-tick-sync/`. Report HEAD, base, UNIT commit, repro, checks, and repeat counts. Do not push.
