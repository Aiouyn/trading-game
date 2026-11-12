# Card 18: top-bar clock must not invent a time before the first server tick

Written 12 Nov 2026, 01:36 Europe/Paris (CET), before any implementation. This is the only file changed by the first commit. Timestamp taken from `date` on the box (Europe/Paris).

## Value and scope

Playtest e30f6822 (d11), on eng/broker-day-expiry, held the first `/api/market` for 8 s then answered 503. From 300 ms through 7 s the signed-in top bar already printed `Day 39 · 11:20` / `data-tick=27700` and `Market open · Port Avalon`, while prices were skeletons and net worth correctly said "— · Net worth loading…". At 9 s, after the 503, net worth became "— · Net worth unavailable" and the pane said "Couldn't load", but the clock was still the invented `Day 39 · 11:20`.

This reproduces on `abf14e57`. `defaultChannels()` boots `clockAt(DEFAULT_TICK)` (`38 * 720 + 340` = 27700 = Day 39 · 11:20, phase `continuous`). `ServerClock` only writes the channel when `useChannel("ticker:wl_default").tick` is non-null (`QuayShell.tsx`, "Signed-in clock: the shell day follows the server quote tick"). Until `/api/market` is adopted, `ticker.tick` is null (`authoritativeQuoteProvenance`: "Guest clocks, and a signed-in feed that has not adopted `/api/market` yet, return null. The label is the adopted server tick only, never the constructor book."). `StatusStrip` and `PhoneHome` still format `channels.clock` as a live time. Guest mock time is a different path (`GuestClock` advances the demo feed) and stays as it is.

17 §3.2.1 (`export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md:240`) puts a real game clock in the status strip once there is one. The Skeleton rule in the same file (`:480`) is "never shows fake numbers". Universal screen states (`:781`) are loading (Skeleton) and error ("Couldn't load"). Net worth already follows that rule for a signed-in account (`useNwReading`, M1-08): the boot value is not shown as a valuation. The clock must do the same.

Do not invent a neighbour time, do not keep printing `DEFAULT_TICK`, and do not say "Market open" or "After hours" from that boot tick. Do not change the guest demo clock, the engine, `/api/market`, Broker ticket order-type/TIF logic, the Portfolio Orders list, Boards, guest Home, the rank label, Settings/sign-up, consent, deep links, `nav.css` safe-area rules, `notices.css` `.qs-bottom`, or `layout.tsx` meta.

## Exact base, branch, and identity

- Branch `ui/clock-first-load`, worktree `/workspace/avalon/ui-clock-first-load`.
- Base `abf14e57f719689e1a94a65223c6f24ab71a6ae0`. The change is shell chrome (status strip / phone status bar), not the in-flight `ui/pwa-safe-area` files, so this is the required base.
- Verify Forge (trading-game bot) `<forge@trading-game.local>` as author and committer. Remove every `GIT_*` variable from manual npm-test and Git subprocesses. Never skip hooks.
- Local checkout only. No cloud, push, PR, deploy, or external handoff.

## Grounding and sketch

Two local shapes were compared:

1. Chosen: a signed-in clock reading, parallel to `useNwReading`. While the session is unknown, or `ticker:wl_default` has no adopted tick (`state: "loading"` or `"error"`/`"denied"` with `tick: null`), the strip and the phone status bar print a muted em dash (`S.nwUnknown`) and a short loading or unavailable label in the same family as "Net worth loading…" / "Net worth unavailable". No `data-tick` of 27700. `MarketPhase` is not rendered from the boot phase. Once `ticker.tick` is a number, format that tick (the same `clockAt` / `clockLabel` path used today) and show the real phase. Guest (session known, not signed in) keeps the demo clock from `channels.clock`. After a later outage, the last adopted tick may stay; that is card 19, not this one.
2. Rejected: blanking the whole mid-strip, or driving the label from a new server field. The client already has the signal (`ticker.tick === null` until adopt). Rejected: leaving "Market open" up while hiding only the time — that phase is also computed from the invented tick.

