# Wider economy and player experience audit — 2026-10-15

**Scope:** shops and player businesses, companies and IPOs, property, money flows and the anti-inflation levy, macro rates, progression, AI Lab and bots, funds/debt, and offline earnings. Price formation and launchpad/NPC behavior are covered by separate audits. This is a code and fixture review at HEAD `be21a34852d2244ea56c824ef1e85042ea7aecf7`; it makes no game-state changes. It is not a claim that every economy mechanic was simulated end to end.

## Overall assessment

There is a substantial, connected economy here. Shop ownership has competitive demand, meaningful operating choices, maintenance, attendance and income tax. Player companies have capacity, input costs, staffing, filed accounts, delayed IPO books, debt covenants, and a real failure waterfall. Funds conserve claims and cash through their lifecycle. These systems can support different kinds of play beyond trading.

The biggest weakness is feedback quality: several displayed “economic” indicators do not measure what their names or descriptions imply. The treasury stabilizer taxes a wealth proxy that includes marked assets, not spendable money. Property rent is a nearly deterministic return on appraised value rather than a market with tenants. Shop NPC opponents have stable personas, but the economic evidence does not establish whether player returns remain viable against them over time. Some high-cost bot and company progression promises have no player-outcome validation in this worktree.

## Scores

Scores assess current player-facing usefulness, where 10 means choices are legible, differentiated, and consequences match the presented model. They are judgments from source review, not playtest ratings.

| Area | Score | Assessment |
|---|---:|---|
| Shops and businesses | 7/10 | Good levers and competitive share model; no household budget or demand ceiling, and long-run NPC fairness is not demonstrated. |
| Companies and IPOs | 7/10 | Strong operating and governance depth; company-NPC spending and long-run investor outcomes need more evidence, and the current live snapshot has no companies. |
| Property | 4/10 | Clear purchase, mortgage, upkeep, rent and resale loop; rents and occupancy do not respond to tenants, financing reprices only at purchase, and catalog supply is not scarce. |
| Money creation and stabilization | 3/10 | Flows are explicitly booked and mostly classified; the anti-inflation controller's measured quantity diverges from cash supply, while the public money index is cumulative-flow based. |
| Macro and rates | 6/10 | A deterministic seeded macro chain with releases, policy meetings, yield curve and asset repricing; the economic impact on player costs and company solvency is not validated as a joined balance run. |
| Progression | 6/10 | Clear asset and tool unlock ladder; rank gates enable important systems but no cohort evidence establishes pacing or whether late tiers are reachable without extreme market luck. |
| AI Lab and bots | 4/10 | Compute/data/research/training costs and risk are modeled; the value bot reads a hidden engine fundamental, so its information advantage and net returns need explicit validation. |
| Funds and company debt | 8/10 | Strong accounting, mandate, custody, self-match, covenant, cure, guarantee and bankruptcy controls with invariant coverage; player-level strategy viability remains separate from rule correctness. |
| Offline economy | 6/10 | Income decays after a grace period and managers/automation change the floor; ownership costs continue, so away-time cash-flow fairness deserves an explicit scenario comparison. |

## Findings that should drive future fixes

### P1 — Stabilizer reacts to paper wealth and mislabels it as money growth

