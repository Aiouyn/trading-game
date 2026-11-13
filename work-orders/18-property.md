# Work order 18: land and property

You own `sim/modules/property/`. Add one `w.use(property)` line in `sim/run.ts`, after `banking`. Banking already lets households order homes from builders (`housingOrders`); you may change that function in `sim/modules/banking/index.ts` so new homes become your property records, and keep that change small. Read `AGENTS.md` and `sim/README.md` first.

## Why

Most families' wealth is their home, most bank lending is mortgages, and most crises start in property. Port Avalon has houses as a count. A living city has addresses, neighbourhoods, rents, landlords, mortgages and booms and busts in prices that people feel.

## Build

1. **Parcels in neighbourhoods.** The city is divided into neighbourhoods (raw file `sim/content/property.txt`: name, size, desirability, distance from the port). Every dwelling and every commercial building is a parcel record in typed arrays: neighbourhood, type, size, condition, owner (person, firm or landlord), tenant, rent, last sale price.
2. **Living somewhere.** Every household lives in a parcel: owners in their own, others renting. People move when their income changes, when they marry or have children, or when rent becomes too high; firms rent commercial space.
3. **Prices clear in a market.** Sellers list, buyers bid with what they can pay plus what a bank will lend; sales go through the ledger, and price indices per neighbourhood follow sales. Rents adjust to vacancy. Landlords are rich people or funds that buy to rent.
4. **Mortgages.** Banks lend against parcels at loan-to-value limits; repayments come from income; arrears lead to repossession and forced sales. A price fall leaves owners in negative equity; repossessions push prices further down: a housing crash can emerge, and banks take the losses.
5. **People feel it.** Losing a home, being evicted, or a big rent rise are thoughts in psyche; a home's value is part of wealth (netWorth).
6. **Stats line**: price index, rent index, home ownership, vacancy, mortgage arrears, repossessions.

## Done

`node sim/run.ts --years 30 --seed 1` finishes with books balanced every day; prices and rents move with incomes and rates, ownership sits between 50 and 70%, and arrears rise in slumps. Save and reload still match. Commit after `git pull --rebase`, push, and reply with the stats for years 5, 15 and 30 and your cost. Then stop.
