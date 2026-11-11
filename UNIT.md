# Unit: /broker first-load headroom (≤ 205 KB gz)

**Branch:** `eng/broker-headroom`  
**Base:** `72410cc82683b71f50e3fc3e1db379323686dabc` (`eng/alpha-telemetry`)  
**Worktree:** `/workspace/avalon/broker-headroom`  
**When written:** 2026-11-11 22:36:20 Europe/Paris — before product-code edits.  
**Owner:** /broker first-load is **214.9 / 215 KB** gz, which blocks further UI work. Get it to **205 KB or less** without changing behaviour or raising the budget (`FIRST_LOAD_BUDGET_KB` stays 215).

Measured on this base, production `next start`, BUDGET_PORT=3974, desktop 1440×900, same rule as `tools/ci/route-budget.mjs` (gzipped scripts until `quay-ready` + network idle; lazy lightweight-charts plot excluded up to 60 KB). Inventory: `/workspace/avalon/evidence/launchpad/broker-headroom/before-chunks.tsv`.

## Before (72410cc8) — 14 chunks, **214.9 KB** counted

| chunk | gz | counted? | what it is |
|---|---:|:---:|---|
| 01s_f_3qlcqtb.js | 70.3 KB | yes | react-dom / react |
| 3i7bb4yv5vlj-.js | 44.4 KB | yes | Next router runtime |
| 1vlnpdsf5_l7h.js | 27.1 KB | yes | shell chrome (also pulls Settings / Appearance, feedback, first-trade copy) |
| 1acypmluy4eg_.js | 17.4 KB | yes | hoisted shared copy: Wire skeleton + wire strings, shell strings, Launchpad/boards labels, FR |
| 1tfrwtuot-cld.js | 13.4 KB | yes | asset catalog (HALC, names, base/vol/lot) |
| 1bbzs2ju_xcd5.js | 12.8 KB | yes | Broker Open orders + ticket copy EN+FR |
| 1wuxarlumemyu.js | 11.1 KB | yes | Broker chart chrome / candle parsers / About+ticket surface |
| 2kzd2bib-2ux6.js | 8.5 KB | yes | Next prerender / cache client |
| turbopack-3-ry682tkyiqk.js | 3.8 KB | yes | Turbopack runtime |
| 0umf92h1sb77c.js | 3.4 KB | yes | Next layout router |
| 1x6obpmlu1_c2.js | 1.9 KB | yes | Next error-page chrome |
| 22kacvc5yht7k.js | 0.5 KB | yes | chunk map (references lazy district / boards / launchpad / broker CSS) |
| 3uro1w38_igb4.js | 0.3 KB | yes | chunk map (plot + goal guide) |
| 3kgx6wsko74_w.js | 59.3 KB | **excluded** | lightweight-charts plot (after chart mount; cap 60 KB) |
| **Counted total** | **214.9 KB** | | budget 215 KB |

React + Next runtime (~114.7 KB + small Next helpers) stays. The cut has to come from product and hoisted copy in the ~96 KB remainder. Target: **≤ 205.0 KB** counted (at least **9.9 KB** off).

Already lazy and **not** in the /broker first-load script list (only named in the small chunk maps): district (`city`), leaderboard (`boards`), launchpad, the Wire *app* chunk, and the first-trade GoalGuide chunk. They still leak *copy* and, for Wire, a first-paint skeleton that pulls the full wire string table into the shell.

## Why this is first-load today

- `AppBody` statically imports `WireLoading` from `@/apps/wire/Skeleton`, and that file imports `./strings` (EN+FR, ~20 KB raw) plus skeleton CSS. That runs on every route, including /broker, even though Wire is not on screen.
- `SettingsApp` is an **eager** `APP_MODULES` entry, so Settings/Appearance ships in the shell chunk on /broker first paint.
- `BrokerFrame` statically imports `AssetPage` (About / Overview / News, and News pulls Wire `KindChip` + wire strings again) and `TicketReview` (review / ack, after the edit step). Trade is the first paint.
- Broker (and hoisted) string modules include the inactive FR locale on an English first load.
- GoalSlot already lazy-loads GoalGuide after sign-in; guests do not fetch that chunk. Keep that. Onboarding *copy* still sits in the hoisted string chunk.

