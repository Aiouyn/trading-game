# Work order 38: AI playtesters

You own `sim/playtest/` (new). Use `sim/play.ts` as the game: AI players read its text screen and type its commands. Change no module; if the text screen lacks something a player needs, write it in the report as a finding instead of adding it. Read `AGENTS.md`, `sim/README.md` and `sim/play.ts` first.

## Why

Code bots find exploits; they do not find confusion. A new player gets lost when the screen hides what they need, a command does not do what they expected, or nothing happens for months. Language models playing as new players, writing down every such moment, find those problems in minutes.

## Build

1. **A driver** `node sim/playtest/run.ts --sessions 10 --turns 150 --model <name>` that starts `play.ts` on a fresh saved world for each session, sends the screen to a language model, takes back one command plus a one-line thought, sends the command, and repeats. It calls the Anthropic Messages API with `fetch` (no SDK install), reading the key from `ANTHROPIC_API_KEY`; the model name is a flag (default a small, cheap model). If no key is set, it exits with a clear message.
2. **Personas and goals**, one per session, in `sim/playtest/personas.txt`: a total beginner with no finance knowledge; a stock trader; a would-be tycoon who wants to own companies; a cautious saver; someone trying to cheat (insider trading, manipulation); someone who wants a family dynasty. Each gets a goal ("double your money in 5 years", "control a listed firm") and is told only what a new player would read.
3. **The model must report** in its thought, with a tag, every moment of: CONFUSED (did not understand the screen or a result), BLOCKED (wanted to do something with no command for it), SURPRISED (the world reacted in a way it did not expect, good or bad), BORED (nothing worth doing), DELIGHTED (something felt great).
4. **The report** `playtest-report.md`: per session the goal, outcome (net worth, firms, prison, death), and the tagged moments with the screen that caused them; then a summary across sessions ranking the most frequent problems, each with two or three quoted examples, and a list of missing commands players asked for.
5. Keep cost visible: print the number of model calls and tokens used per session and in total.

## Done

With a key set, `node sim/playtest/run.ts --sessions 6 --turns 100` runs one session per persona and writes the report. Commit after `git pull --rebase`, push, and reply with the summary section of the report, the token totals, and your cost. Then stop. (If you have no API key, build and test it with a fake model that picks random valid commands, and say so.)
