Moved from UNIT.md on 12 Nov 2026 (Europe/Paris) per Builder's rule, on the merge of origin/main f8f51ad9 (PR105) into this branch. Original text and date below are unchanged.

# Card 13: show the live last on the phone Positions card

Written 12 Nov 2026, 01:10 Europe/Paris (CET), before any implementation. This is the only file changed by the first commit. Timestamp taken from `date` on the box (Europe/Paris).

## Value and scope

Audit of a brand-new player's first 10 minutes on phone 390, after the first trade has filled: Portfolio with a position, P/L as prices tick, a second trade, and closing a position. Find the single biggest moment where a new player is confused or the P/L doesn't feel alive.

After a first HALC fill, Portfolio Overview (the phone root) shows net worth, cash, rank, and a Positions nav row. The goal/guide already names the fill and says "See it in Positions. Prices keep moving" — that copy is Builder's lane and is left alone. The empty-cash state is correctly hidden once a holding exists (card 9's lane, left alone).

On Positions the holding is there and the P&L and Today figures do move with the server tick (samples: last 40.54→41.75, P&L −$1.00→+$23.20, value $810.80→$835.00). Two gaps remain:

1. Chosen: the phone (and large-text) card never shows the live last. Desktop's table has a Last column (`data-testid="pos-last"`, `ticker.last` falling back to `pos.mark`). The card shows only `HALC`, unsigned value, `20 @ 41.72` (qty at average cost), a signed P&L, and Today's day-move. After a tick the dollars jump, but the mark that moved against the cost is invisible. 17 §7.1 PositionRow (`export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md:436`) lists last among the row fields. V1-BOARD.md:43 (M1-08 Portfolio P/L matches server fills) and :82 (live shared ticks) keep this a display of owner-sent marks, not a new figure. 18 §3.7 (`18-ONBOARDING-ACADEMY.md:374`) teaches "Everything happens on the tick, every 5 seconds." The spoken row already includes `avgLast` ("average cost …, last …"); the visible card does not.

2. Not this card: there is no Close control on the row (17 §7.4 PF-02, same file :857, "Close opens a pre-filled ticket"). Closing today means leaving for Broker, which still opens Buy with an empty qty. That is a real later-beat friction; it is not the "P/L doesn't feel alive" moment, and a pre-fill would touch Broker ticket draft wiring next to the order-type / TIF work we must not touch. Unlabelled P&L vs Today is already `ui/positions-number-labels` and is not repeated here.

This is the single biggest first-10-minutes friction in scope. The board, guest landing, empty Portfolio, Wire-to-Broker, shell safe-area, and engine are out.

## Exact base, branch, and identity

- Branch `ui/positions-live-last`, worktree `/workspace/avalon/ui-portfolio-after-fill`.
- Base `abf14e57f719689e1a94a65223c6f24ab71a6ae0`. Positions UI only, not shell chrome, so this is the required base (not `ui/pwa-safe-area`).
- Verify Forge (trading-game bot) `<forge@trading-game.local>` as author and committer. Remove every `GIT_*` variable from manual npm-test and Git subprocesses. Before every commit inspect `log -3` and all new commits, and check for stray init or tracked.txt fixture changes. Never skip hooks.
- Local checkout only. No cloud, push, PR, deploy, or external handoff.

## Grounding and sketch

`PositionRow` already computes `last = ticker?.last ?? pos.mark` and puts it in the table cell and in the spoken `rowLabel`. The card layout omits it. Show that same last on the card, formatted with `decText` like the table, `data-testid="pos-last"`, and `pos-stale` when the `me` view is stale. Pair it with Today on line 3 (avg stays on the left; last + Today on the right), so the live mark and the day-move sit together. Reuse `colLast` ("Last" / "Cours") as the visible word; do not invent a new price or compute P&L. Keep three lines; clusters stay nowrap; no brass. At text scale ≥ 1.5, stack last above Today if the line would otherwise overflow, same idea as the existing P&L % stack.

Rejected: summing position UPL onto the Overview hero (17 §7.22 :603, no client economics; the channel has no owner-provided total UPL). Rejected: a Close pre-fill into Broker (see above). Rejected: changing GoalGuide or the empty state.

## Acceptance and proof plan

- On a nonempty phone 390 (and large-text) Positions card, the live last is visible, equals the table's figure for the same row (`ticker.last` else `pos.mark`), and is tagged `data-testid="pos-last"`. Qty, average cost, P&L, Today, value and signs stay as sent.
- As marks tick, last updates with the `ticker` / `me` channels; no client arithmetic on Money. A stale `me` view marks last stale, as the table already does. Empty, loading, and error views do not claim a last.
- At 390 the card still does not scroll horizontally; Find-my-row is not this screen; existing 3-line geometry holds, with last clustered with Today. French `Cours` is used. Reduced motion: no new motion required (showing the number is enough). No brass semantic colour.
- Fail-first unit: a phone card with a ticker last (and the mark fallback when the ticker row is missing) exposes `pos-last`. Existing PF-B table and a11y tests stay green; the PF-3-09 line-3 exact string is updated only to include last, after the helper/render exists.
- Fail-first e2e: after a real first fill, phone 390 Positions shows `pos-last` matching the server last (polled), and `documentElement.scrollWidth` ≤ 390. Do not weaken M1-08 / PF-B journeys or silently regenerate goldens.
- Evidence: phone 390 (and a 1280 table shot for the unchanged Last column) before and after, under `/workspace/avalon/evidence/ui-positions-live-last/`. Audit shots already taken during the UNIT window live under `/workspace/avalon/evidence/ui-portfolio-after-fill/`.
- lint, typecheck, build, check-hooks, map-no-dup, npm test, route-budget `/broker` < 215 KB gz (220,160 B), all with GIT_* unset, then one clean e2e in a scratch worktree with fresh `.data` (cohort: the new spec + `tests/e2e/17b/PF-B.spec.ts` + `tests/e2e/17b/M1-08-portfolio.spec.ts`). Delete the scratch afterwards. No push, PR, or merge.

Do not change the guest landing, Portfolio empty state, Wire-to-Broker, Builder goal/guide or Wire-story or day-order expiry status, Boards Next-up, nav.css safe-area / notices.css `.qs-bottom` / layout.tsx meta, Broker ticket order-type or time-in-force controls or their tests, or the engine.
