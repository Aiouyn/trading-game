# sim: the world simulation

Run it: `node sim/run.ts --years 10 --seed 1 --explain cb.rate` (Node 22.18+, no install, no build).

## The four laws

1. **Money moves only through the ledger.** `w.ledger.issue / redeem / move` for financial claims (integer cents), `produce / consume` for physical goods. Never keep a balance in module state.
2. **Every actor has a balance sheet.** Net worth is derived with `ledger.netWorth()`, never stored.
3. **No number from thin air.** Prices, earnings, rates and defaults are computed from actor state. `w.rng(key)` is allowed only for tagged outside shocks (`w.events.exo`) and market microstructure noise.
4. **Every event has a cause.** `w.events.emit(kind, msg, causes)` needs the ids of the events that caused it. Every ledger posting carries a cause id. `w.events.explain(id)` must give a chain a player can read.

## Kernel (`sim/kernel/`)

| File | What it gives you |
|---|---|
| `world.ts` | `World` (day, ledger, events, `state`, `rng`), the `Module` interface: `init`, `tick`, `dayClose`, `monthEnd`, `stats`. 30-day months, 360-day years. |
| `ledger.ts` | Actors, instruments (`money`, `claim`, `share`, `real`), postings, `netWorth`, `check()`, `hash()`. |
| `events.ts` | The causality log: `emit`, `exo`, `last(kind)`, `explain(id)`. |
| `rng.ts` | Deterministic named random streams. |

## Writing a module

- One directory under `sim/modules/<name>/`, exporting a `Module`. Register it with `w.use(...)` in `sim/run.ts`.
- Keep your state in `w.state.<name>`. Read other modules' state; do not write it.
- TypeScript must be erasable: no `enum`, no parameter properties, imports end in `.ts`.
- Return a few numbers from `stats()` so the yearly table shows your module is alive.

## What exists

`modules/economy` is the seed: 12 firms in 4 sectors with an input chain, 3 household classes, one bank that creates deposits by lending, a government with a budget rule, a central bank on a Taylor rule, and one tagged outside shock (energy supply). It is deliberately small. Work orders deepen it.
