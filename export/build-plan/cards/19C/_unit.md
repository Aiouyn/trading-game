# Unit 19C: gateway, protocol channels, accounts, HTTP, privacy, projector, SDK and client shell (stage S1)

## Purpose
Everything between a player and the world host: the channel catalog and body schemas with the visible-field allowlist (privacy by serialization), Better Auth accounts with PII isolation, session signing keys and nonces, the WebSocket gateway (intake, acks, rate limits, socket caps), subscriptions and delta delivery with resume and backpressure, the account-related `sys` handlers, the HTTP API framework with web hardening, roll verification and the signed integrity report, personal-data export and deletion, the projector framework with ClickHouse, the TypeScript SDK with the socket Web Worker, and the client shell stores and 19 §7 surface view models.

## Tasks (build order)
1. T19C-01 Channel catalog (27 families), bodies, allowlist, intent schemas, docs/intents.json (19#27, INV-STR-005).
2. T19C-02 Better Auth, accounts, PII, IP hashing, MFA, security-change flow.
3. T19C-03 Signing keys, nonce window, socket tickets, session routes (19#8, 19#9).
4. T19C-04 Gateway core (19#31, 19#35).
5. T19C-05 Subscriptions, delta router, resume, backpressure, req ops (19#30, 19#32, 19#33).
6. T19C-06 Engine sys part 3: account status, deletion, profile, guest upgrade, wall-clock marks.
7. T19C-07 HTTP framework, proxy.ts, verify roll, integrity report (19#37).
8. T19C-08 Export, deletion, PII scanner (19#44, 19#45, 19#46).
9. T19C-09 Projector framework and ClickHouse schema (19#51).
10. T19C-10 SDK core and socket Web Worker.
11. T19C-11 Client stores, no-money-prediction lint, content split check, §7 view models (19#56, 19#58).

## Internal DAG
- 01 -> 04, 05, 10, 11; 02 -> 03, 07, 08; 03 -> 04 -> 05 -> 10
- 06 -> 08; 07 -> 08, 10, 11; 10 -> 11; 09 independent of the gateway path
- External: 19B (all of host, bus, PG, snapshots, archiver), 02 (T02-05, T02-07, T02-11, T02-14), 19A, "T14A-??" (character lifecycle, estate), "T22A-??" (content server key list).

## Exports to downstream units
- `CHANNELS`, `parseChannel`, body schemas, `HIDDEN_FIELDS` allowlist check (T19C-01).
- Auth: `readEmail`, `setStatus`, `hasMfa`, `hashIp` (T19C-02); `verifyIntentSignature`, `NonceWindow` (T19C-03).
- Gateway and `DeltaRouter`, `ResumeBuffer`, `ViewService` (T19C-04, T19C-05).
- `route()` HTTP helper, `verifyRoll`, integrity report (T19C-07); `scanWorld` (T19C-08).
- `registerProjection`, `ProjectorRunner`, `rebuild` for every module's read models (T19C-09).
- `@tycoon/sdk` (`TycoonClient`, signers, nonces) for web, 20 bots and the expert API (T19C-10).
- `FAMILY_STORES`, `useChannel`, `submitIntent`, §7 view models for 17's components (T19C-11).

## Acceptance tests split
19#8, 19#9 C-03; 19#27 C-01; 19#30, 19#32, 19#33 C-05; 19#31, 19#35 C-04; 19#37 C-07; 19#44-46 C-08; 19#51 C-09; 19#56, 19#58 C-11. Invariant INV-STR-005 -> T19C-01.

## Spec contradictions resolved
- Halt intake: 02 §3.20 refuses new intents during halt (`WORLD_HALTED`) over 19 test T59's queue wording; intents already forwarded are sealed on resume (02 owns intake states).
- Rate-limit rejects keep the lowest nonces (02 owns P0) over 19's "in sealed order".

## Registry gaps
- None beyond 19B's flagged supersets.
