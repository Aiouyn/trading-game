# Work order 119: prices a trader believes

Read `AGENTS.md`, `sim/README.md`, `sim/modules/markets/` (`index.ts`, `bars.ts`, `minutes.ts`), `sim/modules/commodities/`, `sim/modules/abroad/`, the clock in `sim/server.ts` (order 113) and `src/apps/broker/` (read only). Playtest screenshots: `D:/tg-work/playtest/shots/2-trader/` (21, 23, 38, 53) and `4-social-life/68-after-60s-x25.png`.

You own `sim/modules/markets/`, `sim/modules/commodities/`, FX wherever it lives, and the intraday parts of the clock in `sim/server.ts`. Other orders run at the same time (the life sim edits `sim/modules/player/` and others); keep both sides on any rebase conflict.

## Why

A trader playtester would "notice within ten minutes" that the market is broken:
- A one-tick spike wick at every open and close auction; the daily close printed at a stale 190.27 while the session traded near 189; vertical 1.4% jumps inside one 1m candle mid-session; overnight gaps that fill back within hours.
- Shares look frozen: Northgrid 190.27 and +0.0% from Jan 3 to Jan 8 at x25, nearly every name +0.0%.
- 63 near-identical shares priced $170-200; Titan Machine Works quoted 0.0100; bonds at 158-161 and futures at 9.59-70.81 with no units.
- Volume: history and live minute volume on different scales; 1m bars all the same height.
- Minute history only reaches back 6 game days, so 1h and 4h charts show about 8 candles and indicators show dashes.
- FX is one untradable pair named "USD per dollar" at 1.0001.

## Do

1. **One price path**: the minute path is the trading itself; the daily close is the last trade of the session; no auction spikes; no jumps a book could not produce; gaps happen only on news and are not mechanically filled.
2. **Shares move every session** with a believable intraday range and daily change spread (most names between -3% and +3% on a normal day, news names more), and `change` figures agree with the bars.
3. **Prices with a story**: each listed firm's price follows from its profits, shares outstanding and the market's valuation, so prices spread from a few dollars to hundreds; no placeholder price anywhere. Bonds quoted per 100 with a yield, futures with their unit (per barrel, per ton...).
4. **Volume on one scale**, varying with time of day, news and moves, in history and live alike.
5. **Deep intraday history**: keep enough bounded history that every timeframe from 1m to 4h shows at least 150 candles (for example 1m for 6 days, 5m for 30 days, 1h for a year, pre-rolled before day one like the daily bars).
6. **Real FX**: a handful of named pairs against the city's currency, moving with rates and trade, tradable by the player in sizes a $5,000 player uses, booked in the ledger.

## Done

On an arrival start at x25 through two sessions, show: a share's 1m bars at the open and close with no spike, its daily close equal to its last trade, the spread of daily changes across all shares, the price range across firms, candle counts per timeframe from `/history`, and an FX buy and sell. Then `node sim/run.ts --years 10` showing "Books balanced every day" in under 100 s. Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
