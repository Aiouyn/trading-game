# Work order 29: faster again, same world

Same rules as before: change internals anywhere, but `node sim/run.ts --years 2 --seed 1` must print the same state hash before and after your work (with `SIM_POP=20000` and `SIM_POP=200000`), and save and reload must still match. Measure the hashes on the current tip first and again after every `git pull --rebase` (other agents are tuning modules at the same time; if their push changes the hash, take the new tip's hash as the reference). Read `AGENTS.md` and `sim/README.md` first.

## The problem

At 200,000 people, 2 years with all 23 modules take 54 seconds (27 a year). The goal is 18 seconds a year, so that a 100-year history at 500,000 people takes under an hour.

## Done

Profile (`SIM_POP=200000 node --cpu-prof sim/run.ts --years 1 --seed 1`), fix the top costs, and reply with the before and after timings, the hashes, the top ten costs before and after, and your cost. Commit after `git pull --rebase`, push. Then stop.
