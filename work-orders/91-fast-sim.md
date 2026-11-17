# Work order 91: a city that stays fast

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`, `sim/world.ts` and the other core files in `sim/`.

Work order 82 measured: a game-day takes about 60 ms in year 1 but 170 ms in year 10, and the sim server's memory grows from about 470 MB to 665 MB over ten years. At the fastest speed a player wants a month to pass in a few seconds, and an early-access player may play for 30 game-years.

You own the core files in `sim/` (not `sim/server.ts`) and every module that no other agent is editing. Agents are editing `sim/modules/media/`, `circle/`, `markets/`, `corporate/` and `property/` right now: if a hot spot is in one of those, make the smallest change that fixes it and keep both sides on any rebase conflict.

## Do

1. Profile a 10-year and a 30-year run (`node --cpu-prof`, plus the heap size each year). List the 10 hottest functions and every structure that grows without limit: event logs, histories, per-person records, price series, closed loans, dead people.
2. Fix the growth: keep recent detail and fold old history into summaries (monthly or yearly), drop what nothing reads, and index what is searched by scanning. History the game shows to the player (charts, the story, a person's past) must still look the same.
3. Targets: a year-10 day under 60 ms, a year-30 day under 90 ms, sim memory flat (within about 20%) from year 5 onward, and a save file at year 30 that loads in a few seconds.
4. Keep the books balanced, the run deterministic, and save/load giving the same state hash.

## Done

Paste the per-year ms per day, heap and save size before and after, for 30 years. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that and your cost. Then stop.
