# review lessons (v1)

read this before starting every unit (UI, Systems, Infra, and cloud agents).
every new Gatekeeper finding is appended here with an `enforced by:` test or CI check (`none yet` if one is still owed); Gatekeeper verdicts end with a `lesson:` line to add.
before any head goes to Gatekeeper, run the full local preflight (lint, typecheck, build, check-hooks, unit, ledger-no-dup, e2e, route budget) and play the changed path yourself. only hand over green heads.

each entry: the mistake, how to catch it before review, and the proof.

1. **bounded maps must not evict live security state.** mistake: a capped throttle map evicted in-window login lockouts, so a flood of distinct handles reset a victim's lockout (cbc7917b). catch it: any map with a cap, ask what happens to a live entry when it fills. proof: a unit that floods with more keys than the cap and asserts the victim stays 429 while an unrelated correct login stays 200, plus the same over http.
enforced by: tests/unit/auth/throttle-bound.test.ts; tests/unit/server/m3-05-mutation-limit.test.ts.
2. **re-check the session at every write, right before save.** mistake: preview/advance paths skipped the session re-check, so a logged-out context still worked. catch it: grep every path that mutates or quotes state for a session re-check. proof: logout between preview and place gives SESSION_REJECTED with zero state change. pure helpers (e.g. commandFarm) must never be route entry points.
enforced by: tests/unit/launchpad/launchpad-meme-actor.test.ts; tests/unit/fx/fx-actor.test.ts; tests/unit/actor-binding/actor-binding.test.ts.
3. **contexts must be issued, not constructible.** catch it: can a caller hand-build an actor ctx? proof: a forged-ctx matrix (spread, clone, wrong owner, stale) is all rejected and state is unchanged; a non-owner gets ACTOR_MISMATCH.
enforced by: tests/unit/actor-binding/actor-binding.test.ts.
4. **measure layout after motion settles.** mistake: a fixed waitForTimeout measured mid-animation (pwa 5d8effee, the reviewer's own error). catch it: no fixed sleeps before layout asserts. proof: await element.getAnimations() finished + 2 rAF, then assert, and the test must fail when the fix is removed.
enforced by: tests/e2e/pwa/safe-area.spec.ts (ticket Review waits for sheet-up to settle, then asserts clearance).
5. **visual changes need base-vs-head baselines.** mistake: overflow:auto changed anti-aliasing, so a 1440 baseline failed (722af447). catch it: run the visual suite on base and head before handover. proof: list which failures exist on base (pre-existing) vs are new, and refresh new baselines deliberately.
enforced by: none yet.
6. **show real values, never hardcoded ones.** mistake: the tied-at-top line omitted the amount (f6c45644). catch it: any copy with a number. proof: an e2e with two accounts at a non-default amount (e.g. $9,999.75) asserting that exact value.
enforced by: tests/unit/leaderboard/m2-03-boards-app.test.tsx ("a tie at the top names the shared net worth as table money").
7. **skeletons never show fake numbers (17-ux:480).** catch it: hold the first fetch and look at the screen. proof: route-intercept the first read; assert no tick, phase or price until real data arrives, plus a failed-read state.
enforced by: tests/unit/shell/clock-first-load.test.tsx; tests/e2e/shell/clock-first-load.spec.ts.
8. **the fix must fail first.** catch it: write the unit/e2e before the fix. proof: the test fails on base and passes on head, both logged in the handoff.
enforced by: none yet.
9. **unit doc first, and keep the order honest.** a restack gives the unit commit a new author date; note the original sha (reflog) in the handoff so it isn't mistaken for docs-after-code.
enforced by: none yet.
10. **float compares use tolerances.** mistake: calibration asserted exact equality and went red at 2e-14 (81b5b144 lineage). proof: assert within an explicit ULP/epsilon and justify the bound.
enforced by: tests/unit/launchpad/launchpad-calibration.test.ts (expectCloseNum / toBeCloseTo, ULP comment).
11. **budget and default-off before handover.** run route-budget (/broker <=215 KB gz), check-hooks, lint, typecheck, a no-flag build and the touched units locally; new engine code ships unmounted/default-off unless the card says otherwise.
enforced by: .github/workflows/ci.yml (lint, typecheck, no-flag build, check-hooks, route-budget, npm test); tests/unit/actor-binding/actor-binding.test.ts (default-off).
12. **isolation and refresh on every player-state change.** proof: a second account can't see it (ui + api), and it survives a refresh and a server restart.
enforced by: tests/e2e/17b/M1-04-catalog.spec.ts; tests/e2e/17b/M1-05-live-ticks.spec.ts.
13. **process hygiene on the shared box.** kill servers by pid file only, never pkill/killall by name (a reviewer cleanup killed :3199).
enforced by: npm run ci:lesson13 (tools/ci/lesson13-pid-kills.mjs, .github/workflows/ci.yml); tests/unit/ci/lesson13-pid-kills.test.ts.

14. **normalise paths before a shroud or allowlist check.** mistake: case, percent-encoded slashes, and literal `.rsc` served the 200 shell instead of 404 (`/Bank`, `/api/Bank`, `/api/bank%2Fdraw`, `/bank%2Fdesk`, `/bank.rsc` on 6a9efd45). catch it: try those variants before handover. proof: they 404, not the shell, and they do not write.
enforced by: none yet.
15. **a non-loopback bind without QUAY_TRUST_PROXY=1 must refuse to boot.** mistake: without the flag, rate and telemetry keys collapse to a shared `local` bucket, and a reachable host would have no real client key (held against reachable-alpha GO; closed on ffef50ca). catch it: boot on `0.0.0.0`/`::` or with a public host and the flag unset. proof: the process exits 1, serves nothing, names `QUAY_TRUST_PROXY`, and does not echo the host; `" 1"`, `"1 "`, and `true` do not count.
enforced by: tests/unit/auth/trust-proxy-boot.test.ts.
16. **don't put app `@/` imports under tools/ci.** mistake: a file in `tools/ci` broke `core:typecheck` because engine-core typechecks that tree with the engine tsconfig, which has no `@/` paths (060061e5). catch it: run `npm run core:typecheck` when touching `tools/ci`. proof: it exits 0.
enforced by: .github/workflows/engine-core.yml (npm run core:check, which typechecks tools/ci).
17. **skipped checks are not passes.** catch it: the handoff lists pass/fail/skip separately and never calls a skip a pass (b8257aaf and later reviews).
enforced by: tools/ci/skipped-checks.mjs (ci.yml); tests/unit/ci/skipped-checks.test.ts.
18. **evidence must be for the exact head under review.** mistake: a handoff that quotes only a SHA can look green on head X while the logs were from a dirty tree or an earlier commit (pr-100). catch it: record the SHA and a content fingerprint, and re-run if the head moved. proof: checks.log / PROVENANCE name the same SHA as `git rev-parse HEAD` and `ls-remote`.
enforced by: tests/unit/ci/preflight.test.ts (HEAD + dirty-tree fingerprint; a mid-run edit is stale).
19. **tests must watch the unknown-session and first-paint path, not only the settled state.** mistake: clock-first-load e2e waited for `data-clock-state=loading`, which is the post-auth state, and missed the invented boot-clock flash (af5d724e). catch it: hold `/api/auth/me` and `/api/market` and assert the first paint. proof: the test fails on that flash and passes when the unknown-session branch is honest.
enforced by: none yet.
20. **a GET must not write under the kill switch.** mistake: `GET /api/auth/me` still persisted `lastSeenAtMs` under `QUAY_KILL_SWITCH=1` (f8a4e4bd). catch it: grep read routes for persist while read-only. proof: under the kill switch, GET `/api/auth/me` and GET `/api/wire` leave store bytes and mtime unchanged.
enforced by: none yet.
21. **env flags are unset or exactly `1`.** mistake: padded `" 1"` was accepted after trim while the docs said padding is a boot failure (f8a4e4bd). catch it: try `" 1"`, `"1 "`, `"true"`, `"0"`, and a trailing newline. proof: those refuse to boot; only exact `1` or unset is accepted.
enforced by: tests/unit/spend/spend-guard.test.ts; tests/unit/auth/trust-proxy-boot.test.ts.
25. **don't read a lazy panel on a paused clock without stepping it.** mistake: BR-10-11 phone booted /settings with bootPaused and read the Settings panel at once; on a slow host the chunk lands after the pause and React 19's Suspense reveal timer never fires (CI run 43161314039, 30 s timeout). catch it: run the spec with `taskset -c 0,1` on 2 workers, or hold the chunk with page.route. proof: the spec steps the clock (revealOnPausedClock) before the first read and stays green x10 under the throttle.
enforced by: tests/e2e/17b/BR-10.spec.ts (BR-10-11 revealOnPausedClock); tests/e2e/17b/openPaused.ts.
26. **a reply must not wipe what the player typed after sending.** mistake: the Wire composer cleared the textarea when a post landed, so a draft typed while it was in flight vanished and Post stayed disabled (M1-10 phone, CI run 43161314039, 180 s timeout). catch it: hold the POST and type during it. proof: the newer draft survives the reply and posts next; an unchanged draft is still cleared. e2e that share the server scope rows to their own account.
enforced by: tests/unit/wire/composer-draft-in-flight.test.tsx; tests/e2e/17b/M1-10-player-statements.spec.ts.
27. **an overlay pinned to a chart coordinate moves on the chart's own redraw.** mistake: the Broker's last-price tag was placed on data / range / size events, but the library rescales the price axis on its own frame after setData, so the tag sat ~35 px off the last price until the next tick (10 of 20 loads under `taskset -c 0,1`; S1-03's palette DOM compare caught it). catch it: compare the tag's y with the series' own priceToCoordinate right after load on a throttled host. proof: equal on every load.
enforced by: tests/e2e/17b/broker-chart-tag.spec.ts; tests/e2e/shell/desktop.spec.ts (S1-03).
28. **before planning a feed fix, probe /broker in a browser and count /api/market reads after reconnect.** mistake: a plan treated BrokerFrame and the shell clock as two ticker subscribers that each reconnect, and described a 3.0s double read. `useChannel` `acquireEntry` shares one store per channel, so the shipped page already did one read. catch it: open /broker, go offline and back online, and count `GET /api/market` before writing the feed change. proof: the unit doc says the shipped page is one read; the two-store unit opens two `openChannel` stores, including a microtask flush between the listeners.
enforced by: tests/unit/shell/outage-backoff.test.ts; docs/v1/units/m1-05-samebook-flake.md.
29. **unit tests must not leave a repo `.data/` directory.** mistake: the production-clock unit set `NODE_ENV=production` and called `getLiveMarket()`, which persisted the storm world under the checkout `.data/market/`. A later M2-01 e2e on that tree then resumed the leftover store instead of a fresh world. catch it: after `npm test`, `.data/` is absent. proof: that unit points `QUAY_STORM_DATA_DIR` and `QUAY_AUTH_DATA_DIR` at `mkdtemp(os.tmpdir())`, and the vitest global teardown fails the run if `.data` remains. Local `--browser` preflight runs `rm -rf .data` immediately before e2e.
enforced by: tests/global-setup.ts (teardown calls tests/unit/ci/no-repo-data.ts); tools/ci/preflight.mjs (`rm -rf .data` before the e2e phase).
