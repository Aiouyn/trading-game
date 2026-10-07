# TYCOON: what is built

The full game from `MASTER-BIBLE.md`, built on top of the Phase 0 engine and screen, as one persistent multiplayer world (Mathis's ruling: one world, one game day per real hour, global and country leaderboards, seasonal chapters inside the world). This file lists every system with its key numbers so balance changes have one place to start.

## The loop

1. **Earn**: businesses pay every tick; trades, rent, dividends and contracts add to it.
2. **Invest**: better business tiers, upgrades, property, compute and data.
3. **Build an edge**: analyst notes, the earnings calendar, the central bank calendar, AI models, bots and signals.
4. **Compete**: ten leaderboards, rivals, alliances, Security Ops and court.
5. **Flex**: lifestyle items and homes turn money into Prestige (status, perks, and a target on your back).
6. **Catch up**: "While you were away" summarises fills, incidents, attacks and verdicts.

## Time and the world

- Tick 5 s · game day 720 ticks = 1 real hour · game year 252 days (≈ 10.5 real days).
- The world is created once with 63 days of history and runs forever; it pauses only while the server is down.
- Chapters: every 8 real weeks the chapter closes, the richest and fastest climbers go to the Hall of Fame, and the chapter ladders reset (net worth never does).
- 24 NPC rivals (momentum chasers, value hunters, landlords, tycoons, whales…) play through the same commands as humans, chat, and give every new player a visible rival from minute one.

## Markets (engine)

- **Universe**: 120 stocks (12 sectors × 10, five regions with their own factor), 15 crypto, 11 commodities including the game-native Compute ($ per 1,000 GPU-hours), Data and Power, 4 currencies, 5 bond funds, 13 unlisted property-district indices, 4 indices (GX, GXT, AV50, CRX).
- **Macro**: inflation and growth follow the cycle; the Avalon Central Bank meets every 8 game days and moves 25–50 bp toward the Taylor rule; the market prices an expected move, and surprises hit stocks. CPI and jobs releases alternate every 5 days with a consensus. Yields (2y/10y/30y) reprice bonds and property through duration; an inverted curve is flagged in the calendar.
- **Earnings, simplified** (Mathis: "keep them, simplify"): every stock reports quarterly. Analysts publish a lean (Beat / Miss / Split with 1–3 stars) 5 days ahead; a whisper (right 7 times in 10) may leak 2 days ahead; the report is a letter grade A+…F with a one-line verdict, and the move keeps drifting for a few days after.
- **Fair value**: every asset has a hidden fundamental value that prices revert toward over weeks. Analyst notes (Hustler+, priced at 0.2% of net worth) and analyst AI signals give noisy reads of it: a real, paid edge.
- **Trading tools**: market, limit, stop, stop-limit, trailing stop; good-till-cancel or day; brackets (take-profit + stop-loss, one cancels the other); one-click close. Pro license: shorting (daily borrow fee) and 2× margin; Derivatives: options and 5×; Institutional: 10×. Margin call below 30% equity/exposure, liquidation below 20%, largest position first. Cash earns half the policy rate; margin pays policy + 3%; dividends pay daily.
- **Options**: calls and puts on the 24 biggest stocks plus CRVO, GNOM, AUC, LTX, GOLD, OIL, AV10; weekly expiries, 4 listed; Black-Scholes on live vol; 3% half-spread; cash-settled at the close of expiry; long only (max loss = premium).
- Fees: stocks/commodities 0.10% (min $1), crypto 0.20%, FX 0.02%, bonds 0.05%. Spreads and square-root impact as in `ENGINE.md`.

## Ranks and licenses

| Rank | Net worth (peak) | Shell | Unlocks |
|---|---|---|---|
| R0 Broke | start | Cracked phone | Stocks and crypto, Hustle businesses, Port Avalon property |
| R1 Hustler | $20k | New phone | Small businesses, mortgages (70% LTV), analyst notes, alliances, deals |
| R2 Owner | $250k | Laptop desk | Pro license, Companies, Nordhaven and Meridia, the AI Lab |
| R3 Operator | $5M | Trading floor | Derivatives license, Enterprises, Sundara and Kaiyo, Security Ops |
| R4 Mogul | $100M | Penthouse office | Institutional license, Conglomerates, Isla Serena |
| R5 Titan | $2B | Tower command | Megaprojects |
| R6 Dynasty | $50B | Island control room | — |

Ranks key off peak net worth and are never lost. The rank-up ceremony (DESIGN §6c) plays for every rank.

## Businesses

- 156 businesses: 13 sectors × 6 tiers × 2. Tier cost ≈ 10× per tier ($2.5k, $25k, $250k, $3M, $40M, $600M) and yield per game day falling by tier (5%, 3.8%, 2.7%, 1.8%, 1.2%, 0.8%).
- **Slots**: at most 4/6/8/10/12/15 businesses per tier per player (attention is limited), so growth comes from climbing tiers, not spamming carts.
- **Competition**: each city × sector is a demand pool with NPC competitors; share is a logit on appeal (marketing, location, staff, tier), capped at 1.8× baseline. Bigger cities pay more (Port Avalon 1.0× up to Isla Serena 1.3×). Demand follows the business cycle by sector cyclicality.
- **Upgrades**: six axes, five levels (cost 45% × 1.7^level of the purchase price): Staff +8%, Marketing +appeal, Equipment +7% and fewer breakdowns, Location +appeal +5%, Automation +15% offline earnings, R&D +6% and +25% data.
- Synergies: 3+ businesses in a sector +10%; owning a supplier sector +5% (vertical integration). Energy businesses power your GPUs; compute and software businesses feed your Lab data.
- Incidents (≈6% a game day): viral hit, award, big contract, rival closes / breakdown, inspection, walkout, data breach, bad reviews, supply shortage.
- Offline: full earnings for 12 real hours after you leave, then 25% + 15% per Automation level.
- Selling returns 70% of everything invested. Net worth values a business at 60% of invested + 6 days of income.

## Property and lifestyle

- 6 cities, 13 districts (working / mid / prime / trophy) each priced by its own index (rate-sensitive, cyclical), 13 property types from a $90k studio to a $400M private island estate. Rent yields 2–7.5%, upkeep 1–2%, 2% transaction costs, renovations (+15% value for 12%), mortgages at the 10-year yield + 2%.
- Living in a home pays Prestige instead of rent.
- 49 lifestyle items in 11 categories (gadgets to a private space station). Prestige = √(price/1000) × rarity × age factor, best item per category counts fully, then ½, ⅓… Mass items fade and depreciate; limited and unique items track the collectibles index. Unique items can be owned by one player in the world. Big purchases hit the Wire; luxury spending nudges Velour Maison's value (bible decision 11).

## Progression and social

- Hourly contracts: three goals per game day (trade, win, beat the index by 0.5%, buy a business…), rewards 0.5–4% of net worth, capped by rank.
- 51 achievements (bronze to legend); achievement names become selectable titles.
- Leaderboards: net worth (the Gilt List, with your global position), richest this chapter, fastest climber (log growth from a $100k floor), tycoon, trader, prestige, landlord, alliances, defender, opt-in Most Wanted, and per-country boards.
- Public filings: holding ≥ 0.5 / 1 / 2 / 5 / 10 / 20% of a company is announced on the Wire (whale tracking).
- Chat: world, country, alliance and direct messages. Alliances: $25k charter, 20 members, treasury with roles. Deals: loans with interest and maturity (defaults go to court) and gifts (capped at 10% of net worth, 5% tax, receiver must be Hustler: anti-alt).

## AI Lab (Owner+)

- MCS = A × 0.25 × C^0.34 × D^0.28 × balance bonus (compute and data in proportion) × collapse penalty (synthetic data above 40%, 60% with research).
- Compute: 5 GPU tiers (resale 60%, drawing power at the Power price unless your power plants cover it), reserved contracts ($2/PFLOP-day), cloud spot ($1.20/PFLOP-day × Compute price / 120).
- Data: licensed broker, scraping (5% chance of a regulator fine), synthetic, and free partnership data from your businesses; decays 2% a day.
- 19 research projects in 7 eras multiply A and unlock bot strategies, analyst signals, security models, faster training and forensics.
- Training runs take 1–6 game days and can fail (18% quick, 6% careful, −1 point per researcher). Researchers cost $1,500 a day.
- Products: trading bots (momentum, mean reversion, value, earnings, trend) on the normal order book, deciding every 36 to 1 ticks by model tier, with crowding decay; analyst signal packs (the 5 biggest mispricings, once per game day); security models (attack and defense).

## Security Ops (Operator+, abstract by design)

Mathis's hidden-session ruling with Tape's numbers: a successful operation plants an entry in the victim's Connections panel that looks exactly like a legit one. It copies the victim's best model while connected (P = 0.85·(1 − e^(−k·h)), offline hours count a quarter and one offline stretch adds at most 0.08), drains a little compute (bots skip runs), and leaves clues among decoys. Whisper / Tap / Siphon trade plant odds against copy speed and noise. Breach odds = 1% + 89%·σ(log2(AP/DP) + bias); defense = 0.8 × security MCS + 40·√(budget/10k) + 10 + alliance bonus. Auto-scans by defense tier (every 24 to 2 game days), $5k+ deep scans, tags, paid disconnects (free when flagged), and Lockdown (cuts everything, pauses your AIs 2 days, then 12 days of shield). Cutting a hostile session yields 20/28/35 (+10 if flagged) evidence points. Anti-grief: 72-day new-player shield (ends on your first attack), rookie zone until $1M or 7 real days, 24-day cooldown per pair, at most 3 hostile sessions per victim, 1–5 live sessions per attacker by tier, a 5× punch-down cost.

## Court

Evidence against a bar (civil 40, model theft 55); verdict odds σ((evidence − bar)/12 + counsel), counsel capped at ±0.75 logit (4 levels, $0 to $120k). Winners get damages; losers pay a severity-tiered fine (0.5–3% of net worth with floors and caps), 90% destroyed and 10% to the victim; model theft with strong evidence also freezes the defendant's assets for 24 game days (Held). Nothing takes anyone below $5,000. Defendants can offer settlements. Loan defaults come with 80 points of evidence.

## Economy

Every dollar created (business income, rent, dividends, interest, contracts, the $250 broker grant) and destroyed (fees, upkeep, fines, compute, data, research, security, lifestyle, transfer tax) is tracked by source. The stabilizer (a public PI controller) raises the upkeep levy up to 1.6× when total player wealth grows faster than 4% per game day, and relaxes back to 1×. The Hall of Fame screen shows both ledgers.

## Balance (scripts/balance/wealth.ts)

A businesses-only "median engaged" player (online 16 h, asleep 8 h, reinvests, saves for the next tier) reaches $10k on day 1, Hustler on day 3, $227k on day 7, Owner around day 9 and $14.5M (Operator) on day 21: 0.70×, 0.45× and 0.72× of the bible's day 1 / 7 / 21 targets before trading, property and contracts, which a real player adds on top. Growth decelerates from about 2× a day early to about 1.3× a day by week three.

## Deliberately left out or simplified

- Player IPOs and takeovers, perpetual futures, option writing, player-launched tokens (bible: later phases, high exploit surface); prediction and vice markets (bible: excluded).
- Weight theft and the full espionage catalog (E1–E8) are represented by the hidden-session operation; insurance and player-run law firms are not built yet.
- One server process (no sharding); 4k concurrent players is the bible's target and has not been load-tested here.
- No French localization yet; no native apps (the web app is responsive down to 390 px).
