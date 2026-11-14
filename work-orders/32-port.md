# Work order 32: the port and shipping

You own `sim/modules/port/` and `sim/content/port.txt`. Add one `w.use(port)` line in `sim/run.ts`, after `abroad`. Trade volumes come from the abroad module: add the smallest exported hooks there so imports and exports pass through your ships and docks. Read `AGENTS.md` and `sim/README.md` first.

## Build

1. **Ships are things**: each vessel has an owner (shipping firms), capacity, age, crew (people), a route and a voyage time; cargo is real goods in transit in the ledger, so imports ordered today arrive weeks later.
2. **The port has capacity**: berths, cranes, dockworkers (staff of a port firm), warehouses. Congestion delays cargo and raises freight rates; a storm (insurance hazards) or a strike closes it.
3. **Freight rates clear** between shippers and ship owners; a freight futures contract on the commodities exchange if its API allows.
4. **Customs** collects tariffs set by politics and inspects cargo (smuggling for the crime module if present).
5. Delays ripple: firms waiting on imported inputs run short, prices rise, and each step is an event.
6. **Stats line**: ships, cargo in transit, average delay, freight rate, port utilisation, tariffs collected.

Every change is an event with causes, so `--explain` reads as a story, and all money moves through the ledger. Any cache lives in the saved state (`w.state`).

## Done

`node sim/run.ts --years 30 --seed 1` (and seeds 2 and 3) finish with books balanced every day; save and reload still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`); the economy is no worse than now (average unemployment 6.5 to 7%, inflation never above 8% in a year); and 2 years at `SIM_POP=200000` take no more than 3 seconds longer than before your work. Commit after `git pull --rebase`, push, and reply with your stats line at years 10, 20 and 30 on the three seeds, one `--explain` chain, and your cost. Then stop.
