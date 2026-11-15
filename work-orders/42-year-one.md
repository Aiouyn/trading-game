# Work order 42: a world that starts in balance

You may change world creation in any module (the `init` functions and content files); do not change daily rules. Read `AGENTS.md` and `sim/README.md` first.

## The problem

Every world opens at 16 to 18% unemployment in year 1, then falls to 4 to 8% from year 2. A player starting a game walks into an artificial slump that has nothing to do with the world's history.

## What to do

Trace the first 12 months (staffing by firm, prices, stocks, wages, what the government and banks do), find why firms start understaffed or shed workers, and set starting conditions (staff, stock levels, prices, deposits, wages) from a steady state so that month 1 already looks like a normal year. A cheap option to consider: run a hidden warm-up before day 0 and start the clock after it, if that keeps save and reload exact.

Target: year-1 unemployment within 2 points of the 30-year average on all three seeds.

## Done

`node sim/run.ts --years 30 --seed 1` (and seeds 2 and 3) finish with books balanced every day; save and reload still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`); the economy is no worse than now (average unemployment 6.2 to 6.6%, inflation never above 8% in a year). Then rerun the bots: `node sim/bots/run.ts --worlds 20 --years 20 --pop 5000`. Commit after `git pull --rebase` (including the new `sim/bots/bots-report.md`), push, and reply with the before and after numbers this order asks for and your cost. Then stop.
