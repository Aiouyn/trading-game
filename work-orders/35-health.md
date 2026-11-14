# Work order 35: health, hospitals and epidemics

You own `sim/modules/health/` and `sim/content/health.txt`. Add one `w.use(health)` line in `sim/run.ts`, after `psyche`. Deaths go through the existing death path in the economy people code; add health fields through `FIELDS`. Read `AGENTS.md` and `sim/README.md` first.

## Build

1. **Each person has health** that depends on age, income, work (dangerous sectors), habits (psyche: drinking, stress), and housing condition (property). Illness and injury happen to individuals, with sick leave lowering their firm output.
2. **Hospitals and doctors** are firms and people; care costs money: paid by the person, a health insurance policy (insurance module if present), or public care funded by politics. Unpaid medical bills are debts that can ruin a family.
3. **Epidemics**: a disease arrives through the port (abroad or port module if present) and spreads along the real contact network (social) and workplaces; people avoid shops, firms lose staff, the government can close the port or order quarantines, with economic costs.
4. **Mortality** replaces flat age-based death rates with health-based ones; life expectancy differs by wealth.
5. **Stats line**: average health, sick days, hospital spending, uninsured share, epidemic cases and deaths, life expectancy of the richest and poorest fifths.

Every change is an event with causes, so `--explain` reads as a story, and all money moves through the ledger. Any cache lives in the saved state (`w.state`).

## Done

`node sim/run.ts --years 30 --seed 1` (and seeds 2 and 3) finish with books balanced every day; save and reload still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`); the economy is no worse than now (average unemployment 6.5 to 7%, inflation never above 8% in a year); and 2 years at `SIM_POP=200000` take no more than 3 seconds longer than before your work. Commit after `git pull --rebase`, push, and reply with your stats line at years 10, 20 and 30 on the three seeds, one `--explain` chain, and your cost. Then stop.
