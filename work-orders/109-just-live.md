# Work order 109: you arrive with $5,000 (rewritten)

Read `AGENTS.md`, `docs/DIRECTION.md`, `sim/README.md`, `sim/modules/player/scenarios.ts` (the `sandbox` goal kind), `sim/modules/player/index.ts`, `sim/server.ts` (`/start`, `/title`), `src/components/shell/TitleScreen.tsx`, `src/shell/StartGate.tsx`, `src/shell/layouts.ts` and `src/components/shell/QuayShell.tsx`.

You own `src/components/shell/`, `src/shell/`, the `/start` and `/title` parts of `sim/server.ts`, and a new file `sim/modules/player/arrival.ts`. Orders 110 (trading terminal) and 111 (bars, courses, people) run at the same time and add routes and commands; keep both sides on any rebase conflict. Keep every existing scenario working in the sim: tests and AI playtests use them.

## Why, in the owner's words

"I should start from nothing, no contact, I just arrived in the city with 5000$ and that's it, then it's my life." "I shouldn't have to learn my situation to then play, I just create mine." "There is no goal, people do what they want, they should be able to do anything." "We are not overloaded with things."

## Do

1. **New game**: type a name (any name; the city adds it to its book) and an age (18 to 60, default 24). Begin. Nothing else.
2. **Arrival**: the player arrives in Port Avalon with exactly $5,000 in cash (moved through the ledger from outside the city, like an immigrant's savings, so the books balance), a room rented by the week in a cheap district, no job, no contacts, no circle, no family in the city, no holdings, no messages, no goal, no time limit. Same seed and name give the same world.
3. **A quiet first screen**: one short paragraph about stepping off the boat, the room and the city's lights. Nothing about work or what to do. No inbox messages, no suggestions, no tutorial.
4. **The city waits**: the player starts everything. They can look for work and apply, take courses, trade, go out to bars, rent a better place, start a company. Nobody contacts the player until the player has met them.
5. **No win or lose**: life runs until death; an heir can carry on. Remove every goal, limit, score and "scenario" word from this path.
6. **Not overloaded**: Quay opens with almost nothing on the desk: the city (where to go), the wallet (cash, room) and the markets. Other apps appear when they become relevant (Bank after the first account, Company after founding one, People after meeting someone). Every app stays reachable from the launcher.
7. **Title screen**: New game, Continue, Settings. Scenarios move to a small "Challenges" link at the bottom.
8. `help` lists what a person can do, grouped by life area, in plain words.

## Done

Paste the `/start` call for a new arrival and the first `/view` (cash, room, job none, contacts none). Check in Quay (`next dev --webpack`) that New game, name, Begin opens the quiet arrival. `npx tsc --noEmit` clean for your files. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
