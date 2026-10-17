# Phase 10 integration record — 2026-10-14

Phase 10 is integrated into the working tree of `p10/integration` at
`C:/Users/Mathis/Projects/trading-game/.claude/worktrees/p10-integration`.
The branch HEAD remains `e5aabb110b919fb952f8b6ac93900225662bfa61`. There is **no new commit**: this sandbox cannot write
`C:/Users/Mathis/Projects/trading-game/.git/worktrees/p10-integration/index.lock` (Permission denied).
All application, conflict resolution and staging used an index and object store in Temp. The real integration index is unchanged;
normal `git status` therefore shows tracked modifications and new untracked source/test/document files.

No source branch, `v1`, or `ux/win-all` was committed, merged or pushed. No dependency was installed, deleted or linked;
shared `node_modules` was read only for documentation. No browser, server, cloud command, simulation, background job or process kill was run.
The requested model switch could not be confirmed because this session exposes no active-model switching control.

## Source capture and provenance

Source snapshots used temporary Git indexes (`read-tree HEAD`, tracked updates, explicit allowlisted untracked source/test paths)
and temporary object directories with the repository object directory as a read-only alternate.
Committed patches start at the actual common merge base `27f643769ec1bba1adf664a1fcd998d622294f3e`;
dirty patches start at each source HEAD. This retains the integration base’s already accepted R-10-1b ruling.
The four real source indexes, HEADs, statuses and dirty-file SHA-256 hashes were verified unchanged after application.
Ignored test-results, generated output and secrets are absent from the captured path lists.

Archive: `C:/Users/Mathis/AppData/Local/Temp/p10-integration-BUU4wD`.

| Source | Exact HEAD | Tracked dirty files | Intended untracked files |
|---|---|---:|---:|
| `p10-fill` | `5385375afeb2a25d0b6a8f8f4dad2f271d8fa493` | 15 | 3 |
| `p10-chart` | `f519c9911b8193e8ac3dc4d3063858c2cbfe02d2` | 14 | 3 |
| `p10-lp` | `b165d97a399f7edba680ad395f39b2cd63d9bec2` | 12 | 1 |
| `p10-fix` | `55ec9f1deacae4d1d0a1ce3ce639e2de4bad9859` | 16 | 2 |

Each source has `<source>.committed.patch`, `<source>.dirty.patch`, and `<source>.original-staged.patch` (all binary/full-index Git diffs).
`manifest.json` records initial statuses, hashes, snapshot trees, untracked allowlists and the source commit lists.
`provenance.json` also records all effective source paths. `audit.json` records preservation and integration comparisons.
`integration.final.patch` captures the complete integrated result, including new files, against the integration base.
The source patches and final binary patch are replayable without the temporary indexes or object directories.

### Exact source commits included as deltas

#### p10-fill

- `b14c1ca6b11cf15713a012348c097ac3fefd8f0a` — feat(engine): fills pay the quote plus their own impact; per-share fees; fractional shares (R-10-1, R-10-2, R-10-4)
- `670c99a79ddba5fd74fd2a68b5f9d2aa7ba5efed` — feat(broker): the ticket shows est. fill, spread, impact and fee apart; one price formatter; fractional sizes (R-10-1, R-10-3, R-10-4)
- `de9e12d09c67348e12accf3fc1a7f9ae6dcc140d` — feat(broker): the watchlist, the positions and the chart's OHLC read the asset's own price precision (R-10-3)
- `0c59e3fca9b2c471f350e323358d872c378a33e8` — test(engine): a save with no ownImpact or impactTally loads, trades and prices (old snapshots, R-10-1)
- `239b8cf4d37a2a759150bbbbddc4ecd34675c58e` — fix(world): recurring buys, DRIP and blocks size in the share step, and dollar buys size to the estimate (R-10-4, R-10-1)
- `038ff2fa9aa1f4bbe326a82deebbd63a04c1de15` — fix(broker): the per-share fee label fits one line in French; the full rule is the row's hover text (R-10-2)
- `4af04eda746000f1fc39121176f230c4d7a59880` — docs: V1 Phase 10 section 10A (fills, fees, spreads, precision, fractional shares; tests, gates, rulings needed)
- `f76555ccb7cabad59c7641027999eae22879facb` — docs: R-10-1b, splitting an order across accounts is accepted (alts are a recorded limit)
- `5385375afeb2a25d0b6a8f8f4dad2f271d8fa493` — fix(broker): every price reads the asset's own precision; fund and plan previews price under their own account (R-10-1, R-10-2, R-10-3, R-10-4)

