# UI unit: Positions number labels

Written before application code: 2026-11-11T18:18:28+01:00 Europe/Paris (UTC+1).
Base: `110583b0aa73ece1dc3b856665f3be0405f1acc3`.
This document is committed alone before any implementation commit.
`git fetch origin` confirmed origin/eng/market-calibration points exactly to the required base. The local init commit is ignored.

## Player outcome and observed friction
After a first trade a phone player can distinguish their holding's P&L from the asset's daily price move, and identify value and average cost without decoding an unlabeled number cluster.
The original fresh-player audit at the required base recorded HALC after buying one share: phone Positions showed `$0.00 (0.0%)`, `$42.14 · 0.4%`, `1 @ 42.14`, and a red `−0.45%`, with no visible labels. Saved net worth was $9,999.90 after the fee. A new player could reasonably read the red asset-day move as their own loss, or wonder why P&L was zero despite the fee.
Evidence: `/workspace/avalon/evidence/ui-first-loop-audit/{phone,desktop}-08-positions.png`, with copies in this card's `before/` evidence directory.
The desktop has column headings but P&L's before-fee / unrealized basis remains unexplained; the focused row's spoken label does not include P&L.

## Spec citations
- `docs/v1/V1-BOARD.md:53-56`: first-session clarity, visible net-worth goal, Broker/Portfolio on ~390px phones.
- `export/vision-review/complete/18-ONBOARDING-ACADEMY.md:15-18`: first-session legibility, just-in-time explanations, and an after-the-fact explanation of numbers, not advice.
- `export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md:856-857`: Portfolio Overview and Positions.
- Same file `:660-666`: 200% text, keyboard, screen-reader labels for every number, colour-independent meaning, cognitive accessibility.
- Same file `:671-672`: English/French and no truncated numbers.

## Scope and non-duplication
Front-end presentation only: visible card labels, a short P&L/Today reading key, and a spoken P&L value. Use existing server strings; do not compute new returns or change numbers.
eng/portfolio-pl owns real ledger valuation/loading correctness; eng/first-trade-goal owns goal/progress and guide state. Neither labels these phone card clusters or explains the P&L/Today distinction. No changes to those data/guide paths or to the two earlier ui cards.
Keep copy/styles in Portfolio-only modules; avoid Broker entry-bundle weight. No engine, API, market/economy, fee, or FX changes.

## Acceptance checks
1. Nonempty phone and large-text cards visibly identify P&L, value, quantity/average cost, and Today; preserve the three logical rows, original amounts, signs, percentages, and existing colour/arrow cues.
2. Nonempty Positions explains unrealized P&L before fees versus the asset's day move in concise EN/FR copy. Empty/loading/error views do not claim a holding or a return.
3. Focused position rows speak P&L including its sign and before-fee basis, not only the asset's day move. No navigation shortcuts/forms are added; the Gatekeeper's input-focus requirement is not applicable here.
4. Phone 390px, 200% text, French, reduced motion, narrow desktop and existing 3-row geometry remain usable with no truncated numbers/horizontal overflow. No brass semantic colour.
5. A clean e2e checkout with fresh .data proves a real first fill -> Portfolio Positions, matching server amounts; normal desktop/phone proof and screenshots are saved under `/workspace/avalon/evidence/ui-positions-number-labels/`.
6. Run lint, typecheck, build, check-hooks, route-budget /broker <215 KB gz, ledger map-no-dup, npm test, affected e2e. No pixel baselines are silently updated.
7. Commit implementation and evidence normally, leave a clean main worktree, report the normal push command to the parent. No push, PR, merge, hook bypass, deploy, or Gatekeeper handoff.
8. Reuse one temporary clean-e2e checkout for this card and remove it after preserving evidence. Keep the main worktree and evidence directory.
