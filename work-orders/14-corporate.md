# Work order 14: firms are born, merge, list and die

You own `sim/modules/corporate/`. Add one `w.use(corporate)` line in `sim/run.ts`, after `banking`. This order is the one exception to "touch only your directory": the world has exactly 63 firms forever, and many modules size arrays by firm count. You may add `addFirm` and `closeFirm` to `sim/modules/economy/index.ts`, and in every other module you may change only the code that sizes or loops per-firm arrays so they grow on demand and skip closed firms. Keep those edits minimal and list every file you touched in your reply. Read `AGENTS.md` and `sim/README.md` first.

## Why

Wall Street Raider is a game about companies: founding them, taking them public, buying them, breaking them up, watching them fail. Port Avalon has a fixed set of firms that never change hands as wholes. The corporate life cycle is the heart of the game the player will play.

## Build

1. **Founding.** Entrepreneurs are people: a skilled, risk-tolerant person with savings (or a bank loan) in a sector where prices run well above cost founds a new firm. It hires from the unemployed, buys machinery, starts small and private (owned by the founder). Content for names in a raw file `sim/content/names.txt` (prefixes, suffixes per sector), parsed with `sim/kernel/content.ts`.
2. **Going public (IPO).** A private firm that grows past a size threshold can list: an investment bank (one of the banks) prices the offer from comparable listed firms, the founder sells part of their stake, new shares are issued through the ledger, and the stock trades on the markets order book from the next day.
3. **Takeovers and mergers.** A firm, a fund or a rich person can bid for a listed firm: a tender offer at a premium. Shareholders (each a ledger holder) accept or not by their own valuation; the board (the chief executive and the largest holders) can resist. Paid in cash (possibly borrowed) or shares. After a merger the target's staff, stock and customers move to the buyer; duplicated staff are laid off. Hostile raids, white knights and greenmail emerge from these rules, not scripts.
4. **Failure.** A firm that cannot pay its debts goes into bankruptcy: creditors are paid in order from what its assets sell for, shareholders usually get nothing, staff are laid off, and the firm closes (its ledger accounts wound down to zero). Today firms just default and keep going.
5. **Every step is an event with causes**, and the chronicle (history module) records foundings, listings, takeovers and failures.
6. **Stats line**: firms alive, founded, listed, taken over, failed this year.

## Done

`node sim/run.ts --years 30 --seed 1` finishes with books balanced every day; over 30 years at 20,000 people a dozen or more firms are founded, a few list, a few are taken over, a few fail, and the economy's unemployment and inflation are no worse than before. Save and reload still match (`node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w` prints "matches the continuous run"). Commit to `v1-build` after `git pull --rebase`, push, and reply with one takeover's `--explain` chain, the stats for years 10, 20, 30, the files you touched, and your cost. Then stop.
