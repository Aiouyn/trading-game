# Unit 19B: world host, tick driver, persistence, recovery and engine module sys (stage S1)

## Purpose
Hosts the 02 engine as a partitioned, durable, recoverable world: platform types and system/admin input schemas, the `packages/engine/index.ts` partition engine factory (the phase-level contract of 19 §2.6 over 02's runtime), the bus and its five streams, PostgreSQL schemas and the hash-chained audit log, the entropy service, coordinator intake and sealing, the multi-thread world host, the distributed tick driver, the commit pipeline with safe mode, the tick scheduler, snapshots, recovery and failover, engine module `sys` (system inputs and admin postings), the archiver, and the assembled world host with a headless multi-partition world used by every replay test.

## Tasks (build order)
1. T19B-01 Platform types, 25 system kinds, 14 platform events, batch hash, platform signer (19#41).
2. T19B-02 PartitionEngine factory, delivery schedule, ports wiring (G6.1), local reference driver (19#1).
3. T19B-03 Bus (NATS JetStream and memory), subjects, permissions, telemetry kit.
4. T19B-04 PostgreSQL schemas, roles, game-week partitions, audit chain (19#43).
5. T19B-05 Entropy service, commitments two epochs ahead, reveals (19#36).
6. T19B-06 Intake and sealing (19#5, 19#6, 19#7, 19#10, 19#11).
7. T19B-07 World host workers, control protocol with fencing, INV-STR-004.
8. T19B-08 Distributed tick driver, router, PHASE stream (19#12, 19#13).
9. T19B-09 Commit pipeline, safe mode, case file (19#20, 19#22).
10. T19B-10 Tick scheduler, CATCHING_UP, re-base, halt and resume (19#17, 19#18, 19#19).
11. T19B-11 Snapshots and object store (19#47).
12. T19B-12 Recovery, lease and fencing, standby follower (19#21, 19#23, 19#24).
13. T19B-13 Engine sys part 1, security hold port (19#62).
14. T19B-14 adm.compensate and adm.clawback, audit writer, sys ModuleDef (19#42).
15. T19B-15 Archiver, retention, audit mirror, backups (19#50).
16. T19B-16 World host main, initial map, genesis, headless world (19#3, 19#4).

## Internal DAG
- 01 -> 03, 04, 05, 06, 07, 09, 10, 11, 13; 02 -> 06, 07, 08, 11, 13, 16
- 03, 06, 07 -> 08 -> 09 -> 10, 11, 12, 14; 05 -> 06, 10, 12
- 13 -> 14; 04, 11 -> 15; 07, 10, 11, 12, 14, 15 -> 16
- External: 02 (T02-05..18), 03 (T03-05, T03-09), 19A, 23 (T23-01, T23-08), 20A (T20A-04 driver for 16).

## Exports to downstream units
- `createPartitionEngine`, `PartitionEngine`, `deliveryPhase`, `runLocalTick`, `PORT_PROVIDERS` (T19B-02).
- `Bus`, `SUBJECT`, `meter`, telemetry (T19B-03); Drizzle tables, `tx`, `appendAudit` (T19B-04).
- `EntropyService`, commitments, reveals (T19B-05); `submitIntake`, sealed batches (T19B-06).
- `TickDriver`, `CommitPipeline`, `Scheduler`, `SnapshotStore`, `ObjectStore`, `KEYS`, recovery and lease (T19B-08..12).
- `sysModule`, system input handlers, `securityHoldPort` (T19B-13, T19B-14); archiver readers (T19B-15).
- `createHeadlessWorld`, `replayHeadless`, `buildMap`, genesis (T19B-16), used by 19C, 19D, 20.

## Acceptance tests split
19#1 B-02; 19#3, 19#4 B-16; 19#5-7, 19#10, 19#11 B-06; 19#12, 19#13 B-08; 19#17-19 B-10; 19#20, 19#22 B-09; 19#21, 19#23, 19#24 B-12; 19#36 B-05; 19#41 B-01; 19#42 B-14; 19#43 B-04; 19#47 B-11; 19#50 B-15; 19#62 B-13. Invariant INV-STR-004 -> T19B-07.

## Spec contradictions resolved
- Phase barriers: 19 per-phase PhaseStart/PhaseDone kept; message delivery follows 02 B1/B2/B3/NEXT (02 owns the pipeline, D019).
- Inbox order: 02 §3.5.3 (fromPartition, seq) vs 19 Rule 3.3.1 canonical key: canonical key (19 Rule 3.6.6 partition independence, INV-ENG-009); T02-14 must align.
- PLAYER hash: 19 Rule 3.5.1 u32(SHA-256(chrId)) vs T02-14 fnv1a32: card uses T02-14 `partitionOf`; reconciler should align T02-14 to 19.
- Catch-up: D389 and D029 both apply: seal = max(scheduled, lastCommit + gap, lastSeal + minInterval).
- Coordinator failover: 19 heartbeats (3 x 500 ms) trigger; 02 `coord_failover_timeout_ms` bounds the takeover.
- Safe-mode halt status: HALTED_EXCHANGE (02 owns safe mode) over 19's MAINTENANCE.
- Halt intake: new intents refused (02 §3.20); already-forwarded unsealed ones sealed on resume; gateway queue limit applies to bus outage (19 §8 edge 20).
- Rate-limit rejects: 02 keeps lowest nonces (owns P0).
- System inputs: 19 `sys.*`/`adm.*` are wire inputs; host converts param/engine/content/halt to 02 directives (T02-18).

## Registry gaps
- Supersets of 19 §11.2 flagged in cards: `SystemInput.keyId`, `entropy_secret_sealed` table, `tick_record.genesis_config_hash`, `SealedIntentRow.receivedSeq`.
