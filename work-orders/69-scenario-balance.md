# Work order 69: scenarios worth replaying

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`, `sim/modules/player/scenarios.ts`, `sim/modules/player/story.ts` and the playtests in `sim/playtest/`. Every scenario must be winnable by a thoughtful player, losable by a careless one, and different each time it is replayed.

You own `sim/modules/player/scenarios.ts`, `sim/modules/player/story.ts`, `sim/modules/player/tutorial.ts` and `sim/bots/` (a scenario bot). Keep every other line of the player module when you rebase.

## Do

1. **Measure.** Write a scenario bot set in `sim/bots/` with three styles (careful saver-investor, aggressive leveraged trader, do-nothing) and run each scenario over 10 seeds with each style (`--workers 3` at most). Print a win-rate table per scenario and style.
2. **Tune.** Target: careful 50–80% wins, aggressive 20–50% with a real chance of ruin, do-nothing under 10%. "First paycheck" ($1,500 to $20,000 in 90 days) is likely far too steep: give it a goal and a time a new player can reach with a job, savings and one good trade, and teach that path through the tutorial.
3. **Variety.** Each scenario's opening (employer, family, contacts, first event) varies with the seed; each scenario has at least one mid-run twist drawn from the world (a recession, a takeover of the employer, a family illness) that changes the best plan.
4. **At least six scenarios** spanning the game: first job, the heir with debts, the struggling chief executive, the hedge fund with outside money, the property developer, the activist investor. Each has a one-paragraph brief, a goal with a deadline, a score, and a distinct challenge.

## Done

`node sim/run.ts --years 10` prints "Books balanced every day". Paste the win-rate table before and after tuning. Commit after `git pull --rebase`, push to v1-build, reply with the tables and your cost. Then stop.
