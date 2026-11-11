# Account continuation autofocus — Gatekeeper follow-up

Written before follow-up application code: 2026-11-11T18:43:01+01:00 Europe/Paris (UTC+1).
Parent branch: ui/account-first-step at `00822651d89693d2a7f7fdd48fdd5d97b3efe5e2`; original game base remains `110583b0aa73ece1dc3b856665f3be0405f1acc3`.
This document is committed alone before the fix. Card 3 was committed and verified first.

## Correction and outcome
Gatekeeper found focus on BODY after registration. The prior e2e helper manually focused Open Portfolio before Enter, proving navigation but not automatic arrival focus. Any claim that it proved autofocus was unsupported.
After successful registration or sign-in in the Account view, the next actionable button, Open Portfolio, must be document.activeElement without test-side focus manipulation. Enter should continue to Portfolio. Authentication, account isolation, save details, and existing Portfolio focus after activation remain unchanged.

## Spec
- `docs/v1/V1-BOARD.md:53-56`: first-session clarity, first trade, phone.
- `export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md:661,663,666`: keyboard play, assistive labels, cognitive accessibility.

## Checks
1. Add a focused regression assertion to the real Account component test; prove failure before the fix and pass after.
2. Desktop and phone browser tests compare document.activeElement with Open Portfolio immediately after real UI registration and sign-in, before any manual focus call. Assert ready/enabled and use Enter from that automatic focus.
3. Keep French/200% text, reduced motion, collapse restore, real first fill and account isolation coverage. Do not modify engine/auth APIs or shared Button behavior.
4. Run lint, typecheck, production build, check-hooks, map-no-dup, npm test, Broker route budget <=215 KB gz, and clean fresh-.data affected e2e. Only the apt/--with-deps setup is explicitly skipped; cached supported Chromium is reused.
5. Update UI-EVIDENCE.md to distinguish historical navigation proof from the new automatic-focus proof, with links to actual follow-up artifacts.
6. Preserve evidence, remove the one owned temporary e2e worktree immediately afterward, leave main worktree clean, report final SHA and normal push command. No push, PR, merge, hook bypass, deploy, or handoff.
