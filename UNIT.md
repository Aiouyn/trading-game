# UI unit: Account first step

Written before application code: 2026-11-11T18:04:31+01:00 Europe/Paris (UTC+1).
Base: `110583b0aa73ece1dc3b856665f3be0405f1acc3`.
`git fetch origin` confirmed origin/eng/market-calibration still points exactly to that SHA. The market-calibration worktree and its extra init commit are untouched.

## Player outcome
A new player understands the game-money starting balance and goal before creating an account, then sees a clear way to continue into Portfolio and the existing first-trade guide.
The account screen keeps its save/demo explanation available without forcing a technical paragraph into the first 30 seconds.

## Observed friction and choice
The first card addressed the hidden phone Broker ticket. This card starts separately at the same base and does not include that shortcut.
The original fresh-player audit showed a long technical account paragraph and no signup goal. A second untouched-base playtest on port 3305 with fresh .data recorded immediate registration completion at desktop 1440x900 and phone 390x844.
On both layouts the only button after registration was Sign out. The phone showed no goal and no route to the first-trade guide within Account. The player had to discover how to leave Settings. Desktop still had Settings over the game.
Evidence: `/workspace/avalon/evidence/ui-account-first-step/before/` contains signup-audit.mjs, signup-audit.json, and desktop/phone screenshots before and immediately after registration.

Existing branches checked: eng/m1-01-auth-session owns auth/session correctness. eng/first-trade-goal owns Portfolio's goal/guide and phone Home entry. Neither adds Account's onboarding copy or a signed-in continuation action. No auth protocol or guide behavior changes are planned.

## Spec citations
- `docs/v1/V1-BOARD.md:53-57`: 30-second clarity, first trade within two minutes, visible grow-$10k goal, and phone support.
- `export/vision-review/complete/18-ONBOARDING-ACADEMY.md:15-18`: first session and legible explanations.
- Same file `:131-134`: real data, one sentence per prompt, no automatic orders or advice.
- `export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md:659-666`: text scaling, keyboard play, and cognitive accessibility.

## Acceptance checks
1. Signup names the $10,000 in game money and $20,000 goal in one sentence. Demo trades are visibly labelled as not saved.
2. The existing full save/demo/server-clock text remains available through a keyboard-accessible disclosure, closed by default.
3. Signed-in Account shows an Open Portfolio action before Sign out. It opens or restores Portfolio without duplicating it, preserves the existing account balance and drafts, and transfers keyboard focus into Portfolio.
4. The button only navigates. It creates no preview, order, or fill. Registration validation, login/logout, identity isolation, and existing first-trade guide remain intact.
5. Desktop, phone 390px, French, 200% text, and reduced motion are usable with no horizontal overflow and >=44px touch targets.
6. Run npm run lint, npm run typecheck, npm run build, node tools/check-hooks.mjs .next/static .next/server, route-budget /broker <=215 KB gz, ledger map-no-dup, and npm test.
7. Run affected e2e in a clean isolated checkout with fresh .data on a port in 3300-3399. Save real screenshots under `/workspace/avalon/evidence/ui-account-first-step/`.
8. Commit normally. No PR, merge, force-push, hook bypass, deploy, or spending. Report delivery status honestly.

## Addendum: layout-agnostic phone trade step (Gatekeeper, Card 2 + Card 6 merge)
Card 6 (ui/broker-trade-sheet) removes the inline phone ticket: on phone, Quantity/Review/Place live in a modal bottom sheet opened by the Trade button, and the sheet must be closed before the shell chrome (account chip) is reachable. The first-fill step in tests/e2e/settings/account-first-step.spec.ts filled the inline field, so the 2+6 merge failed on phone (evidence ui-broker-fill-feedback/stack-clean-e2e-attempt1-b13b054f and stack-*-474a01c4).
Change only the spec's trade step: if the Broker shows the Trade button, open it, use the sheet for Quantity/Review/Place/receipt, then close the sheet; otherwise use the inline ticket exactly as before. Every existing assertion (Review enabled, Place enabled, "Bought 1 HALC" receipt, goal stage done, logout, second account) stays, scoped to wherever the ticket is. No product code. Must pass on this branch's own base and on scratch 2+6 and full 7-card merges.

## Addendum 2 (Gatekeeper, after b11da41c qualified): deterministic ticket path
b11da41c chose the path from `br-trade` presence at one instant, which can race the Broker render and would silently take the inline path if the sheet ever failed to mount. Now:
- Wait for the Broker ready signal (`data-state="live"`, asset selected) before anything ticket-related.
- Decide the path from the project and the build under test, not the DOM: phone AND the build ships the phone Trade sheet (`src/apps/broker/PhoneTradeSheet.tsx`, Card 6) => the sheet path, and the Trade button MUST be visible; otherwise (desktop, or a build without Card 6 such as this branch's own base) => the inline path, and the Trade button must be absent.
- Assert the path that ran: sheet path => Trade visible, no inline Quantity in the Broker body, sheet dialog open then closed; inline path => no Trade button, Quantity inline. The path is recorded as a test annotation (`ticket-path`).
Passes on this branch's own base (phone inline), the 2+6 merge and the 8-card stack (phone sheet); no assertion removed.
