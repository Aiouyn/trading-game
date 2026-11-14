# Work order 26: people buy insurance

You own `sim/modules/insurance/` and `sim/content/hazards.txt`. Read `AGENTS.md` and `sim/README.md` first.

## The problem

Almost nothing is insured: in seed 1 the insured losses are 0 in most years while uninsured losses run 25 to 68 million a year. Insurance only matters if firms and households buy it.

## Targets

- At least 60% of firms and at least 80% of mortgaged homes carry cover; uptake rises after a big disaster and falls when premiums jump.
- Most disaster losses are insured; insurers make money on average across the 30 years but lose in bad years, and premiums rise after them.
- At least one insurer comes close to failing (capital below its required level) in at least one seed.

## How to measure

Run `node sim/run.ts --years 30 --seed 1`, `--seed 2` and `--seed 3` (20,000 people each, about 10 minutes each) and read the yearly stats lines. Every target below must hold on all three seeds, with books balanced every day, save and reload still matching (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`), and the economy no worse than now: average unemployment 5.5 to 6.5%, inflation never above 16% in a year. Change only the module you own and its content file. Commit after `git pull --rebase`, push, and reply with a table of your stats on the three seeds at years 10, 20 and 30, and your cost. Then stop.
