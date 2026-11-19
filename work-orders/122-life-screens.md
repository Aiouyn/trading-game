# Work order 122: the screens of a life

Read `AGENTS.md`, `docs/DIRECTION.md`, `src/shell/StartGate.tsx`, `src/apps/city-life/`, `careers/`, `people/`, `property/`, `estate/`, `academy/`, `profile/`, and what order 121 just added to the sim (`git log -3 -p -- sim/`). Order 117 has just fixed the window manager and Messages. Playtest screenshots: `D:/tg-work/playtest/shots/1-first-hour/` (02, 12, 17, 40, 41, 44, 49) and `4-social-life/` (16, 33, 45, 48).

You own `src/shell/StartGate.tsx`, `src/apps/city-life/`, `careers/`, `people/`, `property/`, `estate/`, `academy/` and `profile/`. Keep both sides on any rebase conflict.

## Why

The playtesters found a real social city underneath, but the screens make it feel like a menu of buttons: character creation is two fields; Careers has no apply button and contradicts itself; homes exist only as a typed command; bar patrons are identical lines with Talk buttons; the People app labels everyone "Colleague".

## Do

1. **Character creation** that feels like making your own life: name, age, a past and where you come from (order 121's choices), with a line on what each means; no goal, no scenario.
2. **Careers**: open seats from the sim's one truth, an apply button, the status of your applications, your job and wage once hired.
3. **Home**: see where you live, what it costs and when rent is due, browse homes to rent or buy with formatted prices and districts, move.
4. **City life**: choose a venue (who goes there, the price), then an evening that feels like a place: the people you can see described by the sim, a conversation of several exchanges, buy a round, listen, leave when you choose; the clock waits while you are there (order 121).
5. **People**: real relationship labels, bonds that move and say why, the people your contacts know, message first.
6. **Academy and profile**: courses with prices and time, what you know and can do.
7. Formatted money, names and game dates everywhere; no internal ids.

## Done

Run the game (sim plus `next dev --webpack`, `SIM_PORT` set) and play a new life with Playwright headless Chrome screenshots at 1600x900 (import from `node_modules/playwright`, `channel: 'chrome'`, wait for `load`, never `networkidle`), looking at each: creation, the first morning, a night out with two people met, an application and hire, renting a cheaper home, a course. `npx tsc --noEmit` clean for your files, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
