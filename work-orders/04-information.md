# Work order 04: relationships, rumours and news

You own `sim/modules/social/` and one `w.use(social)` line in `sim/run.ts` (after `markets`). Read `AGENTS.md` and `sim/README.md` first, especially "People are parallel arrays". Touch nothing else.

In this world information is something people hold. Mechanics come from the Dwarf Fortress decompilation (`C:\\Users\\Mathis\\.gemini\\antigravity\\brain\\2dab82b8-579a-4f5c-8cb3-99f0a994d11e\\dwarf_fortress_simulation_formulas.md`, section 10): each interaction adds 30 familiarity between two people; knowledge is a set of bits a listener either has or gains; the first time anyone learns something is recorded.

## Build it for 200,000 people

1. **Relationships**: a sparse graph in typed arrays (compressed rows or fixed slots per person, for example 16 contacts each: contact index, familiarity, trust). No Map or object per person. Seed from family links and co-workers.
2. **Conversations**: each week every adult talks to a few contacts, weighted toward familiar ones; each adds 30 familiarity. Use the weekly person slot (`i % 7`) like the economy does.
3. **Facts**: every notable event (`firm.default`, `firm.ceoFired`, `firm.succession`, `firm.cashCrunch`, `cb.rate`, `shock.*`, `mkt.move`) becomes a fact known at first only to the people involved: the firm's staff, its owners, the central bank. Who knows a fact is a bitset over people (a `Uint32Array` of P.n / 32 words) or a list of knowers, whichever is cheaper for that fact. A fact spreads through conversations with a chance that rises with trust. Facts older than a year are dropped.
4. **Insiders**: staff learn their firm's monthly profit a week before `lastProfit` is published. Export `knows(w, personIndex, factId)` so markets can later let informed people trade early.
5. **News**: a newspaper (the `NEWS` firms already exist in `sim/content/firms.txt`) publishes a fact once 1% of the population knows it; then everyone knows it. Emit `news.story` with a readable headline, caused by the fact's event.
6. **Reaction**: learning bad news about your own employer or a firm whose shares you hold fires `thought()` from `modules/economy/people.ts`.
7. **Stats**: facts created, average days from event to publication, share of facts that reached the paper.

## Done

`SIM_POP=6000 node sim/run.ts --years 10 --seed 1 --explain news.story` finishes with books balanced and a readable chain, and `SIM_POP=200000 node sim/run.ts --years 3` stays under 15 seconds per year. Commit to `v1-build`, push, reply with the output, your run time and cost. Then stop.