#### p10-chart

- `7122f67b85909b3e698c2104dac9b4a2b068ccee` — feat(broker): TradingView timeframes 1m to 1M, independent of the range
- `c04704c83ce4d6a33af93f2a77b48beb37e7127d` — feat(broker): chart drawings saved per player per symbol on the server
- `5959af8512f8c37f6d5d18f155cb17c5e3350660` — feat(broker): drawing tools, the position tool, and order lines on the chart (R-10-5)
- `f519c9911b8193e8ac3dc4d3063858c2cbfe02d2` — docs: V1 Phase 10 section 10B, the Broker chart (R-10-5): status by part, gates, deviations and what is not done

#### p10-lp

- `f797be0387fa3edd2dd9dd2b2220478f75413be7` — feat(launchpad): pump.fun board, token page, replies and holders (R-10-6)
- `c881c72cfa02d884c9d0c9f600b0ce634f7c8567` — fix(launchpad): figures stay on one line and inside the window on phone (R-10-6)
- `70b3f2f61e28e3467fb81421cf41ee24141b4f49` — fix(launchpad): trades table figures do not count padding as a wrap; e2e reply count (R-10-6)
- `38db430849da12c93e9b9bd29d7d3be945acfac6` — fix(launchpad): review of R-10-6: real candles, link and profanity refusal, reply count, NPC lines by status, bump feed, DEX price notation
- `b165d97a399f7edba680ad395f39b2cd63d9bec2` — docs: Phase 10 10C on 38db430 (review pass, gates, Playwright, screenshots)

#### p10-fix

- `92463abff0a2fe121e9ae59197a13c5b46e49d58` — fix(returns): one basis for the day change, the header and the close (R-10-7)
- `231835fc9b731e34833e00a1ba57e2cab149d82b` — fix(realism): R-10-7 items 2-8 (legal lines, company build-up, French audits, rival ladder, auction bands, desk subscription, wire quote repeats, arrival base)
- `efa05aaf4bbe0aecaf0d1080aa90f9d016796c9d` — test(p10): R-10-7 screens spec (desk, rivals, portfolio, legal, auctions in en and fr); doc 10D.5 and residuals
- `9dcea49690643e5a8c3313f3a2b0be4779e84682` — docs(p10): 10D.6 timeouts are load, not assertions (the five files pass with a 10-minute timeout: 37 passed)
- `55ec9f1deacae4d1d0a1ce3ce639e2de4bad9859` — fix(i18n): French thousands take a no-break space, not U+202F (R-10-7 review 2)

### Intended untracked source/test files captured

- `p10-fill`: `src/components/apps/broker/ticketSizing.test.ts`, `src/components/apps/broker/ticketSizing.ts`, `tests/e2e/p10FillShots.spec.ts`
- `p10-chart`: `src/components/apps/broker/chart/PositionPanel.test.tsx`, `src/components/apps/broker/chart/drawingStore.test.ts`, `src/components/apps/broker/chart/useDrawingKeys.test.ts`
- `p10-lp`: `src/world/launchpad/tape.ts`
- `p10-fix`: `src/components/apps/legal/LegalApp.test.tsx`, `src/world/auction-draw.test.ts`

## Conflicts and implementation review

| Delta | Conflicting path | Resolution |
|---|---|---|
| chart committed; LP committed; fix committed | `docs/V1-PHASE10.md` | Combine sections 10A–10D; retain every complete final source section and all historical evidence. |
| chart committed | `src/components/apps/broker/LevelLayer.tsx` | Keep fill’s asset class and tick precision plus chart’s `close` action. |
| chart committed | `src/components/apps/broker/PriceChart.tsx` | Keep fill’s asset formatter and minMove plus chart timeframes, independent range presets, log/percent modes and drawing layer. |
| chart dirty | `src/components/apps/broker/LevelLayer.tsx` | Keep asset-specific rounding plus chart’s nonpositive/nonfinite rejection and primary-button guard. |
| fix committed | `src/game/format.ts` | Keep asset rules/DEX formatting plus French U+00A0 grouping. |