Turbopack scope-hoisting lesson (budget-l4): a new lazy import of a module that must stay on first load can *re-chunk* it and cost more than it saves. Lazy panels must not import first-load modules except as types, or the after-measure will reject the move.

## Contract

1. Official `/broker` first-load counted gz is **≤ 205.0 KB**. Budget cap stays **215 KB**. Same exclusion rule for the plot chunk (cap 60 KB). Record an after table, same method, per chunk.
2. **No behaviour change** for a guest or signed-in player: Trade on /broker still first-paints the ticket, chart, and Open orders; About, review/ack, Settings, Wire, district, leaderboard, launchpad, and the first-trade guide still work when opened, with the same copy and tests.
3. Each panel newly made lazy (and any existing lazy app body that is only getting a tighter boundary) is wrapped in a **retry boundary** following `RetryableComposer`: a failed chunk shows a short message and Retry that remounts a new `lazy()` generation, not a whole-page crash. While the chunk loads, a **visible skeleton** in the same slot; **no layout shift** on desktop or phone (reserved size, no jump).
4. Locale: the inactive locale (FR on the default English first load) is not in the first-load JS. Switching to FR (e2e `?locale=fr`) still loads FR copy.
5. Do not raise `FIRST_LOAD_BUDGET_KB`. Do not drop the plot exclusion or shrink the 12-seed calibration work. Charge path unchanged.

## Planned moves (measure after each if a step regresses)

1. Stop `AppBody` from importing `WireLoading` / wire strings. Wire's Suspense fallback uses a shell-local skeleton that does not import `@/apps/wire/strings` (same slot, no CLS). That also lets the Wire *detail* stay in the Wire chunk.
2. Make `settings` a lazy `APP_MODULES` entry with a retry boundary and `AppSkeleton` (or a same-size settings skeleton).
3. Lazy-load Broker **About** (`AssetPage` / News / Overview) until the player opens About; lazy-load **TicketReview** until review/placed. Each with a retry boundary and an in-slot skeleton. Open orders and the edit ticket stay eager (they are first paint).
4. Split the inactive locale out of first-load string tables (broker, and any wire/shell tables that otherwise remain in the first-load graph).
5. Confirm district / leaderboard / launchpad app bodies stay out of first-load; if a retry boundary is missing on those already-lazy apps, add the shared one. Remove duplicate deps / tighten heavy imports only where the after-measure shows a real cut.

If a listed move fails the hoisting test (counted gz rises or stays above 205), revert that move and try a different split rather than raise the budget.

## Acceptance

1. UNIT.md is written first (this file). After table in the handoff, same method as the before table, counted total ≤ 205.0 KB gz.
2. Exact-head checks: lint, typecheck, build, check-hooks, route-budget /broker, ledger map-no-dup, official `npm test`. Preview :3199 stays 200.
3. One broad affected e2e batch on a clean temp tree, fresh `.data`, desktop and phone: existing /broker and Wire batch plus every panel made lazy (Settings, Broker About, ticket review, Wire including detail, district, leaderboard, launchpad, and an onboarding/guide open if its chunk moved). Delete the temp tree.
4. Pre-push stray-init; normal push, no force, no PR. Evidence-only GK-HANDOFF.


## After (this unit) — 13 chunks, **196.4 KB** counted

Measured 2026-11-11 23:08 Europe/Paris, production `next start`, no e2e flags, BUDGET_PORT=3974 (inventory) and official `tools/ci/route-budget.mjs /broker` on 3917: both **196.4 KB** gz counted, lazy plot 59.3 KB excluded (cap 60). Inventory: `/workspace/avalon/evidence/launchpad/broker-headroom/after-chunks.tsv`. Budget cap stays **215 KB**.

