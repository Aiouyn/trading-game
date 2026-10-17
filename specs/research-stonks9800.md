# Research: STONKS-9800, company building and market mechanics

**For:** Ledger, then Quant (company economics and fundamentals feeding the market), Forge (management screens), Velvet (dashboards), and Tape (exploit and balance hunts).
**Date:** 2026-10-09. **Status:** research only. Nothing here is approved for build.
**Rule for us:** borrow mechanics, never assets, names, characters or look. No "Amy", no parody company names, no PC-98 styling. Our look stays Ink & Brass.

## 0. Sources and confidence

I used the Steam store page; all 100 Steam news posts and devlogs from 2021 to 2026-09-04, pulled through the Steam news API; all 1,512 English Steam reviews (1,472 positive, 40 negative), pulled through the Steam reviews API; the 266-achievement list with global unlock rates; Steam discussion threads; r/STONKS_9800 (Reddit blocks direct fetches, so those quotes come from search-result snippets); PC Gamer (two articles); LadiesGamers; the developer's Substack; and a GamerSky (Chinese) beginner guide. The fandom wiki is nearly empty (7 pages, lore only).

Patch notes tagged **[dev x.y]** are all on the [Steam news hub](https://store.steampowered.com/news/app/1539140). A mirror of all 100 posts, pulled through the API, is at `specs/research-sources/stonks9800-steam-news.txt`. The 1,512 English reviews are at `specs/research-sources/stonks9800-steam-reviews-en.json`.

Tags used below:
- **[dev]**: the developer's patch notes, store page or devlog. Highest confidence.
- **[player]**: a community report, with the link given. Medium confidence, may be out of date.
- **[uncertain]**: inferred, contradicted, or from one weak source.

The game changes a lot between patches, so a player report from 2023 may no longer be true in v0.10.2.2 (2026-09-04).

## 1. Snapshot

- Solo developer TERNOX (Ukraine). Early Access since 2023-07-17, about $9–10. Full release with a "Story Mode" is planned for 2026 [dev, store]. v0.10 "Family Ties" (2026-06-30) was called "DEFINITELY the last one before the full release" [dev].
- Reviews: **97% positive of 1,443 English reviews (Overwhelmingly Positive)**, but **89% of the 55 in the last 30 days** [store, read 2026-10-09]. Among reviewers, median playtime is about 23 h, and about 10 h at the moment they wrote the review.
- It's a text- and menu-based trader life sim set in Japan's 1980s–90s bubble, with no 3D world. Its verbs are buy, sell, short and hold, plus a life sim (stress, health, hospital), contacts and bars, mini-games, real estate, commodities, art, a charity foundation, the Yakuza and a regulator (FSA).
- Company building (CEO mode) arrived in v0.3 (2023-11-01). The developer himself said it "feels like a standalone DLC… another game within the game" ([Substack](https://ternox.substack.com/p/stonks-9800-big-03-update-with-ceo)). Its depth has grown in patches ever since.

## 2. Core loop

**Time.** Days tick automatically. You can pause, change speed (up to 3×), and set auto-stops at weekdays or weekends [dev 0.8]. Stock indexes update once a day, and a game year takes up to about an hour of real time ([review](https://steamcommunity.com/profiles/76561197993736909/recommended/1539140/)). Weekends are for socializing: calling contacts and going to the bar, golf or the city [dev 0.2, 0.4].

**Typical arc** ([beginner thread](https://steamcommunity.com/app/1539140/discussions/0/7264963821760988786/), [player]):
1. Early: flip stocks on tips, take a part-time job, maybe buy cheap real estate.
2. Mid: hold dividend payers, network, and get board seats with 5%+ stakes.
3. Mid to late: **found a company** and keep buying other companies' shares.
4. Late: trillions of yen, acquisitions, achievements. Several players say money stops mattering here (see §7).

**Information sources:** daily news; paid tips from an insider character, which are sometimes scams and lower your ethics; bar rumors from friends; a "Fortune Teller" trait that's right about two times out of three [dev 0.10.2.2]; annual reports; asking the assistant to analyze a company; revenue forecasts companies publish "to impress investors" [dev 0.5].

**Risk and friction:** stress sends you to the hospital, where you can't trade. The FSA can warn or sue you for rapid in-and-out trading or for dumping a huge stake [dev 0.2, 0.10.1.4]. You can be prosecuted and jailed for insider trading, and going to prison removes you from every CEO post and board seat [dev 2024-04-06].

**Reputation** has seven axes: Public Image, Financial Success, Ethics, Networking, Market Knowledge, Philanthropy and Innovation ([devlog #2](https://steamcommunity.com/games/1539140/announcements/detail/5151601211220771870)). They unlock perks. For example, high market reputation lets you buy more shares at IPOs and on the exchange and lowers fees, and a highly reputable player's speech has more effect on a company [dev 0.5].

## 3. Founding and running a company

### 3.1 Founding
- "Create your own company" in Free Mode: **42.2% of owners have done it** ([achievements](https://steamcommunity.com/stats/1539140/achievements)). You pick a field of activity, or sector. There have been 8 sectors since v0.6.2 (there used to be 11) [dev].
- **CEO bio start:** begin the game already running a small company. It's unlocked after you've founded a company once [dev 0.6]. Until v0.10.1 (2026-07-20) this start "would almost always get you fired". The fix gives it departments and staff from day one, and its "larger IPO attracts more applicants" [dev]. Before that, players reported losing money and getting fired no matter what ([Reddit](https://www.reddit.com/r/STONKS_9800/comments/1uuqjru/ceo_mode_what_am_i_missing/)).
- A founded company seems to list on the exchange right away: it has a share price, issues shares, and splits automatically like other companies [dev 0.10.2.0]. Players also mention an IPO lockup ([review](https://steamcommunity.com/profiles/76561198014551786/recommended/1539140/)). **[uncertain]** I found no exact IPO price rule or lockup length.
- After you resign as CEO, you can't create a new company for one year [dev 0.4.0.2].
- Players' rule of thumb: get rich trading first, then found the company and pour personal money into it through **"replenish reserves"**. One player suggests over ¥25bn of your own money to grow fast ([thread](https://steamcommunity.com/app/1539140/discussions/0/3946902262253133369/), [player]).

### 3.2 Departments
The achievement names give the department list: **Headquarters, Operations, HR, Sales & Marketing, R&D, Finance, IT**. Each runs at an **efficiency %**, with achievements at 66% and 100% ([achievements](https://steamcommunity.com/stats/1539140/achievements)).
- **A new company has no production.** You must build Operations and "expand production" at least once before it earns anything (player, confirmed in substance by the developer's reply in the [thread](https://steamcommunity.com/app/1539140/discussions/0/3946902262253133369/)). You can click "expand production" repeatedly without waiting for each result [player].
- **HR** brings in more and better job candidates [player]. **IT** is said to be the most expensive to upgrade [player, [thread](https://steamcommunity.com/app/1539140/discussions/0/7264963821760988786/)].
- Expanding a department adds a management seat that has to be filled [player, [knacks thread](https://steamcommunity.com/app/1539140/discussions/0/6027566973999193690/)].
- Unassigned staff work on a recurring team "project" that gives reserves, research points and employee XP [dev 0.4.2]. There's a staff cap, and over the cap the assistant fires the weakest employees [dev 0.7.1].
- A player's complaint: board demands such as "HR at 75%" can need upgrades costing 4× what the business cost to found ([review](https://steamcommunity.com/profiles/76561198004363213/recommended/1539140/)).

### 3.3 People
- Every contact in the world is a potential hire, with a **knack** (department affinity), a personality, and stats such as thoroughness and experience [dev 0.3]. The developer says knacks "add a lot to the department's efficiency rate if they are assigned to the appropriate department" ([dev reply](https://steamcommunity.com/app/1539140/discussions/0/6027566973999193690/)). Leadership is the knack for HQ and management seats [player].
- Employees have energy, job satisfaction and salary demands. They ask for raises and vacations. You can train them, send them on vacation, pay bonuses and raise salaries in bulk [dev 0.3, 0.3.0.4, 0.7.1].
- Since v0.10, **character traits are hidden** until you learn them through rumors, conversations or training [dev].
- You recruit through your social network: build friendship by calling contacts, going to bars and sending gifts, then hire them. Random acquaintances also ask to join [dev 0.3; player, [Reddit](https://www.reddit.com/r/STONKS_9800/comments/1uuqjru/ceo_mode_what_am_i_missing/)]. Old staff remember you: one player complained that people from his previous company "had no respect" when he founded a new one ([review](https://steamcommunity.com/profiles/76561199810869502/recommended/1539140/)).
- Consequences: firing someone, especially a board member, lowers internal approval, and so do mass raises or big bonuses [dev 0.9.1]. One review describes a morale cascade: a failed launch plus a crash meant no reserves, morale fell, staff quit "insulting me or the company on their way out", and he resigned ([review](https://steamcommunity.com/profiles/76561198042280058/recommended/1539140/)).
- If both you and an employee have Yakuza ties, that employee can offer "special services" [dev 0.4].

### 3.4 Budget levers
- **Sliders** split income between reserves, dividends, research, marketing and similar lines ([Reddit](https://www.reddit.com/r/STONKS_9800/comments/1uuqjru/ceo_mode_what_am_i_missing/), [player]; "Expense sliders are now easier to use" [dev 0.8]). Players advise about 1% dividends early, heavy research, marketing and reserves, and reinvesting everything [player]. Another player puts marketing and dividends first "to inflate your value", then shifts toward R&D and reserves ([thread](https://steamcommunity.com/app/1539140/discussions/0/7264963821760988786/)).
- Income has been computed daily since v0.9.1, then distributed to reserves monthly [dev]. Since v0.10, companies pay taxes and can donate reserves to charity or move them into your own foundation, a deliberate tax-dodge fantasy [dev 0.10].
- A company with a negative balance for a long time goes bankrupt [dev 0.3].

### 3.5 Projects, R&D and products
- You launch **R&D, marketing (including an "Advanced Marketing Campaign"), production and next-gen product projects**. One player says results take about 2–3 weeks and "boost your monthly income and stock value" ([thread](https://steamcommunity.com/app/1539140/discussions/0/7264963821760988786/)). Projects have **levels 1–5**: only 13.2% of owners have built a level-5 project ([achievements](https://steamcommunity.com/stats/1539140/achievements)). The company itself has levels, with CEO-bio achievements at company levels 5, 10 and 20 [achievements].
- A separate **Investment Center**, for your personal money: you fund outside "investment projects", including Future Tech. Up to three contacts can improve a project. Projects can come from listed companies and move their price and income, and results can spill over to the whole sector [dev 0.5, 0.6.2]. One player found it unlocks after roughly 5–10 investments and costs ¥50M to build ([thread](https://steamcommunity.com/app/1539140/discussions/0/598515617325131507/)). Another calls angel investing "crazily overtuned" ([review](https://steamcommunity.com/profiles/76561198168719327/recommended/1539140/)). The developer later lowered average success chances [dev 0.9.2].
- **What's missing, per reviewers:** "you can choose to develop new products, but the game doesn't allow you to determine what kind of product", "Running a pharmaceutical company feels the same as running a media and advertising firm" ([review](https://steamcommunity.com/profiles/76561198044388013/recommended/1539140/), 2024-07). A Reddit poster says R&D "results are always just random no matter what order I run them in", and that growth stalled for a decade of game time after ¥1T in income despite constant advertising and expansion (r/STONKS_9800 "Keeping a business successful", seen as a search snippet) **[player, uncertain: snippet only]**.

### 3.6 Competition and market share
- Companies are grouped by sector, and there's a yearly "best companies of the year" ranking [dev 0.4]. Achievements count top-5, top-3 and top-1 by annual profit and by market cap.
- The 2024-07 roadmap promised "enhanced competition among companies in the same sector, giving you a clear view of your rivals" [dev]. **[uncertain]** I found no patch note confirming it shipped, and no market-share or demand model in any source. Sector rebalancing exists: "The Financial sector is no longer the obvious best option" [dev 0.10.1].
- Players compete mostly through finance (shorting, dumping, buyouts), not through products: "i sunk a rival business because they refused to be merged" ([review](https://steamcommunity.com/profiles/76561198393905027/recommended/1539140/)), and "bullied every company that wouldn't merge with mine into bankruptcy" ([review](https://steamcommunity.com/profiles/76561198062996119/recommended/1539140/)).
- One cosmetic crossover: a large industrial player company can see its own-brand cars on the car market [dev 0.7.1].

### 3.7 Governance
- **Board of directors** and **shareholders' meetings** with a speech mini-game. Meeting results move the share price [dev 0.3]. This was broken until 2026-07: disappointed investors *raised* the price, and skipping a meeting helped [dev 0.10.1.2].
- **Board tasks**: yearly objectives, shown in the company's Statistics tab [player, Reddit "What are Board Tasks?" snippet]. Only **1.6%** of owners have completed all of them in one year ("Excellent manager") [achievements]. New companies get easier objectives in their first year [dev 0.9.2].
- **CEO risk:** without a controlling stake you can be fired for poor results. With control, you're "offered" resignation [dev 0.3]. A CEO who owns 100% can't be voted out, and a company with a single owner holds no meetings [dev 0.10.2.0, 0.10.1.2]. If you skip meetings as CEO, the outcomes get worse [dev 0.3].

### 3.8 Capital actions
- **Share issuance:** "Without issuing new shares, companies will hit a ceiling". A large holder must consent [dev 0.4]. Players found that their ownership was diluted 2–5% even when they bought their allotment, and called it confusing or a bug ([thread](https://steamcommunity.com/app/1539140/discussions/0/4209246273257598940/)).
- **Outside investor:** at first a "mysterious investor" just gifted money. Now he buys newly issued shares at market price ("real dilution of your stake"), and you can decline [dev 0.10.1.2, 0.10.1.4].
- **Splits and reverse splits** happen automatically when the price gets too low or too high. **33% of would-be bankruptcies do a split instead** [dev 0.6.2]. The player's own company has split automatically since v0.10.2.0.

## 4. How fundamentals reach the stock price

What the game says: price comes from **hype and profitability**, as quoted in this [review](https://steamcommunity.com/profiles/76561198211684145/recommended/1539140/). Patch history:
- v0.6: "Company profits now have a stronger effect on stock prices"; "companies grow less frequently into unrealistically massive corporations"; large unprofitable companies are forced to lay off staff and downsize [dev].
- v0.9.1: companies earn less relative to their size. v0.10.1: NPC dividends are steadier, because payout ratios could fall to zero before [dev].
- Events: news, rumors, revenue forecasts, outcomes of investment projects (company and sector), commodity and yen news, and either the historical early-90s crash or a "Random mode" of booms and busts [dev 0.5, 0.6, 0.6.2, 2024-02-01].

**Price impact of player trades:**
- v0.2: your purchases move the price more.
- v0.7.1: small trades move it less, which makes artificial inflation harder.
- v0.10.1.1: trades move the price immediately, with safeguards, and "some of this sudden price change may fade by the next day".
- Daily trading capacity depends on your total influence in a company [dev 0.8] and on your market reputation [dev 0.5].
- Players say you can manipulate any stock where you can trade more than 5% of shares a day: short it about 10 times and "you'll have infinite money" ([Reddit](https://www.reddit.com/r/STONKS_9800/comments/1kypwtp/how_do_i_consistently_make_money_in_this_game/), [player]).

**Insider effects:** in a high position at a company, your trades in its stock "can cause new events and news", and selling large blocks of your own company hits its reputation [dev 0.4].

**Where players say it breaks:**
- **Own company = the only guaranteed stock.** "If you learn how to run the company it's guaranteed stock explosion… It's the only guaranteed stock in the game" ([Reddit](https://www.reddit.com/r/STONKS_9800/comments/1uuqjru/ceo_mode_what_am_i_missing/)). "Your ability to pump the stock through dividend hikes, next gen product development, etc. is basically unlimited" ([thread](https://steamcommunity.com/app/1539140/discussions/0/3946902262253133369/)).
- **Resignation pump:** a player ran his company down, bought shares, resigned, and the stock surged ([review](https://steamcommunity.com/profiles/76561198243251634/recommended/1539140/)). In another case investors "were thrilled that I was leaving, and our stock went up" ([review](https://steamcommunity.com/profiles/76561198042280058/recommended/1539140/)).
- **Price detached from fundamentals:** a failing company did a 5:1 split and went from 23,000 to 132,000, then 174,000, "on nothing" ([review](https://steamcommunity.com/profiles/76561197991178817/recommended/1539140/), 2025-06). Annual reports contradicted company profiles, profitability was "entirely useless" to predict, and "hype is actually the only variable you can utilize" ([review](https://steamcommunity.com/profiles/76561198211684145/recommended/1539140/), 2023-10). And: "There is essentially no useful data that you can analyze" ([review](https://steamcommunity.com/profiles/76561198050663175/recommended/1539140/), 2024-12).
- **Snowball:** "acquired trillions in assets by the end of year 3" with predatory shorts plus buyouts ([review](https://steamcommunity.com/profiles/76561197998883236/recommended/1539140/)). Patch 0.10.2.0 had to fix companies "worth over 1,000 trillion yen" crashing overnight and money at quintillion-yen levels [dev].
- **Requested by a finance-industry reviewer:** a balance sheet, an income statement, a cash-flow statement, ratios and a beta per stock, with charts driven by those metrics plus tips ([review](https://steamcommunity.com/profiles/76561199072867599/recommended/1539140/)).

## 5. IPOs, ownership and takeovers

- **NPC IPOs:** new companies go public, and you can buy an allotment "at a favorable price (or not…)" [dev 0.3]. There's a minimum subscription [dev 0.4.3.11], and market reputation raises your allocation [dev 0.5]. New companies appear more often since v0.6 but succeed less [dev 0.4.3.11, 0.6]. One player says new IPOs auto-spawn when the count is low, sometimes at multi-billion valuations ([review](https://steamcommunity.com/profiles/76561198066420622/recommended/1539140/)).
- **Getting shares beyond the float:** "not all of their owners want to sell" [dev 0.2]. In 2023 one player hit a practical cap of about 20%, after which only rare personal deals were left ([review](https://steamcommunity.com/profiles/76561198211684145/recommended/1539140/)). Other routes: friends with high friendship offer **share packages at roughly 1/4 to 3/4 of market price at the bar** ([Reddit](https://www.reddit.com/r/STONKS_9800/comments/1n6cdpb/deals_achievement/), [player]); board members sell their stakes once you're friends ([thread](https://steamcommunity.com/app/1539140/discussions/0/3884975231681706250/)); poker prizes paid in shares; marrying into a CEO's family gives a board seat and shares [dev 0.10]. Bugs once let players own more than 100% [dev 2025-06-02, 0.10.2.0].
- **Thresholds** [player unless marked]: about 1% gets you into shareholders' meetings and speeches. Board invitations follow, and you can be expelled from a board if your reputation inside the company is very low [dev 0.4]. Players report that over 50% lets you make yourself CEO at the next meeting ([thread](https://steamcommunity.com/app/1539140/discussions/0/3884975231681706250/)). One player took 20 in-game years to get there through friendships alone.
- **Mergers and buyouts:**
  - v0.4.2.2: companies can buy each other, and your company can buy others.
  - v0.6: with a majority stake the target "cannot refuse", and larger stakes raise your odds.
  - v0.7.1: mergers and full buyouts are separate menus.
  - Companies run by your spouse's relatives or friends are easier to acquire [dev 0.10].
  - Players say the cost scales with the target's net worth or market cap, paid from your **company reserves** ([thread](https://steamcommunity.com/app/1539140/discussions/0/4286936944584763156/)).
  - Only **15.5%** of owners have done a takeover, and **9.0%** hold control of every listed company ("Monopolist") [achievements].
- **What an acquisition does:** "the only effect was my company's market cap getting bigger. I couldn't choose what to do with the company I acquired" ([review](https://steamcommunity.com/profiles/76561198044388013/recommended/1539140/)). On Reddit, buyouts give "a temporary boost before my value regresses" [player, snippet].
- **Bankruptcy:** struggling companies go bankrupt, or split instead (33%) [dev 0.4.2.2, 0.6.2]. Insider tips no longer target bankrupt companies [dev 0.9.2].
- **Short selling** needs reputation, has a monthly borrow fee and a share limit ([guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3008782829); dev 0.6, 0.9.2).

## 6. Progression and pacing

**Funnel from global achievement rates**, as % of all owners ([source](https://steamcommunity.com/stats/1539140/achievements)):

| Milestone | % of owners |
|---|---|
| Build a company department | 43.1 |
| Create own company | 42.2 |
| Hire 5 employees | 41.5 |
| ¥100M monthly profit (own company) | 39.9 |
| ¥1B monthly profit | 35.1 |
| Hire 25 employees | 34.0 |
| Operations dept at 66% | 31.1 |
| Any department at 100% | 30.5 |
| ¥10B monthly profit | 27.9 |
| Top 5 by annual profit / by market cap | 24.9 / 24.9 |
| Top 1 by market cap | 19.0 |
| Acquire another company | 15.5 |
| Level-5 project | 13.2 |
| Control every listed company | 9.0 |
| Complete all board tasks in one year | 1.6 |

So nearly everyone who founds a company scales it a lot. The drop-off is at deep management: board tasks and top-level projects.

**Speed** [player]:
- Largest company "within 1–2 years" with ¥25bn+ invested ([thread](https://steamcommunity.com/app/1539140/discussions/0/3946902262253133369/)).
- Market cap above ¥1T "within a few years of founding" ([thread](https://steamcommunity.com/app/1539140/discussions/0/7264963821760988786/)).
- Trillions by year 3 ([review](https://steamcommunity.com/profiles/76561197998883236/recommended/1539140/)).

**A useful insight:** "your % returns from just trading generally will exceed returns from founding a new company, however once you reach a certain level, the stock market lacks the volume for you to invest all your cash, so it makes sense to grow the market by founding new companies" ([thread](https://steamcommunity.com/app/1539140/discussions/0/3946902262253133369/)). In other words, **limited market liquidity is what pushes players into company building.**

**Pacing problems:**
- Endgame emptiness: "When you're sitting on trillions, the only way to go into the red is through divorce... or prison" ([review](https://steamcommunity.com/profiles/76561198968573207/recommended/1539140/), 62 h, 2026-09). Another: "the endgame is where things get a little quiet" ([review](https://steamcommunity.com/profiles/76561198164895834/recommended/1539140/), positive).
- Early lockouts: hospital stays and food poisoning that "waste real-world time" ([review](https://steamcommunity.com/profiles/76561197975081411/recommended/1539140/)).
- Players asked for a tutorial ([review](https://steamcommunity.com/profiles/76561198274270949/recommended/1539140/); [review](https://steamcommunity.com/profiles/76561198799076679/recommended/1539140/): "the game gives no indication of what to do to make profit for your company"). The developer promised "a real tutorial" in v0.8 [dev 2025-11-14]. **[uncertain]** whether it shipped.
- The developer has added levers: a Luck difficulty and adjustable taxes and fees [dev 0.6.2, 0.10], larger loans by reputation, dynamic loan rates [dev 0.9.1], and a "Golden Boy" bio with a ¥5M head start for players who've topped Tokyo before [dev 0.9.1].

## 7. What players praise and criticize

Crude keyword counts across all 1,512 English reviews:
- In positive reviews: "addictive" 11%, music 11%, gambling mini-games 17%, real estate 9%, the assistant 9%, aesthetic 9%.
- In the 40 negative reviews: RNG/random 28%, bugs 23%, gambling 23%, music 20% (usually "music is good, but…"), insider/tips 13%, company/CEO 13%, unclear/tutorial 13%.

**Praised:**
- Atmosphere and music, and an "excellent game to just be in" ([PC Gamer GOTY pick](https://www.pcgamer.com/anime-finance-sim-stonks-9800-is-the-best-game-you-didnt-play-this-year/)).
- Emergent stories: rags to riches, then ruin and comeback ([review](https://steamcommunity.com/profiles/76561198042280058/recommended/1539140/)).
- The tension of tips and scams, and prison as a funny consequence ([PC Gamer](https://www.pcgamer.com/im-in-love-with-this-80s-japan-themed-stock-trading-sim-that-sent-me-to-prison-for-insider-trading/), [LadiesGamers](https://ladiesgamers.com/stonks-9800-stock-market-simulator-early-access-review/)).
- The career climb from scarcity to buying companies.
- Company management as the place where "you finally do something about the relationships you built" ([review](https://steamcommunity.com/profiles/76561197993736909/recommended/1539140/)).
- Many ways to make money ([review](https://steamcommunity.com/profiles/76561199096076735/recommended/1539140/)).
- A developer who ships frequent updates.

**Criticized:**
1. The market feels random and disconnected from fundamentals and information (§4 links; [review](https://steamcommunity.com/profiles/76561197984049128/recommended/1539140/): "a random-number generator… exists completely in isolation from anything else").
2. Side systems don't feed the core: "nothing feeds back into the main game… You can drink or golf with the CEO of Sony, but it has zero gameplay impact" ([review](https://steamcommunity.com/profiles/76561198004363213/recommended/1539140/)).
3. The company layer is shallow: no product choice, identical sectors, acquisitions that only add market cap ([review](https://steamcommunity.com/profiles/76561198044388013/recommended/1539140/)), and only "7–10" growth options ([review](https://steamcommunity.com/profiles/76561198968573207/recommended/1539140/)).
4. Exploits and snowballing: own-company pumping, short-and-dump, "regulators… barely do anything" ([review](https://steamcommunity.com/profiles/76561197998883236/recommended/1539140/)).
5. Poor explanation, numbers that don't match between screens, and many bugs (each patch note is mostly fixes).
6. Grind: friendship by phone call "about 50 times" ([review](https://steamcommunity.com/profiles/76561198211684145/recommended/1539140/)), and lockouts that waste time.
7. Real estate as a riskless endgame: "rewards you for selling all your stocks and relying on rent income" ([LadiesGamers](https://ladiesgamers.com/stonks-9800-stock-market-simulator-early-access-review/)). Property condition was added in v0.7 [dev].

## 8. Ideas for our game

Our context: an agent-based market where value funds read earnings (quant-market-ecology); one persistent multiplayer world; AI research and espionage (vision/05); Ink & Brass; the IPO rules in ROADMAP §2.1; the logit business model in 01 §4.1. Each idea says what we borrow, what we fix, and how it plugs in.

1. **Departments as real P&L lines, not abstract percentages.** *Borrow* STONKS's seven-department structure (HQ, Ops, HR, Sales & Marketing, R&D, Finance, IT) and its efficiency meter. *Improve:* each department drives a named term in the economics:
   - Ops: capacity and unit cost.
   - Sales & Marketing: the `b·ln(1+marketing)` attractiveness term.
   - R&D: quality and the product pipeline.
   - HR: candidate pool and attrition.
   - Finance: cost of capital and filing quality.
   - IT: automation and cyber defense.
   - HQ: span of control.

   The efficiency % stays as a derived readout, so a player can always see *why* revenue moved. Owner: Quant, with Forge for screens.
2. **Products you actually design.** STONKS's top complaint is "can't choose what product". You pick a segment (budget, mid or premium), a price within ±30% of reference, and a quality target, plus features unlocked by R&D. Products have generations and age, and compete through our logit market share. **Sector-specific economics** so pharma isn't media:
   - Pharma: long pipelines with trial gates and binary readouts.
   - Media: hit-driven.
   - Industrial: capex-heavy, with commodity inputs.
   - Software: high margin, network effects.
   - Finance: balance-sheet risk.
3. **A rivals and market-share screen** (what STONKS promised but never clearly shipped). For each city and sector: share, rival products, price positioning, and share trend. NPC rivals react with price cuts, launches and poaching. In our single world, other players' companies split the same demand, so competition is through products, not only through shorting.
4. **Quarterly filings with guidance, read by the value pool.** Every company, NPC or player, publishes an income statement, balance sheet and cash-flow statement generated from the same ledger, so numbers never contradict between screens (a STONKS bug). NPC analysts publish consensus estimates. The earnings surprise against consensus is what value funds trade on. **Guidance is a lever** (STONKS's "forecast revenue to impress investors"), but every miss lowers a public **credibility score**, which widens how strongly the value pool reacts to your next miss.
5. **Your own stock is never a guaranteed bet.** Price comes only from the agent pools, so fundamentals anchor it through value funds, while trend and retail can overshoot it. To kill STONKS's dividend pump, a dividend above free cash flow or funded by debt raises a distress flag that value funds sell. NPC activist and short-seller funds (quant-npc-funds) target overvalued or opaque companies. Splits are cosmetic, and agents know it, so there's no +450% split nonsense. Tape adds a "founder pump" bot that has to lose money in expectation.
6. **Key people with knacks, hidden traits and morale, plus poaching in a shared world.** *Borrow* knacks (department fit adds a lot of efficiency), hidden traits revealed over time, and salary and vacation requests. *Improve:* other players can poach your stars with offers. You defend with retention bonuses, vesting and non-competes (contracts from 02). A disloyal employee is an **espionage vector** that can leak product plans, hooking into AI research and Security Ops. Morale cascades exist but are telegraphed early, with a warning on the dashboard.
7. **Governance that is a game, not a chore.** A yearly **board mandate** with 3–4 KPIs that follow from the strategy you declare (growth, margin or dividend), shown with progress bars. In STONKS only 1.6% clear all board tasks, so ours should be achievable and explained, with easy mandates in year one like its v0.9.2 fix. **AGMs where real players who hold your stock vote** on dividends, buybacks, issuance and the CEO, with proxy fights. Replace the speech mini-game with an "investor day" where you pick a narrative and the value pool checks it against your filings.
8. **A full, transparent capital stack.**
   - Seed and angel rounds before IPO: STONKS's "mysterious investor" done honestly, with the dilution shown upfront.
   - Rights issues with **before-and-after ownership % always shown**, which fixes STONKS's dilution confusion.
   - Bank loans with covenants, and corporate bonds rated by an NPC agency that our bond engine can price.
   - IPO under ROADMAP §2.1 (float 15–49%, lockups, blackout windows).
9. **M&A with integration choices.** An acquisition transfers the target's products, plants, staff and brand. You choose to integrate (synergies where products or cities overlap, at an integration cost and with a culture-clash attrition risk), run it as a subsidiary, or strip and sell its units. That fixes "acquisition only adds market cap". Takeovers use tender offers and defenses (01 §7.5).
10. **Projects with visible odds and post-mortems.** STONKS's R&D and investment outcomes feel random. Ours show an outcome band upfront (bear, base and bull with probabilities). Team skill, budget and advisor contacts narrow the band (borrowing STONKS's "up to three contacts improve a project"). Every result gets an explanation card in the trade journal and "Explain this candle", built from the cause vector, so luck exists but is legible.
11. **Your AI lab as an R&D branch.** The company's AI research (vision/05) raises product quality, automates departments and can be licensed to others. It is also the main **espionage target**: stealing a rival's design compresses their quality lead, and the IT department's Security Ops defends it. That makes the AI pillar and the company pillar one economy.
12. **Liquidity as the deliberate push into companies.** STONKS players found the market couldn't absorb their cash, so they founded companies. We do this on purpose:
    - Square-root impact and capacity limits stop whales from scaling trading returns.
    - Company capex, R&D and expansion become the productive sinks for big money, which fits the faucet and sink plan in 01 §8.
    - Diminishing returns (span of control, logit share, antitrust review above a sector share threshold) stop the "trillions by year 3" snowball.
    - Rankings stay on NWI.
13. **An insider legal layer built into being CEO.** As in STONKS, a CEO's trades in their own stock make news, but ours are formal: mandatory filings on the Wire, blackout windows around earnings, pre-announced sales, and surveillance graphs for tipping friends (Tape). To block the resignation pump, CEO departures are announced with a cooling period, and trading in the stock by the departing CEO is frozen for N game days.
14. **A distress and restructuring lifecycle.** Struggling firms can cut costs, sell units, raise rescue capital at a discount, do reverse splits, or restructure where equity is wiped and bondholders take over. Vulture players can buy distressed debt to take control. This replaces STONKS's coin-flip split-or-bankrupt with a story players can trade, and pairs with our Phoenix title.
15. **A guided founding path and no wasted real time.** Founding is a rank unlock (R2 Owner or R3 Operator) and comes with a starter template: two working departments and a first product, because STONKS's empty-company CEO start "would almost always get you fired" until 2026-07. The first 30 game days are guided with mandate cards. Avoid life-sim lockouts that freeze play; negative events cost money or reputation, never minutes of real time. Visually, the company dashboard is an Ink & Brass "annual report" page: serif headline for revenue and profit, mono tables for statements, and brass only on the one primary action (for example "Launch product").

**Exploit list for Tape, all reported in STONKS:**
- The dividend pump.
- The resignation pump.
- Short, dump, then buy out.
- Manipulating any stock where you can trade more than 5% of float a day.
- An illegal-company pump with criminal protection.
- Owning more than 100% through deal stacking.
- Free money from an outside investor.
- A failed AGM that raises the price.
- A split that triggers a rally.
- Riskless rent as the endgame.

Each needs a regression test once our version of the system exists.

## 9. Open questions (not resolved by sources)
- The exact STONKS formulas for department efficiency, project success and the IPO price or lockup were never published. Treat any numbers here as player anecdotes.
- Whether the "rivals view" from the 2024 roadmap and the "real tutorial" from v0.8 shipped. Steam news through 2026-09-04 doesn't confirm either.
- Reddit threads could only be read as search snippets. A browser pass could quote them in full if Ledger wants it.
