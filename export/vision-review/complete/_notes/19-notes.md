# 19 notes: Technical Architecture

File: `19-TECH-ARCHITECTURE.md`. The earlier partial version (§1, §2, §3.1–§3.3.1 and the first rows of the §3.3.2 table) was kept word for word. One reference was corrected (`§3.14.4` became `§3.14.2` for the PII schema), and a citation note was added that tells this spec's module `02` apart from the original vision file `vision/02-multiplayer`. Everything from the P7 row of §3.3.2 through §12 is new.

## 1. Parameters

| Key | Default | Range | Unit | Affects |
|---|---|---|---|---|
| coord_heartbeat_ms | 500 | 100–2000 | ms | coordinator heartbeat (§3.2.3) |
| coord_failover_missed_heartbeats | 3 | 2–10 | count | coordinator failover trigger |
| phase_budget_ms_P0…P14 | 100,250,50,200,300,900,600,300,300,300,150,100,150,250,300 | each 20–2000 | ms | per-phase wall budget (§3.3.3) |
| min_inter_tick_gap_ms | 200 | 50–1000 | ms | gap after a late commit |
| catchup_trigger_ticks | 3 | 1–20 | ticks | CATCHING_UP status |
| catchup_gap_ms | 200 | 50–1000 | ms | inter-tick gap while catching up |
| catchup_max_ticks | 120 | 10–1000 | ticks | before the clock re-bases |
| phase_hard_timeout_ms | 15000 | 5000–60000 | ms | point at which a partition is declared failed |
| max_intent_bytes | 16384 | 1024–65536 | bytes | intent frame size |
| gateway_seal_margin_ms | 150 | 50–500 | ms | intake cut-off before seal |
| intent_max_age_ticks (owned by 02) | 3 | 1–12 | ticks | stale clientTick, REJECT_STALE (ruling in 24) |
| nonce_window | 64 | 16–1024 | count | replay window |
| intent_clock_skew_ms | 600000 | 60000–3600000 | ms | ULID time window |
| intent_dedupe_window_ticks | 17280 | 720–86400 | ticks | dedupe set |
| bus_replicas | 3 | 3–5 | count | durability of BATCH |
| batch_archive_lag_ticks | 60 | 10–720 | ticks | batch archive to object storage |
| partition_target_agents | 25000 | 5000–50000 | agents | PLAYER partition size |
| rebalance_trigger_days | 3 | 1–14 | game days | split/merge trigger |
| host_cpu_target | 0.7 | 0.4–0.9 | ratio | host packing |
| max_moves_per_boundary | 4 | 1–32 | count | moves per snapshot boundary |
| deploy_replay_game_days | 1 | 1–7 | game days | golden replay before deploy |
| snapshot_max_ticks | 60 | 10–360 | ticks | snapshot write deadline |
| partition_failover_missed_heartbeats | 3 | 2–10 | count | partition failure trigger |
| partition_rto_s | 60 | 10–600 | s | partition recovery target |
| world_rto_s | 900 | 300–3600 | s | whole-world recovery target |
| audit_retention_years (owned by 21) | 10 | — | real years | audit log retention (ruling in 24) |
| pg_pitr_days | 35 | 7–90 | real days | PostgreSQL point-in-time recovery window |
| ws_ticket_ttl_s | 60 | 10–300 | s | socket ticket lifetime |
| ws_ping_s | 15 | 5–60 | s | client ping interval |
| ws_idle_timeout_s | 45 | 15–300 | s | idle socket close |
| max_sockets_per_account | 4 | 1–10 | count | concurrent sockets per account |
| ui_connections_refresh_ticks | 30 | 30–720 | ticks | me.connections refresh (shared with 17 and 12) |
| max_book_subs | 4 | 1–16 | count | book channels per socket |
| max_subscriptions_per_socket | 64 | 16–256 | count | subscriptions per socket |
| max_sub_changes_per_s | 10 | 1–50 | per s | subscribe/unsubscribe rate |
| ws_json_frames | false (dev only) | bool | – | JSON frames in development |
| target_client_bytes_per_tick | 4096 | 1024–16384 | bytes | bandwidth target |
| max_req_per_s | 10 | 1–50 | per s | socket read requests |
| max_preview_per_tick | 5 | 1–20 | per tick | intent previews |
| intents_per_tick_per_actor | 20 | 5–50 | intents | 00 §5.5 limit |
| intents_per_tick_per_principal | 100 | 20–500 | intents | cap on a character plus its operators |
| du_hard_cap | 2000 | fixed by 11 | DU | owned by 11 (A1) |
| du_partition_cap | 3000000 | fixed by 11 | DU | owned by 11 (A1) |
| max_frames_per_s | 50 | 10–200 | per s | socket frame rate |
| http_rps_per_ip | 20 | 5–100 | per s | HTTP rate limit per IP |
| http_rps_per_account | 10 | 2–50 | per s | HTTP rate limit per account |
| auth_attempts_per_15min | 10 | 3–50 | count | auth throttling |
| auth_captcha_after_failures | 5 | 2–20 | count | challenge threshold |
| presence_intent_window_ticks | 180 | 60–720 | ticks | presence definition (15 real minutes) |
| ws_soft_buffer_bytes | 1048576 | 262144–8388608 | bytes | backpressure on public channels |
| ws_hard_buffer_bytes | 4194304 | 1048576–33554432 | bytes | slow-consumer close |
| resume_buffer_ticks | 720 | 120–2880 | ticks | `me` resume buffer |
| proto_min_version | current−1 | int | – | minimum client protocol |
| proto_overlap_days | 14 | 7–60 | real days | protocol version overlap |
| session_idle_days | 30 | 1–90 | real days | web session idle expiry |
| session_max_days | 90 | 7–365 | real days | absolute session lifetime |
| access_token_ttl_min | 15 | 5–60 | min | native access token lifetime |
| security_change_hold_hours | 24 | 0–72 | real hours | value-removal hold after a security change |
| platform_key_rotation_days | 90 | 30–365 | real days | platform key rotation |
| gateway_max_sockets | 10000 | 1000–50000 | sockets | gateway capacity |
| api_min_account_age_days | 7 | 0–60 | real days | API eligibility |
| max_api_keys | 5 | 1–20 | count | API keys per account |
| api_sig_skew_s | 60 | 10–300 | s | signed HTTP time window |
| projector_lag_ticks_p95 | 2 | 1–20 | ticks | read-model lag target |
| sg_max_nodes | 400 | 50–2000 | nodes | strategy-graph size |
| sg_max_depth | 32 | 8–128 | levels | strategy-graph depth |
| sg_max_fanout | 16 | 4–64 | edges | strategy-graph fan-out |
| ai_workers_per_partition | cores − 2 | ≥ 1 | threads | AI worker pool |
| entropy_epoch_ticks | 720 | 120–2880 | ticks | entropy epoch length |
| entropy_reveal_lag_ticks | 1000 | 100–10000 | ticks | reveal delay (old vision value) |
| ip_hash_salt_rotation_days | 30 | 7–90 | real days | IP hash salt rotation |
| export_sla_days | 30 | 1–30 | real days | data export SLA |
| deletion_grace_days | 14 | 0–30 | real days | deletion grace period |
| slo_tick_lateness_p99_ms | 500 | 100–2000 | ms | SLO |
| slo_delta_p95_ms | 500 | 100–2000 | ms | SLO |
| slo_world_availability | 0.999 | 0.99–0.9999 | ratio | SLO |
| tick_trace_sample | 60 | 1–720 | 1 in N | tick tracing sample rate |
| migration_max_lock_ms | 1000 | 100–5000 | ms | database migration locks |
| ui_js_budget_kb | 200 | 100–400 | KB gz | trade screen JS budget |
| ui_perf_tick_render_ms | 8 | 4–16 | ms | tick render budget |
| dev_tick_ms | 5000 (dev only) | 100–5000 | ms | fast clock in local development |
| npc_du_per_tick_per_partition | 500000 | 100000–2000000 | DU | NPC work budget |
| gateway_queue_max | 200000 | 10000–1000000 | intents | gateway queue while sealing is blocked |
| replay_max_ticks | 8640 | 720–86400 | ticks | replay request size |
| max_keys_per_session | 2 | 1–4 | count | signing keys per session |
| tz_change_cooldown_days | 30 | 1–180 | real days | timezone change limit (L12 day boundary) |

