# Work order 121: a life that adds up

Read `AGENTS.md`, `sim/README.md`, the `arrival` start and `/start` in `sim/server.ts`, and `sim/modules/player/`, `careers/`, `labour/`, `social/`, `circle/`, `venues/`, `society/`, `property/`, `banking/`, `courses/`, `media/` and `economy/people.ts`. Playtest screenshots: `D:/tg-work/playtest/shots/1-first-hour/` and `4-social-life/`.

You own those sim modules and the life commands and `/start` in `sim/server.ts`. Order 119 edits `sim/modules/markets/` and the clock at the same time; keep both sides on any rebase conflict. Do not touch `src/`; order 122 builds the screens on what you add.

## Why

The playtesters met real CEOs at Cellar 41, got a carpenter job after 5 days, and contacts wrote to them about job cuts that matched the Wire: the bones are there. But:
- **The typed name is ignored**: every player becomes "Mara Quill".
- **Money from nowhere**: about +$207 overnight with nothing held, no job, no explanation.
- **You arrive on New Year's Day**, paused, the exchange closed, nothing happening.
- **Careers contradicts itself**: "34 firms are hiring" next to "No firm is short of staff"; a Kestrel employee at a bar knows "nothing private" about Kestrel, the firm said to be short of hands.
- **Copy bugs**: "Undefined undefined was there", "You can approach N", "You have already spoken with them tonight, so try again", a stray "bright", "who:11104", "borrows 103525 from the bank", coin dates "Y1 M1 D4".
- **Shallow people**: bar patrons are six identical "Someone in their fifties, dressed for an evening out"; one canned line per talk; every new acquaintance is labelled "Colleague" (a CEO met at a wine bar too); bonds stay "Cold" after a dinner; the graph shows no links between contacts.
- **Costs out of scale**: Cellar 41 cover $240 plus a $168 round, the governor's $1,800 society party offered on day 6 to someone with $5,000, courses $800-$2,200.
- **Going out** jumps the clock to 23:30 at once; at x25 the evening is gone before you act.

## Do

1. **Character creation feeds the life**: `/start` takes name, age and a short past (what you did before: a few choices such as dockhand, bookkeeper, student, salesperson, coder; and where you come from), which sets starting knowledge, skills and the first people who might recognise you, never a goal. The name is used everywhere. Still $5,000, no contacts, no job.
2. **Arrive on an ordinary weekday morning** (a Monday around 08:00, exchange opening that day), with something already happening in the city.
3. **Every dollar explained**: find the overnight +$207 and either remove it or make it a real, explained entry. Net worth "Today" has one definition.
4. **Jobs that work**: one truth for open seats; a firm short of hands has real openings you can apply for; people who work somewhere know about their firm (openings, mood, who decides) and can put in a word.
5. **People with faces**: patrons are described by what can be seen and overheard and, for public figures, recognised from the papers; conversations draw on who they are, what they own and what is happening to them, several exchanges deep; relationship labels follow how you met (acquaintance, then friend, colleague only if you work together); bonds warm with time spent, rounds, dinners and favours; contacts know each other and the graph shows it.
6. **Prices for every purse**: venues, rounds, courses and invitations scaled to the city's wages and the player's standing; invitations come from people at your level until you rise.
7. **Evenings you can play**: going out pauses the clock at the venue; time passes as you act (a talk, a round), and you leave when you choose.
8. **The player can message any contact first** through a command the Messages app can call.
9. Fix every copy bug above and format every amount and date in sim text as money and game dates.

## Done

On a fresh start with your own name and a past, show: the start time and place, the name in the Wire, a night at two venues meeting named people with several exchanges, a bond warming, a job application to a firm short of hands and the hire, a message you sent first, and a day's cash movements all explained. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
