# Work order 126: a terminal a trader trusts

Read `AGENTS.md`, `src/apps/broker/`, `src/components/market/`, `src/apps/portfolio/`, `src/apps/bank/`, the order and short commands in `sim/server.ts` and `sim/modules/player/` (trading parts), and the first version's chart on `p10/chart` for the position line. Round-2 playtest screenshots: `D:/tg-work/playtest/shots/2-trader/` (22, 29, 37, 81, 88, 103).

You own `src/apps/broker/`, `src/components/market/`, `src/apps/portfolio/`, `src/apps/bank/` and the trading and margin parts of `sim/modules/player/`. Order 125 changes coin valuation in `sim/modules/crypto/` at the same time; keep both sides on any rebase conflict.

## Why

Round 2 scored the trader 6.5/10: honest prices, deep history, live candles, indicators, drawings, stops and shorts all work. What a trader still notices:
- No "you hold N @ avg" line on the chart and no fill markers (the first version had them).
- Mouse-wheel zoom and drag-pan do nothing.
- A short shows only as "Stock loan VOLTANA 5, -$631.25" under loans: no entry price, no P&L, a stale amount.
- The margin-call modal says shares fell 34% when they fell 1%, and sticks.
- FX cannot be traded from the terminal; futures tickets are Market only; coins have no limit orders.
- 15m candles draw as thin grey ticks on some instruments.

## Do

1. **Position on the chart**: an average-price line with quantity and open P&L, and buy and sell markers at your fills, on every instrument.
2. **TradingView navigation**: wheel zoom on the time axis, drag to pan, drag the price axis to scale, double-click to reset.
3. **Shorts as positions** in the Portfolio and the Broker: quantity, entry, live mark, unrealised P&L, borrow fee so far; cover from there.
4. **Margin calls** say the real cause and the amount needed, with the actions to meet it, and close when met.
5. **One ticket for everything**: FX pairs, futures (market, limit, stop) and coins (market, limit, stop) from the terminal, through the sim's order book.
6. Candles draw with body and colour at every timeframe.

## Done

Run the game (sim plus `next dev --webpack`, `SIM_PORT` set) at x25 during a session and check with Playwright headless Chrome screenshots at 1600x900 (import from `node_modules/playwright`, `channel: 'chrome'`, wait for `load`, never `networkidle`), looking at each: a held share with its line and markers, zoom and pan, a short in the Portfolio with P&L, a margin call, an FX trade and a coin limit order from the terminal. `npx tsc --noEmit` clean for your files, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
