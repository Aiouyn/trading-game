# V1 hands-on evaluation (2026-10-13)

Five testers played v1 (`a38fbb6`) on a fresh world, at 1440x900 and 390x844, in English and French, with scripted browser
sessions, measured fills and about 300 screenshots. Raw reports: session scratchpad `eval/report-*.md`. Scores are out of 10:
visual / usability / realism (against the real-world equivalent) / interplay with other windows. "All" is the plain mean.

## Scores

| Area | Page or feature | Vis | Use | Real | Inter | All |
|---|---|---|---|---|---|---|
| Trading | Candle chart, OHLC readout, crosshair | 8 | 7 | 6 | 7 | 7.0 |
| Trading | Timeframes and ranges | 7 | 5 | 5 | 6 | 5.8 |
| Trading | Chart gestures (wheel, axis drag, reset) | 7 | 6 | 7 | 7 | 6.8 |
| Trading | Chart style and indicators | 7 | 5 | 7 | 6 | 6.3 |
| Trading | Drawing tools and the position tool | not built | | | | 0 |
| Trading | Chart right-click (buy limit, sell stop, alert) | 7 | 7 | 8 | 7 | 7.3 |
| Trading | Symbol search and watchlist | 8 | 8 | 7 | 7 | 7.5 |
| Trading | Order ticket (all types) | 7 | 7 | 4 | 6 | 6.0 |
| Trading | **Fill quality and quotes** | 6 | 2 | **1** | 4 | **3.3** |
| Trading | Positions, open orders, history | 7 | 8 | 7 | 7 | 7.3 |
| Trading | Phone Broker | 7 | 7 | 6 | 6 | 6.5 |
| Shell | Top status strip | 6 | 5 | 5 | 4 | 5.0 |
| Shell | Auto-tiling and silent collapse | 6 | 3 | 3 | 2 | 3.5 |
| Shell | **Symbol switching, several Brokers** | 6 | 3 | 3 | **2** | **3.5** |
| Shell | Snap, resize, named layouts | 6 | 4 | 5 | 3 | 4.5 |
| Shell | Launcher (Ctrl+K) | 8 | 8 | 7 | 7 | 7.5 |
| Shell | Toasts and the bell | 6 | 4 | 6 | 3 | 4.8 |
| Shell | **Always-visible positions and P&L** | 4 | 3 | 3 | 3 | **3.3** |
| Shell | Phone home, back, recents | 7 | 7 | 7 | 6 | 6.8 |
| Shell | Phone Broker symbol switch | 5 | 2 | 3 | 2 | 3.0 |
| Launchpad | Feeds (New, Trending, Graduated) | 7 | 6 | **4** | 5 | 5.5 |
| Launchpad | Token page | 7 | 7 | 5 | 6 | 6.3 |
| Launchpad | Graduated token page and Broker handoff | 6 | 4 | **2** | 3 | 3.8 |
| Launchpad | Create form and creator console | 7 | 7 | 5 | 6 | 6.3 |
| Apps | Portfolio | 7 | 6 | 4 | 5 | 5.5 |
| Apps | Wire and the day close | 5 | 5 | 6 | 4 | 5.0 |
| Apps | Calendar | 7 | 7 | 7 | 6 | 6.8 |
| Apps | Messages | 6 | 6 | 5 | 5 | 5.5 |
| Apps | Exchange (player stocks, IPOs, funds) | 6 | 6 | 6 | 5 | 5.8 |
| Apps | Bank and credit | 6 | 6 | 7 | 5 | 6.0 |
| Apps | Research Desk | 6 | 5 | 4 | 5 | 5.0 |
| Apps | Learn | 7 | 8 | 7 | 6 | 7.0 |
| Apps | Settings | 7 | 7 | 6 | 6 | 6.5 |
| Apps | First ten minutes | 7 | 4 | 6 | 6 | 5.8 |
| Apps | Businesses | 6 | 6 | 2 | 4 | 4.5 |
| Apps | Boutique, home room, auctions | 7 | 6 | 6 | 5 | 6.0 |
| Apps | Company (founding to filings) | 7 | 6 | 6 | 5 | 6.0 |
| Apps | AI Lab and tournament | 7 | 5 | 6 | 5 | 5.8 |
| Apps | Security and cyber | 7 | 5 | 7 | 5 | 6.0 |
| Apps | Legal and court | 6 | 3 | 6 | 5 | 5.0 |
| Apps | Rivals board | 7 | 6 | 3 | 5 | 5.3 |

## The ten problems that hurt most

1. **Fills are 30 to 90 times the quoted spread, and the ticket hides it.** A $1k market buy of a large cap filled about 70 bps
   above mid while the ticket showed a 2 bp spread; a buy-and-sell round trip cost about 180 bps (large cap), 260 bps
   (crypto), 1,060 bps (small cap). Cause: R-9-1c charged every fill against a tally of everyone's recent flow in the asset.
   The ticket estimate does not use the tally. (Owner: tech. Ruling R-10-1.)
2. **No drawing tools, no order or position tool on the chart, timeframes that are ranges.** 4h never shows, there is no 1W
   or 1M candle, and "1W" is a lookback. (Tech. R-10-5.)
3. **Changing symbol opens a new Broker instead of switching in place**, on desktop and phone. (UX fork.)
4. **Windows overlap or collapse silently; a small Broker tile loses its order ticket.** (UX fork.)
5. **No always-visible count of open positions and their P&L.** (UX fork.)
6. **Launchpad does not look or behave like pump.fun.** Graduated tokens keep a frozen price, holder counts ignore NPC
   buyers, no USD market-cap-first cards, no live trades bar, no comments, no candle chart, an unfilled "{hours}" template.
   (Tech. R-10-6.)
7. **Return percentages use the wrong base** (Portfolio "-36.62% since arrival" on a $5M book; the day close "-30.93%" for a
   -0.03% day). (Tech. R-10-7.)
8. **Price precision:** FX shows 2 decimals, memecoins 6, so the shown price is off by up to 20%. (Tech. R-10-3.)
9. **Fees above retail reality** (stocks 10 bps min $1, crypto 20 bps) and **whole shares only**, which makes the 10% chip size
   to 0 shares on a first trade. (Tech. R-10-2, R-10-4.)
10. **Toasts cover the data they talk about** (positions, the close brief, the ticket); new windows open at 400 x 395.
    (UX fork.)

Other confirmed defects (tech): the Legal fee row double-counts counsel and shows negative cash after; a company's first sale
books about 10 days of receivables as a "sales" outflow; French copy leaks English rank and licence names and decimal
points; rivals do not scale with the player's rank; auction lots are priced far above the bidder's band; the Research Desk asks
$55k before any output; the same CEO quote appears for two firms.

## What is already good
The chart's look and gestures, the watchlist and search, the positions dock, the chart's right-click order menu, the launcher,
Learn, the calendar concept, the company decision screens and IPO rules, the auctions' soft close, the insurance copy, the
tournament's commit-reveal seeds, three-part refusals everywhere, and no horizontal overflow on phone.
