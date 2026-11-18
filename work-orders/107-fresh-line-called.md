# Work order 107: a fresh credit line is called within days

Read `AGENTS.md`, `sim/README.md`, `sim/modules/banking/`, `sim/modules/player/` and `sim/modules/markets/` (splits).

You own `sim/`. Do not touch `src/`.

## What happens

`/start {"id":"employer-week"}`, then `{"kind":"cash","op":"borrow","amount":2000000,"product":"line"}` (accepted: $19,371.57 on a credit line at 12.45%, tightness 0.28, "steady"), then wait 24 days. By about day 370 the player gets a margin call: "Zelia Linsalard is called on Urbana Properties for 19372; three trading days to pay it down". The call lists 19 Urbana at $1,059.22 and 20 Kestrel at $1,142.36. The letter then says "You owe the bank $0.00 on open loans" while the call is open. The line is gone from `/view` credit, and cash fell to $38k. A trader persona in order 103 hit the same thing.

Urbana had a 4-for-1 split in these runs. Suspect a collateral valuation that mixes pre- and post-split quantity or price, or a credit line treated as a margin loan. Find the real cause.

## Do

1. Fix the cause. A credit line is called only when it falls due and is not rolled, or when credit is tight, as order 100 designed. A margin loan is called only when collateral really slips.
2. Every call letter shows the right amount owed and which loan is called, and says why in one line (shares fell X%, the line came due and was not rolled, lenders pulled back).
3. Splits: check that every holding, pledge, cost basis and limit across the sim treats a split as value-neutral.
4. Play `employer-week` through `sim/play.ts` as a trader: borrow on a line, buy, wait three months. Show the loan staying open until it is due, and what happens when it is due.

## Done

The cause in two lines, the play excerpt, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
