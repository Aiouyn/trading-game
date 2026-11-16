# Work order 50: the chronicle you can share, and same-seed challenges

You own `sim/modules/history/` (the chronicle), the end screens in `sim/modules/player/` and `ui/`, and `sim/play.ts`. Read `docs/DIRECTION.md` (sections "What the game is" and "Same-seed challenges"), `AGENTS.md` and `sim/README.md` first. Build on the command log of work order 48 if it has landed; otherwise record a hash of the commands yourself in the same place.

## Build

1. **The player's story.** At the end of a game and at any time on request, write the player's chronicle as readable text: the five events that mattered most to the player (largest effect on their life: money, family, health, freedom), each with its cause chain told as sentences with named people; their family tree across generations; the firms they founded or controlled; the city's big events during their life. Export it as Markdown and as plain text.
2. **Challenge codes.** A challenge is a scenario id, a seed and a difficulty. The end screen shows a short code holding scenario, seed, difficulty, score and the hash of the command log; `node sim/play.ts --challenge <code>` starts the same challenge; `node sim/replay.ts --verify <code> --log <file>` checks a claimed score by replay.
3. **The city chronicle** (`chronicle.md` from world generation) gains the same storytelling: each decade's three biggest stories with causes and the people in them.

## Done

A scripted game of the "First paycheck" scenario ends with an exported chronicle that a stranger could read and retell, plus a challenge code that replays to the same score. ## Done

`node sim/run.ts --years 30 --seed 1` (and seeds 2 and 3) finish with books balanced every day; save and reload still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`). Commit after `git pull --rebase`, push, and reply with what this order asks for and your cost. Then stop.
