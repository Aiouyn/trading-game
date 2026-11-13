# Work order 17: stock options

You own `sim/modules/options/`. Add one `w.use(options)` line in `sim/run.ts`, after `markets`. Use the markets module's exported functions for share prices and to hedge in shares. Read `AGENTS.md` and `sim/README.md` first.

## Why

Options are how real traders bet on moves, hedge and get rich or ruined fast. They also turn volatility, earnings dates and takeover rumours into prices, which is where a sophisticated player finds an edge.

## Build

1. **Listed calls and puts** on the most traded stocks: monthly expiries out to six months, strikes around the price. Contracts are ledger instruments (one contract = 100 shares), written and held like futures in commodities, with margin for writers.
2. **A market maker** quotes bid and ask from its own volatility estimate (realised volatility of the stock, raised before known events such as earnings dates or after big moves), keeps a delta hedge in the stock through the order book, and widens its spread when its inventory is large. Prices are what clears, not a formula handed to traders.
3. **Who trades.** Funds buy puts to protect their books after falls and write calls for income; rich speculators buy calls on stocks with rumours or rising prices; people who know a private fact may buy short-dated options (an insider trade the law module can see).
4. **Expiry and exercise.** In-the-money options are exercised at expiry through the ledger (shares and cash move), the rest expire worthless. Margin calls on writers work like futures margin calls.
5. **Stats line**: open interest, volume, the market maker's profit, average implied volatility, margin calls.

## Done

`node sim/run.ts --years 10 --seed 1` finishes with books balanced every day; implied volatility rises after crashes and before earnings (if the earnings module is present), the market maker is roughly break-even over years, and every expiry settles. Save and reload still match. Commit after `git pull --rebase`, push, and reply with the stats for years 2, 5 and 10 and your cost. Then stop.
