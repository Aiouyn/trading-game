# Work order 86: a life with plans

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`, `sim/modules/circle/`, `sim/modules/society/`, `sim/modules/social/`, and how `sim/server.ts` builds the calendar (search for "calendar").

You own `sim/modules/circle/`, `sim/modules/society/` and `sim/modules/social/`. Work order 82 is editing `sim/server.ts`; you may add only a few lines to its calendar function so your new events appear there. On a rebase conflict keep both sides.

## The problem

The calendar is sparse, and a player should feel they have a life with friends, family and a city that makes plans with them and without them.

## Do

1. Give the circle and society modules dated plans, each made a few days to weeks ahead: dinners and drinks with friends, birthdays, weddings and funerals in the circle, a colleague's leaving drinks, a charity gala, a society party the rich list attends, a friend's job interview or house move, a contact asking to meet about a deal.
2. Each plan has a date, place, who comes, and something it can change: a relationship warms or cools if the player goes or skips, someone mentions a tip or a job, a cost is paid through the ledger. Some plans are invitations the player answers through the existing act mechanism. People who are skipped too often stop inviting.
3. A typical month should hold 4–10 entries for a sociable player and fewer for a recluse. Other people's lives keep moving whether or not the player joins in: they marry, move, change jobs, fall out.
4. Keep the books balanced and the run deterministic.

## Done

Paste three sample months of calendar entries from a 3-year run, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that and your cost. Then stop.
