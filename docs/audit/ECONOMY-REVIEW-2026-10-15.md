# Economy review: immersive-game audit

**Audit revision:** `be21a34852d2244ea56c824ef1e85042ea7aecf7` (`codex/memecoin-price-action`)
**Scope:** economy, trading markets, NPC and crowd behavior, launchpad, and the player-facing economic loop.
**Status:** consolidated from the three sub-audits. Code paths below were re-read at this revision. Experiment figures are the saved probes in `proof/economy-audit/experiments.json`. Those probes were not re-run for this synthesis. The reported 735/746 test run was not re-run either.

## Verdict

**5/10 as an immersive trading game.**

The score is for what a trader feels while playing, not an average of the subsystem tables. Company books, fund accounting, and the launchpad curve are ahead of the screen the player stares at. Prices, prints, headlines, chat, and paid promotion often tell different stories. A trader who already knows how a real launch moves will feel that gap immediately. Raising volatility further would make the charts louder and leave the cause of each move just as opaque.

Sub-audit anchors, kept as judgments about their own slices:

| Slice | Score | What it measures |
|---|---:|---|
| Market realism | 4/10 | Whether listed prices, quotes, and the tape describe one market |
| Market fit for this game | 6/10 | Whether the listed engine is a playable fortune loop |
| Launchpad behavior / causality | 3/10 | Whether a coin moves because someone decided something |
| Promotion economics | 2/10 | Whether paying for attention is different from buying the print |
| Money stabilization | 3/10 | Whether the levy tracks the quantity its copy names |
| Companies and funds, as rules | 7/10 and 8/10 | Whether the operating and custody rules are real |

## Scorecard for the intended game

| Dimension | Score | Assessment |
|---|---:|---|
| Economic coherence | 5/10 | Cash, curve reserves, company filings, and fund claims are booked. Several large flows still mint demand, and the public money controls measure proxies. |
| Market understanding and agency | 4/10 | Size moves listed mids, and the curve settles real orders. The visible crowd, the daily close, and several launchpad shocks do not show their cause on the tape the player reads. |
| NPC/crowd believability | 3/10 | One funded population replays historical order timing. Other crowds share a mood, ignore headline tone, or exist only as names on prints. |
| Long-term progression and consequence | 6/10 | Shops, companies, debt, rank gates, and offline decay are connected systems. Property yield, the levy, and late-tier bot returns are not yet shown to mean what the UI implies. |
| Immersion and attention competition | 4/10 | New launches can be pushed to the top of the board. Chat, replies, and ordinary bad news do not compete for trader attention in the market. |

## How the economy actually works

Six populations get called NPCs. Their money does not connect.

1. **Funded launchpad accounts.** `population()` opens 240 engine accounts and funds them once. Curve buys spend that cash. Sales credit it. The accounts survive graduation. A token is assigned 24 of them and a historical episode. This is the layer that fixed shared-pool starvation.
2. **Legacy launchpad arrivals.** Launch buzz, viral shocks, paid promos, crowd scalp/FOMO/news buys, and the launch sniper call `buyCurve()` with no wallet. Those fills are an `npcRetail` faucet. Matching legacy sells sink the proceeds. They move the curve and they are not the 240 accounts.
3. **Listed retail tape.** `retailTick` writes prints inside the spread. The module states that those prints are not orders and do not move price or variance. The probe generated 1,080 prints under 995 names while prices and accounts stayed unchanged.
4. **Named listed rivals.** A separate, slower clock. They are not the tape.
5. **World-market style NPCs.** Momentum, contrarian, dividend, and crypto styles read the visible move. The value style reads `lnV - lnP`, the engine's hidden fundamental, plus noise.
6. **Company rivals.** Above a 25% product share, `npcWeeklyReaction` cuts their price toward a floor and multiplies marketing by 1.2. The comment calls the reaction bounded. The code bounds price. Marketing has no cash budget and no cap. Player marketing is paid from company cash and removed on an unfunded day.