| chunk | gz | counted? | what it is | vs before |
|---|---:|:---:|---|---|
| 01s_f_3qlcqtb.js | 70.3 KB | yes | react-dom / react | unchanged |
| 3i7bb4yv5vlj-.js | 44.4 KB | yes | Next router runtime | unchanged |
| 442124kmyz329.js | 19.3 KB | yes | Broker ticket, Open orders, chart chrome (EN only) | was 12.8 + 11.1; About/review/ack and FR dropped out |
| 1i0ie0s_wnl4f.js | 17.4 KB | yes | shell chrome, auth, feedback button, registry copy | was 27.1; Settings/Appearance body dropped out |
| 2lk6qxzqmtd1j.js | 15.0 KB | yes | asset catalog (HALC, names, base/vol/lot) | was 13.4 (re-chunked) |
| 002t9n4owrkkz.js | 11.3 KB | yes | hoisted shell/wire-boot/goal copy; Wire boot label only (no Wire string table) | was 17.4; FR tables and Wire detail copy dropped out |
| 2kzd2bib-2ux6.js | 8.5 KB | yes | Next prerender / cache client | unchanged |
| turbopack-3-ry682tkyiqk.js | 3.8 KB | yes | Turbopack runtime | unchanged |
| 0umf92h1sb77c.js | 3.4 KB | yes | Next layout router | unchanged |
| 1x6obpmlu1_c2.js | 1.9 KB | yes | Next error-page chrome | unchanged |
| 1y020fgwh_1zs.js | 0.6 KB | yes | chunk map (lazy app CSS/JS) | re-chunked |
| 185l4etpom5k4.js | 0.3 KB | yes | chunk map (plot) | re-chunked |
| 3kgx6wsko74_w.js | 59.3 KB | **excluded** | lightweight-charts plot (after chart mount; cap 60 KB) | unchanged |
| **Counted total** | **196.4 KB** | | | **−18.5 KB** vs 214.9; **8.6 KB** under the 205 target |

Official route-budget agrees: `13 chunks, 196.4 KB gz (budget 215 KB; lazy plot chunk 59.3 KB gz, cap 60 KB)`.

FR broker/wire/settings tables, Settings body, AssetPage/News, TicketReview/Ack, Feedback panel, Consent prompt, district/leaderboard/launchpad/Wire app, and GoalGuide are not in the first-load script list (only named in the small chunk maps, or absent until opened). The only French on first load is the two-word Wire boot label (`Chargement du fil`) used by the stringless shell fallback.

## `NEXT_PUBLIC_QUAY_E2E` scoping (Gatekeeper)

The first-launch consent prompt is skipped only in the official Playwright e2e artifact, so it cannot intercept taps or land in screenshot baselines. This is a **build-time** inline, not a runtime switch:

- `next.config.ts` always defines `NEXT_PUBLIC_QUAY_E2E` as `"1"` or `"0"` (same pattern as the other e2e hooks), so the bundler inlines a literal and folds the skip.
- Only `playwright.config.ts` `webServer.env` sets the flag to `"1"` (together with `QUAY_DS` / `QUAY_HOOKS` / mock flags).
- A normal no-flag production build (`npm run build`, route-budget, production `next start`) inlines `"0"` and the skip is dead-code-eliminated. Setting `NEXT_PUBLIC_QUAY_E2E=1` in the process environment of `next start` cannot turn consent off.
- `tools/check-hooks.mjs` treats `NEXT_PUBLIC_QUAY_E2E` like the other e2e hook names: a no-flag `.next` tree must not contain the string (0 hits on this head).

The `?telemetry_consent=1` query only *forces the prompt on* for the consent e2e; it cannot turn consent collection off.

## Not in this unit

Raising the 215 KB cap. Changing ticket or market behaviour. 05/13, Voices, 16:557, 18:204, POLICY/RECOVERY, 07/FX, meme-failure farm. No overall GO.
