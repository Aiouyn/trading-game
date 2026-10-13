# V1 Phase 10: status

Scope: Phase 10 as set in `docs/team/specs/lead-phase10.md` (binding), the realism pass after `docs/V1-EVALUATION.md`. Each
track records its own section here: 10B is the Broker chart (R-10-5, branch `p10/chart`). Other tracks add their sections.


## 10B. Broker chart: timeframes, drawings, position tool, order lines (R-10-5)

Track branch `p10/chart`, worktree `.claude/worktrees/p10-chart`. Commits, in order: `7122f67` (timeframes and scale
switches), `c04704c` (drawings saved on the server), `5959af8` (drawing tools, the position tool, order lines). Status
words as in `docs/V1-PHASE6.md`.

### 10B.1 Status by part

| Part | Status | What is there | What is not |
|---|---|---|---|
| (1) Timeframes and axes | **Done** | 1m 3m 5m 15m 30m 1h 2h 4h built from game-time ticks, clock-aligned (09:30 session open), forming candle live; 1D 1W 1M from the daily bars. Range presets (1D 1W 1M 1Y ALL) only move the view. Price axis and time axis take the mouse; wheel; double-click resets; auto, log and % switches; indicator popover closes on Escape and does not swallow the next click. | Intraday history is the 5-game-day tick ring; 1D to 1M go back to the 400 daily bars. |
| (2) Drawing engine and toolbar | **Done on desktop** | Left toolbar: cursor, cross, lines (trend, ray, extended, horizontal, horizontal ray, vertical, channel), shapes (rectangle, ellipse), Fibonacci (retracement set with 1.272 and 1.618 extensions), measure (price range, date range, date and price range), position (long, short), notes (text, arrow, brush). Magnet (snap to the candle's open, high, low or close), lock, hide all, delete all, undo and redo (50 steps). Properties popover: colour, width, dash, text, delete. Keys: Alt+T, Alt+H, Alt+V, Alt+F, Alt+L, Alt+S, Esc, Delete, Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z. Drawings are kept in time (game tick) and price, per player and per symbol, saved on the server (`drawings.save`, a private field, capped at 60 per symbol, 40 symbols, 160 points, 80 characters of text and 24 KB per symbol) and read back by the `drawings` request. | Phone: no drawing toolbar (the narrow chart keeps the sizes, presets and the order lines). Right-click to place a position tool is not built (Enter places it). |
| (3) Position tools and risk panel | **Done for market entries** | Long and short tools: entry, target and stop handles and a time-extent handle. Risk in dollars and in percent of equity, synced both ways. Quantity from the stop distance, rounded down to the asset's quantity step and capped at buying power. Reward to risk, round-trip spread and fees, net P&L at the target and at the stop. Placement as a market, limit or stop entry, with the target and stop sent as the engine's bracket (`takeProfit` and `stopLoss`, which the engine turns into the ocoGroup legs on fill). | The e2e spec places a market entry only. The panel floats over the plot's top left and covers candles; its placement is not yet refined. |
| (4) Order and position lines | **Done** | Entry, target and stop lines with labels (quantity, live P&L on the average line). A close button on the average line sends a reduce-only market close of the whole position. A drag of a pending line or a target or stop line changes the real order (the existing `commitLevel` path). | The drag check reads the pill text change; it does not read the order's price directly. |

### 10B.2 Gates and numbers (on `5959af8`)

- `npx next typegen` and `npx tsc --noEmit`: exit 0.
- ESLint on the touched files (the broker chart folder, the world and net files, `server/index.ts`, `src/game/store.ts`,
  `src/game/history.ts`): 0 errors.
- Vitest, touched areas (broker chart, `src/game`, drawings): 22 files, 167 tests, all pass.
- Vitest, full suite (`--maxWorkers=3`): 283 files pass, 2,652 tests pass, 3 expected failures, 72 skipped, 20 todo, and
  4 failures. All four are load timeouts, not assertion failures: `tournamentWeek.test.ts` (3 tests, 60 s timeout) and
  `company/determinism.test.ts` (120 s timeout) pass when run alone with `--testTimeout=900000` (16 of 16); the rho gate's
  `beforeAll` hit its 25-minute hook limit under the same load. The rho file and the engine are not changed by this track.
- Playwright, desktop project (1440 x 900): `brokerDrawings`, `brokerPosition`, `brokerTimeframes`, `brokerChartShots`
  pass (8 passed, 2 skipped by their own project guards).
- Playwright, desktop and phone (390 x 844), with the regression specs: `brokerDrawings`, `brokerPosition`,
  `brokerTimeframes`, `brokerChartShots`, `brokerOrders`, `brokerTerminal`, `priceAxis`, `shell/stage2`: 35 passed, 0 failed.
  The first full run failed one test (`brokerOrders`, chart limit at 1280x720): the header's interval and range rows wrapped
  onto two lines and shrank the plot, so a take-profit pill covered the test's click point. The rows now share one line and
  scroll sideways when the tile is narrow (the phone toolbar's pattern), and the test passes.
- i18n: `en.json` and `fr.json` both hold 5,954 keys, the same set. The 81 new keys of the broker chart are French. The 13
  new keys whose French equals the English are accepted loanwords or abbreviations (Stop, Rectangle, Ellipse, Log, Auto,
  Fibonacci, Position, %, +SL, +TP, TP and SL labels).
- Determinism: `src/engine` and `src/content` have no diff since `27f6437`. The world changes are one command
  (`drawings.save`, which no tick reads), one helper, and an optional `Player.drawings` field that stays absent until a
  player draws. A save from before this track loads unchanged, and no world's fingerprint can move. This is by construction
  and by the untouched engine; a fingerprint comparison was not run separately.
- Screenshots (`scratchpad/p10/shots-p10-chart/`): desktop 1440 x 900 and phone 390 x 844, English and French, of the
  timeframes, the chart menu, the drawing properties, the trend line and its reload, the position tool, the bracket in Open
  orders, and the dragged target line. Six were looked at (desktop English position and drawings, the dragged target line,
  the bracket in Open orders, desktop French drawings, phone French chart). The desktop position panel covers the candles
  and is the first thing to refine.

### 10B.3 Deviations and rulings

- Intraday candles open at the previous candle's close (a continuous tick series), so a bar never gaps. This follows the
  brief's "built from game-time ticks".
- The sizes (1m to 4h) and the presets share one row beside the price. In a narrow desktop tile the sizes scroll sideways
  rather than wrapping, which keeps the chart's height. This matches the phone toolbar.
- The drawings view is a request (`drawings`, a private read of the caller's own list), not a `Command`. It is the only
  path that returns drawings; the player view does not carry them.
- The position tool's quantity is in units of the asset (every asset is quoted per unit, so the point value is 1).

### 10B.4 Not done, and why

- Phone drawing tools: the narrow layout has no toolbar, so phone users cannot draw. Deferred: it needs a phone layout
  decision for the chart.
- Right-click placement of a position tool: Enter places it; the right-click does not. Deferred for time.
- E2E for lock, hide all, delete all, magnet, undo and redo, and the limit and stop entries of the bracket: built, not
  spec-tested. Deferred to a follow-up spec.
- Position panel placement over the plot: a layout refinement (it covers candles), not a behaviour gap.
- The shell files (`src/shell/*`, `src/components/os/*`, the status strip, net worth figures), `BrokerApp.tsx` and
  `TerminalLayout.tsx` are not touched. Symbol switching and the Broker's window rules are the UX fork's.
- Known display quirk: Chromium shows a decimal comma in the percent input when the browser locale is French. The value is
  correct.
