# Work order 73: a career you choose, and options you can always trade

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`, `sim/modules/careers/`, `sim/modules/labour/`, `sim/modules/options/` and the player command table in `sim/modules/player/index.ts`. A playtest of Quay found two holes: the player cannot look for, take, change or quit a job, and in a fresh sandbox and two years later the option chain still says "No listed contracts".

You own `sim/modules/careers/`, `sim/modules/options/`, and new player commands and their handlers in `sim/modules/player/` (keep every other line when you rebase). You may add fields to `sim/server.ts` responses.

## Build

1. **Career commands.** `jobs` lists open positions the labour market really has (firm, role, wage, what it asks: experience, education, health), and how the player compares. `apply <n>` competes with the other applicants on the same rules the labour module uses for anyone; the answer comes days later, by letter from the firm. `quit`, `ask raise` (depends on performance, tenure and the firm's profit; refusal is possible and remembered), and `study <field>` (costs money and time, raises the skill the jobs ask for). Losing a job by layoff follows the same seniority rules as for everyone.
2. **Options are always tradable.** The market maker lists calls and puts on at least the 10 most traded stocks from day 1 of any world, sandbox included, with strikes around the money and expiries 1 to 6 months, priced from the stock's realised volatility. Explain to the player in one sentence when a name has no options and why.
3. **Grammar**: "an Industrial Basin home", and the other "a/an" and plural slips in player-facing sentences in the modules you own.
4. **Server**: `/view` carries `career` (job, wage, tenure, performance, open positions summary) and the option chain for any listed name.

## Done

`node sim/run.ts --years 10` prints "Books balanced every day"; save and reload match. A text-game script: list jobs, apply, get an answer, ask for a raise, quit, take a new job; then buy a call and a put on day 1 of a sandbox. Paste it. Commit after `git pull --rebase`, push to v1-build, reply with the script output and your cost. Then stop.
