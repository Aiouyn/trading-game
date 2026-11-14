# Work order 36: speed, round 3

Same rules as rounds 1 and 2: change internals anywhere, but `node sim/run.ts --years 2 --seed 1` must print the same state hash before and after your work (with `SIM_POP=20000` and `SIM_POP=200000`), and save and reload must still match. Measure hashes on the current tip first and again after every `git pull --rebase` (six agents are adding modules at the same time; when their push changes the hash, the new tip's hash is the reference). Read `AGENTS.md` and `sim/README.md` first.

## The problem

At 200,000 people, 2 years with all 23 modules take 54 seconds (27 a year); the goal is 18 a year. Two rounds of local fixes each gained a fifth and new modules ate it. This round, go structural: run only the people who can be affected (active sets instead of whole-population scans each day), spread monthly passes over the days of the month by person index, and cut event and string allocation in daily loops.

## Done

Reply with before and after timings, the hashes, the top ten costs before and after, and your cost. Commit after `git pull --rebase`, push. Then stop.
