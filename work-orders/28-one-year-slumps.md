# Work order 28: find the one-year collapse

You may read every module; change only what the cause requires, and keep the change small. Read `AGENTS.md` and `sim/README.md` first.

## The problem

In seed 1, unemployment is 4.4% at the end of year 20, 29.8% at the end of year 21, and 3.9% at the end of year 22, with the policy rate barely moving. Similar one-year jumps appear in other seeds (seed 2: 12% in years 8 and 29). A real slump takes years to build and to heal; this looks like a sudden mass layoff or a counting error.

## What to do

Trace it month by month (write a small script that opens the world with `openWorld` from `sim/run.ts` and prints unemployment, employment by firm and the events of the month), find the cause, fix it at the source, and explain it in one paragraph in your reply with the `--explain` chain.

## Targets

On seeds 1 to 3, no year-end unemployment above 18% that is back under 6% a year later, unless a named disaster or shock caused it.

## How to measure

Run `node sim/run.ts --years 30 --seed 1`, `--seed 2` and `--seed 3` (20,000 people each, about 10 minutes each) and read the yearly stats lines. Every target below must hold on all three seeds, with books balanced every day, save and reload still matching (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`), and the economy no worse than now: average unemployment 5.5 to 6.5%, inflation never above 16% in a year. Change only the module you own and its content file. Commit after `git pull --rebase`, push, and reply with a table of your stats on the three seeds at years 10, 20 and 30, and your cost. Then stop.
