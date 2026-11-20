# Work order 123: a first hour that pulls you in

Read `AGENTS.md`, `src/shell/` (`desk.ts`, `layouts.ts`, `wm.ts`, `launcher.ts`, `feed.ts`), `src/components/shell/`, `src/apps/city/`, `src/apps/wire/`, `src/apps/messages/`, and what order 124 just added to the sim (`git log -3 -p -- sim/`). Round-2 playtest screenshots: `D:/tg-work/playtest/shots/1-first-hour/` (01, 08, 09c, 21, 31, 43, 46, 50, 54) and `4-social-life/` (73, 82).

You own `src/shell/`, `src/components/shell/`, `src/apps/city/`, `src/apps/wire/` and `src/apps/messages/`. Keep both sides on any rebase conflict.

## Why

Round 2 scored the first hour 6.5/10: playable, the arrival scene is good, but:
- After "Step into the city" a full-width City window (map plus a raw parcel list of strangers' names) covers the desk; the clock is paused and nothing says so.
- "All apps" is a 120px scroll box showing only the Trade group.
- Help exists only by typing "help" in Ctrl K.
- The Wire's default Papers tab is coin-launch spam; the real Herald and Gazette pieces hide under City; "year 1" in headlines.
- The bell is self-status noise ("Mara Quill is Quiet (attention)"); nothing tells you a job answer came or a contact wrote.
- Toasts ("Paused.", "Time runs at x25.", conversation lines) sit over windows and cover content.
- Proposal cards (Accept / Decline / Later) cover the Messages header and thread; the Messages title shows "who:9093".
- The "Job change" modal returns on every reload and resumes the clock at x1.
- The Broker opens narrow; after closing a neighbour it stays half width with dead space.
- The title screen says Northgrid trades at $190.65 while the desk shows $32.01; top-bar chips "Quay 0 · Broke" and "R0 · Broke" mean nothing to a player.

## Do

1. **Arrival desk**: Broker (wide enough to read the list and chart), Wire and Portfolio, tidy, no City dump. A quiet line on the strip while paused: "Paused. Pick a speed to let the day run." No goals, no tutorial.
2. **All apps** opens as a proper panel showing every group without scrolling at 1366x768; a visible Help button on the strip or dock.
3. **The Wire leads with the papers**: Herald and Gazette stories first; coin launches gathered into one Launchpad line per hour; dates without "year 1".
4. **The bell is for things that happened to you**: answers, messages, invitations, fills, layoffs, rent due. Self-status lines go.
5. **Toasts** stack in a corner away from content and fade; conversation lines stay in their window.
6. **Requests** (invitations, deals) show in their own readable panel, saying what it is, who is there and what it costs; never over another window's text. No internal ids anywhere.
7. **Modals** show once, and never change the clock speed by themselves.
8. **Windows reflow**: closing a window lets its neighbours grow back.
9. **Title and strip**: the title's live line uses the same prices as the desk; strip chips are words a player understands, or go.

## Done

Run the game (sim plus `next dev --webpack`, `SIM_PORT` set) and check each point with Playwright headless Chrome screenshots at 1600x900 and 1366x768 (import from `node_modules/playwright`, `channel: 'chrome'`, wait for `load`, never `networkidle`), looking at each. `npx tsc --noEmit` clean for your files, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
