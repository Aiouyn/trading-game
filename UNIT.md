# UI unit: Wire first-step empty-state recovery

Written before application or test code: 2026-11-11T18:55:06+01:00 Europe/Paris (UTC+1).
Base: `110583b0aa73ece1dc3b856665f3be0405f1acc3`. Fresh `git fetch origin eng/market-calibration` confirms the remote tip exactly matches; local init492d60e4 is ignored.
This file is committed alone before implementation.

## Player outcome and actual observation
The first-trade guide asks a new player to read a Wire story. At the untouched base, fresh-data production play on desktop1440x900 and phone390x844 led straight from that guide to an empty live feed saying only “Nothing in this filter yet.” After the first real story arrived, selecting Filings showed the identical message even though the server had a story. Neither view explained the difference or offered a recovery action.
Evidence: `/workspace/avalon/evidence/ui-wire-first-step/before/{desktop,phone}-01-guide-to-wire.png`, `{desktop,phone}-02-empty-filter.png`, and `audit.json` (zero initial rows; one server story behind the empty Filings filter; zero Show-all actions).
Outcome: understand that the whole feed is waiting versus a filter being empty, and return to all stories with one keyboard/touch action without placing a trade.

## Spec
- `docs/v1/V1-BOARD.md:53-56`: 30-second clarity, grow-$10k goal, Broker/Portfolio/Wire at ~390px.
- `export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md:908`: WIR-01 filter feed and “Nothing in this filter yet.” Preserve the existing state label and filter behavior.
- Same file `:660-666,671-672`: 200% text, keyboard/screen-reader access, cognitive clarity, EN/FR.
- `export/vision-review/complete/18-ONBOARDING-ACADEMY.md:15-18`: first-session legibility and just-in-time explanation.

## Small scope / no duplication
Wire-only empty-state help and Show all stories action. No permanent banner on a populated All feed. EN/FR copy stays in a Wire-feed-only module, not shared strings imported by Broker. Keep loading, denied, error, stale, demo labels, story order, scroll holding, and detail navigation honest.
eng/wire-moves owns actual stories, causes and price effects; eng/first-trade-goal owns the guide/goal; eng/leaderboard-nw owns saved rankings. None implements this empty-filter recovery. No changes to any of their engine/data logic or the three ui cards.
The floating phone Trade/bottom-sheet candidate remains useful, but follows the already-improved ticket-entry interaction and touches the tight Broker entry. The independently observed guide-to-empty-Wire dead end is the next card; no unmeasured claim that a bottom sheet cannot fit is made.

## Acceptance / proof
1. A real all-empty signed-in feed explains that stories appear as events happen and Broker exploration need not wait; no invented story, loading success, progress, market timing promise, or guest example masquerading as live data.
2. An empty selected filter offers Show all stories. It resets to All and focuses the actual All radio, not a wrapper/body or an unmounted button; scroll the chip fully into view. Enter activation is proved before any test-side corrective focus.
3. Existing empty-state copy remains on its existing test hook. Loading/error/denied do not show the new recovery; guest all-empty must not claim a live world; stale copy must not claim freshness. Current records/order are untouched.
4. New focused component regressions fail before implementation, pass after; real signed-in browser journey recovers to the server's actual stories and leaves orders/fills untouched. Include guest, French/200% text, reduced motion, 390px phone and narrow desktop coverage.
5. Zero net /broker growth is a hard gate: two stable first-load gzip probes per build, same counting/excluded-plot definition as route-budget, compare exact bytes to base (218,932 bytes measured twice). Reject any positive delta, even if still under215KB. Preserve asset hashes; no performance claim.
6. Run exact normal lint, typecheck, build, check-hooks, ledger map-no-dup, npm test, route-budget and affected clean fresh-.data e2e. Only the explicitly authorized apt/--with-deps setup is omitted; plain cached browser install still runs. No checks/hooks changed.
7. Save production desktop/phone screenshots and full evidence under `/workspace/avalon/evidence/ui-wire-first-step/`. Reuse one temporary e2e checkout and delete it immediately after capture. Main must finish committed and clean. No push, PR, merge, deploy, spending, or Gatekeeper handoff.
