# Work order 30: death, heirs and dynasties for the player

You own `sim/modules/player/`, `sim/play.ts` and the matching panels in `ui/`. Read `AGENTS.md` and `sim/README.md` first.

## Why

The player is a mortal person: in a 30-year run they died of old age and the game simply had no player. Dwarf Fortress and Crusader Kings turn death into the story.

## Build

1. **Family life for the player**: court and marry a contact (the same pairing rules as everyone), have children, pay for their schooling (careers module), write a will choosing how the estate is split.
2. **On death** the estate passes through the normal estate rules; the player continues as the chosen heir (a child, a spouse, or a named contact), who has their own skills, contacts and reputation. No heir: game over, with a final screen.
3. **A dynasty score**: family net worth across generations, firms founded and controlled, offices held, convictions; a family page in the chronicle.
4. **Ageing matters**: health declines, and the player can retire, hand a firm to a child (the succession rules), or be pushed out by a board.
5. A scripted session `sim/modules/player/demo-heir.txt` in which the player marries, has a child, dies, and play continues as the heir.

Every change is an event with causes, so `--explain` reads as a story, and all money moves through the ledger. Any cache lives in the saved state (`w.state`).

## Done

`node sim/run.ts --years 30 --seed 1` (and seeds 2 and 3) finish with books balanced every day; save and reload still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`); the economy is no worse than now (average unemployment 6.5 to 7%, inflation never above 8% in a year); and 2 years at `SIM_POP=200000` take no more than 3 seconds longer than before your work. Commit after `git pull --rebase`, push, and reply with your stats line at years 10, 20 and 30 on the three seeds, one `--explain` chain, and your cost. Then stop.
