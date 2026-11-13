# Work order 02: banking and credit

You own `sim/modules/banking/` and one `w.use(banking)` line in `sim/run.ts` (after `economy`, before `markets`). Read `AGENTS.md` and `sim/README.md` first. Touch nothing else.

Today one bank exists, no firm ever borrows, and interest rates only reach the economy through household saving. Build the credit channel.

1. **Three more banks**, each a ledger actor with its own deposit instrument (`dep:<bank>`) and shares, capitalised at init by the richest people (same pattern as the funds in `modules/markets`). People and firms keep using `dep` (bank_1) for payments; your banks take term deposits from people who hold more than 90 days of income, and lend.
2. **Loans to people**: mortgages and consumer loans. A person applies when a need fires (see `thought()` in `modules/economy/people.ts`) or to buy shares. The bank scores income, job tenure, existing debt and the person's `cY` trait. Each loan is its own `claim` instrument issued by the borrower. Monthly payments; missed payments; default after three; the bank writes the loan off against its equity.
3. **Loans to firms** for expansion: a firm whose sales exceed capacity for a month borrows to hire ahead. Rate = policy rate + a spread from the firm's `lastProfit` history and leverage.
4. **Bank failure**: a bank whose equity falls below 4% of its loans stops lending; below 0 it fails. Depositors lose what its assets cannot cover. Emit `bank.run` when withdrawals in a week exceed 10% of deposits, with causes pointing at the defaults that scared people. People who lose savings get a `thought()` of 300.
5. **Causality**: every loan decision, default and failure is an event whose causes include the borrower's situation (`person.lastEv`, `firm.priceEv`) and the last `cb.rate`.
6. **Stats**: total credit in millions, default rate, weakest bank's capital ratio.

Done: `SIM_POP=6000 node sim/run.ts --years 20 --seed 1 --explain bank.run` (or `firm.default` if no run occurs) finishes with "Books balanced every day" and your stats moving. Commit to `v1-build`, push, reply with the output, your run time and cost. Then stop.
