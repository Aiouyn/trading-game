# sim: the world simulation

Run it: `node sim/run.ts --years 10 --seed 1 --explain cb.rate` (Node 22.18+, no install, no build).
`SIM_POP=200000` sets the population (default 20,000). `--chronicle` prints the history; `--check-every N` sets how often the full conservation check runs (daily up to 20,000 people, weekly above).

## Scale

| People | Seconds per simulated year | Memory |
|---|---|---|
| 6,000 | 4 | |
| 200,000 | 13 (including world creation) | 630 MB |

Measured with economy, banking and markets. Before banking: 200,000 people at 9 s, 500,000 at 13 s.

How: people are parallel arrays, not objects (below); the ledger gives every actor a numeric slot and keeps money in one dense array; shoppers pay once into a clearing account that buys from firms in bulk; staff lists remove in O(1).

## The four laws

1. **Money moves only through the ledger.** `w.ledger.issue / redeem / move` for financial claims (integer cents), `produce / consume` for physical goods. Never keep a balance in module state.
2. **Every actor has a balance sheet.** Net worth is derived with `ledger.netWorth()`, never stored.
3. **No number from thin air.** Prices, earnings, rates and defaults are computed from actor state. `w.rng(key)` is allowed only for tagged outside shocks (`w.events.exo`), individual life events (traits at birth, death, pairing, births) and market microstructure noise.
4. **Every event has a cause.** `w.events.emit(kind, msg, causes)` needs the ids of the events that caused it. Every ledger posting carries a cause id. `w.events.explain(id)` must give a chain a player can read.

## Kernel (`sim/kernel/`)

| File | What it gives you |
|---|---|
| `world.ts` | `World` (day, ledger, events, `state`, `rng`), the `Module` interface: `init`, `tick`, `dayClose`, `monthEnd`, `stats`. 30-day months, 360-day years. |
| `ledger.ts` | Actors, instruments (`money`, `claim`, `share`, `real`), postings, `netWorth`, `check()`, `hash()`. |
| `events.ts` | The causality log: `emit`, `exo`, `last(kind)`, `explain(id)`. |
| `rng.ts` | Deterministic named random streams. |

## People are parallel arrays

As in STONKS-9800 (`docs/reverse-engineering/STONKS-9800/analysis/02-companies-npcs.md:97`), there is no person object. `w.state.economy.P` is a `People` store (`modules/economy/people.ts`) with one typed array per attribute: `P.skill[i]`, `P.employer[i]`, `P.born[i]`, `P.slot[i]` (the person's ledger slot), and so on. Person `i` has ledger id `p_${i}`.

- To add an attribute, add it to `FIELDS` in `people.ts` and give it a default in `People.add`. Never keep a per-person JavaScript object or Map with an entry for everyone.
- Hot loops use the ledger's slot API: `L.balS(P.slot[i], 'dep')`, `L.moveS('dep', from, to, cents, reason, cause)`.
- Expensive per-person behaviour (conversations, memories, detailed decisions) should run only for people involved in something, the way Dwarf Fortress keeps population / 50 + 1 detailed figures per civilisation (`decompiled_141522ee0.c:108-112`). Everyone keeps money, a job and a family in the arrays; detail is switched on when it matters.

## Writing a module

- One directory under `sim/modules/<name>/`, exporting a `Module`. Register it with `w.use(...)` in `sim/run.ts`.
- Keep your state in `w.state.<name>`. Read other modules' state; do not write it.
- TypeScript must be erasable: no `enum`, no parameter properties, imports end in `.ts`.
- Return a few numbers from `stats()` so the yearly table shows your module is alive.

## What exists

## Content

All content lives in plain-text files in `sim/content/`, separate from the engine, the way Dwarf Fortress keeps its raws. Parser: `sim/kernel/content.ts` (errors name the file and line). Loader: `sim/modules/economy/content.ts`.

| File | Objects |
|---|---|
| `goods.txt` | 44 goods in 13 sectors, each with its recipe (inputs per unit, output per worker-day), household and government budget shares, perishability. File order is production order. |
| `firms.txt` | 63 named founding firms; each makes one good; `FAMILY` firms pass the chief's seat to heirs. |
| `shocks.txt` | 8 outside shocks (drought, oil embargo, port strike, mine collapse, pandemic, fab fire, battery breakthrough, heatwave) with yearly chance, duration, productivity and demand effects. |
| `positions.txt` | The chief executive position: removal after losing months, retirement age. |

Add a good, a firm or a shock by editing these files; the economy calibrates staffing from the recipes at genesis.

## What exists

`modules/economy`, simulated person by person (20,000 by default, `SIM_POP` to change):

- **People** (`people.ts`): name, family (founding families are generated), age, skill, traits, employer, their own bank balance. Needs are timers that fire thoughts; a resilience trait dampens each thought; stress causes breakdowns that cut spending. Yearly: deaths with inheritance on the ledger, retirements, marriages, births.
- **Firms**: cost-plus pricing with a markup that widens under shortage and narrows with unsold stock; buyers split orders across rivals by price; unmet demand is booked against the sellers that ran short; hiring from the unemployed, then poaching from overstaffed firms. Chief executives removed after six losing months; heirs-first succession.
- **Institutions**: one bank, a government (income tax rule, dividend tax at source, pensions, benefits, an integral fiscal stance that builds up while unemployment stays above 7%), a central bank on a Taylor rule.

`modules/markets`: price-time order book; funds and the 300 richest people trade the firms' shares; a closing mark from the book when a stock does not trade.

## Known weak spots (next work orders)

- **No business investment and no working credit market.** Profits go out as dividends and the rich save them; only the government recycles that saving, so public debt rises for decades and boom-bust inflation spikes appear every 10 to 15 years. Work order 02 adds investment and credit.
- **Size-dependence**: at 500,000 people the first two years run hotter (15% inflation, 25% unemployment) than at 6,000 to 300,000. Not yet investigated.