Player Lab bots are a seventh actor with the same privileged read: the `value` strategy returns `(a.lnV - a.lnP) * 15` before noise. The client view hides that fundamental.

## What the evidence establishes

Saved at this revision, from `proof/economy-audit/experiments.json` unless noted:

- An accepted player reply and an accepted world-chat message each left prices, accounts, orders, and flows identical to control for 120 ticks.
- A positive earnings headline and a negative one produced the same crowd state, including `$260` queued to buy. `applyNews` never reads `wire.tone`. A themed earnings, preview, move, rumor, listing, or macro headline arms a buy. Halt, crash, crisis, and flash set a scare.
- A $500 board promo created $500 of NPC cash and moved price about +5.86% in one trade. A $2,000 Wire promo created $1,500 of NPC cash and moved price about +18.08% in one trade. `BOARD_ADD` is 0.5 buzz, `WIRE_ADD` is 1.5, and `DEMAND_PER_BUZZ` is $1,000, so those dollar amounts follow from the constants. The percents are the probe.
- Doubling paper net worth, with cash and faucets held fixed, set `sinkMult` to about 1.235. Doubling the player count at the same wealth per player produced the same multiplier. `stabilizerDay` sums `max(0, player.netWorth)`. The nearby comment says growth is per player. The formula does not divide by player count.
- Runtime target is `STABILIZER_TARGET = 0.01`. `scripts/balance/economy.ts` still scores days against `TARGET_GROWTH_PER_DAY = 0.04`.
- On a 3-seed × 30-day sample, closing ticks were 1/720 of observations and accounted for about 36.4% of HLCN squared tick returns, 33.4% of AUC, and 22.9% of FROG. That shows concentration at the close in this sample. It does not set a target variance share.
- FROG's configured 90 bps spread is capped at 30 bps round trip by `HALF_SPREAD_CAP = 0.0015`. Impact is not capped.
- A separate launchpad probe graduated matched 0% and 5% creator-allocation coins onto the engine book. One engine step with no orders moved both quotes. Book inventory differed. The observed quote impact of a $1,000 order did not, because `advNotional` follows cash raised.

The Binance five-second sample is two UTC days per asset. It is a sanity check. Listed game crypto in that same probe was not flatter than the sample on a raw absolute-return basis. The sample is too short, and the clocks do not match, to use it as a calibration.

A read-only snapshot of the p10-chart `world.db` (tick 67942) had 625 launchpad tokens and 240 trader accounts. Marked trader wealth was concentrated. `npcRetail` showed a large cumulative faucet-minus-sink gap. That gap includes legacy event flows. It is not the funded population's solvency.

The captured suite was 735/746. Eight failures sat in the squeeze tests, two in huge-money cash rejects, one in newest-feed ordering. A failing fixture is not, by itself, proof the mechanism regressed.

## What works and should be preserved

- Curve quotes settle against reserves. Account-backed orders cannot spend cash they do not have or sell tokens they do not hold.
- The 240 accounts are the right base for world traders. Historical episodes are a reasonable timing prior while a decision model is still missing.
- Listed impact scales with size. A large order pays to move the mid. The spread cap is a separate, explicit ceiling.
- Deterministic seeds, regimes, GARCH, jumps, and catalysts are a usable listed-market scaffold.
- Shop share, company capacity, filings, IPO books, debt covenants, and fund custody are real choices with booked consequences.
- Newest-launch ordering is committed on this branch (`0ca4928`, `97bb8b3`, `be21a34`): the board can keep "most recent," and a launch can reach traders on the tick it exists. That work is separate from the causality gaps below.

## Important problems and recent-fix assessment

**The chart and the cause have come apart.** Full-mode ecology sets the close on the last tick of the game day. Retail prints fill the minutes in between and do not trade. A player reading the tape cannot tell a close auction from ordinary flow.

**Recent meme-coin work fixed ownership and motion, and left reaction thin.** Persistent balances and exits are real for the funded slice. Legacy arrivals still mint the trade. Historical replay supplies plausible timing and does not look at chat, replies, creator credibility, or the tone of a headline. The discretionary overlay is five shared styles on token-level mood.

