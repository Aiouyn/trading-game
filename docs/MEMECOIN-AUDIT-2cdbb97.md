# Meme-coin market audit and NPC design proposal

Date: 2026-10-14. Audited build: `2cdbb975ad58cfadd642169f0b673a56f193a84d`.

**Updated finding after transaction-level research:** the curve arithmetic is useful, but the current NPC price delivery is far too quiet and lacks sharp downward cascades. The initial audit below did not measure short-horizon historical returns and understated that gap. See [the historical price-cadence follow-up](MEMECOIN-PRICE-CADENCE-2cdbb97.md) for downloaded-data measurements and corrected priorities. Fix the trade-signal cursor before tuning anything: once the tape reaches 80 entries, the crowd stops reading new prints.

This is an analysis and implementation proposal, not a gameplay patch or a ratified replacement of existing rules. The working checkout is `a24e507`; all code findings below refer to the named newer commit, extracted into an isolated temporary snapshot. Earlier observations about the old checkout's missing launchpad do not apply to this build.

## 1. What the audited build does

The server enables world launches (`server/host.ts`, `launchpadNpc: true`). Launchpad simulation lives in `src/world/launchpad/`; general named NPCs in `src/world/npc.ts` are a separate system.

| Stage | Implemented behaviour | Implication |
| --- | --- | --- |
| Launch | 20 world launches per game day on average; heavy-tailed initial buzz; initial demand absorbed inside the launch command | Most early movement happens before a player can respond |
| Curve | Constant product with virtual cash $15,000 and 1.073 billion virtual tokens; 1 billion actual supply; 800 million sold on the curve | Trade size produces nonlinear fills and price impact |
| Demand | Each new unit of buzz supplies $1,000 NPC demand, capped at graduation; launch, viral shock and paid promo are arrivals | Attention currently converts directly into money |
| Sniper | Every launch attempts one $100–$400 sniper buy; exits at 1.5 times entry or after 60 ticks | A recognisable early seller, but little variation in sniper strategy |
| Crowd | Holder, scalper, FOMO and news cohorts; fading adds to holder sales | Several trading motives already exist |
| FOMO | A sufficiently large player buy arms a delayed chase; seeded delay 3–12 ticks, chase 30% of the print subject to budget/impact limits | Follow-through is strongly centred on the player |
| News | Fresh matching sector headlines unlock delayed buying; broad crashes reduce the story premium | World context matters, but themed headline sentiment is not distinguished |
| Graduation | Raised cash and remaining supply fund a cash-bounded book; token becomes an engine crypto asset using the FROG/BONK template | Execution and price dynamics switch systems |
| After graduation | All launch NPC cohorts become one account; its inventory unwinds with a one-day half-life | The launch population loses its different motives |
| Death | Cash under 2% of the raise at seven consecutive closes, counted from day 3; alternatively 24 game days without a player trade | The inactivity clock measures player participation, rather than all economic activity |

One tick is five real seconds at 1×, 720 ticks is one game day/one real hour. Times below use that convention; increasing simulation speed shortens wall-clock time.

The curve's formula is `price = k / y²`, where `k = X0 × Y0`. Diagnostics from the exact constants:

- Initial market cap: **$13,979.50**.
- Graduation raise: **$43,956.04**; graduation market cap: **$215,956.20**.
- Initial-to-graduation marginal price multiple: **15.448×**.
- A $100 buy at the untouched curve moves the marginal price **1.324%**, with **0.660%** average-fill slippage before the trading fee.
- A $1,000 buy moves it **13.636%**, with **6.600%** slippage before the fee.

These are derived mechanics, not historical market measurements. The curve is already useful for immersion: large orders visibly move a small market, and a screen market cap is much larger than the cash available to sellers.

## 2. Comparison with actual launch platforms and historical evidence

