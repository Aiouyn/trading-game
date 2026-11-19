# Work order 114: the first version's charts, exactly

Read `AGENTS.md`, `docs/DIRECTION.md`, the first version's chart on branch `p10/chart` (commit 7122f67b "TradingView timeframes 1m to 1M", and the commits before it on that branch and on `codex/memecoin-price-action`: `git show`, `git log p10/chart -- src/`), the current terminal from order 110 (`src/apps/broker/Terminal.tsx`, `src/components/market/TerminalChart.tsx`, `terminalApi.ts`) and the `/history` route that order 113 extended to minute bars.

You own `src/apps/broker/` and `src/components/market/`. Do not touch `sim/` beyond reading it.

## Why, in the owner's words

"The charts are really not what it needs to be. We really need to replicate the old TradingView charts I did in the earlier version of the game, with the 1 minute, 5 minutes, 15 minutes, 30, 1 hour, 4 hours, etc. Real time frames."

## Do

1. **Port the first version's chart as it was**: its look, layout, candle colours, legend, toolbar and behaviour. Where order 110's terminal differs, the first version wins; keep 110's drawing tools, indicators, order lines and ticket only where the first version had nothing.
2. **Real timeframes**: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 1D, 1W, 1M, as in 7122f67b, built from the sim's minute bars (`/history?tf=1m`) and daily bars. The forming candle moves live as the game clock runs. Intraday candles are cut on the session clock from 09:30 for shares and from midnight for coins.
3. **Range presets** move the visible window only, as in the first version; auto, log and % switches bottom right.
4. Works on shares, the index, coins and memecoins, futures and FX.
5. Check it in Quay with the clock running at x5 or more: the 1m chart adds a candle every game minute, and switching to 15m, 1h, 4h and 1D re-cuts the same data correctly.

## Done

`npx tsc --noEmit` clean for your files, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
