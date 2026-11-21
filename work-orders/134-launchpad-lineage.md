# Work order 134: a Launchpad whose every print adds up

Read `AGENTS.md`, `sim/README.md`, `sim/modules/crypto/` (`printTrade`, `postVoice`, `tell`, the lifecycle and the king rule), the `/coins` route and coin commands in `sim/server.ts`, and `src/apps/launchpad/`. Audit text: `D:/tg-work/audits/Port Avalon Market Launchpad and Interface Audit.txt` (L01–L06, U04, F04 in the other audit).

You own `sim/modules/crypto/`, the coin parts of `sim/server.ts` and `src/apps/launchpad/`. Orders 131 and 135 run at the same time; keep both sides on any rebase conflict.

## Why

- **The tape shows the wrong price.**
  - A $100 founder buy got 42,857 tokens at an average of $0.002333, and the tape says "$0.003267", the pool's price after the trade.
  - A Sell Max paid an average of $0.002121, and the tape says $0.001377.
  - The chart shows zero volume beside a trade in the table while paused.
  - The sell button reads "Launching".
  - "Raised $100" counts the founder alone.
- **Extremes are routine.** 4–5 launches a day. 73% of coins reach the 6× mania trigger within three days, and 25% rug.
- **Death explained wrong.** Coins older than 72 hours are delisted even with a trade minutes before, while the reason says "nobody traded it". 39 coins have end times before their launch.
- **Endings don't reconcile.**
  - After a rug, the player's tokens remain at zero and selling says "no coin".
  - Wind-up pays $9.89 to $27.30 with no explanation.
  - A one-token sell fails below cent precision with an "empty pool" message.
- **Posts change nothing.** Silence, a question, a bullish post and a bearish post gave identical trades, prices, exits and ledger. Asked who holds the most, the creator answered with pool cash.
- **Reputation overreaches.** "Three in the wallet" and "I've been in two rugs" are templates with no portfolio behind them. A disclosed wind-down is punished like an abusive dump.
- **King disagrees.** The stored king and the market-cap leader differ in 667 of 3,024 hourly readings, and the hero card and the badge name different coins.
- **Search empty state.** A search with no match says "No coin is live right now" while coins are live.

## Do

1. **Every print is a fill.** Keep amount, units, average fill price, and pool price before and after. The tape shows the average fill, with price impact. Volume counts real fills from the first trade, paused or not. "Raised" is split into founder buy, outside buys, seed and withdrawals. Buttons say what they do.
2. **Calibrated lifecycle.** Fewer, more varied launches. Mania is rare and earned by real demand, and rugs follow creator traits and opportunity at believable rates. Report the distribution over seeds 1, 27 and 118.
3. **True endings.**
   - Each coin stores its terminal minute and reason: inactivity, drawdown, age limit or pool pulled.
   - The page says which, never an end before the launch.
   - Delisting and rugs settle holders through a shown payout waterfall: what the pool held, who got what, and what your tokens are worth now.
   - Dead tokens leave your holdings with a receipt, or say plainly that they cannot be sold.
   - No sub-cent dead ends.
4. **Posts that matter.**
   - A post enters the same information path as `tell`: named readers who hear it, revise their beliefs and may trade, with an auditable record (who heard what, when, from whom, holding what, and what they did).
   - Opinion and marketing are labelled as such.
   - Credible disclosures move belief; empty hype only moves the gullible.
   - Factual questions ("who holds the most?") are answered from the holder table by those who can see it.
5. **Grounded voices.** First-person claims about holdings, entries and rugs come from the speaker's real portfolio and history. A disclosed, orderly wind-down is treated differently from a dump, and repeat abuse is punished more.
6. **One king rule**, computed after the round's trades, the same on the hero card and the badge, with its rule shown.
7. **Search** says "No coins match" with a Clear button. Sort and ranking windows are explained inline.

## Done

Run the game (sim plus `next dev --webpack`, `SIM_PORT` set). Check with Playwright headless Chrome screenshots at 1366x768 (import from `node_modules/playwright`, `channel: 'chrome'`, wait for `load`, never `networkidle`), looking at each one:
- a launch with its first print at the average fill
- a Sell Max with its fill
- a rug of a held coin with its payout waterfall
- an age-limit delisting with the right reason
- a credible post that changes who buys, compared against silence on the same seed
- the king consistent on the card and the badge
- an empty search

Print the lifecycle distribution for three seeds. Then `npx tsc --noEmit` clean for your files, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