Pump.fun's official documentation describes reserve-based constant-product pricing, then migration into PumpSwap. The game closely follows that structure before graduation. Pump's developer documentation says canonical migration burns LP tokens; creator inventory dumping remains a different risk from withdrawing that locked liquidity. [Pump curve guide](https://pump.fun/docs/bonding-curve), [Pump developer documentation](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md).

Pump's fee page, updated 8 October 2026, lists 1.25% curve fees for SOL/USDC pairs, tiered canonical PumpSwap fees, no platform creation fee, and a 0.015 SOL migration charge. Our 1% curve fee, $100 creation fee and 1.5% raise deduction are game choices. Copying current fee levels is lower priority than reproducing liquidity and participant behaviour. Older observations must retain the fee schedule from their observation period. [Official fees](https://pump.fun/docs/fees).

Raydium LaunchLab also documents virtual-reserve curves and migration to CPMM trading; it supports multiple curve shapes and configurable launch settings. This supports a game architecture with shared token/NPC state and a venue-specific execution function. It does not require a full order book for the launch market. [Raydium LaunchLab documentation](https://github.com/raydium-io/raydium-docs-v1/blob/main/products/launchlab/bonding-curve.mdx).

A February 2026 preprint analyses launches from 1 September to 1 October 2025: 655,770 tokens and 4,338 graduations. It reports approximately 0.63%; those counts imply 0.662%, so use roughly **0.6–0.7% for that cohort**, rather than false precision. Among graduates, reported medians are approximately 457 curve events and 4.4 minutes. The study associates faster capital accumulation with graduation and finds turnover alone is insufficient. These are cohort associations, not instructions to give NPCs knowledge of future winners. Its bot label is a routing proxy; wallets are not unique people. [Marino et al., historical Pump.fun study](https://arxiv.org/html/2602.14860v1).

A separate study collected information on 15 million launches and identifies wash trading, creator-address obfuscation, coordinated selling, copycat launches and social manipulation. Game translation: some impressive tape should represent low-quality demand, and some sell pressure should be correlated across related participants. [Szwajcok et al., manipulation study](https://arxiv.org/abs/2609.10246).

Measurement quality matters. A revised September 2026 preprint shows that collector TIMEOUT labels do not establish protocol non-graduation and reports failed temporal generalisation. Use verified migration events and censored observations in calibration. The older indexed summary for this paper described a graduation-rate study; the current revision changes the interpretation, so that older headline rate is excluded here. [Kamat, measurement audit](https://arxiv.org/abs/2607.02823v4).

**Initial audit evidence limit:** this first pass compared source code and controlled game diagnostics with published analyses and protocol documentation. The subsequent [historical price-cadence follow-up](MEMECOIN-PRICE-CADENCE-2cdbb97.md) now adds downloaded transaction data. No NPC mixture, holding-time distribution or proposed game success rate below is presented as fitted to real data.

## 3. Problems to address, in priority order

### M01 — Confirmed: crowd stops seeing trades when the tape fills

`crowd.ts:87–88` reads from `c.tapeAt` to `t.tape.length` and stores that length as the next cursor. `tape.ts:7–8` trims the array to 80 entries. Once both are 80, new fills replace old rows while the cursor stays 80; the read interval is empty.

Controlled probe, viral shocks and discretionary scalping disabled in both cases:

| Identical $400 player buy | Tape before buy | Scheduled FOMO demand |
| --- | ---: | ---: |
| After 1 tick | 2 entries | $120 |
| After 120 ticks | 80 entries | $0 |

This affects print-based story updates, recent-volume estimates and crowd responses. It does not stop every NPC action: spot-based checks and news can still run. In a separate one-day diagnostic, all 40 world-launched coins across four seeds reached 80 tape entries.

**Proposed fix:** assign every settled trade a monotonically increasing sequence, and retain a per-token crowd cursor in sequence space. Prefer feeding the current tick's settled events directly to the crowd; the bounded UI tape should be a projection of those events, not the simulation's event queue. Define overflow behaviour explicitly and migrate older saves. Test reactions after multiple tape wraps, after reload, and after more than 80 fills in one tick.

### M02 — Display activity and economic activity disagree

`crowd.ts:234` creates 20 display rows every tick from ticker/tick hashes, drawn from 4,000 anonymous slots. `view.ts:247–251` combines these with real trades on the page. These rows do not spend cash, own tokens, move reserves or create candles. Actual NPC prints rotate through 64 anonymous slots while the holder view combines their inventory into one NPC holder.

There is also an actual $7–$10 same-tick buy/sell every other tick. It is excluded from the newest-feed bump, but goes through fees, volume and OHLC. Near the empty curve this alone contributes roughly $5,000–$7,200 gross turnover per game day, subject to rounding and trading eligibility, with almost no net demand.

**Proposed fix:** visible trades come from settlement events. Give economic NPC cohorts stable public wallet identities with holdings consistent with their trades. Idle coins may genuinely print nothing. If wash-trading actors are included, their trades should have actual capital, fees and inventory constraints, and be only one part of the population. Add organic-volume and gross-volume measures before volume drives discovery.

### M03 — Follow-through depends too much on player orders

`crowd.ts:141–146` schedules FOMO from player prints; NPC buys can update the story but do not arm the same chase. Launch/viral/promo arrivals are bought in full in one tick. That favours discrete price jumps followed by holding/fading, with less opportunity for independent discovery and successive waves of traders.

**Proposed fix:** all settled flow can inform behaviour. Each trader observes a delayed subset of public price, net inflow, breadth of independent buyers and visible narrative activity. An NPC buy can attract others; repeated related-wallet churn has weaker influence. Bound and saturate the response to keep a player from manufacturing infinite follow-through.

Preserve the anti-front-running intent of instant absorption, but use varied reaction delays for later attention: some participants already saw the event, some buy after discovery, some wait for a pullback. A publicly visible promotion should have uncertain after-fee outcomes, including failures.

### M04 — Each token has its own money and attention supply

Discretionary budgets start at $300/$700/$500 per token and each refill by $0.04 per tick. That is up to $86.40 of replenished discretionary capacity per token per game day. Buzz arrivals additionally enter as explicitly booked `npcRetail` external funding. Sales exit through a sink; realised proceeds do not directly replenish the same trader's discretionary wallet.

Accounting these flows is valuable, but finite per-token caps do not reproduce competition across tokens. Adding more coins creates more independent budgets and more chances to receive demand. Holdings have entry cost but limited participant-specific memory; a shared fear/greed setting applies across cohorts of the coin.

**Proposed fix:** use a shared population of persistent NPC wallets or funded cohorts. Cash moves between holdings, realised sales and reserves. External funding is controlled once at population level. Each participant has a watchlist and maximum simultaneous positions. A hot new theme competes with existing holdings for money and attention. Losses, recent exits and confidence influence subsequent choices.

### M05 — Graduation switches away from launch microstructure

`graduate.ts:54–80` assigns 190–200% annual diffusion volatility and negative drift, inherits the FROG template's **$400 million ADV**, and seeds a book with about **$43,297** after the graduation fee. Cash and supply bounds prevent unlimited settlement, but inherited ADV makes impact depend on a market vastly larger than the seeded liquidity. The launch crowd stops; its merged account sells with a fixed one-day half-life.

The last curve price is $0.000215956. If the seeded cash/tokens were instead used directly as a CPMM, its initial ratio would be $0.000216484 with no creator allocation, and $0.000288645 at the maximum 50-million allocation. The latter is about 33.7% above the curve endpoint. This is a hypothetical migration diagnostic, not a price jump in the current engine, which explicitly starts at the curve endpoint.

**Proposed fix:** retain participant identities, holdings, cost basis and decisions across migration; change the execution venue. Use the actual pool reserves for impact and sell capacity, and explicitly specify migration continuity for every allocation. If continuing with the engine book, derive its depth/ADV from actual funded liquidity and measured turnover, then validate fills against depletion. Apply price impact exactly once.

### M06 — Headline sentiment and death rules can contradict the apparent market

`applyNews` buys a matching earnings, preview, move or rumor without inspecting its direction/tone. `lastTradeTick` is refreshed by player fills only, so a coin with ongoing substantive NPC trading can eventually die from the no-player clock. The configured cash clock can first kill a continuously underfunded coin around day 9; the 24-day alternative is 24 real hours at 1×.

**Proposed fix:** event direction changes beliefs, with uncertainty and heterogeneous reactions. Distinguish player engagement from economic activity. Use actual trade/holder activity and available liquidity for a dormant state; let attention revival reopen dormant coins when appropriate. Terminal death should have a clear settlement rule. Keep world cleanup as an explicit game rule if needed.

## 4. NPC behaviour that should feel human

Use compact agents or cohorts, not an LLM call per trade. Store cash, token inventory, entry costs, last action, attention, profit targets, loss tolerance and preferred holding horizon. Preserve deterministic RNG streams and save/replay behaviour.

| Participant | Entry motive | Exit motive | Result the player can recognise |
| --- | --- | --- | --- |
| Launch sniper | Fresh launch, tolerable entry impact, limited exposure | Partial profit, time limit, creator selling | Early green spike followed by offers |
| Momentum trader | Strong net inflow and multiple new buyers | Trailing stop, fading inflow, failed breakout | Follow-through and crowded reversals |
| Late retail | Social discovery after a varied delay | Fear, a small profit, or exhausted attention | Buying near local highs; uneven panic |
| Dip buyer | Pullback while narrative/buyer activity survives | Rebound into overhead supply; thesis fails | Bounces that sometimes hold |
| Conviction holder | Narrative affinity, affordable position | Scale-out ladder or a meaningful narrative break | Persistent bags and supply at old entry levels |
| Large trader | Attractive depth relative to intended size | Several clips, adverse activity, limited exit capacity | Absorption, then a visible supply overhang |
| Creator/related group | Launch capital and identity-specific motives | Fees, staged distribution, abandonment or coordinated dump | Creator histories and correlated supply risk |

These are proposed roles, not statistically identified labels for real wallets. Keep motives noisy and overlapping: a momentum trader can become a reluctant holder, a late buyer can sell quickly, and some holders refuse to exit at a loss.

Suggested decision form:

`buy willingness = narrative affinity + observed momentum + new-buyer breadth − concentration risk − expected slippage − existing exposure`

`sell willingness = profit-taking + drawdown fear + adverse narrative + alternative opportunity − conviction`

Turn willingness into probabilistic actions with different delays and position sizes. Orders must fit actual spendable cash and held tokens. Most steps should involve only a minority of the population. Group correlated participants where justified, while retaining independent traders. Coarse cohorts can serve off-screen coins; foreground coins can use more detailed wallets without changing settlement rules.

The intended causal chain is:

`attention → discovery → funded orders → reserve changes → price/volume → new reactions and exits`

Price rises should attract some NPCs and prompt others to take profit. Net buying exhausts available cash; selling returns cash and distributes losses. A selloff can worsen the narrative, while a community revival can bring a second wave. Outcomes should emerge from that feedback rather than a prewritten pump/crash chart.

## 5. Keep the market playable

The raw historical launch success rate would make a small game feed very empty. Preserve the background long tail, then let discovery surfaces select an active subset. Evaluate success rates separately for all launches, shown coins and player-traded coins. Do not silently treat a curated feed as representative of every launch.

Proposed playtest ranges, explicitly uncalibrated:

- Maintain roughly 8–20 economically active visible tokens, plus low-activity launches and archives.
- Aim for active visible launch stories to unfold over roughly 5–30 minutes at 1×, with a minority lasting several sessions. This gives a trader time to observe, enter, manage and exit.
- Explore 3–8% graduation among the curated visible cohort; determine the all-launch rate separately. Graduation is neither permanent survival nor a guaranteed profitable exit.
- Include quiet failures, early dumps, sustained runs, choppy rotations and revivals. Do not enforce fixed proportions before simulation and playtesting.
- Show liquidity, executable exit estimate, net flow, new buyers, creator selling and holder concentration. Keep the opening screen compact; detailed wallets and cohort traces belong in expanded views.

A good skill opportunity is identifying fresh demand, likely overhead supply and deteriorating liquidity. Some informed trades should work after costs; no single public trigger should deliver a repeatable guaranteed profit. The existing balance harness explicitly requires nonpositive confidence bounds for many simple strategies. Revisit that criterion alongside the immersive-trading goal: anti-manipulation checks and checks for useful trading skill answer different questions.

## 6. Historical calibration and acceptance plan

1. Collect a dated random launch cohort, including launches with zero/few trades; separately sample graduates. Follow unsuccessful and successful tokens for the same defined horizons. Keep late observations censored rather than marking timeouts as failures.
2. Record creation, confirmed migration, trade ordering/signatures, wallet, quote/token amounts, real/virtual reserves, fee configuration and data gaps. Reconstruct per-trade prices and net reserve inflow. Include post-migration swaps and cross-venue trades where available.
3. Measure interarrival times, trade-size quantiles, buyer breadth, concentration, creator exit timing, entry-relative holding times, turnover/net-inflow ratio, drawdown/rebound distributions and survival/activity curves. Wallet clusters and bot labels need explicit uncertainty.
4. Match behaviour conditional on token age, curve progress and market regime. Use normalized reserve flow and percentage moves, rather than copying USD values or raw wall-clock speed into the game.
5. Fit on earlier date blocks and validate on later untouched blocks. Split all-launch and active-feed metrics. Compare several historical regimes rather than treating September 2025 as timeless.
6. Run seeded game cohorts and report distribution distances/quantiles, fees and money identities. Use executable liquidation value for held positions, including cash exhaustion. Audit persistent-budget conservation, tape/holder/candle consistency, migration continuity, reload determinism and multiple buffer wraps.
7. Probe clipping, cross-account promotion, coordinated buys, near-graduation fills, failed breakout exits and fee farming. Then have experienced traders play without seeing NPC internals: can they infer plausible participants and trading conditions from actual public evidence?

Implement in this order: **M01 event ingestion → M02 truthful tape → M04 persistent shared capital → M03 varied attention/reaction → M05 venue continuity → M06 sentiment/lifecycle → historical calibration and trader playtests.**

## 7. Verification and reproducibility

Five existing suites passed on the isolated `2cdbb97` snapshot: `crowd`, `curve`, `graduate`, `zerosum`, `determinism` — **29 tests total**. Two temporary diagnostic probes also passed and produced the JSON files below. They observe the unmodified gameplay implementation; their special controls are scoped and restored inside the tape probe.

The small cohort diagnostic launches 10 world coins per seed across four seeds, advances only the launchpad clock/simulation for 720 ticks, and injects no human trades or external news. All 40 remained live, none graduated, and all reached the 80-trade cap. This isolates early launch behaviour; it cannot estimate long-run graduation/death frequencies or validate the full engine/server integration. An initial larger ten-day diagnostic was stopped before completion; no results from it are used.

Evidence is saved in `proof/memecoin-audit-2cdbb97/`: `audit-probe.test.ts`, `tape-probe.json`, `curve-probe.json`, `cohort-probe.json`. To reproduce, archive the named commit's `src`, `package.json`, `tsconfig.json` and `vitest.config.ts` into a separate folder, provide the project's installed dependencies, put the probe beside `src/world/launchpad/fixture.ts`, and run Vitest against it and the five suites above. No dev-server restart or game-state mutation was required.
