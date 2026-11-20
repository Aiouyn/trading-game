# Work order 124: a city that talks

Read `AGENTS.md`, `sim/README.md`, `sim/modules/media/`, `social/`, `circle/`, `venues/`, `society/`, `careers/`, `labour/`, `psyche/`, `economy/people.ts`, `commodities/` and the life commands in `sim/server.ts`. Round-2 playtest screenshots: `D:/tg-work/playtest/shots/1-first-hour/` and `4-social-life/`.

You own those sim modules and the life commands in `sim/server.ts`. Other orders run at the same time on `sim/modules/crypto/` and the Broker; keep both sides on any rebase conflict. Do not touch `src/`; order 123 builds the screens after you, so name new `/view` fields and commands plainly in your summary.

## Why

Round 2 scored the social life 6.5/10. Conversations now use your past, people work at real firms and write to you later. But:
- **The papers go quiet**: in three game days at x25 the Herald printed one story; the rest is coin-launch lines.
- **Accepted invitations never happen**: leaving drinks, a deal at the bank lobby, late-bar drinks were accepted and nothing followed.
- **Silent layoff**: the player lost the Cornerstone job with no notice or reason.
- **Templated people**: the same answers from a clerk and a factory hand; barflies re-rolled every visit; overheard lines from a tiny pool, even at the executives' wine bar; repeated looks ("high-visibility vest", "shock of dark curls").
- **The default name leaks**: a player named "Degen Dan" sees "by Mara Quill" on their coin; notices say "Mara Quill is Quiet".
- **Numbers**: every job pays $743.02 a week; crude oil 9.48 a barrel and gas 8.42; the margin-call text says shares fell 34% when they fell 1%.
- **Copy**: "introduced Isen Verhalwell (slot 4), with less trust than a friend"; firm names cut to their first word in the papers ("Daily, Deepwell..."); "16 firms cut jobs" beside a firm that is short of hands, with no sense of which is which.

## Do

1. **Daily papers**: the Herald each morning and the Gazette each evening carry several real stories from what happened (firms, results, hires and cuts, deals, people, scandals, the port, the bank), with full names; coin launches only as a column.
2. **Invitations become scenes**: an accepted dinner, drinks, deal or party happens at its time and place, with the people who are there, played like a venue evening (talk, listen, leave), and has consequences (bonds, offers, introductions, the deal itself).
3. **Life events reach the player**: layoffs, offers, answers, rent due and messages are notices with the reason.
4. **People who differ**: answers drawn from who the person is (job, wealth, mood, history with you, what is happening to their firm), many variants; each venue has regulars who come back and remember you; overheard talk drawn from the day's real events and the venue's crowd; varied looks.
5. **The player's name everywhere** in sim text; no default name.
6. **Honest numbers**: wages by firm, role, skill and the firm's health; commodity futures at believable prices for their unit; the margin-call text states the real cause (price fall, a sale of collateral, a rate change).
7. **Copy**: no slot numbers or internal ids; full firm names; job cuts and openings stated per firm.

## Done

On a fresh start with your own name, run two weeks at x25 and show: a morning and an evening paper, an accepted invitation played as a scene with its outcome, a layoff or offer notice with its reason, two people of different jobs answering the same topic differently, a regular remembering you at a venue, three different wages, oil and gas futures prices. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
