# Work order 81: the first five minutes

Read `AGENTS.md` (including the Next.js block), `docs/DIRECTION.md`, `docs/DESIGN.md`, `src/app/`, `src/components/shell/`, `src/server/`, and the title, scenarios and tutorial data `sim/server.ts` sends (`/title`, `/scenarios`, `/start`). An early-access player decides in five minutes whether this world is worth their evening. Make those minutes unforgettable, inside the Ink & Brass rules.

You own the title screen, the new-game flow, the loading screen and the first-run layout in `src/app/` and `src/components/shell/`. You may add fields to `sim/server.ts` responses; do not change `sim/modules`.

## Build

1. **Title screen**: Port Avalon at night as a calm, typographic scene drawn from the live world (the harbour, the exchange, a few real headlines and rich-list names from the pre-built world drifting by), Continue, New game, Load, Settings. Fast: the title shows within a second of the page.
2. **New game**: choose a scenario from six cards (brief, goal, difficulty, what makes it different), then who you are (name, age band, starting district: the options the simulation supports), then a 3-line arrival text written from the real world state: your city, your employer, the people who will write to you first.
3. **The first minute**: the desktop opens with the right apps for the scenario, the first letter from a real contact arrives within the first game-week, and the tutorial's first step is one obvious button.
4. **Loading**: when the world takes time, show what is happening in words ("Opening the exchange", "Your sister writes…"), never a bare spinner.
5. **Settings**: palette, text size, reduced motion, game speed, autosave, sound off. Saves list with date, scenario and net worth.

## Done

From an empty browser: title, new game in every scenario's first step, continue, load a save. Desktop and phone. `npx tsc --noEmit` has no errors in `src/`. Screenshots `docs/design/quay-title.png`, `docs/design/quay-newgame.png`, `docs/design/quay-arrival.png`. Commit after `git pull --rebase`, push to v1-build, reply with paths and cost. Then stop. No test suites, no docs.