All other overlapping paths applied without textual conflicts. Both implementations were retained in holdings/portfolio price
formatting and rank/arrival copy; ticket fees and French refusals; chartLevels drag math and asset ticks; history pins;
i18n keys; and the world’s drawing commands, Launchpad reply dispatch, player fields and auction compatibility fields.
The English and French dictionaries both parse, contain 6132 keys, and have identical key sets and placeholder names.
No unresolved conflict stages or conflict markers remain; the temporary index’s complete `git diff --cached --check` passes.

### Chart formatting handoff completed in code

- `src/components/apps/broker/PriceChart.tsx`: asset-specific custom format/minMove on candle, line, area, all price study series
  and price overlays. Price studies and overlays receive the format at creation and again when class, magnitude or locale refreshes.
  RSI has its own numeric formatter (`dec`, one decimal, 0.1 minMove); volume retains `type: volume` and its separate scale.
  No chart-wide price formatter can overwrite RSI or volume. Percentage labels use the library’s separate percentage formatter
  with `pctUnit()`. An explicit `assetClass` prop overrides registry lookup for external price series.
- `src/components/apps/broker/ChartCard.tsx`: forwards the resolved asset class, retaining close/order/drawing controls.
- `src/components/apps/broker/chart/DrawingLayer.tsx`: drawing price labels use the asset class; Fibonacci percent labels use
  localized decimals and percent spacing. All original placement, drag cancellation and right-click behavior remains.
- `src/components/apps/broker/chart/PositionPanel.tsx` and `geometry.ts`: bracket placement rounds on asset-specific price ticks;
  quantity sizing uses the fill ticket’s quantityGrid. A configured engine step of zero means unrestricted quantity, so it no
  longer disables crypto/FX position placement. Preview, sent quantity and quantity copy share that grid. Fees use the selected account.
- `PositionPanel.test.tsx`: the engine mock now preserves actual exports needed by the integrated formatter and quantity grid.
  Original assertions remain, with new FX/crypto placement regressions. `geometry.test.ts` adds FX/memecoin tick assertions.
  These new regressions are **unrun** because integration dependencies are absent.

### Binding decisions retained

- **R-10-1b:** unlinked-account split acceptance remains. Temporary impact stays per account; shared permanent mid movement and
  linked-account surveillance remain. No shared temporary charging was restored and no superseded skipped laws were re-enabled.
- **Trade privacy:** public tape/bar/holder/reply views retain token-specific anonymous ids. Player trade handles and raw account ids
  are not added. Creator identity remains public only on founder/card/header surfaces; NPC handles remain fictional.
  `src/world/launchpad/anon.ts` now explicitly flags the unkeyed hash: known account ids can be matched and six-hex ids can collide.
  This is pseudonymization, not a secrecy guarantee. Keying/rotation remains outstanding.

### Bounded B2B receivables review — unresolved spec gap

R-10-7 explicitly specifies consumer near 1 day and B2B 30. The source implementation (`src/content/company.ts`) has consumer 1
and all five B2B sectors 10. `src/world/company/company.ts` still assigns `arNew = receivableDays * revenue` for today’s revenue.
This is an aggregate days-of-sales approximation, not an invoice aging schedule, and it is **not bounded by earned-to-date sales**.
On a first B2B sale from zero receivables, 10× revenue is booked as AR and revenue − ΔAR is −9× revenue; changing only 10 to 30
would make that −29× revenue. The strengthened source tests verify ledger identities, not a 30-day payment contract or this bound.
The prior company spec `docs/team/specs/quant-company-building.v1.6.1.md` §1 defined DSO 10; Phase 10’s binding 30-day ruling supersedes it.

