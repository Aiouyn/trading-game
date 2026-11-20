# Work order 127: a clock, a calendar and books a player trusts

Read `AGENTS.md`, `sim/README.md`, `sim/kernel/world.ts`, the clock and `/view` money fields in `sim/server.ts`, `sim/modules/player/` (cash, net worth, runway), `sim/modules/history/prose.ts`, `src/shell/simSession.ts`, `src/components/shell/StatusStrip.tsx` and `src/apps/portfolio/`. Playtest reports (build 8827b945, before orders 123–126): `C:/Users/Mathis/PortAvalon-playtest-8827b945/{Lina,Marco,Kenji,Sofia}/report-full.md`; screenshots sit beside them.

You own `sim/kernel/` (date display only, never the 360-day cycle the sim runs on), the clock and money parts of `sim/server.ts`, the money parts of `sim/modules/player/`, `sim/modules/history/`, `src/shell/simSession.ts`, `src/components/shell/` and `src/apps/portfolio/`. Orders 128 to 130 run at the same time; keep both sides on any rebase conflict.

## Why

All four players scored polish 4/10, and the same complaints recur:
- **Calendar.** "Rent due Thursday 30 February". 31 January is skipped. A February with 30 days. The same date reads Thursday in one place and Friday in another.
- **Pause.** At x25, Pause stops 1 to 3 game hours late. The clock freezes for 90 seconds, then jumps hours. Bars say "the clock waits" while the clock runs. Leaving a bar leaves the world paused. Visit summaries add 10 minutes.
- **Money that vanishes.**
  - $324 was gone on rent day with no ledger line and no notice.
  - Net worth fell $477 overnight while both shorts were in profit.
  - The top bar showed $3,072 against $1,949 of real cash and dead coins.
  - The Why? panel and the headline disagree on the same screen.
  - Runway jumps from 7 to 49 weeks.
  - The same wallet is called "Flush", "Thin" and "Broke" on one screen.
- **Silence.** Wages arrive with no payslip, and "Today" stays $0.00 on payday.
- **Internals on screen.** "bank_1..bank_4" on the loading screen. A Why? chain ending in "world created from seed '1'". Notices that read only "Held off the page.". "each line is the cause of the one above" is written backwards.

## Do

1. **One calendar.** A single formatter in the sim, mirrored in `src`, turns a sim day into a real calendar date with the right weekday: no 30 February, no skipped days, the same weekday everywhere. Every date in sim text, letters, papers, notices, calendars and the UI goes through it. Monthly cycles may fall on any calendar date; say so nowhere, just show real dates.
2. **An exact clock.**
   - Pause stops at the minute shown when it was clicked, at every speed.
   - The displayed clock never freezes and never jumps.
   - Scenes and venues that hold the clock really hold it, and leaving one gives back the speed you had.
   - Visit durations are correct.
3. **One net worth.** Cash plus what every holding would bring if sold now, which means dead or delisted coins count as $0. It is computed in one place, and the strip, the Portfolio, every Why? and the Launchpad all show that same number, live.
4. **Every dollar has a line.** Each cash change is a ledger line the player can see: rent, everyday spending, borrow fees, wages, benefits, tuition, bar tabs, deals. The Portfolio gets a daily statement (yesterday, today) that adds up. Rent day and payday each raise a notice, with a payslip showing gross, deductions and net. "Today" counts wages.
5. **One money label.** One function decides the wallet's word (with thresholds a player would agree with: $5,000 is not "Broke"), and every screen uses it. Runway is cash divided by the real weekly outgoings, explained in its Why?.
6. **No internals.** Remove bank_N, seeds, "Held off the page." notices, "who:", "slot", and backwards Why? captions from everything a player sees.

## Done

Run the game (sim plus `next dev --webpack`, `SIM_PORT` set) from a fresh start through a rent day, a payday and a month end at x25. Check with Playwright headless Chrome screenshots at 1600x900 (import from `node_modules/playwright`, `channel: 'chrome'`, wait for `load`, never `networkidle`), looking at each one:
- 31 January and 1 March shown correctly
- a Pause at x25 that stops on the clicked minute
- the rent notice and the payslip
- a daily statement that adds up
- the strip, Portfolio and Why? showing one net worth with a dead coin at $0

Then `npx tsc --noEmit` clean for your files, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
