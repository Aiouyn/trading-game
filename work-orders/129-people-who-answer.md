# Work order 129: people who answer, standing that moves, work with a pulse

Read `AGENTS.md`, `sim/README.md`, and these sim modules: `circle/`, `social/`, `society/`, `venues/`, `careers/`, `labour/`, `academy` or courses (find it), `crypto/` (the player's coins, holders and posts), the regulator module (find the one behind "Attention"), and the life commands in `sim/server.ts`. Read what order 124 did: `git show 8b4d2d63 --stat`. Playtest reports (build 8827b945, before order 124): `C:/Users/Mathis/PortAvalon-playtest-8827b945/{Lina,Sofia,Kenji,Marco}/report-full.md`, screenshots beside them.

You own those sim modules and the life commands in `sim/server.ts`. Do not touch `src/`. Order 130 builds the screens after you, so name new `/view` fields and commands plainly in your summary. Orders 127 and 128 run at the same time; keep both sides on any rebase conflict.

## Why

Social life scored about 5–6 across the four players. The best moments were all people: a reference that worked, a grudge then forgiveness, someone recognising your past, a round raised back. What breaks it:
- **Letters ignore what happened to you.**
  - Norel got Lina hired at Prairie, then wrote "We are short of hands at Prairie: 2 seats open".
  - Peren offered the firm that had just laid Lina off.
  - Coren, Sofia's boss, told her to "apply and say Coren sent you".
  - Isel and Zelen re-sent the same template in answer to a question.
  - In person a contact says "hiring is on hold" while his letter says 4 seats, and the seat counts quoted go 5 → 8 → 3 → 4.
  - Referrals point at firms with no listing.
- **Yes, then no.** "Name the place with an invitation and I will be there", then "will not sit with you". A Close friend refuses dinner and an introduction.
- **Standing never moves.** A job, a $1,000 gala and two Close friends left it at "Slight · a new name in the city" for 14 days. Its Why? still says "holds no job" after the hire. Nothing says what would raise it.
- **Player invitations happen instantly.**
  - A $1,000 gala was gone at 02:24 with no scene and no effect.
  - A dinner at 2am took $36.56 and was over the same minute.
  - The Society "dinner at the dining room" has no place, time or guests, and nothing happens on the day.
  - The hill-house party says "You were not invited" with no way in.
- **Work has no presence.**
  - Hires happen at midnight with no accept step.
  - There is no first day, no colleagues, and the boss is not tagged as a colleague.
  - Performance "Ordinary 59" all week, with a Why? that says "Coren has 204 people".
  - A referral seat stays greyed out ("0 years is short of 1") with no pointer to the course that unlocks it.
  - The course counter is stuck at "class 0 of 8, next in 7 days" while class night blocks the bar.
- **Templates.**
  - "There is nothing I'd call a secret. I like talking to you. That is rare enough" from three people.
  - "We rent in Midtown… We get by" from three chief executives.
  - Bus and rent lines make up half of what you overhear.
  - CEOs write layoff letters like employees.
  - "We comes from".
  - "INTRODUCE YOURSELF" still shows after 11 talks.
  - The People log says "asked about money too soon" for "Keep talking".
- **One person, two jobs.** "Governor of the central bank" also runs Northgrid Power and launched "Coren Inu".
- **Messaging fights you.**
  - One unanswered letter blocks writing again.
  - "They will answer by tonight" is broken for 25+ hours.
  - Your text is auto-capitalised.
  - Replies are back-dated.
  - Five acquaintances send the same "has let people go" letter at once.
- **A coin dev without a name.**
  - Five launches and three dev dumps on 36 holders moved nothing: Reputation, Attention, the regulator and the NPCs never reacted.
  - The game auto-posted "Shakeout. Happens at every top." as the player.
  - You can't talk coins at a bar, even the crypto crowd's.
  - Rugs and delistings of coins you hold are silent.
  - Duplicate tickers (two KINU).

## Do

1. **Letters and talk know your story.** Replies are generated from the letter you wrote and from what has happened between you and to you: a hire, a layoff, a move, your coin, a scene you shared. A contact who got you hired congratulates you. Your boss talks to you as staff. Nobody pitches the firm that just let you go. In-person talk, letters and Careers draw seat counts and hiring state from one source. Referrals only name firms with real openings. One letter per event per person; others mention it in their own words, or not at all.
2. **People keep their word.** "Name the place and I will be there" means they come when invited. Refusals give the real reason in the person's voice, and Close friends do not refuse without one.
3. **Standing moves.** It has clear inputs that change it: job and title, close bonds with people of standing, hosting, events attended, wealth, scandal. Its Why? lists them and names the next step. A Close friend with standing can get you onto a guest list. The Society dinner and the hill-house party have a place, a time and guests, and are played as scenes (reuse order 124's scenes) for those who are in.
4. **Player-hosted invitations become scenes.** A dinner or gala you host is booked for a time and place with its price shown before you commit. It is played as a scene with the guests, and has consequences: bonds, standing, introductions, gossip.
5. **Work with a pulse.**
   - An offer to accept or decline, with the start date.
   - A first-day scene with your manager and colleagues, who are tagged as colleagues.
   - Shifts that take your time: say when they overlap market hours.
   - Performance that moves with attendance and skill, with a Why? about you.
   - A greyed-out seat says what unlocks it (years, a course) and links to that.
   - Courses advance class by class, with a short note after each class.
6. **Many voices.** Every line depends on who the person is (role, wealth, firm, mood, history with you), with many variants and no line shared word for word by two people in a week. Overheard talk comes from the day's events and the venue's crowd. CEOs write as CEOs. Fix "We comes". Relationship labels follow the real number of talks.
7. **One identity per person**: one role, consistent everywhere.
8. **Messaging that respects you.** Writing is never blocked. Promised answer times are kept. Your text is kept as typed. Dates are honest.
9. **The player as a coin dev.**
   - Your launches, pumps and dumps build a dev record that holders, the crowd, Reputation and Attention react to.
   - The regulator acts after repeated rugs.
   - A following forms around a dev who treats holders well.
   - A "coins" topic works at bars and in letters, and its reception depends on the crowd.
   - Nothing is ever posted in your name without you.
   - Rugs, delistings and big moves of coins you hold are notices.
   - Tickers are unique among live coins.

## Done

Run a fresh start with your own name for three weeks at x25, through the commands. Show:
- a letter that answers what you wrote
- a contact congratulating you on a job they referred you to
- your boss writing as your boss
- an accepted invitation keeping its word
- standing rising with its Why?
- a hosted dinner played as a scene with its price
- an offer accepted, with a first day and colleagues
- a course advancing
- two people answering the same topic in different words
- a dev dump that moves Reputation, with the crowd naming you
- a rug notice for a held coin

Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
