# UNIT: the Wire keeps its stories across a server restart (b3)

Written 2026-11-12T19:26:43+01:00 Europe/Paris, before any product code on this branch. Branch `sys/wire-restart-history`, worktree `/workspace/avalon/sys-wire-restart-history`.
Timing, honestly: the red tests came first, as local commit `5789ecc5` (investigation, base origin/main `02c38da9`). Then origin/main `c469b03f` was merged forward (`a5ec02b2`, --no-ff). This doc was written after that merge and before any change under `src/`. Root `UNIT.md` stays equal to main.

## Player outcome and scope

A signed-in player who reads the Wire, then sees the server restart (crash, SIGKILL, deploy), still finds every story that was listed before. The same id, tick, headline, cause and price move show in `GET /api/wire` and on `/wire`, also after a reload. New stories keep landing on the same schedule as on an uninterrupted server. Guests are out of scope: they keep the labelled example feed (docs/v1/M1-02-WORLD.md:15). Not edited: auth, broker, `src/app/api/wire/route.ts` (Wire statement code), the quote walk, the ledger, the client.

## Sources and the gap

- Gatekeeper 20c3bb69 REVIEW.md:37/:47 (b3). Local repro on 02c38da9: before the kill there were 25 rows at tick 27836. After the restart there were 2 (`w-a-27760`, `w-27790`). Evidence: `/workspace/avalon/evidence/sys-wire-restart-history/REPORT.md`.
- The cause: the rows live only in `LiveMarket.stories` (clock.ts:62). The per-step save (clock.ts:118-127, :154) does not write them. Boot replaces them with `rebuildRumorStories()` (clock.ts:115), and `seedBootHistory` returns on any resumed tick (clock.ts:186).
- Spec: 19-TECH-ARCHITECTURE.md:541 "a client never sees a state the server could lose" and :543 (RPO zero for committed ticks). 15-MULTIPLAYER-SOCIAL.md:606/:621. REVIEW-LESSONS #12 (survives a refresh and a server restart) and #20 (a GET must not write).
- Why stored, not recomputed: shown price moves come from the marks at publish time, and the marks restart on resume (mockFeed.ts:281-283). Storm, crisis, coin-news and degen rows are not functions of (seed, tick).

## Approved plan (Gatekeeper)

1. Persist the retained Wire rows (≤ STORY_KEEP plus held rumors) as a versioned, strictly parsed `wire` field (`{ v: 1, items }`) inside the storm-world snapshot. It is written in the same per-step atomic write (temp + rename), so rows and rumor claims commit together. On boot, restore the rows and merge `rebuildRumorStories()` by id (the saved row wins, missing rumor rows are added), then apply the STORY_KEEP window. Fresh worlds keep `seedBootHistory`. A snapshot without `wire` boots as today. A corrupt `wire` is refused. A newer `v` is refused. Nothing silently resets.
2. Tests first, red on main.
3. Proofs: restart ≡ uninterrupted, prices and ledger unchanged, write cost, crash mid-write.

## Acceptance checks

1. Restart lists every pre-restart row with the same id, tick, kind, headline, slots, cause, phase and effects (unit + prod SIGKILL e2e, signed-in api, /wire and reload).
2. Restart then continue gives the same catalog row ids as an uninterrupted clock at the same tick. Two restarts in a row keep the same rows. A read never writes the store.
3. STORY_KEEP bound: restored plus new rows stay within the retainStories window (STORY_KEEP + held rumors).
4. Old snapshot without `wire` boots exactly as main (rumor-derived rows only, same quotes).
5. Corrupt `wire` (not an object, bad items, duplicate ids, unknown v ≤ 0): boot throws `WireSnapshotError` with code `WIRE_SNAPSHOT_CORRUPT`. The message names the file path and the field `wire`, echoes no file content or secret, and the file is left unchanged.
6. Newer `wire.v` than this build knows: boot throws code `WIRE_SNAPSHOT_NEWER`, naming the file, the field and both versions. It is never downgraded or overwritten.
7. Crash mid-write: a writer SIGKILLed at random points of the temp + rename save never leaves a file whose `wire` is partial. Boot reads the previous complete snapshot.
8. Prices and ledger: quotes and the storm snapshot (minus `wire`) after a restart are byte-identical to main's restart of the same store, at the restart and after further steps. test:formal-money and ledger-no-dup pass.
9. Write cost: time and bytes of one snapshot save, before vs after, at STORY_KEEP plus the largest held-rumor count observed. A step never overruns FEED_TICK_MS (5 000 ms) under a long run. Numbers in evidence.
10. Preflight: lint, typecheck, build, check-hooks, route-budget (34xx), ledger-no-dup, npm test, test:formal-money, port-avalon verify, the new e2e in a fresh detached worktree (fresh .data, 34xx), and a seed-17 prod SIGKILL replay with signed-in play at desktop and phone.

## Operator: a refused Wire snapshot

If the server refuses to start with `WIRE_SNAPSHOT_CORRUPT` or `WIRE_SNAPSHOT_NEWER`:
1. Do not delete `storm-world.json`. It also holds storms, rumor claims and the rumor key.
2. Stop the server and copy the file aside (`cp storm-world.json storm-world.json.bad-$(date +%s)`).
3. NEWER means a newer build wrote it. Run that build again instead of this one.
4. CORRUPT, or you accept losing only the Wire history: remove just the `wire` key (`jq 'del(.wire)' storm-world.json.bad-… > storm-world.json`) and start again. The server boots like a pre-wire snapshot: storms, claims and quotes are kept, and the Wire shows the rumor-derived rows and then new stories.

## Results

(filled after the fix)
