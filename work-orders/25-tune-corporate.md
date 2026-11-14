# Work order 25: keep the business world alive

You own `sim/modules/corporate/` and `sim/content/names.txt`. Read `AGENTS.md` and `sim/README.md` first.

## The problem

With all modules on, the number of firms shrinks from 63 to about 49 over 30 years: takeovers and failures outpace foundings (in the previous wave it grew to 73). Fewer firms means less competition, fewer stocks and a duller world.

## Targets

- Firms alive stay between 55 and 95 over 30 years; foundings each decade at least match takeovers plus failures, unless the economy is in a long slump.
- Foundings respond to opportunity: more in sectors where margins are high or firms were absorbed, fewer when credit is tight.
- Takeovers stay a few a year, and merged firms keep a realistic share of the market (no sector ends with a single firm unless it started that way).

## How to measure

Run `node sim/run.ts --years 30 --seed 1`, `--seed 2` and `--seed 3` (20,000 people each, about 10 minutes each) and read the yearly stats lines. Every target below must hold on all three seeds, with books balanced every day, save and reload still matching (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`), and the economy no worse than now: average unemployment 5.5 to 6.5%, inflation never above 16% in a year. Change only the module you own and its content file. Commit after `git pull --rebase`, push, and reply with a table of your stats on the three seeds at years 10, 20 and 30, and your cost. Then stop.
