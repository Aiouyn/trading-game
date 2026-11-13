# Work order 05: government bonds, the yield curve and money markets

You own `sim/modules/bonds/` and one `w.use(bonds)` line in `sim/run.ts` (after `banking`, before `markets`). In `sim/modules/economy/index.ts` you may change only `govFund`, `govPay`, the monthly bond repayment, the coupon payment and the `BOND` constant; nothing else there. Read `AGENTS.md` and `sim/README.md` first, including "People are parallel arrays".

## Why

Today the government borrows by handing a single instrument, `bond:gov`, straight to `bank_1`, and pays it the policy rate. There is no bond market, so there are no yields, no yield curve, and nothing for savers, funds or the player to buy except deposits and shares.

## Build

1. **Bonds with maturities.** The treasury issues real securities: 3-month bills, 2-year, 10-year and 30-year bonds. Each issue is its own `claim` instrument issued by `gov` (for example `bond:2y:0037`) with a face value, coupon rate and maturity day. It pays coupons every six months and repays face at maturity, all through the ledger.
2. **Auctions.** When the government needs money (`govFund`), and to roll over maturing debt, it auctions bonds. It splits issuance across maturities by a simple debt-management rule (more bills when rates are high). Bidders submit price and amount; the auction clears at a single price; the coupon is set to the clearing yield rounded to an eighth.
3. **Bidders, with their own reasons.**
   - Banks (from `modules/banking`) keep a share of assets in bills and bonds as a liquidity buffer.
   - Bond funds, capitalised at init by the richest people the same way the stock funds are in `modules/markets`, hold a target duration.
   - People with savings above 6 months of income buy bonds when the yield beats the deposit rate by enough. Their risk appetite comes from their `cY` and `resil` traits.
   - The central bank does not buy at auction.
4. **Secondary market.** Existing bonds trade on an order book (reuse the matching approach in `modules/markets`). Prices move with policy-rate expectations: bidders price bonds off the expected path of the policy rate (current rate plus the Taylor-rule pressure in `w.state.economy`) plus a term premium that rises with public debt to GDP.
5. **Central bank operations.** The central bank keeps the overnight rate at its policy rate by buying or selling short bills with banks (open market operations). In a crisis, when unemployment is above 12% and the policy rate is at 0.75% or lower, it buys long bonds (quantitative easing). Each operation is an event caused by `cb.rate` or `macro.jobs`.
6. **Causality.** A move of more than 0.25 points in the 10-year yield in a month emits `bond.yield` whose causes are the `cb.rate`, `macro.cpi`, `gov.tax` or debt events that drove it.
7. **Stats.** 3-month, 2-year and 10-year yields; public debt held by banks, funds, people and the central bank; auction cover ratio.

## Done

`SIM_POP=6000 node sim/run.ts --years 30 --seed 1` and `--seed 2` finish with books balanced. The yield curve is upward sloping most years and inverts before at least one recession. No auction fails to clear. `SIM_POP=200000 node sim/run.ts --years 5` stays under 18 seconds per year. Commit to `v1-build`, push, and reply with both tables, your run time and cost. Then stop.
