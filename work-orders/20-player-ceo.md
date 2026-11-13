# Work order 20: the player runs companies

You own `sim/modules/player/` (extend it) and `ui/` only for the new screens this needs. Use the corporate module's exported functions to found, list, bid for and run firms; if one is missing, add the smallest exported function to `sim/modules/corporate/` and say so. Read `AGENTS.md`, `sim/README.md`, and the player and corporate modules first.

## Why

In Wall Street Raider the player becomes a tycoon: founds companies, takes them public, raids others, sits on boards. Right now the player can only trade. This order lets the player do everything an NPC entrepreneur, raider or chief executive can do, through the same rules.

## Build

1. **Found a firm** in any sector with your money (and a bank loan if a bank agrees): name it, choose the sector, it starts private and small like any new firm.
2. **Run it as chief executive**: set its price (or leave it on the normal rule), its hiring target, its dividend policy, and machinery investment; the firm's workers, suppliers and customers are the same people and firms as for anyone. Monthly report of sales, costs, profit and cash.
3. **Take it public**: an IPO through a bank, selling part of your stake.
4. **Raid**: make a tender offer for a listed firm at a price you choose, in cash or shares, financed by your money or a loan; shareholders accept or not by their own rules. Win control and you become chairman: you can replace the chief executive with someone you know (a contact), merge it into your firm, or sell its divisions to another firm.
5. **Boards**: holding 10% or more of a firm gives a board seat; the player sees board news before the public (a private fact — trading on it is insider trading that law can catch).
6. **Commands** in `play.ts` (`found`, `ceo`, `ipo`, `bid`, `board`) and matching panels in the `ui/` screens.

## Done

A scripted session (`sim/modules/player/demo-ceo.txt`) founds a firm, grows it for two years, lists it, raids a listed firm and wins control, with books balanced every day and save and reload matching. Commit after `git pull --rebase`, push, and reply with the transcript of that session and your cost. Then stop.
