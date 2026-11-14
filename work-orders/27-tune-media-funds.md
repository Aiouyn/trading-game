# Work order 27: the press gets it right more often, and short sellers hunt

You own `sim/modules/media/`, `sim/content/media.txt` and `sim/modules/funds/`. Read `AGENTS.md` and `sim/README.md` first.

## The problem

In seed 1, by year 10 there are 2 scoops against 19 retractions, and after that scoops stop entirely. Short interest is 0% every year and activist campaigns fade to none. The press and the hunters are the main ways private facts become prices; they need to work.

## Targets

- Scoops outnumber retractions overall, serious outlets retract less than sensational ones, and scoops continue in every decade.
- Short interest stays between 1% and 5% of shares, rising on weak firms; at least one short report a decade, some right and some squeezed.
- One to three activist campaigns a year on average; fund flows chase the best strategy of recent years.

## How to measure

Run `node sim/run.ts --years 30 --seed 1`, `--seed 2` and `--seed 3` (20,000 people each, about 10 minutes each) and read the yearly stats lines. Every target below must hold on all three seeds, with books balanced every day, save and reload still matching (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`), and the economy no worse than now: average unemployment 5.5 to 6.5%, inflation never above 16% in a year. Change only the module you own and its content file. Commit after `git pull --rebase`, push, and reply with a table of your stats on the three seeds at years 10, 20 and 30, and your cost. Then stop.