## 2. Decisions

- Pipeline phase ownership by partition kind, P7–P14 (§3.3.2). DEFAULT.
- Phase wall budgets of 4,250 ms out of 5,000 ms (§3.3.3). DEFAULT.
- Overrun policy: wait, never skip; catch-up gap; clock re-base after 120 ticks (§3.3.4). DEFAULT.
- Load levers enter only as `sys.load_scale` inputs, so replay stays deterministic (§3.3.4). DEFAULT.
- Seal margin is 150 ms, measured on the coordinator's receive clock (§3.4.1). DEFAULT.
- Canonical order is `SHA-256(entropy(N) ‖ intentId)` (§3.4.4). DEFAULT.
- Home rules: player-controlled institutions are homed with their owner; biz and prop are homed by city; hidden sessions with the victim; contracts with the lowest-id party as anchor (§3.5.1). DEFAULT.
- Inter-partition clearing accounts `sys:ipc:A:B`, with a zero-sum invariant (§3.5.3). DEFAULT.
- Rebalancing only at day-close snapshot boundaries (§3.5.5–3.5.6), keeping the old vision's rule.
- Partition-independent logical state hash as a modular sum of entity hashes (§3.6.6). DEFAULT.
- Inbound phase messages are recorded in a `PHASE` stream so one partition can recover alone (§3.7.4). DEFAULT.
- Retention table (§3.7.6): batches kept forever in object storage; events moved to cold storage after 1 game year (old vision rule kept). DEFAULT for the remaining values.
- Channel catalog adopts 17 §2.6 unchanged and adds `status` (§3.8.2).
- Rate limits: 20 per actor (00 §5.5) plus a cap of 100 per principal across the character and its operators (§3.8.6). DEFAULT (Mathis may override).
- Intent signatures with per-session Ed25519 keys over RFC 8785 canonical JSON (§3.9.1). DEFAULT.
- MFA is required for API keys, staff, and top-100 board players (§3.9.3), from the old vision's "2FA for top players".
- Expert API is unlocked, not public from day one: FULL account, MFA, account age 7 real days, LIC2, no automation sanction. Resolves V3 Part 13 Q3 (§3.10.3). DEFAULT.
- Entropy epochs of one game day; commitment published two epochs ahead; reveal 1,000 ticks after the epoch ends; player-party rolls do not depend on the world seed, so players can verify them (§3.12). DEFAULT.
- Hosting: one EU dedicated server for alpha; from beta, a container platform in one EU region (3 AZs) with a DR region; edge gateways optional. Resolves roadmap Q7 and vision/02-multiplayer §17 Q7 (§3.13.4). DEFAULT.
- Deletion anonymizes the character and keeps its pseudonymous world history; unique assets go to the estate process (§3.14.4). DEFAULT.
- Sandbox is unranked and carries over only Academy completion and sandbox badges. Resolves roadmap Q4 (option A, tightened) and V3 Part 11's solo-sandbox point (§3.17.4). DEFAULT.
- Roadmap Q5 resolved: shared challenges and the AI tournament run server-side with committed seeds (§3.17.4).
- Roadmap Q8: Held is off in sandbox mode (option B). Recorded in §3.17.4 as a DEFAULT; 13 owns the rule.
- Roadmap Q1 resolved: the server skeleton is built in S1, before markets; AI and espionage in S5; the sandbox is for learning only (§12.4). DEFAULT.
- vision/02-multiplayer §17 Q8 ("Phase 0 first") is superseded by §12.4's order (the server early, the sandbox as a learning tool).
- Toolchain DEFAULTs (§3.1.4, kept from the partial file): Node 24 LTS, Next 16.4, PostgreSQL 18, NATS JetStream, Valkey 8, ClickHouse, Better Auth, uWebSockets.js.
- Build units, stages S0–S10 and gates G1–G4 (§12). DEFAULT.

