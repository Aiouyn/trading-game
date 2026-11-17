# Work order 89: a press that watches the city

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`, `sim/modules/media/`, and skim the events emitted by `society/`, `circle/` (dated plans, commit 3c5d927e), `earnings/`, `economy/`, `bonds/` (new curve, commit 61c6df3a) and `politics/`.

You own `sim/modules/media/`. Other agents are editing `markets/`, `corporate/`, `property/` and the Quay apps at the same time: do not touch those.

## The problem

A city feels alive when its press reacts to what happens: to markets, to the rich list, to scandals, and to the player once they matter.

## Do

1. Give the city a handful of named outlets with distinct voices and biases (a sober financial daily, a tabloid, a business weekly, a gossip column) and named journalists, each with a beat.
2. Stories follow real events in the world: rate decisions and what the curve did, earnings beats and misses, defaults, layoffs, society parties and fallouts, weddings on the rich list, political fights. Some stories are rumours that turn out true or false later, and a correction follows when they are wrong.
3. **The player becomes news** once they are large enough: a big position, a takeover, a bankruptcy, a famous friend, a gala, a lawsuit. Coverage changes something (reputation, a contact's opinion, a share price on a big rumour), and journalists can ask the player for comment through the existing act mechanism.
4. Keep the volume readable: a few stories a day, the important ones ranked first, no duplicates. Keep the books balanced and the run deterministic.

## Done

Paste 20 consecutive headlines from a run, including at least one about the player and one corrected rumour, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that and your cost. Then stop.
