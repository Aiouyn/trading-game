# Work order 41: strikes happen, power prices track their costs

You own `sim/modules/labour/` and `sim/modules/energy/` with their content files. Read `AGENTS.md` and `sim/README.md` first.

## The problem

Over 30 years union membership grows from 18% to 34% but there are no strikes in the years checked, so unions only collect dues. The power price rises about 3.4 times over 30 years, much faster than other prices.

## Targets

- On each seed, a few strikes a decade, more when inflation outpaces wages or profits are high; strikes last days to weeks; settlements usually above inflation, sometimes a loss for the strikers.
- The power price follows fuel costs and plant costs: over 30 years it rises no more than about 1.5 times the general price level, spikes in cold winters and fuel shocks, and falls back after.

## Done

`node sim/run.ts --years 30 --seed 1` (and seeds 2 and 3) finish with books balanced every day; save and reload still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`); the economy is no worse than now (average unemployment 6.2 to 6.6%, inflation never above 8% in a year). Then rerun the bots: `node sim/bots/run.ts --worlds 20 --years 20 --pop 5000`. Commit after `git pull --rebase` (including the new `sim/bots/bots-report.md`), push, and reply with the before and after numbers this order asks for and your cost. Then stop.
