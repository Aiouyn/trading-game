# Work order 132: a terminal that shows what is real

Read `AGENTS.md`, what order 131 just added (`git log -3 -p -- sim/`, and the `/view` fields its commit names), `src/apps/broker/`, `src/components/market/`, `src/apps/portfolio/`, `src/apps/markets/`, `src/apps/institutions/` and `src/apps/bank/`. Audit text: `D:/tg-work/audits/Port Avalon Market Launchpad and Interface Audit.txt` (U01–U04, D01–D03) and `Port Avalon Playtest and Simulation Audit.txt` (M01–M03, F02, C03, I04).

You own those `src/apps/` directories and `src/components/market/`. Keep both sides on any rebase conflict.

## Why

- **% scale breaks the indicators.** With % on, the RSI and MACD axes show −10% and −100% while the legend reads RSI 50.9.
- **Chart controls misfire.**
  - Double-clicking a price silently switches the ticket from Market to Limit.
  - A drag starting on the legend selects text instead of panning.
  - With overlays on, the legend covers much of the plot.
  - Drawing modes give no hint ("choose start", "choose end", "Esc").
  - Scrolling hides the ticket type and the chart title.
- **Header numbers lack units.** A monthly candle changes the header to another bar's OHLC under the same "today" label.
- **The options ticket accepts nothing.**
  - With no listed contracts it shows $0.00 premium and an enabled Place button.
  - It inherited "Taken. Posted" from an earlier coin post.
- **Duplicate windows.** The Review layout opens two windows titled Portfolio.
- **Narrow screens.** At 866 px the net-worth strip covers the x10 and x25 buttons.
- **Labels that mislead.**
  - Bank shows generic deposit, withdraw and repay under a loan form.
  - Risk promises to "name the limit" in a reply instead of showing it before the trade.
  - "Upward" curve label.
  - Price index 96.9 beside total return 100.0.

## Do

1. **Show order 131's facts.**
   - The quote panel shows mark, bid and ask, last trade with time, and session volume.
   - Bars and volume carry their source (traded, indicative, backfilled or estimated) in the tooltip and as a visible style.
   - The header shows an as-of session summary, plus the hovered bar with its interval.
2. **Indicators keep their own units.** Price scale modes (auto, log, %) apply only to the price pane. RSI stays 0–100 and MACD keeps its own axis. The legend is compact and can be collapsed or moved.
3. **Chart interaction.**
   - Double-click proposes a limit at that price in a visible prompt, never silently.
   - Panning works from anywhere on the plot, legend included.
   - Drawing modes show what to do next near the cursor.
   - Symbol, interval and ticket type stay visible.
   - Keyboard users can step candles, read OHLCV and set an order price.
4. **Order lifecycle on screen.**
   - A working-orders panel shows each order's record from order 131: status, reserved cash, fills, fees, remainder and cancel.
   - Queued desks say when they will execute next.
   - No raw ids.
   - Status messages clear when the instrument or ticket changes.
5. **Tickets per desk.**
   - Options: Place is disabled until a contract can be previewed. The preview shows per-share premium, per-contract cost, total cash, break-even, delta and maximum loss. If no contracts are listed, offer the nearest listed underlyings and expiries.
   - Futures, FX, bonds and coins show cost and executable size before you submit.
   - Bank and Risk show collateral, haircut, rate, maintenance and buying power after the trade, before you commit.
6. **Portfolio.** One snapshot, figures that reconcile, and labelled changes (from order 131).
7. **Markets and Institutions.** Index methodology, return windows and curve shape as order 131 defines them.
8. **Layout.**
   - Window titles name their content, with no duplicates.
   - At 866 px nothing overlaps the speed buttons.
   - At 1280 px the Broker with indicators on keeps a readable plot.

## Done

Run the game (sim plus `next dev --webpack`, `SIM_PORT` set) and check with Playwright headless Chrome screenshots at 1600x900, 1280x800 and 866x700 (import from `node_modules/playwright`, `channel: 'chrome'`, wait for `load`, never `networkidle`), looking at each one:
- RSI and MACD under % scale
- a bar tooltip showing its source
- the quote panel
- a double-click limit prompt
- a drawing hint
- a working-orders record for a queued treasury order
- an options preview
- a Portfolio that reconciles
- the strip at 866 px

Then `npx tsc --noEmit` clean for your files, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
