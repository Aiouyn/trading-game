# Work order 80: the city's society in Quay

Read `AGENTS.md` (including the Next.js block), `docs/DIRECTION.md`, `docs/DESIGN.md`, `src/server/`, `src/shell/`, and `sim/modules/society/` (work order 78: rich list, the powerful, rising and falling, the calendar, the player's standing, all in `/view`).

You own a new `src/apps/society` (register it in `src/shell/registry.ts` and `appModules.ts`; keep every entry when you rebase), the shell's top bar calendar chip, and the person page's standing line. Do not change `sim/modules`.

## Build

1. **Society app**: the rich list with this year's change and its cause, your rank and the gap to the next name, the most powerful people grouped by where their power comes from, and the month's rising and falling stories. Every person opens their page; every firm opens its page.
2. **Your standing**: score, its why, and what it opens (who accepts your invitations and introductions).
3. **Calendar**: a chip in the top bar with the next event ("Central bank meets in 3 days"), and a month view in the Society app; market holidays grey out the trade buttons with a reason.
4. **Make the city feel inhabited**: when time runs, a soft ticker of the notable moves (a rich-list change, a new chief executive, a gala) in the Wire and on the phone home screen.
5. Desktop and phone.

## Done

`npx tsc --noEmit` has no errors in `src/`. Screenshots `docs/design/quay-society.png` and one at phone width. Commit after `git pull --rebase`, push to v1-build, reply with paths and cost. Then stop. No test suites, no docs.
