# Work order 130: the screens for a life

Read `AGENTS.md`, what order 129 just added to the sim (`git log -3 -p -- sim/`, and the new `/view` fields and commands it names), `src/apps/people/`, `src/apps/messages/`, `src/apps/careers/`, `src/apps/academy/`, `src/apps/society/`, `src/apps/estate/`, `src/apps/property/`, `src/apps/city-life/`, `src/apps/launchpad/` (posting and the dev record only) and `src/shell/launcher.ts`. Playtest reports (build 8827b945): `C:/Users/Mathis/PortAvalon-playtest-8827b945/{Lina,Sofia,Kenji}/report-full.md`, screenshots beside them.

You own those `src/apps/` directories and `src/shell/launcher.ts`. Keep both sides on any rebase conflict.

## Why

The life sim is deep but hard to reach. The playtests found:
- **The flat hunt is hidden.**
  - Home & property is missing from the dock; Lina found it only by typing "home" in search.
  - The home card's "More homes" does nothing.
  - Renting is one click, with no confirm, no viewing and no moving cost, and "3 available" stays 3 afterwards.
  - Every listing says "Sound · Mid-size".
- **Careers.**
  - No search; finding Ledgerly took six screens.
  - The list reshuffles daily.
  - "Long in the trade 6 years" and "Ask for a raise" on day one.
  - The arrival card "holds no job" stays after the hire.
- **People.**
  - Clicks in the small window pick the wrong person.
  - "Introduce yourself" is offered after talking.
  - The "Out" list describes strangers differently from their cards.
- **Messages.**
  - The list doesn't scroll in a small window.
  - A sent message didn't appear in its thread.
  - "You write to Coren" banner on another person's thread.
  - An empty "THE EVENT" chip.
  - A deal card with no explanation of what you get.
- **Society.**
  - The calendar has 6 columns, and clicking a day does nothing.
  - The strip's "Dinner at the dining room" chip opens an empty day.
- **Invitations.** A $1,000 gala goes out with one click and no price shown.
- **Ctrl+K.** "chief executive" gives "Did you mean child?". The box is sometimes unfocused.
- **Launchpad.** No dev record, and no notice when a coin you hold is rugged.

## Do

1. **Home in the dock.**
   - The home card opens Home & property.
   - Listings differ: size, condition, district, light, noise.
   - A viewing, then a confirm showing rent, deposit and moving cost, then the move with its ledger lines.
2. **Careers you can search** by firm, role and pay. The order is stable, and "with a reference" sorts first. A greyed seat says what unlocks it and links there. Offers to accept or decline (from order 129) appear here and in the bell. Your job card shows your real tenure, colleagues and shifts.
3. **People and Messages.**
   - Each person's page shows their one role, your history together and what you can do now.
   - Clicks always hit the right row.
   - Labels follow the real state.
   - Threads scroll, show every message you sent, and carry only that person's banners.
   - Event and deal chips say what they are and what you get.
4. **Invitations you host.** The Invite flow shows the place, the time, the guests and the price, then a confirm before booking. Booked events show in the Society calendar, the strip and the requests panel, and open as scenes.
5. **Society.** A seven-column calendar. Each event shows its place, time, guests and whether you're in. Standing with its Why? and the next step (from order 129).
6. **Search finds people by role and name** ("chief executive", "governor", a firm), and the box always takes focus.
7. **Launchpad.** Your dev record and following on your profile and coin pages. Notices for rugs, delistings and big moves of coins you hold.

## Done

Run the game (sim plus `next dev --webpack`, `SIM_PORT` set) on a fresh start at x25. Check with Playwright headless Chrome screenshots at 1600x900 and 1366x768 (import from `node_modules/playwright`, `channel: 'chrome'`, wait for `load`, never `networkidle`), looking at each one:
- finding and renting a flat from the dock
- a Careers search
- a referral seat with its unlock link
- a job offer accepted
- a person's page
- a scrolled thread
- hosting a dinner with its price and confirm
- the Society calendar with an event you're in
- Ctrl+K "chief executive"
- a rug notice

Then `npx tsc --noEmit` clean for your files, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
