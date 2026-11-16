# Work order 45: a game, not just a world

You own `sim/modules/player/` (a new file `scenarios.ts` and what it needs), `sim/content/scenarios.txt`, `sim/play.ts` and the matching screens in `ui/`. Read `AGENTS.md`, `sim/README.md` and the player module first.

## Why

The player can now do almost anything, but nothing says what they are trying to do. Wall Street Raider and Capitalism Lab give the player a start, a goal and a clock, and let them pick how hard it is.

## Build

1. **Scenarios** in a raw file: name, story text (two or three sentences), start (who the player is: age, money, job, family, contacts, holdings; which saved world or seed; the year), goal (net worth, control of a named firm or sector, a political office, a dynasty over N generations, survive a crash), time limit, and difficulty modifiers (starting cash, loan limits, how often the regulator investigates the player, how fast rivals react). At least eight scenarios, from "First paycheck" (beginner, small savings, a job) to "Hostile takeover" (control a listed firm in 5 years), "The crash" (start a month before a crisis), "Family business" (inherit a struggling firm), "Dynasty" (open-ended, score across generations).
2. **A sandbox mode** with no goal, choosing start money and difficulty.
3. **Win, loss and score**: the game checks the goal monthly; on success or failure a final screen shows the outcome, the score (net worth against the stock index, firms controlled, reputation, convictions) and the five events that mattered most (from the player's event chains).
4. **New game flow**: `node sim/play.ts --scenario first-paycheck` and the same choice on the opening screen of `ui/`. Worlds come from world generation (`sim/worldgen.ts`): a scenario either names a seed and history length or picks a pre-generated world.
5. **Hints**: the first months of the beginner scenarios show one hint per screen about what the player could try (read the news, talk to a contact, buy shares), switchable off.

## Done

Each scenario starts, and a scripted run of "First paycheck" plays to a win or loss screen, with books balanced every day. Commit after `git pull --rebase`, push, and reply with the scenario list, the end screen of the scripted run, and your cost. Then stop.
