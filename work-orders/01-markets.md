# Work order 01: stock market

You own `sim/modules/markets/` and one `w.use(markets)` line in `sim/run.ts` (after `economy`). Read `AGENTS.md` and `sim/README.md` first. Touch nothing else.

## Build

A stock exchange where the shares that already exist on the ledger (`eq:frm_*` and `eq:bank_1`) trade for deposits (`dep`).

1. **Order book per stock.** Limit and market orders, price-time priority, matching on each intraday tick. Set `ticksPerDay` to 8 in `sim/run.ts`. A trade settles on the ledger in the same tick: shares move one way, deposits the other, using `pay()` from `modules/economy`.
2. **Traders are ledger actors with their own money.** Create a few funds at init, capitalised by the household classes buying fund shares (same pattern as the genesis equity in `modules/economy`):
   - value funds: fair value = discounted dividends, from each firm's `lastProfit` and `lastDividend` and the policy rate in `w.state.economy`. Buy below, sell above.
   - momentum funds: follow the recent price trend.
   - a market maker: quotes both sides around the last price, widens the spread when its inventory or volatility grows.
   - households: the three classes rebalance slowly toward a target equity share of their wealth.
   Small random noise in order timing and size is allowed, drawn from `w.rng('mkt:...')`. Fair values and direction are never random.
3. **Prices.** Last trade price per stock, daily open/high/low/close/volume history, and a cap-weighted index. Expose `w.state.markets.price(instr)` in cents so `ledger.netWorth(actor, price)` works.
4. **Causality.** When a stock closes more than 3% from the previous close, emit `mkt.move` whose causes are the events that changed the traders' inputs that day: the firm's `firm.price`, `firm.default`, `firm.stockout`, or `cb.rate`, `macro.cpi`. Running with `--explain mkt.move` after an energy-shock year must show a chain that reaches `shock.energy`.
5. **A player hook.** Export `submitOrder(w, actor, { instr, side, qty, limit? })` returning an order id, and `cancelOrder`. Any ledger actor with deposits can call it.
6. **Stats.** Add to the yearly table: index level, yearly turnover in millions, average price/earnings.

`legacy/oct07-src/engine/trading.ts` has the earlier execution code (spread, impact, fees, halts). Reuse ideas from it. Do not port its random price generator: prices here come from orders.

## Done

`node sim/run.ts --years 10 --seed 1 --explain mkt.move` finishes, prints "Books balanced every day", shows your three stats moving, and the explain chain is readable. The same seed gives the same state hash twice.

Commit to `v1-build`, push, and reply with that output and the wall-clock time and cost of your run. Then stop.
