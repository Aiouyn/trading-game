# Work order 48: multiplayer groundwork

You own `sim/modules/player/`, `sim/play.ts`, `sim/server.ts` and a new `sim/replay.ts`. Read `docs/DIRECTION.md` (section "Multiplayer groundwork that goes into V1"), `AGENTS.md` and `sim/README.md` first. V1 still runs with one player: this order changes no gameplay.

## Build

1. **Many players in the state.** Replace the single player (`PlayerState.who`, `playerIndex(w)`) with a list keyed by player id. `act(w, playerId, cmd)` and `view(w, playerId)`; one-player helpers keep working so the bots, scenarios and screens need only small changes (make them).
2. **The command log.** Every accepted or rejected command is recorded with its day and player id in the saved state. `sim/server.ts` and `ui/` must never change world state except through `act`: find and remove any place that does.
3. **Replay.** `node sim/replay.ts --log <file>` rebuilds the world from its seed, scenario and command log and checks that the daily ledger hash matches the one recorded at each day. Save writes the log next to the world.
4. **Cross-machine check.** `node sim/replay.ts --hashes 200 --seed 1` prints the ledger hash for each of 200 days. Run it on this Linux machine and commit the output as `sim/hashes-linux.txt`; the owner will run it on Windows and compare. List any source of difference you suspect (for example `Math.pow`, `Math.exp`, sorting with an unstable comparator, iteration order of objects with numeric keys).
5. Keep the sim free of `Math.random`, `Date.now` and wall-clock reads; add a check to `sim/run.ts` that fails the run if any module calls them during a run.

## Done

A 5-year scripted game replays from its log to the same hash on every day; the bots, `play.ts` demos, scenarios and the server still work. ## Done

`node sim/run.ts --years 30 --seed 1` (and seeds 2 and 3) finish with books balanced every day; save and reload still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`). Commit after `git pull --rebase`, push, and reply with what this order asks for and your cost. Then stop.
