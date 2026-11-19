# Work order 120: the terminal, polished

Read `AGENTS.md`, `src/apps/broker/`, `src/components/market/`, `src/apps/portfolio/`, `src/apps/bank/` and the `/history` route in `sim/server.ts`. Order 119 has just made the price data honest and deeper; build on it. Playtest screenshots: `D:/tg-work/playtest/shots/2-trader/` (12, 23, 32, 38, 39, 53).

You own `src/apps/broker/`, `src/components/market/`, `src/apps/portfolio/` and `src/apps/bank/`. Other orders run at the same time; keep both sides on any rebase conflict.

## Why

The terminal is the strongest part of the game (TradingView-class), but:
- The volume pane: bars all the same height, filling a third of the chart; negative volume ticks on coins.
- Axis labels "0.000000" and "-0.000000" on RSI, MACD and coin axes; an x-axis label "Y1".
- The header price and the watchlist price disagree (190.53 vs 187.68).
- Order form state leaks between instruments (a stock stop price of 188 stays in the coin form); a stale fill message stays after switching order type; the coin box says "Cents to spend".
- Copy: "borrow AMOUNT margin"; the margin loan reads "8.0% for the 11111% of a year's income you owe".
- Net worth "Today" flips between +$0.76 and +$207; the "Why?" links in Portfolio show nothing.

## Do

1. Volume pane like the first version: a short band at the bottom, scaled to visible bars, coloured by candle direction.
2. Axis labels with precision chosen from the visible range, never negative zero; time labels as dates and times, never internal ids.
3. One price everywhere: header, watchlist, ticket and last candle read the same live price.
4. The ticket resets per instrument; messages clear when the order changes; dollars in every input.
5. Every "Why?" opens a short readable explanation from the sim's reasons; "Today" is computed one way and explained.
6. Fix the copy above and any similar placeholder you find in your apps.
7. Indicators show values once there are enough candles (order 119 gives 150+ on every timeframe).

## Done

Run the game (sim plus `next dev --webpack`, `SIM_PORT` set) and check at x25 during a session with Playwright headless Chrome screenshots (import from `node_modules/playwright`, `channel: 'chrome'`, wait for `load`, never `networkidle`), looking at each: a share on 1m, 15m, 1h, 4h, 1D with volume and RSI; a coin; a stop order; Portfolio's Why?. `npx tsc --noEmit` clean for your files, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
