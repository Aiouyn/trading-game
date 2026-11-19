# Work order 117: a desk that holds up

Read `AGENTS.md`, `docs/DIRECTION.md`, `src/shell/` (`simSession.ts`, `wm.ts`, `desk.ts`, `layouts.ts`, `launcher.ts`, `feed.ts`), `src/components/shell/` and `src/apps/messages/`. The playtest screenshots are in `D:/tg-work/playtest/shots/` (folders 1 to 4); look at the ones named below.

You own `src/shell/` (except `StartGate.tsx`), `src/components/shell/` and `src/apps/messages/`. Other orders run at the same time on the sim, the Launchpad, the Broker and the life apps; keep both sides on any rebase conflict.

## Why

Four playtesters played the build for two hours. The world underneath is alive, but the desk gets in the way:
- Reloading the page, or opening the game after a closed tab, shows "This game is open in another window" for 20 s up to forever (until Quay restarts), and New game / Continue fail. (`4-social-life/04-after-begin.png`)
- Windows open small, cascaded on top of each other, and clip their content: Launchpad tabs cut off, the net-worth chart cut off, Careers and People lists hidden. (`1-first-hour/12-careers.png`)
- The help and command results are tall toasts of serif text that cannot be closed and run off the screen; `homes` prints raw rows. (`1-first-hour/49-homes-command.png`)
- The letters strip at the top starts flush at the screen edge, is cut off with an ellipsis before you can read the offer, and pushes the desk down. (`1-first-hour/51-x25-final.png`)
- The Messages window is broken: the people list is squashed to 3 of 8 threads, the thread header is doubled over the list, the thread pane stacks under it. You cannot write to a contact first ("A thread opens when they write"). (`4-social-life/63-isel-thread.png`)
- Home, bank, property and the other life apps exist but a new player cannot find them: the quiet desk hides them and the help says to type commands.
- At x25 the clock crawls when the page is idle (headless Chrome showed one game hour in 5 real minutes without mouse moves): the clock must be driven by the server and the screen must follow it whatever the input.

## Do

1. **One game, any tab**: a reload or a new tab takes over the game at once; the old tab, if still open, shows that it was taken over. No lockout, ever, including after the browser was killed.
2. **Windows that fit**: an app opens at a size that shows all its content on a 1600x900 and a 1366x768 screen, without overlapping another open window when there is room (tile or replace), with nothing clipped; a maximise and a sensible restore.
3. **Everything findable, nothing pushed**: the desk stays quiet at arrival, but every life app (home, bank, careers, city life, people, messages, academy, property, portfolio, launchpad, broker, wire) is one click away in the dock or launcher with a plain name. No feature is reachable only by typing a command.
4. **Help and results as readable panels** that close, with formatted money and names, never raw rows or internal ids.
5. **Letters strip**: padded, full text readable before you accept, never moves the desk.
6. **Messages**: a working two-pane layout at every window size, and the player can open a thread with any contact and write first (through the sim's existing message command; add a small route if none exists).
7. **The screen follows the clock** at any speed with no input, through the light tick feed.

## Done

Run the game (sim plus `next dev --webpack`, `SIM_PORT` set) and check each point with Playwright headless Chrome screenshots at 1600x900 and 1366x768 (import from `node_modules/playwright`, `channel: 'chrome'`, wait for `load`, never `networkidle`), looking at each one. `npx tsc --noEmit` clean for your files, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
