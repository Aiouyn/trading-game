# Work order 77: the odd sentences and the odd numbers

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`. Transcripts from the last orders show these oddities; reproduce each with a short script first, then fix it at its cause.

You own `sim/modules/careers/`, `sim/modules/circle/`, `sim/modules/labour/` and the player text helpers. Keep every other line when you rebase.

1. `jobs` labels every opening "a long shot", even for a well-qualified player at a firm with few applicants. The chance must reflect the real competition and the player's fit; some openings must be "likely".
2. Letters: "The eldest of 4 at home is 40", "The child at home is 23", "Iso and I are still in the house. Write when you can.", "I'm in Old Harbor — I'm still turning up if the job holds", birthday notes that list the eldest child. Drop facts that do not make sense for the moment (adult children are not "at home" news), and drop letters that say nothing new.
3. Remaining stock phrases ("I will not dress it up", "I will be plain") at most one in 30 letters.
4. "Come to a gala ... the city covers you": either the city pays or the player does; say which and book it.
5. A circle invitation that needs a yes or no carries a deadline and a default answer; the deadline is in the `/view` data so Quay can show it.
6. Read 50 letters and 30 headlines from a 5-year run as a picky editor and fix anything else that a person would never write.

## Done

`node sim/run.ts --years 10` prints "Books balanced every day"; save and reload match. Paste 25 letters and the `jobs` output for a qualified player. Commit after `git pull --rebase`, push to v1-build, reply with that and your cost. Then stop.
