# Work order 100: how you pay for it matters

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`, `sim/modules/banking/`, `sim/modules/markets/`, the margin and bankruptcy code (work order 51), and `sim/bots/bots-report.md`.

You own `sim/modules/banking/`, `sim/modules/markets/` and the player's borrowing in `sim/modules/player/`. Other agents are editing `signals/` (new), `earnings/`, `port/`, `corporate/`, `labour/`, `circle/`, `social/` and `history/`: do not change those.

## Why

Two players buy the same company. One financed it with short-term debt and is forced to sell in a credit crunch; the other kept cash, survived, and bought more at the bottom. The difference between them should be the player's own financial judgement, and it should be visible.

## Do

1. **Ways to pay**: cash, a margin loan, a short-term credit line, a term loan secured on the shares or a home. Each has its own rate, term, haircut and the conditions under which the lender can pull it or reprice it.
2. **Credit cycles**: lenders tighten when defaults and losses rise and when the policy rate climbs: haircuts go up, lines get cut or not rolled over, and spreads widen. Then they loosen again later. A crunch hits borrowers who rely on rolling short debt.
3. **Forced sales move prices**: when many leveraged holders sell at once (bots, households, the player), prices fall further than the news alone would justify, and patient cash buyers earn the rebound.
4. **The index**: the bot report (work order 97) shows a broad index total return of about 4.5% a year against a 6–9% target, and an index that differs by the player's strategy in the same world. Find the cause in `markets/` and fix it if it lies there.
5. Keep the books balanced and the run deterministic.

## Done

Paste a worked example from two bot or scripted players who buy the same stock on the same day, one with short-term debt and one with cash, through a credit crunch, with each one's path and final worth. Paste the index fix with before and after returns over six worlds. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
