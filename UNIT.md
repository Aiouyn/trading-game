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
