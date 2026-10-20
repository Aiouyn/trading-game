# Unit 19D: scale-out, deploys, expert API, AI hosting, replay, PWA and native, operations and drills (stage S9)

## Purpose
Takes the single-host world of 19B/19C to production scale and operations: multi-host partitions with rebalancing and invisible moves, zero-missed-tick deploys with engine upgrades at boundaries and the golden replay gate, the expert API, server hosting of strategy graphs (P5 worker pool, DU metering, NPC budget), the replay service and client sandbox isolation, PWA and native shells with client performance budgets, infrastructure (CDN/WAF, edge gateways, KMS rotation, SLOs, backups, restore drill), load and deploy drills, and outbound leak scanners with the halt and ad-grant end-to-end checks.

## Tasks (build order)
1. T19D-01 Multi-host placement, rebalance planner, MOVE execution (19#25).
2. T19D-02 Rolling deploys, engine upgrade takeover, golden gate, migrations, flags (19#60, 19#61).
3. T19D-03 Expert API: eligibility, keys, API socket, signed HTTP (19#39, 19#40).
4. T19D-04 Strategy-graph compiler, metered interpreter, AI pool, NPC budget (19#14, 19#15, 19#16).
5. T19D-05 Replay service and sandbox isolation (19#49, 19#57).
6. T19D-06 PWA, native shells, client budgets (19#55).
7. T19D-07 Topology, edge, KMS rotation, SLOs, backups, restore drill (19#48).
8. T19D-08 Swarm and load/deploy drills (19#26, 19#34, 19#52, 19#53, 19#54).
9. T19D-09 Leak scanners, halt drill, ad grant path (19#28, 19#29, 19#38, 19#59, 19#63).

## Internal DAG
- 01 -> 02 -> 07; 01, 02, 07 -> 08; 04 -> 08; 03, 08 -> 09
- 05, 06 depend only on 19B/19C and external units
- External: 19B, 19C, 02, 05 (T05-05, T05-06, T05-22), 20A (T20A-03, T20A-04), 23 (T23-08); not yet carded: "T11-??", "T12-??", "T13-??", "T14A-??", "T15B-??", "T17-??", "T18-??", "T21-??".

## Exports to downstream units
- `planRebalance`, `executeMoves`, capacity helpers (`playerPartitions`, `gatewaysFor`, `marketGrouping`) (T19D-01).
- `takeover`, `runGoldenGate`, `IntendedDivergence`, `rollService`, `lintMigration` (T19D-02) for 20B gates and 21's console.
- `apiEligibility`, API key routes, `connectApi` (T19D-03).
- `graphRuntime` (11's `GraphRuntimePort`), `runGraph`, `AiPool`, `NpcBudget`, `npcIntentId`, `registerNpcCap` (T19D-04).
- `runReplay`, `filteredFrames`, `acceptSandboxWrite`, `startSandbox` (T19D-05) for 13, 17, 18, 21.
- `runSwarm`, `syntheticLoad`, `collect` (T19D-08): T20B-19's load driver should reuse them and depend on T19D-08.
- `installTap`, `scanPresence`, `scanSecrets` (T19D-09).

## Acceptance tests split
19#25 D-01; 19#60, 19#61 D-02; 19#39, 19#40 D-03; 19#14-16 D-04; 19#49, 19#57 D-05; 19#55 D-06; 19#48 D-07; 19#26, 19#34, 19#52-54 D-08; 19#28, 19#29, 19#38, 19#59, 19#63 D-09.

## Spec contradictions resolved
- Cancelled move vs sealed `sys.partition_map`: the active map is a platform fact recorded per TickRecord (`partitionMapVersion`); logical state is layout-independent (19 Rule 3.6.6), so a cancelled move changes no outcome.
- Halt intake (19#59 wording "queued intents are sealed on resume"): new intents during a halt are refused (02 §3.20 owns intake states); intents already forwarded are sealed on resume; the gateway queue applies to bus outage (19 §8 edge 20).
- Ad grant: 19 §4.3 lists `sys.ad_grant`; its engine validation and codes are 21's (21 Rule 3.14.3); 19D only checks the end-to-end path.

## Registry gaps
- 11's graph limit reject codes are quoted as `LAB_GRAPH_*` until 11's cards name them.
