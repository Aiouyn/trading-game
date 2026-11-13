# Work order 21: fund managers, short sellers and activists

You own `sim/modules/funds/`. Add one `w.use(funds)` line in `sim/run.ts`, after `options` if present, else after `markets`. Trade only through the markets, options, bonds and commodities modules' exported functions (`submitOrder`, `borrowShares` and so on). Read `AGENTS.md` and `sim/README.md` first.

## Why

The markets module has generic funds that rebalance. Real markets are moved by people with strategies, egos and track records: a momentum manager piling into winners, a value investor buying the hated, a short seller publishing a report on a fraud, an activist forcing a board out. Their fights are the stories traders remember.

## Build

1. **Funds are run by people.** A manager (a person in the arrays, with traits) runs each fund; investors' money flows in after good years and out after bad ones; a manager fired after losses is replaced. Several strategies, each in its own file: momentum, value (price against earnings or book), macro (rates, the exchange rate, commodities), quant market-making, short selling, activism.
2. **Short sellers** borrow shares (`borrowShares`), and the best of them look for weak firms (falling sales, rising debt, a chief executive guiding too high) and publish a report: a published fact that moves the price, and that the firm can deny. A wrong report costs them a squeeze.
3. **Activists** build a stake (above 5% is public news), then demand changes: a higher dividend, a sale of the firm, a new chief executive. The board resists or gives in according to its holders' votes.
4. **Crowding and blow-ups.** Funds that hold the same trades sell together when one of them must sell; a fund with leverage can blow up, forcing sales that move prices. Every forced sale is an event with causes.
5. **Stats line**: assets under management by strategy, best and worst fund of the year, short interest, activist campaigns, fund blow-ups.

## Done

`node sim/run.ts --years 30 --seed 1` finishes with books balanced every day; strategies take turns being best, at least one short report and one activist campaign happen, and the economy's numbers stay in their usual ranges. Save and reload still match. Commit after `git pull --rebase`, push, and reply with the year-by-year best fund, one campaign's `--explain` chain, and your cost. Then stop.
