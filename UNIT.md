# Card 6 — Phone Trade ticket sheet

Written 2026-11-11T20:17:40+01:00 Europe/Paris, before any implementation. This file is the only change in the first commit.

## Outcome and lane
A new player can open the existing order ticket from a persistent, 44px-or-larger floating Trade button, without scrolling past the phone chart. Opening never submits. Quantity → Review → explicit Place still uses BrokerFrame's existing preview, intent, pending and acknowledgment path. Phone/narrow is the existing shell breakpoint, viewport width <768px; compact and wide desktop keep the inline ticket and their existing behavior. Front-end only: no engine/server/market/economy/shared-package, route-budget limit or script changes.

## Exact stacked base and identity
- Branch `ui/broker-trade-sheet`; isolated worktree `/workspace/avalon/ui-broker-trade-sheet`.
- Base `bfe320dd57e9b6e58ddc671ef9f8717b09a27cae`, the local verified Settings/News recovery head on `ui/broker-entry-split`, on top of original `009f50bfd5bde60d0e05f9d28d3bc38d60d0c81d`. This is a stacked, UNMERGED UI branch, itself based on `110583b0aa73ece1dc3b856665f3be0405f1acc3`; not main and not the preflight fix.
- New author identity verified as Forge (trading-game bot), forge@trading-game.local. The exact inherited card-5 base contains legitimate earlier pf@test-authored commits; do not mistake those for new fixture `init` commits or rewrite the required base. Before every commit inspect log -3 and all commits after this base; reject any new init/pf@test commit. All manual npm-test and git subprocesses have every GIT_* environment variable removed. No hook bypass.
- No push, PR, owner/Gatekeeper handoff, merge into an owner branch, deployment or spending. Scratch-only integration merges are requested evidence, not integration authorization.

## Sources
`export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md`:
- :828 BRK-01: phone chart full width; bottom-sheet ticket opened by a floating accent Trade button; honest risk note; authoritative preview.
- :474 BottomSheet: content, half/full, grab handle; drag-down dismissal is broader component-spec scope, see boundary below.
- :389–396: sheet elevation/radius/z-order, phone <768, minimum width320, touch targets >=44x44.
- :256–262: phone status/app bars and Recent; keep the existing shell navigation usable when the ticket is closed.
- :1274, :1281: preview values authoritative; keyboard reachability and accessibility.
`docs/v1/V1-BOARD.md`: :41–43 existing atomic/idempotent order path and Portfolio P/L; :53–56 first-trade clarity and ~390px mobile shell; :82–84 V1 lane and exclusions.

## Grounding: ownership and flow
BrokerFrame owns the draft and edit/review/placed phase; SimpleTicket only edits and requests review. ReviewBlock alone exposes explicit Place; AckPanel reads the returned intent/fill. Phone currently renders the whole ticket below the chart and creates a SECOND sheet only for review. The existing shell Sheet already supplies modal semantics, Tab wrap, Escape, scrim close and opener return. The phone shell uses a36px edge-bar token plus bottom safe-area; Broker's phone class deliberately disables size containment so fixed sheets stay viewport-relative. Draft and phase must stay in BrokerFrame so dismiss/reopen never duplicates order state.

## Usage and chosen shape
BrokerFrame renders its unchanged desktop ticket branch OR a small phone-only presentation wrapper around the SAME `ack || review || ticket` React node. The wrapper owns only open/closed UI state, calls the existing `toEdit` on dismissal, and renders one shared Sheet for editing, review, pending and acknowledgment (never nested modals). Its only external inputs are localized labels/asset context, the existing quantity focus ref, existing keyboard and dismiss callbacks, and children; it has no order/preview/intent API.

Compare two structurally different local sketches (Task/arena tools are not exposed; no independent-runner claim):
1. Chosen: Broker-local wrapper + existing Sheet, one mounted ticket and parent-owned draft/phase. Focus Quantity on open; when replacing edit/review/ack content would remove focus, land on an enabled action inside that content (or the persistent Close button while pending). Keep user-chosen close/action focus during quote refreshes. Explicitly focus Trade before mounting Sheet so touch and keyboard both restore correctly. Dismiss during pending does not cancel/re-submit; reopening displays current phase/result. Unmounting phone wrapper on a desktop resize naturally resets only its open UI state.
2. Rejected: native dialog/new modal implementation or global sheet-host snapshots. Native dialog duplicates established shell modal policy; global snapshots split rendering/state ownership and require external synchronization for each preview/phase update. Both expose more coordination than the local wrapper.

Accepted tradeoff: reuse the established shared Sheet rather than extend its global API or add a modal package. No swipe-to-dismiss work: spec :474 describes that general component capability, but this card's requested closes are Escape, backdrop and a visible 44px Close button; drag dismissal is not silently claimed. Existing Sheet has a grab handle. Check screen-reader semantics and keyboard containment on each content transition, including pending.