## Acceptance and proof plan

- Signed-in, first `/api/market` held: `[data-testid=clock]` is not `Day 39 · 11:20` and has no `data-tick="27700"`. The visible mid-strip matches the loading treatment (muted dash plus a loading label). Phase is not "Market open · Port Avalon". Prices and net worth keep their existing loading treatment.
- Signed-in, first fetch ends in error before any adopt: still no invented time; an unavailable label, not the boot clock.
- Signed-in, after a good adopt: the clock is the adopted server tick, formatted as today, and then follows later ticks.
- Guest: the demo clock at `DEFAULT_TICK` (and its local steps) is unchanged. Existing e66 clock-string tests that render the strip as a guest must stay green.
- Phone 390 status bar uses the same rule as the desktop strip. No horizontal overflow. Do not edit `nav.css` safe-area rules.
- Fail-first unit of the signed-in held-first-fetch case (and the error-before-adopt case) on StatusStrip, plus a fail-first e2e that holds `/api/market` on a signed-in `/broker` and asserts the clock is not the boot time. Do not weaken existing clock or M1-08 tests.
- Evidence under `/workspace/avalon/evidence/ui-clock-first-load/`: before/after desktop 1280 and phone 390 with the first fetch held. Official checks with `GIT_*` unset (lint, typecheck, build, check-hooks, map-no-dup, npm test, `/broker` route-budget ≤ 220,160 B). One clean e2e in a scratch worktree with fresh `.data`. No push.

## Qualifications

- Reproduced the d11 shape in source on `abf14e57` (same `DEFAULT_TICK` boot + `ServerClock` guard). Live before-shots are part of this card's evidence, not of this UNIT commit.
- Card 19 (outage presentation) is a separate branch. This card does not change reconnecting / After hours / Review order copy.

## Notes (Gatekeeper B1, 12 Nov 2026)

Lesson: loading skeletons must cover the unknown-session state too. `!isSignedIn(auth)` was read as "guest" while `auth.status` was still `"loading"` (`authSession.ts` starts as `{ status: "loading" }`). That painted the invented boot clock (`Day 39 · 11:20` / `data-tick=27700`) plus `MarketPhase` / `TickRing` for a signed-in player, for about 70–90 ms on a natural load. `useNwReading` already special-cased `auth.status === "loading"`. The catch: for every `isSignedIn()` branch, ask what renders while auth is loading. Proof: a unit and an e2e that hold `/api/auth/me` (and the first `/api/market`) and assert no tick, phase, or ring is painted.

This addendum does not rewrite the UNIT-only first commit.

### `isSignedIn()` audit on this card's surfaces (clock / strip / phone home)

This batch fixes only the clock reading. The other branches below still treat `loading` as "not signed in". They are noted, not changed (rank label and Settings/sign-in stay out of scope).

- **Clock / `MarketPhase` / `TickRing` (StatusStrip and phone StatusBar).** `useClockReading` now returns `{ state: "loading" }` while auth is loading, so the muted dash is shown and phase, ring, and the phone phase dot are not mounted. Fixed.
- **StatusStrip `release` and right chrome.** While auth is loading, the release string uses the boot rank (`Quay 2 · Owner`) and the right chrome shows the rank chip plus Sign in, not the account chip (no handle is invented). Same flash Gatekeeper photographed. Not changed here.
- **StatusStrip and phone NW chips.** `useNwReading` already returns loading, so these already print "— · Net worth loading…". Unaffected.
- **Phone StatusBar account chip.** Omitted while loading (no invented handle). Unaffected.
- **PhoneHome widget (home, not the status bar).** While auth is loading, the rank chip and Sign in CTA render (`!signedIn`). The next-rank bar uses `nextRankTarget(rank)` on that same branch, so a signed-in load can briefly show guest next-rank chrome once NW is live. Account chip, goal, and first-trade guide wait for `signed_in`. Not changed here.
- **Guest, once auth resolves to `signed_out`.** The demo clock at `DEFAULT_TICK` (and its local steps) is unchanged.