`stabilizerDay` sums `max(0, player.netWorth)` and applies its trailing growth controller to that total. The inline description calls the input “money held by players,” and the controller comment says population growth is excluded, but the implementation neither reads cash supply nor normalizes by player count ([boards.ts](../../src/world/boards.ts#L70), [boards.ts](../../src/world/boards.ts#L83)). A fixed cash balance with rising marked securities or property can therefore raise `sinkMult`; a join wave inside the lookback can also change the aggregate. That is a fairness defect because property upkeep and fees scale with the levy, and shop income-tax brackets shift while it is active. The available probe bounds this claim to controlled mutations: separately, it doubled paper wealth while holding cash/faucets unchanged, and doubled population while holding wealth per player unchanged. Both report `sinkMult = 1.235223784`; the population case was not the paper-wealth case repeated. These probes show that non-cash wealth and population size can affect the measured base under the tested setup. They do not show frequency or severity in normal live play, so this is an important fairness mismatch rather than evidence of a catastrophic economy failure.

**Recommendation:** choose and name the controlled quantity. If the intent is monetary inflation, measure cash-like balances and include the NPC/world accounts that create and absorb cash. If the intent is wealth/cost-of-living pressure, rename the control and separately test market-mark shocks, business/property holdings and player joins. Keep real and game time labels explicit. Then rerun the same scenario with only each factor changed.

**Acceptance:** a pure 2x mark-to-market change with every cash balance and booked faucet/sink held fixed must not move a cash-supply controller. A join/leave operation must have a documented expected response. The dashboard's target, active measured quantity, and rate must agree with its code.

### P1 — The economy balance harness evaluates the wrong target

Runtime uses `STABILIZER_TARGET = 0.01` (1% per game day), while the comment and `TARGET_GROWTH_PER_DAY` in `scripts/balance/economy.ts` still state 4% ([boards.ts](../../src/world/boards.ts#L70), [economy.ts](../../scripts/balance/economy.ts#L14)). Its `daysOverTarget` output therefore cannot currently validate whether the runtime target is met. This is not just stale prose: it can make a balance result look healthier than the active rule. Tie the harness to the exported constant and print the supply definition it actually measures.

**Acceptance:** a small scenario with growth between 1% and 4% is classified as over target by the harness; the reported target is imported from runtime; the measured series is identified as positive net-worth sum unless the stabilizer design changes it.

### P1 — Property advertises an investment but removes the hard parts of property risk

Property purchase has a 2% transaction fee, an R1 mortgage cap of 70% LTV, variable district-index price, daily upkeep and mortgage interest, and an immediate sale path with a 2% fee ([assets.ts](../../src/world/assets.ts#L267), [assets.ts](../../src/world/assets.ts#L310), [assets.ts](../../src/world/assets.ts#L350)). A non-home property's rent is generated daily from current appraised value and type yield, multiplied by a random occupancy from 85–100%; there is no tenant demand, vacancy process, rent collection risk or renter cash budget in this settlement ([assets.ts](../../src/world/assets.ts#L403)). Mortgage rates are captured at purchase, so later rate changes do not reprice existing loans. The catalogue does not model scarcity or construction limits in these paths.

As a game abstraction, smooth rent can make a useful passive-income system. The issue is the investment framing: a player can infer tenant demand, refinancing and market liquidity that the implementation does not offer. In addition, a house designated as the player's home forgoes rental income while still paying upkeep and mortgage interest, with no modeled housing service beyond prestige. That can be an intentional luxury cost, but should be legible as such.

**Recommendation:** label the system as a yield simulation if smooth occupancy is the intended product. Otherwise add vacancy/rent shocks, a bounded supply or demand signal, and a clearly stated fixed-rate mortgage term. Make the home-versus-rent yield tradeoff visible before confirmation.

**Acceptance:** show all-in net yield after upkeep, mortgage interest and both transaction fees over a stated holding period; compare a home-use property to a rental property at identical prices; ensure the projected value uses the same district index and mortgage rules as settlement.

### P1 — Player-company operating depth is real; company-NPC budget and investor outcomes need evidence

The operating path computes sector demand and logit shares against seeded NPC rivals, limits booking/shipping by staffed capacity, applies material and overtime costs, and books cash and filings ([company.ts](../../src/world/company/company.ts#L421), [market.ts](../../src/world/company/market.ts#L1)). Related supply is banded and recorded separately from unrelated revenue; company buyers must have cash for the full contract day ([supply.ts](../../src/world/company/supply.ts#L1)). IPOs require a filing/history and rank gate, price from filed value, run a one-day book, cap per-buyer allocation, use an NPC backstop, and apply founder lockup/sell caps ([ipo.ts](../../src/world/company/ipo.ts#L1)). Debt is paid to a bank pool, covenants can trigger a cure/default, and bankruptcy has a waterfall with limited liability except guarantees ([debt.ts](../../src/world/company/debt.ts#L1), [failure.ts](../../src/world/company/failure.ts#L1)). Those are meaningful decision consequences, not a cosmetic company screen.

The player AI Lab can trade listed company stocks: `listingDef` appends IPO stock with `listed: true` and `assetClass: 'stock'`, and `deployBot` accepts any configured asset that is listed ([ipo.ts](../../src/world/company/ipo.ts#L178), [lab.ts](../../src/world/lab.ts#L210)). So absence of a company-bot harness does not mean such gameplay is impossible. What remains missing is outcome validation: multiple company-investment bot-edge cases are marked `todo`/blocked because the harness is absent ([blocked.test.ts](../../src/world/company/exploits/blocked.test.ts#L28), [wait-register.test.ts](../../src/world/company/tape/wait-register.test.ts#L72)). The provided live snapshot contains 0 companies and 0 properties, so it cannot show how IPOs, property or company failure behave under actual player use.

There is also an asymmetric competitive budget in the company market. When the player's top product share exceeds 25%, `npcWeeklyReaction` lowers every rival NPC's price (to a floor) and multiplies its marketing by 1.2; the market test repeats this reaction 100 times but only asserts a floor for price, not an upper bound for marketing ([market.ts](../../src/world/company/market.ts#L119), [market.test.ts](../../src/world/company/market.test.ts#L72)). Player-company marketing is capped per product and paid from company cash; an unfunded day removes its effect ([company.ts](../../src/world/company/company.ts#L426), [company.ts](../../src/world/company/company.ts#L554), [content/company.ts](../../src/content/company.ts#L147)). NPC marketing has no corresponding cash budget, cap or visible cost in the inspected paths. Repeated reactions therefore grant NPC rivals compounding, free marketing in response to player success. This may be an intentional difficulty response, but it risks making the 25% share milestone feel like a hidden tax on growth and can steadily strengthen rivals without a solvency tradeoff.

**Recommendation:** decide whether company rivals are intended to have an unconstrained difficulty budget. If so, surface the response in the growth/share feedback and bound the strength over time. If rivals are meant to compete economically, give their marketing a finite budget and compare it with player marketing. Before tuning valuations or presenting this as a dependable investment loop, run fixed-seed multi-year founder, buyer and AI-bot scenarios with listed stocks and explicit trade counts. Keep solvency/filing invariant tests separate from investor return claims.

**Acceptance:** publish seed-level company survival, founder return, outside-investor return versus a matched index, dilution, drawdown and trade counts; flag zero-trade runs as inconclusive. Run cases across sectors, price/cost shocks, guarantees and covenant cures.

### P1 — AI value bots read the engine's hidden value directly

The market frame deliberately omits hidden fundamental state, and its lightweight mirror sets value equal to price so the client never learns the true `V` ([view.ts](../../src/world/view.ts#L33), [view.ts](../../src/world/view.ts#L178)). The server-side Lab bot's `value` strategy instead reads `(a.lnV - a.lnP) * 15`, then adds model-dependent noise before submitting an ordinary market order ([lab.ts](../../src/world/lab.ts#L325), [lab.ts](../../src/world/lab.ts#L343)). This means the trained bot's signal is based on privileged ground truth rather than a public or purchased estimate. The noise makes the signal imperfect, but it does not remove the information-access difference. This is a potentially major gameplay fairness and product-truth issue: training can appear to buy an AI while the key edge is direct access to server-only truth.

**Recommendation:** choose whether value bots are meant to model an analyst estimate or be an explicit privileged-oracle fantasy. For analyst behavior, feed the strategy a noisy/delayed estimate derived only from public data and model capability; keep true `lnV` available only to evaluation and test code. If the oracle is intended, label it in the unlock and balance its access/cost accordingly.

**Acceptance:** a live bot's decision input must be traceable to the same public/paid signals exposed to a human strategy, unless its UI explicitly promises privileged truth. For fixed observable inputs, changing only hidden `lnV` must not change the bot's action under the analyst model. Measure returns versus public-signal baselines across seeds and count executed trades.

### P2 — Shops have good controls but no external demand budget

Shops compete in city/sector logit pools; marketing changes appeal, prices reduce demand elastically, crew caps service, and quality/location/equipment/research and supplier synergy can increase income ([assets.ts](../../src/world/assets.ts#L134), [assets.ts](../../src/world/assets.ts#L143)). Owners face wages, marketing, maintenance, manager prepayment, incidents and positive-net income tax; neglected businesses also decay through attendance/condition rules ([shops.ts](../../src/world/shops.ts#L128), [shopRules.ts](../../src/world/shopRules.ts)). These are strong player-facing levers, and purchase/sale limits make entry and exit consequential. The model does not link total sales to household wages, cash, or a finite number of customers: in a pool, there is always an outside option and every shop's revenue is a world faucet. That is a fine abstract tycoon loop if presented as a game demand index; it is not evidence of closed-market competition or price-level inflation.

The NPC shop's stable “well-run” settings give the player a consistent rival, but no inspected balance result established how returns distribute by business, city, tier or management strategy. Avoid calling shops a safe or predictable passive-income ladder until that is measured.

**Recommendation:** preserve the low-friction tycoon abstraction, but expose the actual drivers of projected revenue (share, price, service capacity, events, offline multiplier and tax). Add player-outcome sweeps before changing ROI tables.

**Acceptance:** in a seeded portfolio matrix, report net cash after all costs and taxes, payback time, resale haircut, online/away schedule and failure/overdraft frequency for well-run, managed and neglected players across tiers and pool crowding.

### P2 — “Money index” is a cumulative-flow proxy, not an observed price index

The runtime index is clamped `1 + (all-time booked faucets − all-time booked sinks) / (player count × $5m)` ([boards.ts](../../src/world/boards.ts#L104)). It is not derived from a priced basket. It may be a useful pacing scalar, but its label invites a purchasing-power interpretation and it can be affected by the denominator as the player count changes. The cash-flow ledger itself is clearer: `credit`/`debit` book creations and destructions, while transfers and asset conversions are distinct ([core.ts](../../src/world/core.ts#L69), [core.ts](../../src/world/core.ts#L123)). Preserve that distinction in player-facing copy and dashboards.

**Acceptance:** any “money index” display states its formula or is replaced with a basket-price index; adding accounts without economic activity has a tested, documented impact.

## Cross-system interactions and deliberate abstractions

- **Treasury and property/business costs:** the levy multiplier reaches property upkeep and shop costs; when the levy is active, shop income tax brackets also shift. A market-wide wealth repricing can therefore alter owners' cash expenses even without new cash creation. This is the highest-impact link to fix first.
- **Rates and player costs:** the macro layer evolves inflation and growth, meets on a seeded schedule, publishes CPI/jobs releases, changes the yield curve and reprices bonds/property/equities ([rates.ts](../../src/engine/rates.ts#L4), [rates.ts](../../src/engine/rates.ts#L108)). New property mortgage rates use the 10-year yield at purchase plus 2%; existing mortgages keep their captured rate. This is an understandable fixed-rate abstraction if the purchase UI calls it out.
- **Shops and Lab:** shop income, through a sector data-yield factor, can supply fresh data to the owner's lab. GPU power use can be offset by power-producing businesses, while research, data, compute and salaries are sinks ([lab.ts](../../src/world/lab.ts#L258)). This creates cross-system strategy, though the present report did not optimize the subsidy or quantify break-even.
- **Lab and trading:** model quality lowers signal noise, bot cadence improves by tier, and crowded strategies add noise; bots submit normal market orders, consume equity allocation and pay ordinary fees/impact ([lab.ts](../../src/world/lab.ts#L284), [lab.ts](../../src/world/lab.ts#L343)). This is a sensible anti-free-alpha structure. The specific premise that better MCS and crowding produce the right net returns remains unverified in this worktree's bot harness evidence.
- **Progression:** rank thresholds unlock progressively larger business tiers, mortgages, cities, companies, derivatives, institutional leverage and the AI Lab ([lifestyle.ts](../../src/content/lifestyle.ts#L20)). This gives goals and variety, but increases capital and leverage at the same time; no population-level progression curve was reviewed. Treat late-game thresholds as pacing choices, not proven economic targets.
- **Offline activity:** business income stays full for eight game days (sixteen with a manager), then ramps down to a floor, with automation affecting that floor; expenses such as property upkeep and lab payroll continue while offline ([assets.ts](../../src/world/assets.ts#L205), [core.ts](../../src/world/core.ts#L22)). The consequence is coherent, but a player needs a clear net-away estimate including their obligations.
- **Calendar scale:** one game day is one real hour and each day has 720 five-second ticks ([core.ts](../../src/world/core.ts#L10)); macro days, quarterly company filings, offline periods and eight-week chapters compress different real-world horizons into one clock. That is a product choice, not an economic error. UI copy should distinguish game days from real days anywhere deadlines or return rates are shown.

## Evidence boundaries

- The provided fresh aggregate snapshot is tick 67,822 with 265 players, 172 businesses, 0 companies and 0 properties. It includes aggregate cash and cumulative NPC retail faucet/sink totals; no private account detail is used here. This is useful for current business presence and cash context, not for validating absent company/property systems.
- The controlled experiment file reports that reply/chat actions do not change prices, balances, orders or flows in the exercised fixture. It also reports promotion faucets of $500/$1,500 NPC money against $500/$2,000 payer costs, and an unchanged cash/faucet total in the stabilizer paper-wealth test. These are bounded fixture findings, not broad product guarantees.
- The selected test run reports 735/746 passing and 11 failures across three files: eight in `engine/squeeze.test.ts`, two in `engine/huge.test.ts`, and one in `world/launchpad/crowd.test.ts`. They do not directly falsify the audited shop/property/company-economy claims. The run is not green and must not be summarized as a passing suite.
- The report did not independently reproduce every provided probe, inspect production database write paths, validate market-price formation or launchpad/NPC paths assigned to other audits, or establish cohort-level player outcomes. Company and property outcomes are especially unvalidated because the fresh snapshot has no records in either system. Listed company stocks are selectable by Lab bots in code; their return distribution was not validated here.

## Suggested order of work

1. Decide what the stabilizer controls; align runtime, name, UI and tests to that quantity.
2. Fix the economy harness's 4%/1% mismatch and make balance runs observable by player strategy and net cash flow.
3. Clarify property and shop return projections so players can tell modeled yield from real market risk.
4. Build company/AI bot return scenarios with actual listed trading and nonzero-player snapshots before tuning or marketing returns.
5. Decide whether “money index” means flow pressure or purchasing power, then rename or measure it accordingly.
