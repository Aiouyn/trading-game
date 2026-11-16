# Work order 58: the player's money moves only when the player acts

From the three agent playtests in `sim/playtest/agent-*.md` (read all three first, with `AGENTS.md` and `sim/README.md`). You own the command handlers and the player's state in `sim/modules/player/index.ts`, `life.ts` and `scenarios.ts`. Another agent is adding `story.ts` and `tutorial.ts` and hooks in `view()` at the same time: pull often and keep both sides. Do not change other modules, except a call into banking, corporate or markets where a player command needs one that exists for NPCs.

## Fix these, each at its cause

1. **`wait` and `holiday` never act for the player.** In the playtests, the first month spent $2,000,000 on two homes and a bond book, married the player, and dropped filled futures. The player's person must be excluded from every NPC decision that spends their money, buys property, invests, marries or closes their positions; life events that happen to anyone (illness, a contact's news) still happen. `holiday` must advance the date.
2. **The chronicle and story record what happened, not what was attempted.** A refused bid and a failed `sell` were written as events. Write only on success; a refusal returns the reason and records nothing.
3. **Control means control.** Holding more than half the shares, or being chair, lets the player use every `ceo` command on that firm, and `board chief <person>` accepts any person, not only a contact. A repeated bid for a firm the player already controls is refused with one line.
4. **Founding a firm**: say what changed (job left, cash moved), and count the player's stake in their own firm in net worth and in the scenario goal at its book value.
5. **Margin and short selling.** `borrow` opens a margin account (so `short` works afterwards), states the limit and the rate, and `sheet` shows the loan.
6. **`sheet`, `desk` and `quote <firm>`** exist: `sheet` the balance sheet; `desk` a board of all listed stocks with last, change, volume, P/E and the player's position; `quote <firm>` price, bid, ask, last 20 closes, profit, staff, top holders and the last 3 news lines about it.
7. **The six stats carry their dollars**: each word shows the number behind it on the same line ("Thin ($1,925 cash, 3 weeks of costs)").

## Done

Re-run the three playtest situations by script: the first-paycheck start with `wait 1m` ×3 leaves the player's cash only changed by wage, tax and spending; a hostile-takeover start shows Silicrest on `desk` with a real price; `borrow 500` then `short` works. `node sim/run.ts --years 10` still prints "Books balanced every day"; save and reload still match. Commit after `git pull --rebase`, push to v1-build, reply with the three script outputs and your cost. Then stop.
