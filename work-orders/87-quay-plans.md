# Work order 87: plans you can see and answer

Read `AGENTS.md` (including the Next.js block), `docs/DIRECTION.md`, `sim/modules/circle/plans.ts` (the dated plans from work order 86, commit 3c5d927e), `sim/modules/society/`, how `sim/server.ts` builds `/view` and the calendar, and `src/apps/people/`, `src/apps/messages/`, `src/apps/society/`.

You own `src/apps/people/`, `src/apps/messages/`, `src/apps/society/` and one new app, `src/apps/diary/`, registered in `src/shell/registry.ts` and `appModules.ts`. Work order 82 is editing `sim/server.ts` and `src/shell/` data code: add only the lines needed to expose plans in `/view` and to accept or decline one through `/act`, and keep both sides on any rebase conflict. Run Quay with `next dev --webpack`.

## Do

1. **Diary app**: this week and the next four, day by day: dinners, drinks, birthdays, weddings, funerals, galas, society parties, earnings dates, central bank meetings, the player's own job and loan dates. Each entry shows who comes, where, what it costs, and a one-line reason it matters ("Kela's 24th. You missed her last two dinners.").
2. **Invitations**: an open invitation shows Accept and Decline in the Diary, in Messages (as a message from the person) and on that person's page in People. Answering updates every place at once and says what happened in one sentence.
3. **Aftermath**: after the date, the entry reads as a past event: who came, what was said, any tip, job or fallout, what it cost. Skipped plans read as skipped.
4. **Living city**: on Society, show the upcoming parties and galas the rich list attends, including the ones the player wasn't invited to.
5. Use the Quay look (Ink & Brass tokens, existing components). It must work at phone width.

## Done

Screenshots of the Diary, an invitation in Messages, and a person's page, at desktop and phone width, saved to `docs/design/quay-diary*.png`. `npx tsc --noEmit` has no errors in `src/`. Commit after `git pull --rebase`, push to v1-build, and reply with that and your cost. Then stop.
