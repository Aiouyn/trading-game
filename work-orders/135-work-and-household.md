# Work order 135: jobs and a household that add up

Read `AGENTS.md`, `sim/README.md`, `sim/modules/careers/` (`jobs.ts` around 309–324, `resolveApp`), `sim/modules/labour/`, the household and runway code in `sim/modules/player/` and `sim/server.ts`, `sim/modules/property/`, `src/apps/careers/`, `src/apps/profile/` and `src/apps/property/`. Audit text: `D:/tg-work/audits/Port Avalon Playtest and Simulation Audit.txt` (W01–W03, I04).

You own `sim/modules/careers/`, `labour/`, the household budget in `sim/modules/player/`, and the screens `src/apps/careers/`, `src/apps/profile/` and `src/apps/property/`. Orders 131 and 134 run at the same time; keep both sides on any rebase conflict.

## Why

- **Vacancies are counted per firm, not per role.** Aegis advertised 3 seats against both Bookkeeper and Underwriter, because one firm-level staffing gap is reused across every role row.
- **The decision clock lies.**
  - An application promised "Thursday 18 January" was still pending on Thursday afternoon.
  - The offer appeared on Friday, dated Thursday.
  - After accepting, the screen still showed Accept and Decline.
  - The offer links to "genesis" instead of the application.
- **Layoff and rehire contradict each other.** A week after starting, the player was laid off for below-plan sales and "newest hires first". The same notice then recommended the same $781 Aegis opening, with no demand change to explain it.
- **Runway makes no sense.**
  - At arrival: 8.4 weeks on $5,000, implying $595 a week, with rent at $42.21 a month.
  - After the layoff: 150.3 weeks on $4,621.90, implying $31 a week.
  - There is no visible budget, and no gross against take-home pay.
- **Dates disagree.** The strip says "Central bank decides in 17 days" on 15 January, while the Diary says 30 January.

## Do

1. **Role-level vacancies.** Each firm opens and closes seats per role, from that role's own demand. Careers shows seats per role, never a firm total repeated.
2. **An honest decision clock.**
   - Applications state their real decision time and resolve at it.
   - Offers carry the right date and a deadline.
   - Accepting or declining moves the screen to Accepted or Declined at once.
   - The offer links to the application, the decision-maker and the vacancy.
3. **Layoffs that cohere.**
   - A layoff names the demand change behind it.
   - The firm does not re-advertise that role until a recorded change justifies it, and then says so.
   - Careers says whether you can return.
   - Waits stop or report on consequential events.
4. **A household budget.**
   - Rent, food, transport, utilities, debt service, tax and benefit end dates, each from the ledger.
   - Gross against take-home pay.
   - Runway = cash ÷ real weekly outgoings, with that sum shown in its Why?.
   - Leases compare deposit, utilities, commute, quality and hazard.
5. **One date for each event** across the strip, Diary, calendar and paper.

## Done

On a fresh start, through the commands:
- apply to two roles at one firm, and show separate seat counts
- see the decision arrive on its stated day
- accept, and show the Accepted state
- go through a layoff, with its reason, and no contradictory re-advert
- show the budget and runway before and after, both adding up

Check Careers, Profile and Property with Playwright headless Chrome screenshots at 1600x900 (import from `node_modules/playwright`, `channel: 'chrome'`, wait for `load`, never `networkidle`). Then `npx tsc --noEmit` clean for your files, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
