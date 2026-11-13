# Work order 02: business investment, banks and credit

You own `sim/modules/banking/` and one `w.use(banking)` line in `sim/run.ts` (after `economy`, before `markets`). You may add fields to `Firm` and replace the capacity rule and `borrow()` in `sim/modules/economy/index.ts`, nothing else there. Read `AGENTS.md` and `sim/README.md` first, including "People are parallel arrays": per-person loan data (balance, missed payments, lender) goes in typed arrays on `P` or in arrays indexed by loan, never one object per person.

## Why

Read "Known weak spots" in `sim/README.md`. Today output depends on labour alone, firms never invest, and the one bank barely lends. Profits are paid out and saved by the richest people, so only the government recycles saving: public debt climbs for decades and the economy swings into an inflation spike every 10 to 15 years. Fixing that is the point of this order.

## Build

1. **Capital.** Each firm owns a capital stock of `MACHINERY` (factories, offices) on the ledger. Capacity = min(staff skill x output per worker, capital x output per machine). Capital wears out at 1% a month (consumed through the ledger). Set initial stocks at genesis so capital is not binding.
2. **Investment.** A firm whose utilisation has been above 90% for three months orders machinery from the `MACHINERY` firms to expand, paid from retained earnings first, then a bank loan. Dividends are paid only from what is left after planned investment. Housing works the same way for `HOUSING` builders.
3. **Three more banks**, each a ledger actor with its own shares, capitalised by the richest people at genesis. Deposits stay in `dep`; banks compete for loans on rate.
4. **Loans to firms and people.** Firm loans priced at policy rate + a spread from leverage and profit history; mortgages and consumer loans for people, scored on income, tenure and existing debt. Each loan is its own `claim` instrument. Missed payments, default after three, write-off against bank equity.
5. **Bank failure.** Below 4% capital a bank stops lending; below zero it fails and depositors take losses. `bank.run` when a week's withdrawals exceed 10% of deposits, caused by the defaults that scared people. People who lose savings get `thought()` of 300.
6. **Causality.** Every loan decision, investment, default and failure is an event whose causes include the borrower's situation and the last `cb.rate`.
7. **Stats**: investment per day, total credit, default rate, weakest bank's capital ratio.

## Done

`SIM_POP=6000 node sim/run.ts --years 30 --seed 1` and `--seed 2` finish, and `SIM_POP=200000 node sim/run.ts --years 5` stays under 15 seconds per year, with "Books balanced every day"; public debt stops rising without limit; no year above 15% inflation; unemployment mostly between 4% and 10%. Commit to `v1-build`, push, reply with both tables, your run time and cost. Then stop.
