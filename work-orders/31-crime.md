# Work order 31: crime and dirty money

You own `sim/modules/crime/` and `sim/content/crime.txt`. Add one `w.use(crime)` line in `sim/run.ts`, after `law`. Report offences to the law module through its exported functions (add the smallest one if needed). Read `AGENTS.md` and `sim/README.md` first.

## Build

1. **Street-level and white-collar crime by people with motives**: theft and burglary when poor and desperate (psyche stress, unemployment), embezzlement by finance staff under debt or habit pressure (gambling), tax evasion by the rich, loan fraud.
2. **Organised crime**: a few gangs, whose members are people, run smuggling through the port (abroad module), protection rackets on small firms, loan-sharking to those the banks refuse, and illegal gambling that feeds habits.
3. **Money laundering**: dirty cash is washed through front firms (cash-heavy sectors report sales that did not happen), property purchases and crypto; this inflates those firms reported earnings, which the earnings and media modules can pick up.
4. **Corruption**: bribes to investigators, politicians and port officials, each a risk of exposure by the press.
5. **Police** as public staff with a budget set by politics; detection depends on staffing; victims feel it (psyche), neighbourhood crime lowers property desirability.
6. **Stats line**: offences by kind, gang income, money laundered, arrests, bribes.

Every change is an event with causes, so `--explain` reads as a story, and all money moves through the ledger. Any cache lives in the saved state (`w.state`).

## Done

`node sim/run.ts --years 30 --seed 1` (and seeds 2 and 3) finish with books balanced every day; save and reload still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`); the economy is no worse than now (average unemployment 6.5 to 7%, inflation never above 8% in a year); and 2 years at `SIM_POP=200000` take no more than 3 seconds longer than before your work. Commit after `git pull --rebase`, push, and reply with your stats line at years 10, 20 and 30 on the three seeds, one `--explain` chain, and your cost. Then stop.
