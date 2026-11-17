# Work order 99: an edge before the market

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`, `sim/modules/earnings/`, `sim/modules/port/`, `sim/modules/careers/`, `sim/modules/media/` and `sim/playtest/agent-trader.md`.

You own a new module `sim/modules/signals/` (registered with one line in `sim/run.ts`), plus `sim/modules/earnings/` and `sim/modules/port/`. Other agents are editing `banking/`, `markets/`, `player/`, `corporate/`, `labour/`, `circle/`, `social/` and `history/` at the same time: read those, but do not change them. Media may get only a few lines that read your signals; keep both sides on any rebase conflict.

## Why

An outside reviewer said it best: the engine explains yesterday very well, but the player rarely gets to act on incomplete information about tomorrow. That information edge is what would set Port Avalon apart.

## Do

1. **Private, noisy signals from the player's life**, drawn from the true state of the world, before it reaches prices:
   - At work, by job: a port worker sees berth queues and which shippers book more; a shop clerk sees footfall; an engineer hears about a delayed product; a bank clerk sees loan demand.
   - From contacts in the circle who work at firms: "orders are slow this month", "we're hiring again", "the chief is out".
   - From the city: queues at a store, empty offices, ships waiting.
   Each signal is true more often than not, but not always. Better-placed contacts and longer tenure give clearer signals.
2. **Public views that can be wrong**: an analyst consensus for each listed firm's next quarter, built from public data with a lag and with its own biases. A journalist's explanation of a move may be wrong.
3. **The reveal**: at earnings, the true results come out against the consensus, prices move on the surprise, and the event says which signals pointed the right way.
4. **Fair and legal**: material non-public information from an insider who breaks a duty is insider dealing, and the law module can catch it. Observations from the player's own job and from the street are fair game. Say which is which, in one line, on the signal itself.
5. Expose the signals and the consensus in the state, so `/view` can show them later; another order will build the screens.
6. Keep the books balanced and the run deterministic.

## Done

Paste one worked example from a run: a signal the player could see, the consensus, the earnings result, and the price move. Also show how often signals were right, by kind. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
