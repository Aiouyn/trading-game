# Account continuation autofocus — Gatekeeper correction

The original proof below established Portfolio focus after activation, not automatic focus of Open Portfolio after registration. The old helper manually focused the button before Enter. A handoff claim of automatic arrival focus was unsupported; Gatekeeper observed BODY.

This follow-up uses the native button `autoFocus` behavior when the signed-in Account view mounts, after registration or sign-in. Shared Button behavior, authentication, the existing Portfolio navigation, and engine data are unchanged. The button remains the actual keyboard target; no wrapper is substituted.

`UNIT-FOCUS.md` was committed alone before follow-up code. The focused regression adds `document.activeElement` equality and reproduces BODY focus before the fix (`focus-followup/regression-before.log`). The real desktop/phone e2e now checks that same equality immediately after UI registration and UI sign-in, before any manual focus call. It presses Enter from that automatic focus. Existing manual focusing remains only for testing other navigation/reopen paths.

Exact follow-up check outcomes and tested SHA are recorded under `/workspace/avalon/evidence/ui-account-first-step/focus-followup/`: `final-checks/checks.json`, `e2e.log`, `FINAL-MANIFEST.json`, and screenshots. These supersede the historical result table below for the follow-up. The apt/--with-deps setup alone is explicitly omitted because cached Chromium/system libraries are already supported and apt refresh is unavailable. No source check or hook is edited or bypassed. Remote CI/Gatekeeper remain independent.

---

# Original Account first-step verification (historical)

Recorded 2026-11-11T18:13:29+01:00 Europe/Paris (UTC+1).
Branch: `ui/account-first-step`. Base: `110583b0aa73ece1dc3b856665f3be0405f1acc3`.
Implementation tested: `ff75e38bdef2173e2d7feaf1975a03c92c395278`. This evidence-only commit does not change application or test code.
`git fetch origin` confirmed that origin/eng/market-calibration equals the required base; the local init commit was not used.

## Player result

Fresh desktop and phone registration previously left **Sign out** as Account's only button. The technical save/server-clock paragraph dominated signup, with no starting-money goal in that screen. `UNIT.md` records the pre-code timestamp, audit, and spec citations: V1-BOARD:53–57; onboarding:15–18,131–134; UX:659–666.

Signup now names $10,000 in game money and the $20,000 goal. Signed-in Account offers **Open Portfolio** before Sign out, with the existing goal/first-trade guide as the next step. Full save/demo/world details remain in a native disclosure. English and French copy are provided. The action reuses and restores Portfolio, transfers keyboard focus, and places no order. Auth, engine, and guide behavior are unchanged.

## Checks

| Command | Result |
| --- | --- |
| `npm run lint` | Pass; 11 existing warnings, zero errors; contrast floors met |
| `npm run typecheck` | Pass |
| `npm run build` (no e2e flags) | Pass |
| `node tools/check-hooks.mjs .next/static .next/server` | Pass; 410 files, 59 patterns, zero hits |
| `BUDGET_PORT=3307 node tools/ci/route-budget.mjs /broker` | Pass; **214.4 KB gz** <=215; lazy plot 59.3 KB <=60 |
| `cd packages/engine/ledger && npm ci && npx vitest run test/map-no-dup.test.ts` | Pass; 13 tests |
| `npm test` | Pass; 2,331 passed, 2 skipped; 153 files passed, 1 skipped |
| Clean affected e2e, port 3306 | Pass; **36 passed, 10 project-specific skips**; all four new card cases pass |
| Ordinary production browser proof, port 3308 | Pass; desktop and phone, real UI signup, keyboard continuation, zero broker writes |

The e2e checkout `/workspace/avalon/ui-account-first-step-e2e` started at the tested commit with empty tracked status and no `.data`; it installed dependencies locally and ran the five specs listed in `VERIFICATION-MANIFEST.json`. New tests cover UI registration, save-details keyboard toggling, mode-specific copy, continuation without orders, focus, desktop singleton/collapse restore, a real first fill through the existing guide, logout/new-account isolation, French, 200% text, reduced motion, touch size, and Account overflow. Existing suites also exercise the shared quote feed, Portfolio, first-trade guide, and Settings.

## Real screenshot evidence

All files are under `/workspace/avalon/evidence/ui-account-first-step/`:

- `before/{desktop,phone}-01-signup.png` and `-02-after-register.png`: untouched required base, fresh player.
- `production/{desktop,phone}-01-signup.png`, `-02-after-register.png`, `-03-portfolio-guide.png`: ordinary production build, no test flags. The continuation is entirely in the viewport; phone target is 44px high. `production/proof.json` records focus, $10,000/$20,000 goal, empty orders/fills, and zero broker POSTs.
- `screenshots/{desktop,phone}-01-signup.png` through `-04-first-fill.png`: clean e2e signup → goal/guide → real first trade.
- `screenshots/{desktop,phone}-05-fr-scale2-account.png` and `-06-fr-scale2-portfolio.png`: French, 200% text, reduced motion.
- `VERIFICATION-MANIFEST.json`: exact commands, tested SHA, viewport sizes, and SHA-256 of each screenshot.

Screenshots were visually inspected. Settings' existing suite emits captures into tracked baseline paths; those outputs are retained under `existing-settings-captures/` and were restored only in this run's temporary checkout. They are not pixel-diff gates. No generated baseline update is in this branch.

## Notes and limits

Initial parallel build and ledger install hit transient inode exhaustion (`ENOSPC`). Original failure logs are retained as `build-enospc-attempt.log` and `ledger-install-enospc-attempt.log`; unchanged serial retries passed after pressure subsided. No other worktree was modified or cleaned. The unit suite's existing localhost:3000 refusal noise did not fail tests; no server was started there.

Broker has only 0.6 KB budget headroom. There are no known unresolved product blockers in this card. All owned preview listeners have been stopped. Delivery/push status is reported separately; no PR, merge, hook bypass, or deploy was performed.
