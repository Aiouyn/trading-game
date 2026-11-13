# Work order 13: the screens

Start only after work order 10 (the player) is merged: you build on its `view(w)` and `act(w, command)`.

You own `sim/server.ts` and a new directory `ui/`. Do not touch `src/`, `packages/` or the Next.js app: the game's screens are separate from it. Read the modules; change none of them. If the player module lacks something a screen needs, add the smallest exported function to `sim/modules/player/` and say so in your reply. Read `AGENTS.md` and `sim/README.md` first.

## Why

The world exists only as tables in a terminal. A player needs to see it: their money, the market moving, the news arriving, the people they know, and the reason behind anything they click. Wall Street Raider showed that dense screens full of numbers can be addictive when every number can be acted on. Dwarf Fortress showed that a world feels alive when you can open anything and read its history.

## Build

1. **`node sim/server.ts --load worlds/7`** runs the world in one process and serves the screens on `http://localhost:4173`. Plain Node 22, no install, no build step: the `ui/` folder is static HTML, CSS and JavaScript modules. The world runs while the page is open: the speed is set from the page (pause, 1 day per second, 1 week per second, 1 month per second). The server talks JSON: `GET /view`, `POST /act`, `GET /explain/:eventId`, `GET /person/:index`, `GET /firm/:id`, `GET /history`, plus a server-sent event stream that pushes each new day.
2. **The trading desk (main screen).** The player's net worth and its change, cash, positions with profit and loss, open orders; the stock list with last price, day change and volume; an order ticket (buy, sell, short, limit, market) that calls `act`. A price chart for the selected stock (daily closes, drawn on a canvas, no chart library).
3. **The newswire.** Published news as it arrives, and the private facts the player has learned, marked with who told them. Clicking any item opens its cause chain from `/explain`.
4. **People and firms.** A firm page (chief executive, staff count, price, sales, debt, share price history, its news) and a person page (age, job, family, wealth band, mood, and the player's relationship with them if they are a contact). Every name anywhere is a link to its page.
5. **Contacts.** The player's 16 contacts with their relationship bars (familiarity, trust, friendship), and buttons to talk to them or ask about a firm.
6. **Markets beyond shares.** Tabs for bonds (yield curve), commodity futures (prices and the player's positions, margin), crypto (coins, the player's holdings), and the exchange rate.
7. **The economy.** One page with the macro lines over time (unemployment, inflation, policy rate, exchange rate, stock index), each point clickable to its event chain.
8. **Look.** Dense, keyboard-friendly, dark, monospaced numbers, like a trading terminal. No placeholder data: every number comes from the world.

## Done

`node sim/server.ts --load worlds/7` starts; in the browser you can place an order, watch it fill as days pass, open a news item's cause chain, visit the firm and its chief executive, and talk to a contact. Books stay balanced every day (the server runs the same check as `run.ts`). Commit to `v1-build`, push, and reply with three screenshots (desk, newswire with a cause chain open, a person page) and your cost. Then stop.
