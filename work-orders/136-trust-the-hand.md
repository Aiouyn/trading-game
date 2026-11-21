# Work order 136: a city you can trust with your hand

Read `AGENTS.md`, `sim/README.md`, and the two playtest reports of build cb828c8: `D:/tg-work/grok-play/1/report.md` (Lina, newcomer) and `D:/tg-work/grok-play/2/report.md` (Marco, trader). Their screenshots are beside them in `shots/`. Orders 131 (market facts) and 135 (jobs and household) landed after that build; skip what they already fixed.

You own the clock and pause in `sim/server.ts` and the Quay shell, `sim/modules/venues/`, `sim/modules/academy/` (find it), the letters and talk code in `sim/modules/circle/` and `sim/modules/media/` (the paper's date only), and the screens that show them. Leave market valuation to 131's code, and leave careers to 135.

## Why

- **Money leaves without consent.**
  - One missed click enrolled Lina in Energy for $341.16, with no confirm, no undo and no drop.
  - Sell on a position row dumps the shares and cancels the bracket. Buy asks for confirmation; Sell does not.
  - Cellar 41's door said $4.88 and charged $54.88.
- **Pause doesn't stop the clock.**
  - Venues say "The clock waits while you're here", yet each topic moves the clock about twelve minutes, even with Pause lit.
  - At x10, a pause clicked at 09:57 landed at 12:07, and a whole session went by unseen.
- **Stops fill through the open.** A 9.85 stop filled at 9.07 when the open was 9.12 on 4 shares. For ten minutes the position row, working orders, cash, the bell and the chart each showed a different position.
- **The paper is a week behind.**
  - The wire sat on Friday 12 January from Monday night to Thursday.
  - People quote a Coppercliff −6% that isn't on the tape.
  - The City Mercury opens as a blank black window.
  - Listen calls a 10% gap "Nothing worth trading on".
- **Letters are mechanical.**
  - Letters sometimes send twice.
  - Replies ignore what you wrote.
  - "You arrives, aged 24" system cards appear inside threads.
  - The dock badge reads 9+ with only one thread.
  - A rejection comes from a stranger labelled Colleague.
  - Home lines differ only in the district.
  - Yana says she hasn't met you, while her card records your earlier talk.
- **There is no night.** Health and stress never move. Nobody sleeps, "sleep" is not a command, and your lease is missing from Your properties.
- **Finding your way.**
  - Help's buttons don't respond to clicks.
  - The dock icons have no names.
  - The relationship label "Close" is confused with the panel's Close button.
  - Topic buttons scroll off the bottom of the card.
  - Courses you never took show as Finished.
  - "Spend the evening" appears at noon.
  - Why? links are specks too small to click.
  - The bank opens on a margin loan with $1,000 prefilled.

## Do

1. **Consent for every outflow.** Anything that spends cash, sells, cancels a bracket or enrols shows one confirmation with the exact amount. Charge the price shown, or refuse and show the new price. Courses can be dropped, with a refund rule stated up front. The bank opens on deposit and savings; borrowing is a deliberate second step with a warning.
2. **Pause means paused.** At every speed, the clock stops within one tick of Pause. Talk, Listen and venue actions cost game time only while the clock runs, and the cost is shown on the button. At x5 and above, the game pauses itself at 09:30 and when a decision you are waiting on comes due.
3. **Stops that keep their word.** A stop fills at the stop price. If the market gaps through it, it fills at the opening print. The row, working orders, cash, the bell and the chart update from the same fill in the same minute.
4. **Same-day paper.** Each morning's paper covers the previous session, including any move of 5% or more. People quote either the paper or a stated source of their own. Every paper opens as a readable page. Listen picks the line a trader would write down.
5. **Letters that listen.**
   - Each letter is sent once.
   - Replies answer what you wrote: your question, your news, your refusal.
   - System cards stay out of threads.
   - The badge counts unread letters.
   - Senders are people you know, or are introduced.
   - Per-person home lines are generated from that person's life.
   - A person's memory matches their card.
6. **A night and a body.**
   - Your home has a bed. "sleep" runs until morning.
   - Sleep, work, losses and evenings out move health and stress, and each change has a Why?.
   - Your lease appears under Your properties and on the map.
7. **Wayfinding.**
   - Help's buttons work.
   - Dock icons have labels.
   - The relationship tier is no longer called "Close".
   - Card actions stay pinned.
   - Courses show Finished only once completed.
   - Headings follow the hour.
   - Why? links are at least 24 px targets.

8. **Leftovers from orders 132 and 134.**
   - Order records for Treasury and market-at-open orders stay "queued" after they fill. Close them in the sim (`sim/modules/markets/` and the order-lifecycle code in `sim/server.ts`).
   - `accountSnapshot` counts the starting endowment as an inflow, so on day 0 "Investment return" shows a large negative.
   - The dev-dump modal after a Sell Max of your own coin covers the page; make it a dismissible notice.
   - Treasury orders cannot be cancelled while queued; allow it.

## Done

On a fresh start, through the commands:
- refuse an unconfirmed enrolment, enrol and then drop with a refund
- pause at x10 at 09:29 and show the clock still at 09:29 one real minute later
- a stop gapped through, filled at the open, with the row, working orders, cash, bell and chart agreeing
- the next morning's paper carrying a ≥5% move
- two letters to one person answered to their content
- a night slept, with health and stress moving and a Why?

Check the venue, Academy, Help and letters screens with Playwright headless Chrome screenshots at 1600x900 (import from `node_modules/playwright`, `channel: 'chrome'`, wait for `load`, never `networkidle`). Then `npx tsc --noEmit` clean for your files, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
