# Work order 111: going out, learning, and the people you meet

Read `AGENTS.md`, `docs/DIRECTION.md`, `sim/README.md`, `sim/modules/circle/`, `sim/modules/social/`, `sim/modules/careers/`, `sim/modules/economy/people.ts`, `sim/modules/media/`, `sim/modules/signals/`, `sim/modules/corporate/` and `sim/modules/player/`.

You own new modules `sim/modules/venues/` and `sim/modules/courses/` (each registered with one line in `sim/run.ts`), a new file `sim/modules/player/outings.ts` for the player commands (plus their lines in the command parser, `sim/play.ts` and `/act`), and a new Quay app `src/apps/city-life/`. You may add small hooks in `circle/`, `social/` and `careers/`. Orders 109 and 110 run at the same time; keep both sides on any rebase conflict.

## Why, in the owner's words

"Buy some formations that will take time to develop my knowledge in certain sectors." "Go to the bar regularly to make some friends: I can choose between different bars to have a chance to meet a CEO I read in the journal, or I just meet random people, make friends, talk business, maybe try to hire some, or try to make them pull strings for you." "Not really random, since the game is granular." "It needs to be this advanced and fun."

## Do

1. **Venues**: a handful of real places, each with its own crowd drawn from the real population by who they are, where they work and live, what they earn and their habits: a dockside bar (port and factory workers), a bar near the exchange (traders, bankers, analysts), an uptown wine bar (executives, owners, the rich), a café near the labs (engineers, founders), a union pub, a club (young, crypto, gamblers). People go out on their own schedules, so who is there on an evening follows from the world, and a CEO from the paper can really be found at the wine bar. Regulars come back.
2. **Going out**: `go <venue>` spends an evening and some money. The player sees who is there in plain words: a few faces, what they look like they do, and anyone recognised from the news. They can `approach <person>`, buy a round, or just listen (overheard talk can carry a signal from order 99).
3. **People you meet**: a first meeting makes an acquaintance; meeting again, shared interests and favours build trust. With someone they know, the player can talk business (learn what their firm is doing, with order 99's legal line), offer them a job at the player's firm, ask a favour (an introduction, a job interview, a loan, a word with a lender, a board seat) or invest together. Asking too much too soon costs trust; people remember favours and refusals.
4. **Courses**: bookkeeping, trading and markets, shipping and logistics, energy, property, software, law, management, and so on, each with a fee and a length in weeks of evenings. Finishing one raises the player's knowledge of that sector: clearer signals about its firms, access to better jobs, better reads of its news. Classmates are real people and can become contacts.
5. **Jobs are applied for, not given**: the player looks at real openings and applies; interviews go better with the right course or an introduction.
6. **City life app in Quay**: where to go tonight (each venue and its crowd in a line), people you know (how you met, trust, what they do), and courses. Calm and uncluttered.
7. Keep the books balanced and the run deterministic.

## Done

Paste a short `sim/play.ts` session: start the sandbox (or the new arrival if order 109 has landed), take a course, go to two different bars over a few weeks, meet someone recognised from the news, become friends, and ask one favour that works and one that is refused. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
