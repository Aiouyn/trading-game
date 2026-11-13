# Work order 08: crypto and memecoins

You own `sim/modules/crypto/` and one `w.use(crypto)` line in `sim/run.ts` (after `social`). Read the other modules' state only; do not edit them. Read `AGENTS.md` and `sim/README.md` first, especially "People are parallel arrays". The November app has a memecoin launchpad in `src/` (look under `src/launchpad` and the server code). Reuse its ideas: bonding-curve launch, rug pulls, hype phases. Do not reuse its random price paths.

## Why

Stocks have profits behind them. Coins don't. Their price is attention and money flowing in and out, and in this world attention is real: people hear about a coin from their contacts (the social module's 16 contacts per person) and buy according to their own traits and savings.

## Build

1. **Exchange and coins on the ledger.** A crypto exchange actor holds people's coin balances. Each coin is a `share`-kind instrument issued by its creator. Trades are paid in `dep`.
2. **Two kinds of coin.**
   - **Majors**: two or three coins that exist from genesis. They have a fixed supply schedule and a little real use: a firm in `FINANCE` accepts one for payments, giving a small steady demand.
   - **Memecoins**: launched by people. A person with savings, low anxiety (or high `resil` until work order 07 lands) and many contacts can launch one: they pay a fee and seed a bonding-curve pool. Name each coin from a word list plus their family name.
3. **Attention spreads through real contacts.** Each coin has a set of people who have heard of it (a bitset over people, as the social module does for facts). Each week a holder tells a few contacts; the chance rises with trust and with the coin's recent gain. Hearing is not buying: a person buys if their savings and traits allow and the coin went up recently (momentum), with small sizes relative to wealth.
4. **Phases come out of behaviour, none scripted.** Early holders tell others, the price rises on the curve, latecomers buy at the top. Holders who are up take profit, which turns the curve down. A creator with low loyalty to their own contacts may rug: pull the pool and walk away with the money, emitting `crypto.rug`. Victims get a `thought()` of 300, and their contacts' trust in the creator drops.
5. **Majors trade on an order book** (reuse the matching approach in `modules/markets`), with a market maker and a momentum fund. Their price can react to the policy rate: high rates pull money out.
6. **Leaks into the real economy.** Gains and losses are real money. A mania pulls savings out of the bank and out of shops; a crash leaves people broke, with the usual stress and the broke thoughts. Do not add any extra effect on the economy. These flows are the effect.
7. **Causality.** A memecoin that rises more than 5× in a week emits `crypto.mania`, caused by the conversations that spread it (the launch event, then the biggest spreaders' events). `crypto.crash` and `crypto.rug` explain themselves the same way.
8. **Stats.** Price of the largest major, number of live memecoins, people holding any coin, total money lost to rugs this year.

## Done

`SIM_POP=6000 node sim/run.ts --years 20 --seed 1 --explain crypto.mania` finishes with books balanced, at least one mania and one rug, and a readable chain. No year has inflation above 15%. `SIM_POP=200000 node sim/run.ts --years 3` stays under 18 seconds per year. Commit to `v1-build`, push, and reply with the output, your run time and cost. Then stop.
