# Work order 106: fix what the five players hit (Quay)

Read `AGENTS.md`, `docs/DIRECTION.md`, `src/apps/research/`, `src/apps/markets/`, `src/apps/bank/`, `src/apps/company/` and `src/shell/`.

You own `src/`. Another agent is editing `sim/` at the same time; do not touch it. It is changing `/view` to send `qty` beside `shares` in top holders, a per-product haircut, and the market value beside the sale value of a stake; read both old and new field names so Quay works before and after.

## Do

1. **Research is unreachable**: it sits behind the `v1.terminal` shroud flag and an R3 rank gate (~$5M). Open it from the start of play; it is the core of the information edge.
2. **Markets stock page shows "Couldn't load"** for any firm with holders (`App.tsx` reads `qty`, the server sends `shares`).
3. **Insider warning on the Markets order ticket** too, not only on Research's Trade button, whenever the player holds an inside signal on that firm.
4. **Signals, consensus, credit and stake refresh on each day tick**, not only on pause or act.
5. **Haircut**: use the server's per-product haircut when present, else the client fallback.
6. **Stake value**: when present, show market value and what a sale would fetch side by side, with a one-line reason.
7. Check in the browser with `/start {"id":"employer-week"}`: open Research, Markets for Salar Lithium, borrow a line, buy a stake, make one owner choice. Take one screenshot each of Research, Bank and Company into `docs/design/` (`quay-research.png`, `quay-bank-credit.png`, `quay-stake.png`). Kill every server you start.

## Done

`npx tsc --noEmit` clean for your files, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