## Relationship to Card 1
Card1 (`ui/broker-ticket-entry` @0814d8e3) is NOT in this base. The new floating Trade button supersedes its Go to order ticket shortcut ON PHONE; hide `.br-phone .br-ticket-entry` as an explicit stacked-integration compatibility rule so phone never offers a shortcut targeting a now-unmounted inline form. Card1's compact-desktop shortcut and wide-desktop hidden state remain untouched. Measure/test an approved 1–5 scratch merge and document any source conflict resolution exactly; preserve Card1's desktop id/ref/shortcut and its existing tests except phone expectations deliberately superseded by the sheet. No cherry-pick of unrelated UI cards into this feature branch.

## Acceptance and evidence plan
- One SimpleTicket/order flow, no new request or calculation. Trade activation/repeated opening/closing produces zero order POSTs; only explicit Review then Place sends one request.
- Focus Quantity initially; Tab/Shift+Tab stay within Sheet; transitions retain modal focus; Escape/backdrop/Close dismiss and focus Trade; draft survives reopen; About has no stale Trade overlay; resize leaves desktop inline ticket.
- FAB and controls >=44px; reserve space after the last market/order row; FAB clears the existing36px edge nav + safe inset + gap; use safe-area-aware horizontal/panel padding and scrollable sheet body. Closed navigation remains reachable; modal intentionally owns interaction while open.
- EN/FR at390px and FR at320px, textScale2: no viewport or sheet horizontal overflow, wrapped labels and readable full preview values; review/Close reachable by scrolling.
- Run exact repo checks: `npm run lint`, `npm run typecheck`, `npm run build`, `node tools/check-hooks.mjs .next/static .next/server`, `node tools/ci/route-budget.mjs /broker`, ledger `npx vitest run test/map-no-dup.test.ts`, `npm test` (GIT_* scrubbed). Do not invoke apt/--with-deps; existing Chromium is installed, plain browser install only if needed. No budget/script edit.
- Measure actual /broker counted gzip assets before/after on the exact recovered Card5 base AND approved merged cards1–5 stack, <=215KiB on each. Freeze preview build/PID during probes, retain hashes and exact input SHAs; this is bundle size, not a runtime speed claim.
- One clean fresh-.data e2e worktree, fresh install if inode budget permits, ports3300–3399 only, no3199/3102. Targeted affected Broker and first-trade/Portfolio flows; full signed-in phone open→quantity→review→place→real fill displayed in Portfolio. Include desktop unchanged screenshot comparison and phone screenshots (including FR200%). Do not regenerate existing baselines unless an intentional phone expectation changes and is explained.
- Keep raw failed attempts as evidence; delete only Card6 scratch checkouts and previews after capture, not primary worktree/evidence. Final clean committed tree, Forge author confirmed, exact SHA and normal push command reported without pushing. Remote CI/Gatekeeper are not certified locally.

## Ordered recovery/rebuild context
Card6 was cleanly checkpointed atfc712431 before the scoped Card5 Settings/News recovery. Card5 UNIT-addendum-onlyd0f868bd preceded its fix, all core checks and fresh clean e2e (93 pass/57 project skips, all8 abort/re-import paths). Card6 is locally rebased, unpushed, onto the exact recovered head above; re-verify all Card6 paths on this source, not only its earlier checkpoint. Original own/stack measurements remain archived as checkpoint evidence, not final-base proof.

Merge order: preserve Card5's all-built-apps-lazy app-modules.test.tsx contract; removed EagerAppId/LazyAppId assertions from older cards must not return. The recorded five-card stack5f03d95b already had the correct test byte-identical to Card5; its recovery merge needed no new source/test resolution. Re-run merged-stack typecheck/npm test as well as build/budget. Merge Card6 last, preserve Card1 compact-desktop entry id/ref, and deliberately replace only its phone shortcut expectations with the Trade sheet.

## Final phone-only expectation and harness follow-up
The rebuilt first full clean cohort found two proof gaps, not an extra order path: the existing phone app screen itself has role=dialog, so the nested-modal regression assertion must count aria-modal=true dialogs (exactly one), not all dialogs. Preserve the full open→review→place→real fill assertion; do not skip it.

Removing the inline phone ticket and reserving space for the FAB intentionally changes the phone Trade scroll extent. At200% text the browser retains a different natural scroll position when entering About: its focused About heading/Overview now starts near the top instead of retaining more of the quote header. The About DOM/styles, focus, content, News and desktop remain unchanged and all a11y/overflow/navigation assertions pass. Accept this phone-only framing consequence, explicitly update ONLY BR-10/phone-overview-2-390x844.png from the captured real failed comparison, retain original/actual/diff and re-run the exact unchanged pixel assertions. No desktop, News, other phone or global baseline regeneration. This is not claimed as a universal About-scroll reset or a product-code fix.

Desktop deterministic comparison: studies/table/About/News pixel-identical; initial Broker has8 antialiased pixels at the Review button's bottom-right rounded corner (bbox550,428–554,430), no text/layout difference. Raw full images and enlarged corners retained; do not call this five pixel-identical views.
