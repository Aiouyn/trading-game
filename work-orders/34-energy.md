# Work order 34: the power grid and utilities

You own `sim/modules/energy/` and `sim/content/energy.txt`. Add one `w.use(energy)` line in `sim/run.ts`, after `commodities`. Electricity is already a good that firms buy; add the smallest exported hooks in the economy so supply can be rationed by plant capacity. Read `AGENTS.md` and `sim/README.md` first.

## Build

1. **Power plants are assets** owned by the utility firms: coal, gas, oil, hydro, each with capacity, fuel use, age, outages. Fuel is bought on the commodity markets; the cheapest plants run first, and the marginal plant sets the daily power price.
2. **Demand** from firms (by sector intensity) and households (by season: winter peaks). When demand exceeds capacity there are blackouts by neighbourhood: firms lose output, people get angry (psyche), the government is blamed (politics).
3. **Investment**: utilities build plants years ahead with bank loans or bonds; a regulator (politics) caps household tariffs, which can starve investment.
4. **Weather and seasons**: a cold winter or a dry year (hydro) is an event; an oil shock passes through to power prices and on to every firm.
5. **Stats line**: capacity, peak demand, reserve margin, power price, blackout days, fuel mix.

Every change is an event with causes, so `--explain` reads as a story, and all money moves through the ledger. Any cache lives in the saved state (`w.state`).

## Done

`node sim/run.ts --years 30 --seed 1` (and seeds 2 and 3) finish with books balanced every day; save and reload still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`); the economy is no worse than now (average unemployment 6.5 to 7%, inflation never above 8% in a year); and 2 years at `SIM_POP=200000` take no more than 3 seconds longer than before your work. Commit after `git pull --rebase`, push, and reply with your stats line at years 10, 20 and 30 on the three seeds, one `--explain` chain, and your cost. Then stop.
