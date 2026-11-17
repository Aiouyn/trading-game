# Work order 67: a living circle of people

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`, then `sim/modules/social/index.ts`, `sim/modules/psyche/index.ts` and how `sim/server.ts` builds `/view` (contacts, messages) and `/person/<i>`. The world already has relationships (familiarity, trust, respect, fear, loyalty, friendship), rumours and memories. What it lacks is people who act toward the player. This order makes the player's circle feel alive: friends, rivals, mentors and family who write, ask, invite, help, betray and remember.

You own a new module `sim/modules/circle/` (register it in `sim/run.ts` with one `w.use` line). You may add player commands (in `sim/modules/player/`, only new entries and their handlers, keep every other line when you rebase) and add fields to `sim/server.ts` responses. Do not change other modules' behaviour.

## Build

1. **Messages from people, about real things.** Each week, contacts whose relationship and situation give them a reason write to the player: a friend at a firm that is about to cut jobs hints at it (only if they know the fact); a sibling asks for a loan after losing their job; a rival gloats when the player's position falls; a banker contact offers a better rate; a mentor congratulates a milestone. Every message comes from a real event or fact in the world, names it, and links to it. Tone follows the person's facets and the bond. No filler, no random lines.
2. **Requests the player can answer.** Loans to friends (a real ledger transfer, repaid or not depending on that person's finances), introductions (meet a contact's contact: a new slot with lower trust), invitations (dinner, a club, a charity gala: costs time or money, builds friendship and familiarity, may meet notable people such as chief executives or bank staff), favours (a tip in exchange for a promise). Answers: `reply <msg> yes|no|text`, plus `lend`, `invite`, `gift`, `introduce`. Refusing has consequences in the bond.
3. **Relationships change for reasons.** Bonds drift with time and contact; help raises loyalty, broken promises and losses caused by the player cut trust; shared employers and neighbourhoods create acquaintances. A friendship score the player can read with a "why" listing the last events that moved it.
4. **Rivals and allies.** A few people in the player's field become rivals (they compete for the same job, bid for the same house or firm, short the player's company) or allies (co-invest, vouch at the bank, testify in court). Their actions are real simulation actions.
5. **Memory.** People remember what the player did to them and bring it up later ("You never paid me back for March").
6. **Server.** `/view` and `/person/<i>` carry: the inbox with threads, pending requests with their actions, each contact's role (friend, rival, mentor, family, colleague), bond with its why, and the last things you did together. `/act` accepts the new commands.

Keep it cheap: work only on the player's circle (their contact slots and the contacts of those contacts), never the whole population each day.

## Done

`node sim/run.ts --years 10` prints "Books balanced every day"; save and reload give the same hash. A 2-year text-game script where the player lends to a friend, attends a dinner, makes a rival and receives at least 15 distinct, event-based messages; paste that transcript (trimmed). Commit after `git pull --rebase`, push to v1-build, reply with the transcript and your cost. Then stop.
