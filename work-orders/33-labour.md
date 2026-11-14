# Work order 33: unions, strikes and wage bargaining

You own `sim/modules/labour/`. Add one `w.use(labour)` line in `sim/run.ts`, after `careers`. Wages are set in the economy module: add the smallest exported hook (under 40 lines) so a firm or sector can have its own negotiated wage premium. Read `AGENTS.md` and `sim/README.md` first.

## Build

1. **Unions by sector** with members (people choose to join from their pay, their coworkers and their traits), dues through the ledger, and elected leaders who are people.
2. **Bargaining rounds** each year per sector: demands depend on inflation, the firms profits (earnings reports) and unemployment; firms concede, hold out or lock out.
3. **Strikes**: output stops at struck firms, strikers live on the strike fund and savings, customers switch suppliers, the share price reacts through news; settlements set a wage premium for the contract period.
4. **Politics**: unions donate and endorse (politics module); a government can legislate a minimum wage or restrict strikes.
5. People feel it (psyche: solidarity, stress, resentment of strikebreakers in social ties).
6. **Stats line**: union membership, strikes, days lost, average settlement, minimum wage.

Every change is an event with causes, so `--explain` reads as a story, and all money moves through the ledger. Any cache lives in the saved state (`w.state`).

## Done

`node sim/run.ts --years 30 --seed 1` (and seeds 2 and 3) finish with books balanced every day; save and reload still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`); the economy is no worse than now (average unemployment 6.5 to 7%, inflation never above 8% in a year); and 2 years at `SIM_POP=200000` take no more than 3 seconds longer than before your work. Commit after `git pull --rebase`, push, and reply with your stats line at years 10, 20 and 30 on the three seeds, one `--explain` chain, and your cost. Then stop.
