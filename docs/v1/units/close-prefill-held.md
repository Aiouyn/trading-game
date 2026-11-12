# Card 34 — Close prefill is not held at the window cap, across accounts, or mid-Place

**When:** 12 Nov 2026, 09:09 Europe/Paris (CET)
**Branch:** `ui/close-prefill-held`
**Base:** `85c983fbd68cf5dfaa1584bedac5e4fd5a85032c` (card 27 PR #122 head). PR122 is still open; `origin/main` is `cde6b4c7` and does not yet contain 85c983fb.
**Identity:** Forge (trading-game bot) <forge@trading-game.local>
**Tier:** high (order-ticket path). No push this pass.

## Player outcome

Close still opens a pre-filled Sell ticket when a Broker window can open or be reused for that asset. If four other Broker windows are already open, Close does not silently hold a Sell for later: the player is told to close a Broker window first, and a later Broker for that asset comes up empty. A held Close is forgotten on sign-out or when another account signs in. Close cannot interrupt an in-flight Place: the ack still lands, exactly one order is sent, and Close stays off until that ticket is done submitting.

## Grounding

- Gatekeeper card 27 `@85c983fb` PASS qualified. Quals 1–2 and the mid-flight note in `/workspace/avalon/evidence/launchpad/gatekeeper/85c983fb/REVIEW.md`. Probes: `proof/gk-probe2.test.tsx`, `proof/gk-probe3.test.tsx`.
- `docs/v1/REVIEW-LESSONS.md` 8 (fail first), 12 (isolation on account change), 13 (pid hygiene), 19 (unknown-session / first paint).
- Existing window-cap UX (`src/shell/wm.ts:88-94`, `registry.ts:67`): at cap, `openApp` focuses another Broker and returns `opened: false`. There is no toast or copy. This card does not steal that other ticket.

## Plan

1. If Close cannot open or reuse a Broker ticket for that asset at the 4-window cap, clear the held prefill and tell the player to close a Broker window first (the existing cap path only focuses another window and says nothing; this card will not steal that ticket).
2. Clear the module-level prefill when the auth-account boundary key changes (sign-out or another account).
3. Disable Close while that asset's ticket is submitting, and ignore a mid-flight prefill, so the in-flight Place still lands exactly one ack; also drop the unused `row` binding in the card 27 e2e.

## Scope

- Positions Close: after `store.open`, if no Broker window (desktop) or phone app is on that asset, `resetTicketPrefill()` and a polite status line. No change to `wm.openApp` cap behaviour for other open paths.
- `AuthAccountBoundary`: `resetTicketPrefill()` when the account key actually changes, not on first paint or while auth is `loading`.
- Broker ticket publishes a submitting flag for that asset; Close on that row is disabled until the ack (or failure) replaces the submitting phase. A prefill offered mid-flight is ignored and not left held.
- Remove the unused `row` const in `tests/e2e/17b/positions-close-prefill.spec.ts:23`.

## Out of scope

- Same-asset draft replaced without asking; Close qty including pledged/lent (card 27 backlog).
- Changing the global 4-window cap or retargeting an unrelated Broker window.

## Acceptance / proof

- Fail-first unit: 4 non-HALC Broker windows open, Close HALC → no HALC ticket, `takeTicketPrefill()` is null, a later Broker HALC is not Sell. A status tells the player to close a Broker window first. Red on `85c983fb`, green on this head.
- Fail-first unit: hold a prefill, change the account (or sign out), `takeTicketPrefill()` returns null. Red on `85c983fb`, green on this head.
- Fail-first unit with `replyMs`: Place, Close mid-flight → Close disabled (or ignored), `submit` called exactly once, ack shown, ticket is not left as the Close sell. Red on `85c983fb`, green on this head.
- Official-flag e2e on fresh `.data`: `tests/e2e/17b`, plus cap and account-switch coverage where practical.
- Production no-flag play at 1280 (window cap, sign-out then sign-in as another account) and 390.
- Lint, typecheck, build, check-hooks, unit, ledger-no-dup, route-budget. No push.
