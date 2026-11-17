# Work order 94: answering the press properly

Read `AGENTS.md`, `sim/README.md`, `sim/modules/media/`, and how `sim/server.ts` handles a press comment (work order 93, commit 47391cb4).

You own `sim/modules/media/`, plus the press-comment lines in `sim/server.ts` and `src/apps/wire/` and `src/apps/messages/`.

## The problem

A player's comment to a journalist is sent as a reply to message 0 with `press: true`. The sim rejects it ("no such message"), but the command still lands in the log, and the media module reads its quote from that log. The server then tells the player "The paper has your comment." This works only by accident.

## Do

1. Add a real act in the media module, for example `media.comment` with the story or request id and the player's words: it checks that the request is open, records the quote, and closes the request.
2. Point the server and the Quay comment boxes at that act, and remove the reply-to-0 workaround.
3. Each request offers a few stances: deny, explain, no comment, or attack the story. The stance changes the follow-up story and the player's reputation. A request left unanswered for a few days runs as "declined to comment".
4. Make the press ask for comment early enough to be seen: also when the player is part of a society story, and when the player is on a rich list or makes a large trade.
5. Keep the books balanced and the run deterministic.

## Done

Paste a request, the answer, and the follow-up headline from a run. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
