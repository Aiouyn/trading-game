# Work order 39: everything an NPC can do, the player can do

You own `sim/modules/player/`, `sim/play.ts` and the matching panels in `ui/`. Use the other modules' exported functions; if one is missing, add the smallest exported function to that module and list it in your reply. Read `AGENTS.md`, `sim/README.md` and `sim/bots/bots-report.md` first.

## Why

The bots and the playtest found commands the player is missing: there is no `help`, no way to buy or write options, no way to buy, sell or let property. A new player stares at the first screen with no idea what to type.

## Build

1. **`help`** lists every command grouped by topic with one example each; `help <command>` explains one in two or three lines; an unknown command suggests the closest one. The first screen of a new game ends with one line: "type help".
2. **Options**: `opt` lists the chain for a stock (strikes, expiries, bid, ask, open interest); `call` and `put` buy; `write` sells with margin; `close`. Exercise at expiry works as for anyone.
3. **Property**: `homes` lists listings by neighbourhood with price and rent; `bid`, `sell`, `let` (set a rent and take a tenant), `move` (where the player lives); mortgage through a bank.
4. **Every other module**: go through each module in `sim/modules` and list anything an NPC can do that the player cannot (for example join a union, donate to a party, buy insurance, report a crime, become a journalist's source); add those that are one exported call away, and list the rest in your reply.
5. Add the matching bots' commands to `sim/bots/gambler.ts` (options) and `sim/bots/landlord.ts` (property) so the next balance report measures them.

## Done

`node sim/run.ts --years 30 --seed 1` (and seeds 2 and 3) finish with books balanced every day; save and reload still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`); the economy is no worse than now (average unemployment 6.2 to 6.6%, inflation never above 8% in a year). Then rerun the bots: `node sim/bots/run.ts --worlds 20 --years 20 --pop 5000`. Commit after `git pull --rebase` (including the new `sim/bots/bots-report.md`), push, and reply with the before and after numbers this order asks for and your cost. Then stop.
