# Work order 06: commodity spot and futures markets

You own `sim/modules/commodities/` and one `w.use(commodities)` line in `sim/run.ts` (after `markets`). Do not edit other modules; read their state only. Read `AGENTS.md` and `sim/README.md` first, including "People are parallel arrays".

## Why

Crude oil, natural gas, coal, iron ore, copper, lithium, grain and livestock already exist as physical goods on the ledger, made and consumed by real firms (`sim/content/goods.txt`). Firms set their prices from cost, and buyers order from them directly. There is no exchange where those goods are priced in public, and no way to bet on or hedge future prices. A drought or an embargo should move futures before it reaches the shops.

## Build

1. **Contracts, one per commodity and delivery month.** For CRUDE_OIL, NATURAL_GAS, COAL, IRON_ORE, COPPER, LITHIUM, GRAIN and LIVESTOCK, keep the next six monthly contracts listed. A contract is for a fixed quantity of the good, delivered at expiry.
2. **Positions and margin on the ledger.** A long or short position is recorded per holder per contract. Holders post margin in `dep` with the exchange (a new actor). Positions are marked to market daily and gains and losses move as cash between holders through the exchange. A holder who cannot meet a margin call is closed out, emitting `futures.marginCall`. Physical delivery at expiry moves real goods from the short's stock to the long, through the ledger.
3. **Traders, with their own reasons.**
   - Producers (the firms that make these goods) sell futures to lock in part of their next months' output when futures trade above their unit cost.
   - Big buyers (the firms whose recipes use these goods) buy futures to lock in input costs when their stock is thin.
   - Commodity funds, capitalised by the richest people like the funds in `modules/markets`, follow trend and carry. Carry is the gap between near and far contracts.
   - A market maker quotes both sides.
   - Small random noise in timing and size may come from `w.rng('cmdty:...')`; direction and fair value never do.
4. **Fair value.** Traders estimate future spot from today's firm prices for the good, current stocks against usual stocks, active shocks in `w.state.economy.shocks` with their remaining days, and the policy rate as the cost of carry.
5. **Feedback to the real economy.** Expose `futuresPrice(w, good, monthsAhead)`. Do not change the economy module. Firms with an open hedge simply buy and sell at their hedged price for that quantity, because their futures gain or loss settles in cash.
6. **Causality.** A daily move of more than 4% in a front-month contract emits `futures.move` whose causes are the shock, stockout, input-shortage or `cb.rate` events behind the traders' changed views. Running `--explain futures.move` after a drought must reach `shock.drought`.
7. **Stats.** Front-month price of oil, copper and grain; open interest; number of margin calls.

## Done

`SIM_POP=6000 node sim/run.ts --years 20 --seed 1 --explain futures.move` finishes with books balanced, prices that stay within a believable range of the firms' prices, and a readable chain. `SIM_POP=200000 node sim/run.ts --years 5` stays under 18 seconds per year. Commit to `v1-build`, push, and reply with the output, your run time and cost. Then stop.
