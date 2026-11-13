# Work order 03: content as data files

You own `sim/content/` and `sim/kernel/content.ts`. You may change `modules/economy/index.ts` only to replace its hard-coded `SECTORS` table and firm list with what the loader returns. Read `AGENTS.md` and `sim/README.md` first.

Dwarf Fortress keeps all content in plain-text definition files, separate from the engine. Do the same.

1. **Format**: one object per block, `[OBJECT:TYPE]`, `[ID:NAME]`, then `[TAG:arg:arg]` lines. Write the parser in `sim/kernel/content.ts` (no dependencies), with clear errors that name file and line.
2. **Object types**: `GOOD` (unit, perishable, budget share), `RECIPE` (inputs and quantities per unit of output, labour per unit), `SECTOR`, `FIRM_TEMPLATE` (sector, size range, family-owned chance), `POSITION` (title, succession: HEIR or APPOINTED, removal rule), `SHOCK` (yearly chance, target, effect, duration).
3. **Content**: grow the world from 4 goods and 12 firms to at least 40 goods across 13 sectors (energy, agriculture, mining, metals, chemicals, construction, manufacturing, technology, transport, retail, healthcare, finance, media) with real input chains three or four steps deep, about 60 firms, and 8 named shocks (drought, port strike, mine collapse, pandemic, patent breakthrough and so on).
4. The economy module must run from these files with no content left in code.

Done: `SIM_POP=6000 node sim/run.ts --years 20 --seed 1` finishes with "Books balanced every day"; unemployment and inflation stay in a believable range. Commit to `v1-build`, push, reply with the output, your run time and cost. Then stop.
