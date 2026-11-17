# Work order 78: the city's society and its calendar

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`, `sim/modules/social/`, `sim/modules/circle/`, `sim/modules/politics/`, `sim/modules/media/`. The player should feel they live among people with standing: the rich, the powerful, the rising and the falling, and a city with a rhythm through the year.

You own a new module `sim/modules/society/` (one `w.use` line in `sim/run.ts`) and may add fields to `sim/server.ts` responses. Read other modules' state; do not change their behaviour.

## Build

1. **The rich list and who matters**: each month, the top 50 households by net worth with the change since last year and its cause (a firm's shares, a property sale, an inheritance, a bankruptcy); the most powerful people (chief executives of the largest firms, bank heads, office holders, the largest landlords) with their standing. The player's own rank, always, with the gap to the next name.
2. **Rising and falling**: monthly stories of the biggest gains and falls among notable people, each with its real cause from the event log. The paper prints the best one.
3. **The calendar**: earnings season, the central bank's meetings, elections and campaigns (from politics), the tax deadline, the harbour festival in summer and the charity gala in winter (both real events where notable people meet; the circle's invitations can point at them), bank holidays when markets close. A `calendar` list of the next 60 days in `/view`.
4. **Standing for the player**: a reputation score with a why (charity, scandals, court cases, a bankruptcy, a famous trade, office), which changes who accepts the player's invitations and introductions in the circle (read through a function the circle module can call; do not change the circle's code beyond one call).

Keep it cheap: monthly work only, over notable people, never the whole population every day.

## Done

`node sim/run.ts --years 10` prints "Books balanced every day"; save and reload match. Paste the rich list top 10 and the player's rank in year 5, five rising and falling stories, and the 60-day calendar. Commit after `git pull --rebase`, push to v1-build, reply with that and your cost. Then stop.
