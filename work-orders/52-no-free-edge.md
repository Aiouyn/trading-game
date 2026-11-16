# Work order 52: no rule beats the market for free

Launch condition 2 in `docs/DIRECTION.md`. Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md` and `sim/bots/bots-report.md` first.

You may change: `sim/modules/markets/`, `sim/modules/funds/`, `sim/modules/earnings/` and the measures in `sim/bots/`. Do not change the value and momentum bots' rules: the market has to learn, not the bots get worse. Read every other module; do not change it.

## The problem

Two simple coded rules beat the market in every world. Value's 10th percentile is 7.71× against an index median of 4.88×; momentum's is 5.80× against 4.58×. A rule anyone can write in ten lines should not be a free win. In a real market, if cheap stocks reliably rise and trends reliably continue, the funds that trade those signals bid the edge away, until what is left is a reward for risk.

## What to do

1. **Trace the edge.** On seeds 1 and 2: for value, how long a stock stays cheap on the bot's measure and how fast it re-rates; for momentum, the autocorrelation of monthly returns per stock. Find the cause in the price process: closing marks taken from a thin book, slow reaction to earnings, NPC funds that don't trade these signals or trade too small, or dividends not in the price.
2. **Fix it in the market.** Prices react to news and earnings when they happen, not over months. The value and momentum funds in `sim/modules/funds/` trade with enough capital that the signals are mostly priced in; when the trade is crowded, it can crash (momentum crashes and value traps happen in real markets). Keep the cause chains: a re-rating should trace to the earnings report or the fund flow that caused it.
3. **Keep a real edge for real skill.** Information the player has to get (contacts, insiders, reading a firm's books, a strike or an epidemic the market has not priced yet) should still pay, with risk. Do not flatten every return to the index.

## Targets on the bot report

No strategy's 10th percentile above the index median. The index investor within 2 points a year of the total-return index. Value and momentum medians within 3 points a year of the index, each with some losing worlds against it. Rerun `node sim/bots/run.ts --worlds 20 --years 20 --pop 5000` and commit the report.

## Done

`node sim/run.ts --years 30 --seed 1` (and seeds 2 and 3) finish with books balanced every day; save and reload still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out <tmp dir>`); the economy is no worse than now. Commit after `git pull --rebase`, push to v1-build, and reply with the before and after bot table, what you traced as the cause, and your cost. Then stop.
