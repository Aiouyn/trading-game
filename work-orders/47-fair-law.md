# Work order 47: the law catches criminals, not index investors

You own `sim/modules/law/`, and may change how other modules report suspected offences to it. Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md` (launch condition 3) and `sim/bots/bots-report.md` first.

## The problem

The index investor bot only buys a spread of stocks every week. It went to prison in 4 of 20 worlds and was charged or convicted 15 times. The do-nothing bot, which only keeps cash in the bank, went to prison once. A law that punishes innocent behaviour makes the game unfair and unreadable.

## What to do

1. For every case against the index investor and the do-nothing bot in the report, trace the charge back with `--explain`: which offence was recorded, which rule flagged it, what evidence existed.
2. Fix the rules so that an offence needs a real act: trading a firm while knowing a specific unpublished fact about that firm, and gaining from it. Holding a stock through an announcement is not insider trading; a routine weekly purchase is not one; being the heir of someone who committed one is not one.
3. Wrongful convictions may exist, but rarely, and only when the evidence really looked bad (for example the person did know the fact).

Targets on a new bot report (`node sim/bots/run.ts --worlds 20 --years 20 --pop 5000`): index investor, bond ladder and do-nothing never in prison and charged at most once in 20 worlds; the insider still caught in most worlds. Commit the report.

## Done

`node sim/run.ts --years 30 --seed 1` (and seeds 2 and 3) finish with books balanced every day; save and reload still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`). Commit after `git pull --rebase`, push, and reply with what this order asks for and your cost. Then stop.
