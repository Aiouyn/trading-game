# Work order 37: strategy bots and the balance report

You own `sim/bots/` (new). Read the player module (`sim/modules/player/index.ts`: `ensurePlayer`, `act`, `view`, the `Command` type) and `sim/play.ts`. Change no module; if a bot needs a command that does not exist, list it in your reply instead of adding it. Read `AGENTS.md` and `sim/README.md` first.

## Why

Before anyone judges whether the game is fun, it must not be broken: no strategy should always win, no action should make money from nothing, doing nothing must be clearly worse than playing well, and crime must carry real risk. Bots written in plain code can check this on many worlds every wave, for free.

## Build

1. **Bots are plain functions** `(view, w) => Command[]` called once per simulated day (or week), acting only through `act`, seeing only what `view` shows the player. No reading other modules' state: a bot knows what a player knows.
2. **At least ten strategies**, each in its own file: do nothing (cash in the bank); index investor (buy and hold a spread of stocks, reinvest dividends); bond ladder; momentum trader; value investor (cheap stocks by price against earnings); maximum leverage gambler (margin, futures, options); memecoin speculator; insider (trades on every private fact it hears, through contacts); raider (founds, lists, bids for firms); property landlord if the player can buy property; a random trader as the noise baseline.
3. **The runner** `node sim/bots/run.ts --worlds 20 --years 20 --pop 5000` creates worlds with seeds 1..N, adds the player, runs every bot on every world (in parallel processes, one bot per world run), and writes `bots-report.md`: for each strategy the median, 10th and 90th percentile of final net worth relative to start, the share of runs ending bankrupt, dead or in prison, the number of times caught by the law, and the annualised return against the stock index.
4. **Automatic flags** at the top of the report: a strategy whose 10th percentile beats the index (too safe), any run whose net worth grows more than 50 times (likely exploit: print the day-by-day trace of the biggest jumps with their event chains), doing nothing within 20% of the index median (playing is not rewarded), the insider never caught or always caught, and any `act` call that threw or broke the books.

## Done

`node sim/bots/run.ts --worlds 20 --years 20 --pop 5000` finishes on a normal machine within an hour and writes the report with books balanced in every run. Commit after `git pull --rebase`, push, and reply with the full `bots-report.md`, the list of exploits found with their traces, and your cost. Then stop.
