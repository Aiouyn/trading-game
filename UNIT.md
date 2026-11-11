# Card 5 — Broker entry import boundaries

Written: 2026-11-11T19:20:13+01:00 (Europe/Paris, CET), before implementation.
Base: `110583b0aa73ece1dc3b856665f3be0405f1acc3`.
Branch: `ui/broker-entry-split`.

## Player outcome
Keep the existing Broker screens, trading, indicators, table, drawings, About/News, settings, locale and focus behavior. Reclaim at least 10 KiB (10240 bytes) of counted first-load gzip on the exact base AND on approved cards 1–4, so later phone trading UX has real room. No new product feature in this card.

## Sources
- `export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md:678–687`: Broker first-load budget and stable charts/inputs (historical spec says 200 KB; repository's existing authoritative gate is 215 KB, unchanged).
- Same file `:824`: retain Settings About, licences/credits/integrity link.
- Same file `:828–830`: retain Broker first-trade, chart indicators and drawings; saving budget enables the later phone ticket, not implemented here.
- `docs/v1/V1-BOARD.md:42,53–56`: history/live within budget, first trade and ~390px mobile.

## Investigation and bounded design
Actual ordinary-production baseline, two fresh-page probes: 218932 counted gzip bytes, plot 60678 bytes. Evidence: `/workspace/avalon/evidence/ui-broker-entry-split/base-probe-*.json` and analyzer graph/attribution. Module compressed-size estimates are NOT measured route savings. The plot is already lazy and nearly at its 60 KiB exclusion cap; moving more code into that exclusion is not the solution.

The shell eagerly imports the entire inactive Settings app. Broker's eager Trade/About switch shares a module with About/News, and the shell Wire skeleton imports the full Wire dictionary just for its loading label. These are UI-only import boundaries, not missing engine data. Start with Settings using the existing per-app lazy/Suspense contract. If insufficient, separate the eager switch from the lazy About body and isolate the unchanged EN/FR Wire-loading label. Stop once the target is met; do not rewrite indicator, trendline, market or channel logic. Cold optional app loads may use the shell's existing generic loading skeleton, not a new design. Keep stable UI and navigation/focus outcomes identical after load.

Approved integration inputs (not moving branch tips):
1. `0814d8e3b721d59726c2df8b51bd9f0c559fa967`
2. `d1ce500958296e06fd18b1eaf942bfe252a0b41a`
3. `f6610d6a3d8f1c21bed264a2584eb9566a690173`
4. `1ef58ad0982d3798a10945287d73738073a674ca`

## Acceptance and proof
- UNIT-only commit first. New isolated worktree only; no packages/engine, market, economy, budget/helper, or hook edits. No push/PR/deploy.
- Normal lint, typecheck, build, check-hooks, locked ledger map-no-dup, npm test, unchanged route-budget gate. Exact two-probe asset gzip/SHA256 comparisons for own base and approved merged stack; >=10240 counted bytes saved on EACH and <=215 KiB. Explain hash/chunk regrouping honestly; no runtime speedup claim.
- Before/after desktop1440x900 and phone390x844 screenshots, unchanged production UI at deterministic state; retain original files and compare meaningful pixels/DOM. Exercise any affected optional views and account navigation.
- One fresh clean detached e2e worktree, fresh npm ci and .data; plain Chromium install, no apt/--with-deps (unprivileged apt unavailable, user explicitly omits only that step). Run Broker chart/table/candles/MA/BB/RSI/VWAP/trendline/storage and any affected About/settings/account e2e. Retain failed attempts honestly, delete temp checkout after evidence.
- Local disposable scratch integration only, pin exact approved SHAs, resolve docs-only conflicts preserving all unit/evidence documents, assert no source conflicts. Preserve measurements then delete scratch.
- Finish with committed clean worktree, exact HEAD/check/e2e/screenshot report; remote CI/Gatekeeper remain independent. Ports3300–3399 only; never3199/3102/3302. Queued phone focusPortfolio issue is out of scope.


## Gatekeeper recovery addendum — 2026-11-11T20:34:30+01:00 Europe/Paris
Written before recovery implementation; this addendum is its own UNIT-only commit on top of009f50bf. Owner steering: code PASS qualified, but a failed Settings or News lazy import currently escapes to generic Next error UI; browser Back from a first-history visit can leave the product. Do not address that by changing global navigation or eagerly importing the modules again.

### Ground and intended outcome
AppBody wraps module-level cached React.lazy instances only in Suspense; AssetPage does the same for News. Suspense handles waiting, not rejected imports. A reset around the same rejected lazy instance cannot recover because React caches its rejection. A legitimate offline/abort failure must be contained at the two optional module boundaries, leaving shell navigation and the rest of Broker usable. Retry must invoke a fresh lazy/import attempt, not reload the whole page or suggest history Back. Preserve existing skeletons, normal loaded visuals, parent draft state and EN/FR.

### Small shape and alternatives
Choose a small shared scoped lazy boundary, used ONLY for Settings and News. It owns a discriminated ready-with-lazy-component / failed state, the fresh lazy identity created at construction/retry, product-styled inline failure + Retry, and recovery focus. Caller supplies its existing import loader, typed component props, localized scope label, locale, and unchanged loading skeleton. No ordinary-success wrapper that changes Settings/News layout. A recovery-only visually hidden focus marker can focus the first loaded input/button/link or itself if there are no controls; do not steal focus if the player moved elsewhere while waiting. Initially failed first-history entry with BODY focus should land on Retry; News tab focus may stay on the still-live tab. No new order/server/engine logic, dependencies, budget limits, or preflight-test patch.

Rejected alternative: clear only an error-boundary flag around existing module-level lazy (permanent cached rejection); also reject browser reload/global Back handling or making Settings/News eager (hides the actual boundary failure and forfeits split savings). Task/arena tools are unavailable here; these are local design alternatives, not independent review claims.

### Proof and integration order
- First reproduce with a real production chunk-request abort on exact existing app source; preserve the red failure. New e2e aborts Settings and News chunks, verifies inline EN/FR recovery, real second network/import attempt after Retry, sensible focus, usable Broker/shell and preserved draft. Include first-history navigation and phone/desktop.
- Full lint, typecheck, build, check-hooks, unchanged route-budget, ledger map-no-dup and npm test (all GIT_* removed), clean fresh-.data e2e, real screenshots. Keep /broker delta tiny and record bytes; original >=10KiB savings target remains a regression guard where practical. No apt/--with-deps, no hook bypass, push, PR, deployment or spending.
- All new commits must be Forge (trading-game bot), forge@trading-game.local. Inspect log -3 before each commit and reject newly introduced fixture init/pf@test commits; preserve legitimate inherited009f50bf metadata.
- Merge order matters: apply Card5 registry/AppBody/type-test changes as one unit when combining approved cards1–4. Gatekeeper found old EagerAppId/LazyAppId expectations in app-modules.test.tsx needed reconciling in the 5-card stack; preserve Card5's all-built-apps-are-lazy test contract, not the pre-split Settings-eager assertion. Record exact integration test resolution and run merged-stack typecheck as well as budget, not build alone.
- Card6 is cleanly checkpointed at fc712431 (no push), with two documented e2e harness assumptions still to correct; finish this recovery batch first, then locally rebase Card6 onto the new exact recovery head, update its stacked-base UNIT, and re-verify. Report both final SHAs. Delete only recovery-batch temporary checkouts after capture; preserve both primary worktrees and evidence.

### Recovery implementation refinement and measured guard
The small factory retains a module-level successful lazy generation, so normal Settings remounts and News tab returns keep the previous synchronous-after-load behavior. Each scoped boundary owns its failure/focus state and generation reference; Retry renews only that failed generation, reusing an already-retried generation for another failed scope. Order/draft state stays outside. There is no success-path DOM wrapper. EN/FR, actual second chunk request and conditional focus are tested, not inferred from clearing a flag.

Recovery first-load increment is565 bytes on the exact009f50bf source (207793→208358),571 on the recorded approved1–5 stack (207937→208508). Full Card5 saving from110583b0 remains10574 bytes on its own and11211 on approved1–4, above10240; plot remains60678 bytes. The all-lazy app-modules.test.tsx on recorded stack5f03d95b is already byte-identical to Card5; the recovery merge needed no further test resolution. Do not revive the removed EagerAppId/LazyAppId assertions when merging from another order. Merged-stack typecheck, npm test and unchanged budget passed; exact inputs, hashes and results are in the recovery evidence directory.
