# Work order 110: a real trading terminal

Read `AGENTS.md`, `docs/DIRECTION.md`, `src/components/market/` (CandleChart, PriceChart, TrendLayer, trendlines, chartStudies, movingAverages: the first version's TradingView-style chart on lightweight-charts), `src/apps/broker/`, `src/apps/markets/`, the commits 008786ca, 14cc4fc1 and 9f170c60 (the first version's chart and Broker trading tools), and `sim/server.ts` for how quotes, orders and coins reach Quay.

You own `src/apps/broker/`, `src/components/market/`, a new trading app if you need one, and a price-history route in `sim/server.ts` plus whatever small history store it needs in `sim/modules/markets/` or `sim/modules/crypto/`. Orders 109 and 111 run at the same time; keep both sides on any rebase conflict.

## Why, in the owner's words

"There is no trading, I should have a tradingview like chart, with the trading view tools etc, just like I did in the first version of the game, what I did was perfect I think."

## Do

1. **Bring the first version's chart back, fed by the sim**: candles from real sim trades, volume bars, a crosshair with an OHLC readout, and timeframes (day, week, month, and intraday if the sim's ticks allow). It must work for everything tradable: shares, indices, memecoins and crypto, commodity futures, FX and bonds where they trade.
2. **TradingView tools**: drawing (trendline, horizontal line, ray, rectangle, Fibonacci retracement, text note) saved per instrument; indicators (moving averages, EMA, Bollinger bands, RSI, MACD, VWAP, volume) toggled from a small menu; log or linear scale; compare with the index.
3. **Trade from the chart**: an order ticket beside the chart (market, limit, stop); positions and open orders drawn on the chart as lines; drag a limit line to move the order; the margin-call line when borrowing; keyboard buy and sell from the first version.
4. **Watchlist and market list** beside the chart: search any instrument, top movers, and memecoins that just launched.
5. **Through the sim only**: every order goes through `/act`, every price comes from the sim. Add a `/history?instr=...&tf=...` route returning OHLCV bars, from a deterministic history kept inside the sim with bounded memory.
6. The Ink & Brass Quay look, uncluttered: chart first, tools tucked into menus.

## Done

Check it in Quay (`next dev --webpack`) on a share and on a memecoin: draw a trendline, add RSI, place a limit from the chart, see the fill. `npx tsc --noEmit` clean for your files. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
