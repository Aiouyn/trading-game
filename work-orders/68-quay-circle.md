# Work order 68: your people, in Quay

Read `AGENTS.md` (including the Next.js block), `docs/DIRECTION.md`, `docs/DESIGN.md` (Ink & Brass), and how `src/apps/messages`, `src/apps/profile` and `src/server/` read `sim/server.ts`. Work order 67 added a living circle to the simulation: an inbox with threads, requests with actions, each contact's role, bond and its why, and commands `reply`, `lend`, `invite`, `gift`, `introduce`. Read `sim/modules/circle/` and the new `/view` and `/person/<i>` fields.

You own `src/apps/messages`, a new `src/apps/people` (register it in `src/shell/registry.ts` and `appModules.ts`, keep every entry when you rebase) and the person page component. Do not change `sim/`.

## Build

1. **Messages** feels like a phone messenger: threads per person with their portrait initial and role, unread badges, the event each message refers to as a tappable card, and the request's actions as buttons (lend with an amount, accept the dinner, decline). A reply updates the thread at once.
2. **People**: your circle as a list and as a small map of who knows whom, filterable by friend, family, rival, mentor, colleague. Each person: bond bars with "why", the last things you did together, what they own and where they work (as the sim knows them), and actions: message, invite, gift, lend, ask about a firm, ask for an introduction.
3. Notifications: a new message from a close contact or a rival's move shows a toast and a dock badge; requests with a deadline appear in the top bar's interrupts only if they matter (family in trouble).
4. Phone width first: Messages and People must be pleasant at 390 px.

## Done

Play two game-years in a sandbox: answer a loan request, accept an invitation, meet someone new. `npx tsc --noEmit` passes. Screenshots `docs/design/quay-messages.png`, `docs/design/quay-people.png` and one at phone width. Commit after `git pull --rebase`, push to v1-build, reply with the screenshots' paths and your cost. Then stop. No test suites, no docs.
