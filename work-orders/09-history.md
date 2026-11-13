# Work order 09: world history before the player arrives

You own `sim/modules/history/`, a new script `sim/worldgen.ts`, and one `w.use(history)` line in `sim/run.ts` (last). Read the other modules' state only. Read `AGENTS.md` and `sim/README.md` first.

## Why

Dwarf Fortress runs centuries of history before you play: civilisations rise and fall, figures are born, rule and die, and you can browse all of it. Port Avalon should open on a world with a past: dynasties, crashes, scandals and fortunes. It also hides the rough first years every world has today (year 1 runs at about 25% unemployment while the economy finds its feet).

## Build

1. **`node sim/worldgen.ts --years 100 --seed 7 --out worlds/7`** creates a world, runs it for the given years, and saves it:
   - **The full state**: the ledger, every module's `w.state`, the people arrays and the event log, in a compact binary or JSON-lines format.
   - **A chronicle.**
   A saved world can be reloaded with `node sim/run.ts --load worlds/7 --years 5` and continue exactly as if it had never stopped. Prove it: running 100 years straight and 95 + save + load + 5 give the same state hash.
2. **The chronicle: the history module records what matters as it happens.** History is made of entries about named people, firms and years, and each entry keeps its cause:
   - founding and failure of firms;
   - every change of chief executive, and family dynasties (who inherited what from whom);
   - each recession and recovery (unemployment above 12%, then back under 8%), each inflation spike, each bank run or failure;
   - the biggest fortunes made and lost each decade;
   - the oldest person, the richest family, the longest-running chief executive.
   It must stay readable: a few hundred entries per century, not every event.
3. **Browsable output.** Write `chronicle.md` (decade by decade, plain language) and `chronicle.jsonl` (one entry per line with year, kind, people, firms, text and cause chain), so a later screen can show it. Every entry names real people and firms from the arrays.
4. **Family trees.** For the 20 richest families at the end, write each family's tree: who was born, married, inherited and ran which firm, with years.
5. **Event log memory.** `EventLog` drops old events past its cap. The chronicle must keep its own copies of what it needs, including cause chains rendered as text at the time, so a century still explains itself.
6. **Speed.** 100 years at 50,000 people must finish in under 25 minutes. If it doesn't, tell me where the time goes; do not cut features.

## Done

`node sim/worldgen.ts --years 100 --seed 7 --out worlds/7` with `SIM_POP=50000` finishes, books balanced. `worlds/7/chronicle.md` reads like a history. The save-and-load hash check passes. Commit the code (not the world files) to `v1-build`, push, and reply with the first two decades of the chronicle, the timing, and your cost. Then stop.
