# Work order 51: the player can lose

Launch condition 1 in `docs/DIRECTION.md`. Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md` and `sim/bots/bots-report.md` first.

You may change: `sim/modules/banking/` (margin and personal loans), `sim/modules/player/` (bankruptcy for the player), `sim/modules/options/` (option margin), `sim/modules/law/` only if bankruptcy fraud needs a hook, and `sim/bots/` (measures and the gambler and raider bots). Read every other module; do not change it.

## The problem

In the last bot report, 0 of 220 runs went bankrupt. The gambler borrows to the limit every week and still has no world below 3.7×; the raider loses money but never goes under. `banking/index.ts` already has `callMargin`, but nothing makes a leveraged position hurt enough to wipe out a player, and there is no personal bankruptcy at all: `sim/bots/worker.ts` only marks a run bankrupt when net worth ends at or below zero.

## What to do

1. **Trace first.** For the gambler on seeds 1 and 2, print per month: loan, collateral at liquidation value, loan-to-value, and any margin call. Find why the calls never wipe it out (limits too loose, calls too late, forced sales at too good a price, or the bot always topping up).
2. **Margin that bites.** Maintenance margin per position, checked daily; a call gives a deadline (3 trading days), then the bank force-sells into the book at whatever it fetches, and the person owes any shortfall as unsecured debt. Options written on margin get the same treatment.
3. **Personal bankruptcy**, for the player and for NPCs: when a person cannot service debts for 90 days, or debt exceeds assets at liquidation value, a court declares bankruptcy. Assets are sold, creditors are paid in order (secured, then tax, then unsecured), the rest is written off on the lender's books through the ledger, and the person is barred from borrowing for 6 years. Each step is an event with causes, so `--explain` gives the chain from the price fall to the ruin.
4. **What the player sees.** Margin call and bankruptcy as player events with plain text. In a scenario, bankruptcy ends the run with a loss screen unless the scenario says otherwise; in sandbox the player continues with nothing.
5. **Bots.** `bankrupt` in the report is set when the court declares it, not from final net worth. Add a column for margin calls.

## Targets on the bot report

Gambler: at least 3 of 20 worlds bankrupt, and its 10th percentile below 1×. Raider: at least 1 of 20 bankrupt. Index investor, bond ladder and do nothing: 0 bankruptcies. Rerun `node sim/bots/run.ts --worlds 20 --years 20 --pop 5000` and commit the report.

## Done

`node sim/run.ts --years 30 --seed 1` (and seeds 2 and 3) finish with books balanced every day; save and reload still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out <tmp dir>`); the economy is no worse than now. Commit after `git pull --rebase`, push to v1-build, and reply with the before and after bot table, one `--explain` chain from a price fall to a bankruptcy, and your cost. Then stop.
