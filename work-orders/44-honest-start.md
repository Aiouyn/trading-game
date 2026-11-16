# Work order 44: a world that starts in balance, the honest way

You may change world creation (the `init` functions of the modules and the content files). Do not change daily rules. Do not add hidden years or move the clock back: the last attempt ran six hidden years at every world open (40 seconds at 20,000 people, minutes at 200,000) and rewrote every date field by name, which breaks the moment a module adds a new date field. It was reverted. Read `AGENTS.md` and `sim/README.md` first.

## The problem, already traced

Opening production is staffed for 90% of the workforce and priced at cost plus 20%, but in the first week buyers clear only about 85% of it: household budgets start at about four-fifths of the wage bill and the government starts with no fiscal stance. Firms cut staff, unemployment jumps from 10% to the mid-20s, and year 1 ends at 16 to 18%.

## What to do

Make the opening consistent: household budgets, deposits and the government's opening spending sized so that demand clears the opening output; opening staff and stocks sized to that demand; opening prices at a normal markup. Check month by month for the first two years.

Target: on seeds 1 to 3, year-1 unemployment within 2 points of the 30-year average, and no month in year 1 above 12%.

## Done

`node sim/run.ts --years 30 --seed 1` (and seeds 2 and 3) finish with books balanced every day; save and reload still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`); the economy is no worse than now. Commit after `git pull --rebase`, push, and reply with the before and after numbers this order asks for and your cost. Then stop.
