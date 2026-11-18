# Work order 109: just live

Read `AGENTS.md`, `docs/DIRECTION.md`, `sim/README.md`, `sim/modules/player/scenarios.ts` (the `sandbox` goal kind), `sim/modules/player/index.ts`, `sim/server.ts` (`/start`, `/title`), `src/components/shell/TitleScreen.tsx`, `src/shell/StartGate.tsx`, `src/shell/layouts.ts` and `src/components/shell/QuayShell.tsx`.

You own `src/components/shell/`, `src/shell/`, `sim/server.ts`, and the new-life setup in `sim/modules/player/` (a new file is best). Another agent may make small wording fixes in `sim/modules/player/` at the same time; keep both sides on any rebase conflict. Keep every existing scenario working in the sim: tests and AI playtests use them.

## Why

The owner of the game: "I want to be able to just play, there is no goal, people do what they want, they should be able to do anything in this game." Today New game opens on scenario cards with goals and time limits, and the name must come from the city's book. The game must start from the player's own life.

## Do

1. **New game is "who are you?"**, on one calm screen:
   - Any name the player types (the city adds them to its book).
   - Age (18 to 60).
   - Where they grew up (a district).
   - The family they come from: struggling, modest or comfortable. This sets starting cash, debts and who can help.
   - Schooling, and their first work, chosen from jobs that really exist in the city at the start (a trade, the port, a shop, a desk, a bank, a lab…), or "looking for work".
   - Optional: one or two people they already know (a sibling, an old friend at a firm, a mentor), chosen from real people in the city who fit.
   Sensible defaults for everything, so "Begin" works straight away.
2. **The city builds around the player**: the job, rent or a room at the family's, cash, the first contacts and the circle follow from those choices, inside the real economy (no invented money: use the ledger the way scenarios do). Same seed and same choices give the same world.
3. **No goal, no time limit, no win or lose.** The player's life runs until they die, and the heir can carry on. Remove every goal, limit and "scenario" wording from this path.
4. **A first morning** written about the player: where they wake up, who messages them, a line from the paper, and three or four plain suggestions of things they could do now (go to work, look at the market, call the friend, look for a better job). These are suggestions, not goals.
5. **Ambitions, optional**: the player can write or pick their own ambitions at any time (own a home, start a firm, own the firm I work for, look after my family, retire rich) and drop them. The diary notes progress. Nothing ends when one is met.
6. **The title screen**: New game, Continue/Load, Settings. Scenarios leave the front: keep them reachable only under a small "Challenges" link at the bottom, for players who want a set puzzle.
7. **Discoverable freedom**: the Quay layout for a new life opens on the things a person does (work, money, people, the city), and `help` lists everything the player can do, grouped by life area.

## Done

Paste the `/start` call for a new life and the first-morning text from `/view`, then check through Quay (`next dev --webpack`) that New game → Begin opens a life with no goal. `npx tsc --noEmit` clean for your files. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
