# UX redesign (lead spec, branch ux/overhaul)

Source: the player's demo feedback (2026-10-11) and the audit in the session scratchpad `ux/` (314 screenshots, scores
per page: trading 3.9/10, portfolio 4.6, empire 5.3, shell 5.4; 1440x900 is the main target and the worst).
References: TradingView, Binance/Bybit spot, Hyperliquid, IBKR Mosaic, Robinhood, Trading 212, Coinbase, pump.fun/Dexscreener.
Every string through i18n (en and fr). All four palettes. No sound. No-reveal and determinism rules unchanged.

## Principles
1. **Trading never scrolls.** At 1280x720 and up, chart, ticket and the Buy/Sell button are on screen together.
2. **Show money the way brokers do.** Cash, buying power and net worth are separate, labelled figures.
3. **Your trade lives on the chart.** Entry, take profit, stop loss and working orders are lines you can see and drag.
4. **Explain costs before, not after.** Fee (with its minimum), spread, round-trip cost and break-even are shown on the ticket.
5. **Density over decoration.** No giant per-app titles; the window title names the app. Compact stat strips, tables.
6. **Nothing blocks the trade surface.** Day close, coach tips and achievements become toasts or notification-center items.

## Stage 1: the trading core (this stage)
### 1.1 Broker becomes a terminal (desktop, window width >= 900 px)
- Three zones: top bar (symbol, price, change, interval and range controls, indicators menu), center chart (fills the
  remaining height), right ticket column 320-360 px, sticky, full height, its CTA always visible.
- Bottom dock under the chart, resizable (default 220 px), tabs: Positions | Open orders (n) | History | Asset | Options.
  Asset stats, earnings, the option chain, Plans, Block trade, Markets and Rivals move into these tabs or a left
  collapsible watchlist (symbol, last, change %; search on top).
- Window width < 900 px (and phone): chart about 45% height, a sticky bottom trade bar (Long/Short toggle, size, CTA with
  total); the full ticket opens as a bottom sheet. Positions and orders below the chart.
- The first-run desktop opens the Broker maximized (the Trade workspace), not three windows and a tip card.

### 1.2 Chart
- Interval selector in game time (1m, 5m, 15m, 1h, 4h, 1D) plus range presets (1D, 1W, 1M, 1Y, All); the tooltip says what
  a candle is in real time (1 game hour = 7.5 real minutes). Axis labels match the range (dates/game days for 1W and up).
- Optional percent axis; a minimum visible range so a 0.1% wiggle never fills the plot; crosshair readout with change %.
- Legend top-left: active indicators with values and a remove control; at most three on by default.

### 1.3 Positions and orders on the chart
- Average-cost line (dashed) with a live P&L pill (after exit fee and spread, "if closed now").
- Take-profit (green) and stop-loss (red) lines, draggable, with $ and % at risk/reward on the label; dragging calls the
  existing modifyOrder (or creates the bracket child when there is none). "+ TP" / "+ SL" buttons on the position line.
- Working limit/stop orders drawn as lines with an inline cancel (x) and drag to modify.
- Right-click or Alt+click on the chart: "Buy limit at X", "Sell stop at X", "Set alert at X".
- Liquidation line kept.

### 1.4 Ticket
- Long | Short tabs (Short = sell to open). Order type as a dropdown with a one-line explainer. Size in shares or $ with
  10/25/50/Max chips. TP/SL fields always available (also in simple mode). Summary: est. price, notional, fee
  ("0.10%, min $1.00"), spread, round-trip cost and break-even price, cash after, buying power after.
- The CTA is disabled with its reason as its label ("Enter a size", "Not enough cash: need $X"); refusals sit under the
  field that caused them. Validation of stop/limit relative to the mid. One decimal separator.

### 1.5 Rules changed with the UI (lead rulings)
- **Shorting from R0, cash-secured.** Any account may sell to open at 1x: collateral = 100% of the short notional on top of
  the proceeds, maintenance per the margin config, borrow fee shown. Pro (R2) adds 2x margin, forex, bonds, commodities.
  Rank unlock copy updated (en and fr). The simple-mode cap (20% of cash) applies to shorts too.
- **Simple-mode cap is aggregate.** Open buy and short notional are reserved, so three orders in one tick cannot pass 20%.
- **A new business is valued at cost** until its trailing window holds real days (no baseline income on day zero), so buying
  one does not raise net worth.
- **Top bar shows Cash and Net worth**, labelled, with a click-through breakdown (cash, markets, businesses, property,
  companies, funds, tokens, debts). Day change neutral at 0. A fill toast reads "Bought 5 HLCN at 177.22 - cost $887.10 -
  fee $1.00".

## Stage 2: shell and workspaces
Workspaces (Trade, Portfolio, Empire, News) as tabs in the top bar; windows tile instead of cascading (2 = halves, 3 = one
big plus two, 4+ = grid); apps opened from the dock in the Trade workspace open as a right side panel next to the chart.
Day close, coach and achievements become non-blocking (toast + notification center). Fix Review layout, title double-click,
snapping reflow.

## Stage 3: Portfolio and money
Portfolio home like Robinhood/Trading 212: big net worth with range chart (the $250 grant consistent with the header),
allocation, positions table with P&L after fees, order history, journal as a real trade log (Tradervue). Day-close numbers
count valuation changes separately from trading.

## Stage 4: empire apps
Compact headers, dense tables with inline actions, empty states that are next-step cards, one CommitBar (review then
confirm) for every spend, Launchpad as a pump.fun/Dexscreener-style table and token page with a sticky ticket, AI Lab as a
stepper, Security/Legal breakpoint and overlap fixes, locked tiles that say how to unlock.

## Stage 5: re-audit
Same capture script, same three viewports, re-score every page; target >= 8/10 at 1440x900 for every trading page and
>= 7/10 for every other page.
