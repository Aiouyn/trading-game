# UI unit: Broker ticket entry

Written before implementation: 2026-11-11T17:50:20+01:00 Europe/Paris (UTC+1).
Base: `110583b0aa73ece1dc3b856665f3be0405f1acc3`.
`git fetch origin` on 2026-11-11 confirmed origin/eng/market-calibration points exactly to that SHA; ignored local 492d60e4 init.

## Player outcome
A new player can discover and reach the Broker order ticket immediately on phone and a narrow desktop window, without hunting below the chart and technical indicators. The shortcut navigates only; review and explicit Place order remain unchanged.

## Why this card
Played the unmodified base with fresh .data on localhost:3301 using isolated headless Chromium desktop 1440x900 and phone 390x844 sessions: UI account creation, goal/guide, Broker, first buy, review, fill, Portfolio and Positions. The goal and first-trade guide already work, and Portfolio reflects the fill. The largest concrete obstruction was phone Broker entry: quantity starts at y=1061.94 and Review order at y=1212.44, below the 844px viewport; the visible screen ends at chart indicators with no path to trade visible. Desktop's wide ticket is already visible (quantity y=243.06, Review y=377.56), so leave that layout alone.
Evidence: `/workspace/avalon/evidence/ui-first-loop-audit/` (audit.mjs, audit.json, desktop/phone 01–08 screenshots). Automated completion times are harness times, NOT human timed playtest results.

Existing branches checked: eng/first-trade-goal adds the goal/guide, eng/portfolio-pl ledger P/L, eng/m2-05-pwa offline/install, eng/wm-resize-broker reflow, eng/broker-* indicators. None adds a visible route past the chart to the ticket. This is a small M2-01/M2-04 follow-up, not a replacement for those cards.

## Spec citations
- `docs/v1/V1-BOARD.md:53-57`: 30s clarity/2-min first trade, grow-$10k goal, Broker/Portfolio/Wire at ~390px.
- `export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md:248-261`: narrow desktop and phone app forms.
- Same spec `:828`: Broker Simple fewest decisions and explicit phone Trade entry. This unit adds a navigation shortcut to the existing inline ticket, not a second ticket/sheet (the existing review already has its own sheet).
- Same spec `:659-666`: text scaling, full keyboard play, simple cognitive floor.
- `export/vision-review/complete/18-ONBOARDING-ACADEMY.md:131-134`: real data, one-sentence prompts, never place on behalf of a player, no advice.

## Acceptance checks
1. On phone 390x844 and narrow desktop Broker 520px, a labelled >=44px phone/28px pointer ticket-entry button is visible above the chart without scrolling.
2. Activating it scrolls to the existing ticket and moves keyboard focus there; no preview/order/fill is created by navigation, side/type/quantity draft is preserved.
3. Keyboard activation works; EN and FR, text scale 2, and reduced motion remain usable; no horizontal overflow.
4. Wide desktop retains its existing side-by-side layout (no redundant shortcut), and About has no ticket shortcut.
5. Review/Place safety and real server fill -> Portfolio still work on both desktop and phone. Run affected e2e in a clean isolated worktree, fresh .data, port 3300-3399.
6. Run npm run lint, npm run typecheck, npm run build, node tools/check-hooks.mjs .next/static .next/server, BUDGET_PORT=3303 node tools/ci/route-budget.mjs /broker (<=215 KB gz), ledger map-no-dup, npm test.
7. Save real desktop/mobile production screenshots and logs under `/workspace/avalon/evidence/ui-broker-ticket-entry/`; inspect actual diff, commit normally. No PR, merge, deploy, spending or hook bypass.
