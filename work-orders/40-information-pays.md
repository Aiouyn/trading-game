# Work order 40: why does no strategy beat the index?

You may read every module. Change only what the cause requires, and keep changes small. Read `AGENTS.md`, `sim/README.md` and `sim/bots/bots-report.md` first.

## The problem

In the bot report (20 worlds, 20 years) the stock index returns 13.6% a year, yet a bot that buys a spread of stocks and holds them returns 7.3%, momentum loses 2% a year, value makes 0.6%, and an insider who trades on every private fact makes 0.5% and is caught once in 20 runs. In a good trading game, skill and information must pay (and carry risk), and a passive investor must be able to roughly earn the market.

## What to do

1. **Find why the index investor lags the index by six points a year.** Candidates to check with traces, not guesses: the index measure (equal weight, survivors only), spreads and thin order books (the player paying far above mid, partial fills), the player's own orders moving prices, dividends not reinvested, cash left idle, fees. Fix what is wrong in the game; if the measure is wrong, fix the measure in `sim/bots/run.ts`.
2. **Make information valuable.** Trace a few insider trades: when did the fact become private, when did the bot trade, when was it published, how far did the price move? If prices already move before publication (because NPCs trade too) or move too little after, tune how markets react to published facts and earnings surprises so a real edge exists. Keep the law module's catch rate where a careful insider is rarely caught and a greedy one usually is.
3. **Check momentum and value against real behaviour**: prices should show some short-term trend and long-term reversion, not pure noise.

Targets on the new bot report: index investor within 2 points a year of the index; insider median clearly above the index but with a real chance of prison; at least one of momentum or value beating the index in a meaningful share of worlds.

## Done

`node sim/run.ts --years 30 --seed 1` (and seeds 2 and 3) finish with books balanced every day; save and reload still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`); the economy is no worse than now (average unemployment 6.2 to 6.6%, inflation never above 8% in a year). Then rerun the bots: `node sim/bots/run.ts --worlds 20 --years 20 --pop 5000`. Commit after `git pull --rebase` (including the new `sim/bots/bots-report.md`), push, and reply with the before and after numbers this order asks for and your cost. Then stop.