The integration preserves this source economics and records it as incomplete. No new advance/deposit terms, customer payment
schedule, founding-capital grant or settlement clamp was invented. The earlier 13 affected company tests and founding-capital
decision remain open (10D.2). A bounded model must still be reviewed against the explicit 30-day contract, save compatibility,
cash/ledger conservation and the company/IPO/debt/funding/commerce/exploit/determinism fixtures before acceptance.

## Independent-window UX handoff retained

`ux/win-all` remains at `7104523825527bb8fc6f1b00fde0f7c683194bc1` and is not merged.
Its Broker retarget/fresh-open/phone handling, minimize/focus/window tabs, window management and account-strip changes remain
on that branch for later integration. Preserve its `BrokerApp.winId`, pickBroker and phone navigation, appViews winId wiring,
window manager/store actions, short-layout Review button, phone screens and shell/account tests when integrating later.

Expected later overlaps are `src/components/Holdings.tsx`, `src/components/Portfolio.tsx`,
`src/components/apps/broker/BrokerDock.tsx`, `TradeBar.tsx`, `src/components/os/OsUpdate.tsx`, and the two dictionaries.
Keep Phase 10 fee/precision/French changes together with the UX targeting, counter/Review/account behavior.
The later UX branch predates R-10-1b: its apparent five-line deletion of `docs/team/specs/lead-phase10.md` must not erase the accepted ruling.
Only Phase 10’s source-owned `OsUpdate.tsx` rank translation and `ResearchDesk.tsx` subscription copy are integrated under `components/os`.
Launcher/PhoneRecents asset-price forwarding remains a UX handoff. The current Phase 10 chart controls still use the original global
range/interval/mode state; per-window chart-state isolation is not claimed by this integration.

## Validation and remaining acceptance

| Check | Current integration result |
|---|---|
| Source HEAD/index/status/dirty-byte and patch-hash preservation | All four unchanged |
| Source-only paths compared to captured snapshot trees | No unexplained mismatch; intentional chart/privacy edits listed above |
| Complete source document sections | All four retained |
| JSON parse, en/fr key and placeholder parity | Pass; 6132 keys per locale |
| Full integrated whitespace/conflict audit | Pass |
| Typecheck / lint / Vitest | **Blocked and not run: local node_modules absent** |
| Browser/e2e/visual acceptance | Not run; requested local ENOMEM restriction |
| Full suite, long simulations, universe/ecology/wealth and Launchpad economy gates | Not run |

Per the dependency instruction, work stops after integration; no install/link/deletion or ancestor-dependency testing was attempted.
Repository AGENTS was read. Next use-client and TypeScript guides were read from the existing ancestor dependency directory;
Lightweight Charts 5.2.1 typings and implementation were read to confirm the separate percentage formatter and per-series formats.
Historical source passes in 10A–10D are not fresh integration passes. No expectations, timeouts or skips were relaxed during integration.

### Required follow-up commands once the integration has dependencies

Run in this integration worktree, foreground only. These commands were **not executed**.

```powershell
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src server tests
# Vitest’s process-local Temp override and runner loader avoid writing auth/config/cache into shared dependencies.
$env:LOCALAPPDATA = $env:TEMP
node node_modules/vitest/vitest.mjs run src/engine/fill-realism.test.ts src/engine/fill-accounts.test.ts src/engine/priceRules.test.ts src/engine/trading.test.ts src/components/apps/broker/ticketSizing.test.ts src/components/apps/broker/ticketMath.test.ts src/components/apps/broker/chartLevels.test.ts src/game/format.fr.test.ts src/game/format.price.test.ts src/world/plans.test.ts --maxWorkers=2 --configLoader=runner --cache=false
node node_modules/vitest/vitest.mjs run src/components/apps/broker/chart src/game/chartRanges.test.ts src/world/drawings.test.ts src/world/drawings-command.test.ts src/world/orders.test.ts --maxWorkers=2 --configLoader=runner --cache=false
node node_modules/vitest/vitest.mjs run src/world/launchpad src/components/apps/launchpad src/world/text src/i18n --maxWorkers=2 --configLoader=runner --cache=false
node node_modules/vitest/vitest.mjs run src/world/auction-draw.test.ts src/world/auction-bands.test.ts src/world/auctions.test.ts src/world/view-memo.test.ts src/world/returns-basis.test.ts src/world/court-filing.test.ts src/world/company/receivables.test.ts src/world/company/company.test.ts src/world/rivalsBoard.test.ts src/components/apps/legal/LegalApp.test.tsx --maxWorkers=2 --configLoader=runner --cache=false
node node_modules/vitest/vitest.mjs run src/engine/selfimpact.test.ts src/engine/companyHooks.test.ts -t "self_impact_clip_ratio.*defaultConfig|a world with no company stocks" --maxWorkers=2 --configLoader=runner --cache=false
```

