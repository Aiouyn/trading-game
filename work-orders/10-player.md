# Work order 10: the player

You own `sim/modules/player/` and a new script `sim/play.ts`. Add one `w.use(player)` line in `sim/run.ts`, after `crypto` and before `history`. Read the other modules' state; change them only through the functions they already export (`submitOrder`, `cancelOrder` in markets, and the equivalents in banking, bonds, commodities and crypto). If you need a function that does not exist, add the smallest exported one to that module and say so in your reply. Read `AGENTS.md` and `sim/README.md` first.

## Why

There are hundreds of thousands of people in the world and none of them is the player. The game starts when one of them is you: a person in the same arrays, with the same ledger account, contacts and stress, who can only act through the same markets as everyone else. Nothing the player does may bypass the ledger or the order books.

## Build

1. **The player is a person.** At world creation (or when a saved world is loaded with `--player`), add one adult to the `People` arrays and mark them (a flag bit). They get a bank deposit, 16 social contacts like anyone else (a few family, a few coworkers at a chosen firm), and the psyche stats. `playerIndex(w)` returns them. If they die, the game is over; if they inherit, they inherit.
2. **Actions, all through existing APIs.** An exported `act(w, command)` function that takes a typed command and returns a typed result (accepted, rejected and why, order id, fill):
   - shares: limit and market orders, cancel; short selling only with a margin account at a bank;
   - bonds: buy and sell government bonds;
   - commodity futures: open and close positions, with margin calls applied to the player like any trader;
   - crypto: buy, sell, launch a memecoin (same rules as NPC creators);
   - banking: deposit, withdraw, borrow against shares (a margin loan) at the bank's quoted rate, repay;
   - people: talk to a contact (one conversation, same effect as NPC talk), ask a contact what they know about a firm (they share facts they know, filtered by trust).
3. **What the player sees: only what they know.** `view(w)` returns the player's screen data as plain JSON: their balance sheet (from `ledger.netWorth` and balances), open orders and positions, prices they can see (all public quotes), the news (published facts), and private facts they have learned through contacts, with who told them and when. Never show a private fact the player does not know (`knows()` in social). Each item carries its event id so `explain` works on it.
4. **Time.** `play.ts` is a terminal game loop: show a compact summary (date, net worth, top news, positions), read a command (`buy FRM_X 100 @ 52.10`, `sell`, `short`, `fut long OIL 6 2`, `borrow 50000`, `talk 3`, `ask 3 frm_x`, `news`, `why <event id>`, `wait 1d|1w|1m`), run it, advance time. Starting from a saved world: `node sim/play.ts --load worlds/7`.
5. **Score.** Net worth over time, kept in the player state, and a yearly line in the chronicle for the player like any notable figure.

## Done

`node sim/play.ts --load worlds/7` runs; a scripted session (`node sim/play.ts --load worlds/7 --script sim/modules/player/demo.txt`) buys shares, borrows, opens a futures position, talks to two contacts, learns one private fact, waits a year, and prints the final balance sheet with books balanced every day. Save and reload with the player still give the same hash. Commit to `v1-build`, push, and reply with the demo transcript and your cost. Then stop.
