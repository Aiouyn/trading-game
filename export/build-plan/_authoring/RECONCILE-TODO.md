# Reconciler to-do (collected from writer reports)

## W05 (05)
- 05 uses MarketPorts + createMarketsModule(ports) (now G6.1). Streams mkt/pool, mkt/bg, mkt/alloc mapped onto mkt.npc_flow / mkt.lp_quote; consider adding rows in 02 registry.
- 23 lacks keys: circuit-breaker levels, bond halt, IPO band, block minimum, 535 cut-off, volume tiers (constants in cards).

## W02 (02, 20A, 20B)
- Proposed GLOBAL-CONTEXT additions: Boundary *_OPEN and PHASE_CHANGE; channels 'NPC','ADMIN'; ModuleDef.services (ledger, calendarEvents, spawnCharacter); LedgerProvider.testHooks; TableDef.home + indexes; partyIds on events/emit; createEngineTestWorld; engine folder packages/engine/truth (module 20); negative test title "<INV-id> negative".
- 03 assumed installLedgerProvider/createLedgerApi; 02 has services.ledger, createPartition, testHooks -> align.
- Tape doc cited in 20 §3.7.3 missing.

## W01 (19A, 23, 19B, 19C, 19D)
- Engine folder for 19: packages/engine/sys; packages/engine/index.ts owned by T19B-02.
- Allow engine value-import of @tycoon/protocol/canon; sdk may import platform/deltas/apply-ops; params.ts exports PARAM_KEYS.
- T02-11 register sys./adm. namespaces for 19. T02-14 expose per-round runtime steps; inbox ordering by 19 canonicalKey; PLAYER hash partitionOf -> 19 SHA-256.
- T20B-19 depend on T19D-08, reuse runSwarm.
- 19 §11.2 tables need: SystemInput.keyId, entropy_secret_sealed table, tick_record.genesis_config_hash, SealedIntentRow.receivedSeq.
- Registry gaps: grid_mw_<district>, cityRentMult Isla Serena.

## W02 contradictions resolved (verify consistency later)
- R29 maintenance; SYS_QUARANTINED (D417); partition kinds per 19 §2.1; undo log not B-tree; catch-up per 02 §3.19; rumor band per 20; intentsRoot order-free.

## W06 (06A/B/C)
- 02 stream registry lacks ast.earn, ast.meme (meme uses ast.crypto_hype key MEME_SPAWN).
- 03 reason codes: missing CRY_TOKEN_LAUNCH_FEE; DEFI_NETWORK_FEE, CRY_TOKEN_MINT, CMDTY_SPOILAGE need qty mint/burn templates.
- 05 InstrumentPort lacks preTradeGate, peGuard. 08 FundsPort.etfFlows should include indexRebalanceFlows.
- New intents/events: mkt.distressed.order/cancel, mkt.series.listed, mkt.swap.payment/terminated.
- Indices owned by 06: T05-19 must read 06's levels.
- k_mr formula scaling question (06 §3.13.3 vs daily GARCH) -> QUESTION for Mathis/owner; kept as written.
- Document extension registries (registerPortExtension, registerModelValuer, registerRfqProduct, registerViewExtension) and fear06 accessor in GLOBAL-CONTEXT.

## W03 (03)
- Wiring: services.ledger = ledgerProvider (createPartition, globalCheck, testHooks); phases.P13 -> runP13; cross-partition cash in P2.
- 03#36/37/42 in T03-29 (S10, deps T20B-02/06–09/11), long mode TYCOON_LONG.
- Registry gaps: led_code_alarm_mult, led_code_alarm_floor, restricted-cash 72h window, stab_lever_ranges, tax-rate ranges, $5,000 protected floor.
- Contradictions: 14 §3.13 vs 03 §3.14.5 personal insolvency (followed 03; 14 cards must align); fresh start = top-up to $5,000 (R17); 03#11 expects 1 micro-unit vs arithmetic 2 -> QUESTION.
- GLOBAL-CONTEXT: add availableFor/placeCashFor, PostOpts extension fields, reason-code extension registration, P13 hook.
- 02 needs: per-partition totals in globalCheck, id generator in apiFor, COORD tables replicated read-only, entity.partitionId refresh on rebalance, postings archive.
- Message names to confirm: acct.insolvency.estate.sell/done, life.freshStart.topup (14), law.garnishment.persistent (13); LAW_GARNISHMENT requested by 13.