Browser acceptance remains desktop/phone, en/fr, stock/FX/major crypto/memecoin axes, crosshair and study pointer labels,
RSI/volume isolation, log/percent/auto/range gestures, position brackets (market/limit/stop), direct server-order drag assertions,
drawings save/reload/account isolation, Launchpad create/moderation/replies/public anonymous tape, and realism screens.
Phone drawing toolbar and position-panel placement remain original chart residuals. Drawing movement’s existing 1e-6 price floor
also needs a memecoin review. Position buying-power caps remain reference-notional caps and may still be refused after execution costs.
The $100 Launchpad fee still needs its held-out economy gate; universe ecology and wealth smoke also need new integration evidence.
No cloud/browser/long-run jobs were launched to satisfy those outstanding checks.

## Exact integrated paths

The following 167 paths differ from integration HEAD (including this record).

```text
docs/V1-PHASE10-INTEGRATION.md
docs/V1-PHASE10.md
server/index.ts
src/components/Holdings.tsx
src/components/Overlays.tsx
src/components/Portfolio.tsx
src/components/Profile.tsx
src/components/Social.tsx
src/components/apps/bank/BankApp.tsx
src/components/apps/broker/AssetPanel.tsx
src/components/apps/broker/BrokerDock.tsx
src/components/apps/broker/ChartCard.tsx
src/components/apps/broker/LevelLayer.tsx
src/components/apps/broker/OptionChain.tsx
src/components/apps/broker/OrderTicket.tsx
src/components/apps/broker/PlansCard.tsx
src/components/apps/broker/PriceChart.tsx
src/components/apps/broker/RivalsCard.tsx
src/components/apps/broker/TradeBar.tsx
src/components/apps/broker/Universe.tsx
src/components/apps/broker/chart/DrawingLayer.tsx
src/components/apps/broker/chart/DrawingPanel.tsx
src/components/apps/broker/chart/DrawingToolbar.tsx
src/components/apps/broker/chart/PositionPanel.test.tsx
src/components/apps/broker/chart/PositionPanel.tsx
src/components/apps/broker/chart/drawingStore.test.ts
src/components/apps/broker/chart/drawingStore.ts
src/components/apps/broker/chart/geometry.test.ts
src/components/apps/broker/chart/geometry.ts
src/components/apps/broker/chart/risk.ts
src/components/apps/broker/chart/useDrawingKeys.test.ts
src/components/apps/broker/chart/useDrawingKeys.ts
src/components/apps/broker/chartLevels.test.ts
src/components/apps/broker/chartLevels.ts
src/components/apps/broker/ticketMath.test.ts
src/components/apps/broker/ticketMath.ts
src/components/apps/broker/ticketSizing.test.ts
src/components/apps/broker/ticketSizing.ts
src/components/apps/company/Overview.tsx
src/components/apps/company/capital/Equity.tsx
src/components/apps/company/capital/Money.tsx
src/components/apps/company/capital/Trading.tsx
src/components/apps/company/labels.ts
src/components/apps/exchange/IposTab.tsx
src/components/apps/exchange/StocksTab.tsx
src/components/apps/journal/JournalView.tsx
src/components/apps/launchpad/Board.tsx
src/components/apps/launchpad/CandleChart.test.ts
src/components/apps/launchpad/CandleChart.tsx
src/components/apps/launchpad/CreateTab.tsx
src/components/apps/launchpad/CurveChart.tsx
src/components/apps/launchpad/FeedTab.tsx
src/components/apps/launchpad/LaunchpadApp.tsx
src/components/apps/launchpad/Ticket.tsx
src/components/apps/launchpad/TokenPage.tsx
src/components/apps/launchpad/TokenSections.tsx
src/components/apps/launchpad/copy.test.ts
src/components/apps/launchpad/copy.ts
src/components/apps/legal/LegalApp.test.tsx
src/components/apps/legal/LegalApp.tsx
src/components/apps/practice/SandboxDesk.tsx
src/components/apps/sixd/AuctionsPanel.tsx
src/components/os/OsUpdate.tsx
src/components/os/ResearchDesk.tsx
src/content/company.ts
src/content/learning.ts
src/content/rivalLadder.ts
src/engine/altpeak.test.ts
src/engine/companyHooks.test.ts
src/engine/config.ts
src/engine/fill-accounts.test.ts
src/engine/fill-realism.test.ts
src/engine/huge.test.ts
src/engine/hunt-helpers.ts
src/engine/impact-day.test.ts
src/engine/impact-tally.test.ts
src/engine/index.ts
src/engine/priceRules.test.ts
src/engine/priceRules.ts
src/engine/selfimpact.test.ts
src/engine/sim.ts
src/engine/trading.test.ts
src/engine/trading.ts
src/engine/types.ts
src/engine/universe.ts
src/game/chartRanges.test.ts
src/game/format.fr.test.ts
src/game/format.price.test.ts
src/game/format.ts
src/game/game.test.ts
src/game/history.ts
src/game/store.ts
src/i18n/en.json
src/i18n/engineFr.ts
src/i18n/fr-groups.test.ts
src/i18n/fr-realism.test.ts
src/i18n/fr-screens.test.ts
src/i18n/fr.json
src/i18n/tokens.test.ts
src/i18n/tokens.ts
src/net/client.ts
src/net/protocol.ts
src/world/auction-bands.test.ts
src/world/auction-draw.test.ts
src/world/auctions.test.ts
src/world/auctions.ts
src/world/close.test.ts
src/world/close.ts
src/world/company/company.ts
src/world/company/ipo.ts
src/world/company/receivables.test.ts
src/world/court-filing.test.ts
src/world/court.ts
src/world/drawings-command.test.ts
src/world/drawings.test.ts
src/world/drawings.ts
src/world/exchange/view.ts
src/world/game.ts
src/world/launchpad/anon.ts
src/world/launchpad/bars.ts
src/world/launchpad/commands.ts
src/world/launchpad/constants.ts
src/world/launchpad/flow.ts
src/world/launchpad/graduate.test.ts
src/world/launchpad/graduate.ts
src/world/launchpad/icon.ts
src/world/launchpad/launch.ts
src/world/launchpad/lpReview10.test.ts
src/world/launchpad/moderate.ts
src/world/launchpad/pump.test.ts
src/world/launchpad/reply.ts
src/world/launchpad/rug.ts
src/world/launchpad/tape.ts
src/world/launchpad/trade.ts
src/world/launchpad/types.ts
src/world/launchpad/view.test.ts
src/world/launchpad/view.ts
src/world/ledger.ts
src/world/news.ts
src/world/plans.test.ts
src/world/plans.ts
src/world/players.ts
src/world/research-desk.hunts.test.ts
src/world/returns-basis.test.ts
src/world/rivalLadder.test.ts
src/world/rivalLadder.ts
src/world/rivalsBoard.test.ts
src/world/rivalsBoard.ts
src/world/sponsor.ts
src/world/text/copy.test.ts
src/world/text/exec-distinct.test.ts
src/world/text/lpReplies.ts
src/world/text/roles.ts
src/world/tournament.test.ts
src/world/types.ts
src/world/view.ts
src/world/work.test.ts
src/world/work.ts
tests/e2e/brokerChartShots.spec.ts
tests/e2e/brokerDrawings.spec.ts
tests/e2e/brokerPosition.spec.ts
tests/e2e/brokerTimeframes.spec.ts
tests/e2e/launchpadLayout.spec.ts
tests/e2e/launchpadPump.spec.ts
tests/e2e/launchpadShots.spec.ts
tests/e2e/p10FillShots.spec.ts
tests/e2e/p10Fix.spec.ts
```
