# Work order 102: research in Quay

Read `AGENTS.md`, `docs/DIRECTION.md`, `src/apps/markets/`, `src/apps/diary/`, one or two other apps in `src/apps/`, and the `/view` JSON from `sim/server.ts` (order 104 added signals, consensus, reveals, credit and stake to it).

You own a new app `src/apps/research/`, its registration in the Quay shell, and small additions to `src/apps/bank/` and `src/apps/company/`. Do not touch `sim/`.

## Why

The player now has private signals, an analyst consensus that can be wrong, credit that tightens, and a stake in their employer. None of it is visible in Quay.

## Do

1. **Research app**: pick a listed firm and see on one screen its price, the consensus (number, range, analyst count, how old), the player's signals on it (source, clarity, the legal line in plain words, how old), when earnings are due, and past reveals: what the signals said, what came out, how the price moved, and what the paper blamed. Make inside signals look clearly different and warn before an order on that firm.
2. **Bank app**: choose margin, line or term when borrowing; show the rate, the haircut, when it is due and the city's credit tightness in plain words ("lenders are pulling back").
3. **Company app**: when the player owns a stake, show it, the owner choices as buttons with a one-line consequence each, and "who remembers": the people and groups and what they remember.
4. Use the Ink & Brass Quay look of the other apps. Everything goes through `/view` and `/act`.
5. Check it in the browser with `/start {"id":"employer-week"}`, run with `next dev --webpack`. Kill every dev server and sim you start before you finish.

## Done

`npx tsc --noEmit` clean for your files, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
