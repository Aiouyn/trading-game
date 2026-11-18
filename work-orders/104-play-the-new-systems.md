# Work order 104: let the player use what 99–101 built

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`, `sim/modules/signals/`, `sim/modules/banking/`, `sim/modules/corporate/owner.ts`, `sim/modules/corporate/story101.ts` and `sim/modules/player/`.

You own `sim/modules/player/`, `sim/server.ts` and `sim/play.ts`. You may make small fixes in `sim/modules/corporate/owner.ts` and `sim/modules/signals/` when a command needs them. Do not touch `src/`.

## Why

Orders 99–101 built an information edge, ways to pay and owning your employer, but the player can reach almost none of it: owner choices are functions only, and the CLI and server accept only the old `borrow`.

## Do

1. **Borrowing**: `borrow <amount> margin|line|term` (and `repay`) in `sim/play.ts`, the server's `/act` (`{"kind":"cash","op":"borrow","amount":…,"product":"line"}`) and `help`. Refusals say why in one line (credit too tight, not enough collateral).
2. **Owner commands**: `stake <firm> <amount> [cash|margin|partners|buyout]`, then, once the player chairs the firm, `cut <n>`, `protect`, `promote <person>`, `sell-division`, `refinance <amount>`, `payout <amount>`, `union deal|refuse`. Each goes through `act()`, is in the command log, and its refusal says why.
3. **Make it reachable without a gift**: a player who works at a small listed firm should be able to reach control with savings plus partners or a buyout within a few years of careful play. Tune the buy-in, not the economy. Remove the need for a scripted $5.2M legacy.
4. **`/view`**: add the player's signals (text, kind, clarity, legal line, firm, age), the consensus per listed firm, past reveals involving the player's signals, credit tightness and the player's loans by product, and, when the player owns a stake, the stake, the choices made and who remembers them.
5. **A scenario `employer-week`** in `sim/modules/player/scenarios.ts`: about 30 minutes of play. The player works at a small listed firm with earnings due in a few weeks, has some savings, a friend in finance and a credit line on offer, and the firm faces a hard choice (a division sale or layoffs) that a stake would let them decide. Start with `/start {"id":"employer-week"}`.
6. Keep the books balanced and the run deterministic.

## Done

Paste a short `sim/play.ts` session of `employer-week` that borrows on a line, reads a signal, buys a stake and makes one owner choice, plus one `/view` JSON excerpt with signals and the stake. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
