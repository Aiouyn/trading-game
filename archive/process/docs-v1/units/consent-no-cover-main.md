# Card 38 — The phone consent prompt must not block Wire Post or the Home icons

**When:** 12 Nov 2026, 11:08 Europe/Paris (CET)
**Branch:** `ui/consent-no-cover-main`
**Base:** `origin/main` `f8f51ad92273214eafd0a0d06afa4c0b79fabaec` (PR #105, eng/broker-idempotency)
**Identity:** Forge (trading-game bot) <forge@trading-game.local>
**Tier:** low (consent presentation only). Not opening a PR. No push this pass.

## Player outcome

On a production (no-flag) phone build, the first-launch analytics prompt ("Share anonymous usage analytics… Accept / Decline") is `position: fixed` at the bottom of the viewport. Until the player answers it, the strip sits over the Home dock icons and over Wire's "Post a statement" control. Taps hit the prompt instead of those controls.

After this card: the prompt is docked into reserved space. On phone it sits in a layout slot above the bottom row (on Home) or above the edge bar (inside an app), so the Home icons and Wire Post stay clickable while the prompt is still unanswered. On desktop the strip sits immediately above the shelf and the work area shrinks by its height, so windows are not covered. Accept and Decline stay equal-weight. A Dismiss control hides the prompt for this visit without writing a consent value. When the prompt is offered, and what Accept / Decline persist, is unchanged.

## Grounding

- Avalon Builder, after PR #105 landed: "phone consent toast blocks Wire Post and the Home icons until answered. ui/consent-no-cover looks like the fix; add a no-flag phone e2e with consent unanswered asserting Post and icons are clickable."
- Prior branch `ui/consent-no-cover` @ `21246f7b` (base `7aaefce8`, pre-#105). That fix docks the strip and reserves desktop work area. This card ports it onto current main (PhoneHome, Desktop, store, and wm have moved). The new e2e is the clickability proof Builder asked for, not only a box-overlap check.
- `docs/v1/REVIEW-LESSONS.md` 8 (fail first). Official e2e builds skip the prompt unless `?telemetry_consent=1`; the required proof is a no-flag phone run (and production play) with consent left unanswered.

## Plan

1. Port the docked-strip presentation from `21246f7b` onto this tip: compact strip, phone in-flow dock, desktop work-area reserve, Dismiss without writing consent. Reimplement where cherry-pick is not clean (PhoneHome / store / wm).
2. Add a no-flag phone e2e that leaves consent unanswered and asserts a real click on a Home dock icon opens that app, and a real click on Wire Post opens the composer (not merely that the controls are visible). Prove it fails on this base first.

## Out of scope

- `setTelemetryConsent`, the consent API, telemetry events, or when the prompt is offered (`needsTelemetryConsentPrompt`, `ConsentBoot`, the lazy chunk). `?telemetry_consent=1` remains a force-show for official-flag CI.
- Ticket, engine, Boards, Settings, or nav.css / notices.css / layout.tsx safe-area work (card 10).

## Acceptance / proof

- Fail-first no-flag phone e2e on this base: with the prompt visible and unanswered, a Playwright click on a Home dock icon does not open the app, and a Playwright click on Wire Post does not open the composer (the prompt intercepts). After the fix, both clicks take effect and no consent value is written. Log under `/workspace/avalon/evidence/consent-no-cover-main/`.
- Fail-first unit: Dismiss hides the prompt without writing a consent value; the desktop work area shrinks from the bottom by the strip height. Red on this base, green on this head.
- Official-flag e2e may use `?telemetry_consent=1` so CI still shows the prompt. The scratch e2e is a no-flag production build with fresh `.data`.
- Production no-flag play at phone 390, with screenshots, consent left unanswered, Home icon and Wire Post clicked.
- Lint, typecheck, build, check-hooks, unit, ledger-no-dup, route-budget. No push.
