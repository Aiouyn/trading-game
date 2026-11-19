# Work order 115: where the launches went

Read `AGENTS.md`, `docs/DIRECTION.md`, `src/apps/launchpad/`, `src/shell/desk.ts` (order 109's quiet desk), `sim/modules/crypto/` (memecoins: launches, pools, manias, rugs), the `launch` and `coin` commands in `sim/server.ts`, and the first version's launch board on branches `origin/ui/lp-firstver-board` (commit 7b28df3c) and `p10/lp` (commits f797be03 and 38db4308: board, token page, replies, holders, real candles, bump feed).

You own `src/apps/launchpad/` and `src/shell/desk.ts`. You may add small read routes or fields for memecoins in `sim/server.ts` and `sim/modules/crypto/`. Order 113 changes the clock and `sim/server.ts` at the same time; keep both sides on any rebase conflict.

## Why, in the owner's words

"I don't find the launches. I don't know where the launches went."

## Do

1. **Launchpad on the desk from the first minute**, beside the trading terminal, for a new arrival too.
2. **The first version's launch board**: port its board and token page from those branches (new launches as they happen, bumps, king of the hill, a token page with candles, replies and holders, buy and sell), fed by the sim's real memecoins.
3. **Launch your own coin** from the Launchpad (name, ticker, a starting buy), through the sim's `launch` command, and watch the crowd react.
4. New launches can be noticed from anywhere: a quiet line in the wire, and a count on the Launchpad icon.
5. Through `/view`, `/act` and `/history` only.

## Done

Check in Quay on an `arrival` start: the Launchpad is on the desk, shows real launches, a coin can be bought and sold, and your own coin can be launched. `npx tsc --noEmit` clean for your files, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
