# Broker ticket entry evidence

Recorded 2026-11-11T17:59:22+01:00 Europe/Paris (UTC+1).
Branch `ui/broker-ticket-entry`. Implementation tested at `1a24a71e089cb191bd034d7137de5ac26c067f91`.
Base `110583b0aa73ece1dc3b856665f3be0405f1acc3`.
The final evidence commit changes documentation only.

## Scope

The Broker has a "Go to order ticket" button above the chart on phone and narrow desktop windows.
The button scrolls to the existing ticket and moves keyboard focus to its labelled group.
The wide desktop layout has no extra button. About has no ticket target.
The button does not change the draft, preview an order, or place an order.
EN and FR labels use the existing Broker strings.

Only three application files change: `src/apps/broker/BrokerFrame.tsx`, `src/apps/broker/broker.css`, and `src/apps/broker/strings.ts`.
The remaining changes are `UNIT.md`, this evidence reference, and `tests/e2e/17b/broker-ticket-entry.spec.ts`.
No engine, economy, market, server, dependency, or budget threshold changes.

## Card selection and base

`UNIT.md` contains the pre-code timestamp and spec citations.
The fresh-player base audit covered UI registration, the goal and guide, first trade, review, fill, Portfolio, and Positions.
On phone 390x844 the original quantity field began at y=1061.94 and Review order at y=1212.44.
The final no-flag production button begins at y=306.38 and is 44px high.
The wide desktop quantity and Review positions remain unchanged.
These coordinates are browser geometry measurements, not human timed-playtest results.

`git fetch origin` confirmed `origin/eng/market-calibration` points exactly to the base SHA.
The local market-calibration worktree and its extra `492d60e4` commit were not used or changed.
Existing goal, Portfolio, PWA, Wire, indicator, and resize branches were checked before card selection.

## Checks

All final commands exited 0. Logs are under `/workspace/avalon/evidence/ui-broker-ticket-entry/`.

| Check | Command | Result | Log |
| --- | --- | --- | --- |
| Lint | `npm run lint` | Pass, 11 existing warnings and no errors | `lint.log` |
| Types | `npm run typecheck` | Pass | `typecheck.log` |
| Production build | `npm run build` | Pass, no e2e flags | `build.log` |
| Production hooks | `node tools/check-hooks.mjs .next/static .next/server` | Pass, 410 files and 0 hits | `check-hooks.log` |
| Broker budget | `BUDGET_PORT=3303 node tools/ci/route-budget.mjs /broker` | Pass, 213.9 KB gz against 215 KB | `route-budget.log` |
| Duplicate definitions | `npx vitest run test/map-no-dup.test.ts` in `packages/engine/ledger` | Pass, 13 tests | `map-no-dup.log` |
| Unit suite | `npm test` | Pass, 2331 passed and 2 skipped. 153 files passed and 1 skipped | `test.log` |
| Affected browser suite | `npm run e2e -- tests/e2e/17b/broker-ticket-entry.spec.ts tests/e2e/17b/M2-01-first-trade.spec.ts tests/e2e/17b/M1-06-broker-orders.spec.ts tests/e2e/17b/M1-08-portfolio.spec.ts tests/e2e/17b/BR-4.spec.ts --workers=1` | Pass, 46 passed and 10 project-specific skips | `e2e.log` |

The browser suite ran with `CI=1 E2E_PORT=3302` in `/workspace/avalon/ui-broker-ticket-entry-e2e`.
Before the run, `git status --porcelain` was empty and `.data` did not exist.
The production build came from Playwright's configured build command. The real-session journeys assert signed-in chrome, server tick provenance, and the saved fill.
The tests cover keyboard focus, untouched drafts, no request on initial navigation, explicit review and Place, real fills and Portfolio positions, French, 200% text, reduced motion, hit sizes, and no horizontal overflow.
The existing BR-4 suite also passes its focus-trap, one-intent, axe, contrast, and pending-order checks.

The budget measurement counted 14 script chunks. It excluded the lazy plot's 59.3 KB gz under the existing 60 KB cap.
Two runs both measured 213.9 KB gz. `route-budget-run1.log` preserves the first run.
The plain-byte budget is a bundle-size check, not a runtime speed claim.

## Screenshots and reports

All paths below are relative to `/workspace/avalon/evidence/ui-broker-ticket-entry/`.

- `before/phone-03-broker-entry.png`, `before/desktop-03-broker-entry.png`, and `before/audit.json` record the unmodified base.
- `production/phone-03-broker-entry.png` shows the visible entry in a no-flag production build.
- `production/phone-03b-ticket-entry-target.png` shows its focused destination.
- `production/desktop-03-broker-entry.png` shows the unchanged wide layout.
- `production/` also contains UI registration, goal, review, fill, Portfolio, Positions, and the repeatable local browser script.
- `screenshots/desktop-entry.png` and `screenshots/desktop-ticket.png` show the 520px window.
- `screenshots/phone-entry.png`, `screenshots/phone-scale2-entry.png`, and `screenshots/phone-scale2-ticket.png` show phone layouts.
- `screenshots/phone-french-ticket.png` and `screenshots/desktop-french-ticket.png` show French.
- `playwright-report/index.html` and `test-results/` contain the final browser report.
- `run1/` preserves the initial failed test run. Its new test used the isolated request fixture instead of the browser's session and an incorrect exact Back label. The test fixtures were corrected. No application change was needed for those failures.

## Delivery status

Implementation and checks are complete locally. The branch has not been pushed.
A normal `git push -u origin ui/broker-ticket-entry` remains pending explicit owner authorization through the coordinator.
No PR, Gatekeeper handoff, merge, deployment, purchase, or hook bypass occurred.
A human timed playtest remains a separate gate. Automated script durations are not a substitute.
