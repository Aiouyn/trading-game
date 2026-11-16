# Work order 46: screens for everything

You own `ui/` and `sim/server.ts`. Read the player module's commands (`help` in `sim/play.ts`) and `AGENTS.md` first. Change no module; if the server needs data a module does not export, add the smallest exported function and say so.

## Why

Since the first screens were built the player gained options, property, founding and running firms, takeovers, boards, a family and heirs, and health. The browser screens show little of it. Everything the player can do in `play.ts` must be doable and visible in the browser.

## Build

1. **A panel per area**: options chain with an order ticket; property listings by neighbourhood with a map-like grid, the player's homes, tenants and mortgage; the player's firms (a chief executive's dashboard: sales, costs, staff, price, cash, with the controls the player has); takeover bids and boards; the family (spouse, children, will, heir, dynasty score); health.
2. **Alerts** for anything that needs the player now: a margin call, a takeover bid on the player's firm, a strike at their firm, a regulator's letter, a sick child, a tenant who stopped paying. Each alert links to the panel and to its cause chain.
3. **Speed and keyboard**: every panel reachable by a key; the world's speed control always visible; the screens must stay responsive at 200,000 people (send changes, not the whole world, each day).
4. **No dead ends**: every name, firm, stock, parcel and event links to its page.

## Done

`node sim/server.ts --load <world>` serves every panel, an order of each kind can be placed from the browser, and books stay balanced. Commit after `git pull --rebase`, push, and reply with a screenshot of each new panel and your cost. Then stop.