## 3. Interfaces assumed

- **02**: `PartitionEngine` (§2.6); safe-mode re-execution; detmath; RNG streams seeded as in §3.12.2; `migrate()` hook on snapshot load; calendar re-base hook for `sys.clock_rebased`.
- **03**: holds as reservations (`available = balance − Σholds`); `sys` TRANSFER accounts usable as `ipc:A:B`; reason codes for `sys:compensation` (FAUCET) and clawback; the owner chain used for authority checks.
- **11**: block DU costs; agent cadence staggering; DU caps per A1; `lab.graph_save` intent; mandate scopes.
- **12**: `ConnectionEntry` serialization identical for legit and hostile entries; refresh limit of 1 per game hour; presence factor read from `sys.presence`; player-party rolls exposed as `{tick, rollDomain, subjectIds, rollIndex, threshold or band, outcome}`.
- **13**: Held and sanction state readable at P1 (unit 13.A); discovery rules decide when SEALED events become visible to a requester.
- **14**: license and rank state; protection windows; country change once per 180 days; estate process for deleted or dormant characters.
- **15**: anti-cheat thresholds and enforcement ladder; guest limits; opt-in presence indicator; chat stored in schema `social`; the Wire.
- **16**: news text pre-localized in en and fr; NPC aggregation when budgets bind.
- **17**: channel table §2.6 (adopted); screen 32 (API) uses flag `api.eligible`; diegetic halt overlay; tick ring.
- **20 §3.9**: gates G1–G4 as defined in §12.4; invariant registry API; regression-seed format; bot swarm uses `packages/sdk`.
- **21**: two-person approval rule; ad receipt verification producing `sys.ad_grant`; export and deletion legal SLAs; age gate producing `ageBand`; commerce schema outside the engine.
- **22**: content split into `content/public` and `content/server`; asset groups for MARKET partitioning.
- **23**: params registry with ranges, used by the `sys.param_change` validator.

## 4. Content needed (22)

- Reference mid-range Android device for the performance budgets (§3.17.3), named in 22 or in 17's device list.
- MARKET asset-group table (about 12 groups: EQ per bloc ×5, BOND-ALL, FX-ALL, CMD-ALL, CRYPTO-ALL, DERIV per bloc) mapping every one of the 400 instruments.
- Reject-code catalog with en/fr i18n keys for platform codes: `BAD_SIGNATURE`, `BAD_SCHEMA`, `DUPLICATE`, `RATE_LIMITED`, `LATE_EXACT`, `WORLD_HALTED`, `AUTH_NOT_PERMITTED`, `PLATFORM_NO_RESULT`, `CHANNEL_DENIED`, `CHANNEL_REVOKED`, `SESSION_REVOKED`, `TOO_MANY_SOCKETS`, `SLOW_CONSUMER`, `UPGRADE_REQUIRED`.
- Diegetic halt and maintenance reason keys (for example "Trading halted by the Exchange", "Scheduled exchange maintenance", "Clock synchronization").
- Generated-label word lists for anonymized characters (for example "Estate of a departed trader #NNNN").
- Patch-notes key template for `sys.engine_upgraded`.
