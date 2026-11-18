# Work order 108: the 30-minute week, played again

Read `AGENTS.md`, `sim/README.md`, `work-orders/103-the-30-minute-week.md`, `sim/playtest/employer-week-runs.md` (the first round) and the commits for orders 105 and 107.

You own `sim/playtest/`. You may make small fixes in `sim/modules/player/` (wording, a broken command, a confusing refusal), nothing larger. Do not touch `src/`.

## Why

Round one found bugs: trades booked to the player, the employer's print missing from news, `protect` not holding, a block valued at a tenth of its price, a credit line called within days, crossed quotes. Orders 105–107 fixed them. Check that the same five players now have five different stories because of their choices, not because of bugs.

## Do

1. Play `employer-week` five times, once per persona from order 103: cautious saver, leveraged trader, loyal worker, ambitious climber, curious newcomer. Play it, do not script a fixed path. Aim for 40 or more commands each: read news, signals, quotes and the sheet before deciding, and keep playing after the goal is met if the game allows it.
2. After each, answer the four questions as that player: what did you know that the market didn't; why did you take the risk you took; what happened that you didn't expect; what do you want to try next time.
3. For each bug from round one, say whether it is gone.
4. Fix small problems in `sim/modules/player/`. List the larger ones with the exact command and day that shows them.
5. Replace `sim/playtest/employer-week-runs.md` with this round's short logs and outcomes.

## Done

In your reply: the five answer sets (short), a table of the five outcomes, which round-one bugs are gone, the fixes you made and the larger problems left. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build. Then stop.
