# Work order 54: the browser game, start to finish

Read `AGENTS.md`, `sim/README.md` and `docs/DIRECTION.md` (surface rule) first. You own `ui/` and `sim/server.ts`. Read the player module (`sim/modules/player/`); do not change it, except adding fields to what `view()` returns if a screen needs data that exists but is not exposed.

## The goal

Someone double-clicks, a browser opens, and within one minute they are playing a scenario and understand what to do. Today the screens exist as panels on a server you start by hand with a saved world.

## What to build

1. **Title screen**: New game (pick a scenario with its story, goal, time limit and difficulty, or sandbox), Continue (last save), Load, Challenge code. A new world is generated with a progress bar showing the history being written ("Year 34: Northgrid Power founded by ...").
2. **The main screen** around one idea: your life in this city. Top bar: date, net worth with trend, the six stats as words with arrows, the scenario goal and time left. Centre: what happened to you and around you since last time, each line clickable for "why?". Sides: the panels that exist today (desk, newswire, firms, people, contacts, bonds, futures, options, crypto, forex, property, family, health, economy), reached by a left menu with keyboard shortcuts.
3. **Time controls**: pause, play at 1 day/second, fast (1 week/second), skip to next month; auto-pause on margin calls, takeover bids, arrests, deaths in the family, scenario milestones.
4. **Feel**: a coherent trading-terminal look (dark, dense, monospaced numbers, green/red moves, sparklines on every price, no layout jumps), readable at 1366×768 and up. Plain JavaScript and CSS, no build step, no framework downloads at runtime.
5. **Save and load** from the UI, with autosave every game month.

## Done

`node sim/server.ts` with no arguments serves the title screen on http://localhost:4173; a new scenario can be started, played for a year with the time controls, saved, and continued. `node sim/run.ts --years 10` still prints "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, reply with how to start it and your cost. Then stop. No test suites, no docs.
