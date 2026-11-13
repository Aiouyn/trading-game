# Work order 04: information, rumours and news

You own `sim/modules/social/` and one `w.use(social)` line in `sim/run.ts` (after `markets`). Read `AGENTS.md` and `sim/README.md` first. Touch nothing else.

In this world information is a thing people hold. Mechanics come from the Dwarf Fortress decompilation: each interaction adds 30 familiarity between two people; knowledge is a set of bits a listener either has or gains; the first time anyone learns something is recorded.

1. **Relationships**: a sparse map person-to-person with familiarity and trust. Seed it from family links and co-workers (same firm). Each week every adult has a few conversations, weighted toward people they already know; each adds 30 familiarity.
2. **Facts**: every notable event (`firm.default`, `firm.ceoFired`, `firm.succession`, `firm.cashCrunch`, `cb.rate`, `shock.*`, `mkt.move`) becomes a fact first known only to the people involved: staff of the firm, the board, the central bank. A fact spreads through conversations with a chance that rises with trust.
3. **Insiders**: staff learn their firm's monthly profit a week before `lastProfit` is published. Expose `knows(personIndex, factId)` so the markets module can later let informed people trade early.
4. **News**: a newspaper actor publishes a fact once 2% of the population knows it; then everyone knows it. Emit `news.story` with a readable headline and the fact's event as cause.
5. **Reaction**: learning bad news about your own employer or a firm you own fires `thought()` from `modules/economy/people.ts`.
6. **Stats**: facts created, average days from event to publication, share of facts that reached the paper.

Done: `SIM_POP=6000 node sim/run.ts --years 10 --seed 1 --explain news.story` finishes with "Books balanced every day" and a readable chain. Commit to `v1-build`, push, reply with the output, your run time and cost. Then stop.