**Paid promotion is a priced buy.** The fee is a sink. The demand is a same-tick faucet fill. Reach, delay, and refusal are absent.

**Headline tone is discarded** for ordinary launch-crowd news. Crashes scare. Bad earnings buy.

**Conversation is stored text.** Replies do not perturb market streams. That is stable for replay. It also means a reply cannot move a trader.

**The levy can tax a mark.** A rally in marked securities or property can raise upkeep, fees, and, while the levy is on, shop tax brackets, with cash supply unchanged. The balance harness still thinks the target is 4% a game day, so a healthy 1–4% path can look like a pass.

**Two value agents see server truth.** World value NPCs and Lab value bots both read `lnV`. Noise makes the signal imperfect. It does not make the input public.

**Company rivals can answer a successful player with free marketing** that compounds on each weekly reaction. Price has a floor. Marketing does not.

**Graduation changes the model.** The curve becomes an engine asset with a bounded book. A quote can move with no trade. Creator allocation changes book float while the starting quote stays on the cash raised. That is an approximation of a post-migration constant-product pool.

## Desired player-facing behavior

- **Paid promotion** buys a chance of attention. Conversion is delayed, capped by NPC cash, and sometimes refused. The payer can see that the fee and the later buying are different events.
- **Chat and replies** stay visibly social until an audience model exists. When a message is supposed to matter, the affected accounts and the lag are traceable.
- **Credible information and spam** disagree. A negative earnings headline and a positive one do not queue the same buy. A scare and a rumor are different orders.
- **Large buys and sells** on the curve and on listed names move the quote through the same book the player trades, and the tape names those prints.
- **Creator sells** hit the book the creator actually holds, with vesting still binding, and the float change is visible at graduation.
- **Realizing losses** belongs to an account that remembers a cost basis. A shared token mood can still panic. It should not be the only memory.
- **Attention is scarce.** A new launch can win the board. It should win trader cash only by taking it from accounts that chose it over what they already hold.

## Ranked improvement roadmap

1. **One listed price story.** Either show the ecology close as an auction with a cause and auction prints, or spread that flow through the day. Keep causal accounting. Label retail prints as display-only, and keep them out of volume, VWAP, candles, and sentiment until they are orders with cash and inventory.
2. **Launchpad cause and effect.** Promotion spends for uncertain, delayed, budgeted conversion. Ordinary positive and negative headlines disagree. Keep chat inert until it has an audience, and say so in the UI. Report legacy faucets apart from the 240 accounts' P&L.
3. **Name the stabilizer's input.** If it is money, measure cash-like balances and include the world accounts that mint and absorb cash. A pure mark-to-market doubling must leave that controller still. Point the balance harness at `STABILIZER_TARGET`.
4. **Public inputs for value agents.** World value NPCs and Lab value bots trade from public or purchased signals, unless the UI calls the oracle an oracle.
5. **Company rival budgets.** Give NPC marketing a cap or a cash cost, and show the reaction when a player crosses the share line.
6. **Graduation contract.** Either the post-migration quote follows reserves, or the UI calls the current book an approximation and tests no-trade marks, 0% and 5% creator allocation, and curve-to-book continuity on their own.

Acceptance for each item is in the matching sub-audit. Do not pick a variance-share or tick-size target until the product says how large and how visible a move should be.

## Detailed audit reports and evidence

- [Market realism and player experience audit](MARKETS-2026-10-15.md)
- [Launchpad and NPC audit](LAUNCHPAD-NPCS-2026-10-15.md)
- [Wider economy audit](WIDER-ECONOMY-2026-10-15.md)
- [Experiment results](../../proof/economy-audit/experiments.json)
- [Historical spot sample](../../proof/economy-audit/historical-spot.json)
- [Regression test summary](../../proof/economy-audit-tests.json)
- [Stablecoin anchor probe](../../proof/economy-audit/stablecoin-anchor-probe.json)
- [Launchpad probe](../../proof/economy-audit/launchpad-npc-audit.json)
