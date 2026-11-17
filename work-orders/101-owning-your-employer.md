# Work order 101: owning what you work for

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`, `sim/modules/corporate/`, `sim/modules/labour/`, `sim/modules/circle/`, `sim/modules/social/`, `sim/modules/history/` and `sim/modules/player/demo-heir.txt`.

You own `sim/modules/corporate/`, `sim/modules/labour/`, `sim/modules/circle/`, `sim/modules/social/` and `sim/modules/history/`. Other agents are editing `signals/` (new), `earnings/`, `port/`, `banking/`, `markets/` and the player's borrowing in `player/`: do not change those, and use banking's existing loan acts to borrow.

## Why

The established games let players run firms. Port Avalon can go further: one ownership decision should travel through the firm, its workers, the press, the player's circle and family, and the next generation, in ways the player can recognise years later.

## Do

1. **Buying in**: the player can build a stake in their own employer and take control: with savings, a loan, partners from the circle, or a management buyout.
2. **Owner's choices with real trade-offs**: sell a division to meet payroll, cut or protect jobs, refinance at a rate that risks the family's money, pay dividends or invest, or deal with the union.
3. **People remember**: workers, the union representative, managers, rivals and journalists keep a record of what the owner did to them (laid off, protected, promoted, betrayed). Years later that record shapes who becomes an ally, a rival, a source for the press, or a witness in court.
4. **Heirs inherit both**: when the player dies or retires, the heir inherits the shares and debts and also the city's memory: grudges, loyalties and reputation. A heir scenario can start from one of these histories.
5. Keep the books balanced and the run deterministic.

## Done

Paste one chain from a scripted run: an ownership decision, who remembered it, and what that caused years later, including for the heir. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
