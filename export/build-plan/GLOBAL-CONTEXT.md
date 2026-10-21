# GLOBAL CONTEXT (included at the top of every task pack)

You are implementing one task of **TYCOON**, a persistent multiplayer financial game. The full design is a 3 MB specification; you only receive the parts your task needs. This global context is binding on every task. If anything in your task pack seems to contradict this file, this file wins for code shape (names, packages, APIs) and the spec excerpts win for game rules and numbers.

## G1. How to work

1. Read the whole pack before writing code: this context, the task card, the spec excerpts, the upstream exports, the parameters, the decisions and the acceptance tests.
2. Create exactly the files the card lists (you may add small private helper files inside the same folder; list them in your report). Never edit files owned by another task except where the card says "edit".
3. Use only the upstream exports the pack shows. If you need something that is not exported, stop and report "MISSING EXPORT: <task> <symbol>" instead of inventing it.
4. Every spec rule in your excerpts must be implemented as written. Never simplify a formula, skip a branch, or leave a TODO that changes behaviour. Where the spec says DEFAULT, use that default.
5. Every acceptance test assigned to the task becomes at least one automated test whose name starts with its id, e.g. `it('05#8 market buy of q ADV moves price by s + Y σ_d √(q/D)', …)`.
6. Finish with: `pnpm -w lint && pnpm -w typecheck && pnpm -w test --filter <your package>` all green. Then write the short report described in G12.

## G2. Repository layout (monorepo root = repository root)

pnpm workspaces + Turborepo. Package scope `@tycoon/*`.

```
apps/web        Next.js 16 App Router client (read node_modules/next/dist/docs/ before writing Next code;
                Next 16: proxy.ts not middleware.ts, async params/cookies, Turbopack default)
apps/gateway    WebSocket gateway (uWebSockets.js)       apps/world      world host: coordinator + partitions
apps/projector  event consumers -> read models           apps/jobs       BullMQ jobs
apps/admin      admin console (Next.js 16)               apps/harness    Truth Machine runners (20)
apps/native     Capacitor shell
packages/engine/core        02 time engine, store, rng, dmath, fixed, ids, canon, testing
packages/engine/ledger      03     packages/engine/macro       04     packages/engine/markets   05
packages/engine/assets      06 (equity, etf, bond, fx, commodity, crypto, defi, derivatives, collectibles)
packages/engine/banking     07     packages/engine/funds       08     packages/engine/business  09
packages/engine/realestate  10     packages/engine/lab         11     packages/engine/conflict  12
packages/engine/law         13     packages/engine/progression 14     packages/engine/social    15
packages/engine/world       16     packages/engine/index.ts    PartitionEngine factory
packages/protocol (zod schemas, canonical encoder)   packages/content (22 catalogs)   packages/params (23)
packages/platform (db, bus, auth, telemetry; NOT deterministic)   packages/ui (17)   packages/i18n (en, fr)
packages/sdk   packages/config (tsconfig, eslint incl. determinism rules, tailwind, vitest presets)
infra/  tests/ (Playwright e2e, protocol contract tests)  docs/
```

Each engine module folder contains: `schema.ts` (entity types + table defs), `rules/*.ts` (pure functions), `intents.ts`, `events.ts`, `phases.ts`, `invariants.ts`, `views.ts`, `params.ts`, `index.ts` (exports the `ModuleDef`), and tests next to the code as `*.test.ts`.

Import rules (CI-enforced): engine modules import only `@tycoon/engine/core`, the engine modules they hard-depend on, `@tycoon/params`, `@tycoon/content`, and types from `@tycoon/protocol`. The engine never imports `platform`, `ui`, Node built-ins, network, filesystem or clocks.

Toolchain: TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Node 24 LTS, Vitest (+ fast-check for property tests), zod 4, Playwright, Tailwind 4, Zustand 5, TanStack Query, next-intl, Drizzle + PostgreSQL 18, Valkey 8, NATS JetStream, ClickHouse, BullMQ, Better Auth, OpenTelemetry, three.js (city), TradingView Lightweight Charts 5.

## G3. Units and conventions (00 §3)

| Quantity | Type | Rule |
|---|---|---|
| Money | `Money = bigint` micro-units (1e-6) of a currency, always with a `Ccy` | display `$12.4k`, `$3.21M`, `$1.05B`, `$4.2T` |
| Currency | `Ccy = 'FDL' \| 'EUN' \| 'PYN' \| 'NKR' \| 'SRL'` | FDL is the reserve currency |
| Price | `Price = bigint` micro-units per unit of asset | |
| Quantity | `Qty = bigint` in the asset's base lot | each asset has `lotSize`, `qtyDecimals` |
| Rates | `number` (float64) in model math; persisted as integer `rateE6` (1e-6) when they enter the ledger | |
| Probability | `number` in [0,1] | |
| Time | `Tick = number` (integer since genesis) | |
| Compute | integer PFLOP-days × 1000 | display GPUh (1 PFLOP-day = 10 GPUh) |
| Energy | integer kWh. Data: DQU float, persisted ×1000 integer | |

- All model math in float64; conversion to integers only at the ledger boundary with round-half-to-even through `toMoney(x, ccy)` / `toQty` / `toPrice`. No other code converts floats to money.
- Money crossing the protocol is a decimal string.
- IDs: `<kind>_<26 chars>` generated only by `ctx.newId(kind)` (deterministic). Authored ids like `ast_EQ_HALC` come from content.
- Parameters: `PARAM.snake_case` keys live in `@tycoon/params`; code reads them with `ctx.params.num('key')`, `ctx.params.money('key', ccy)` etc. Never hard-code a number that has a PARAM key. Param defaults in the registry are in display units: money in dollars (convert with `toMoney`), `%` as fractions, "game days" × 720 = ticks, "real days" × 17,280 = ticks.
- Notation: `σ(x)=1/(1+e^-x)`, `clamp`, `ln`, `dt = 1/262080` (one tick in game years).

## G4. Time (00 §5.1)

5 real seconds per tick; 720 ticks per game day (= 1 real hour); 30 ticks per game hour; one tick = 2 game minutes. Week = 7 game days (Mon–Fri trading, Sat–Sun weekend). Quarter = 13 weeks = 91 game days, months 28/28/35 days. Year = 364 game days = 262,080 ticks. Chapter = 8 real weeks = 1,344 game days. Real day = 24 game days.
Trading day tick-of-day `t`: pre-market 0–59; opening auction t=60; continuous 61–539; closing auction t=540; after-hours 541–719. Accruals (interest, rent, wages, fees) post at day close t=719. Business operations run once per game hour, staggered: an entity runs when `tickOfDay mod 30 == fnv1a32(id) mod 30`.

## G5. Tick pipeline (00 §5.2)

```
P0 ingest  P1 validate  P2 calendar  P3 world(16)  P4 npc(05,16)  P5 ai(11)  P6 match(05,06)
P7 clear(07)  P8 finance(07,08)  P9 real(09,10)  P10 conflict(12)  P11 law(13)  P12 social(14,15)
P13 ledger(03: commit postings atomically, settle/release holds, assert invariants)  P14 emit
```
A phase may read any committed state and the outputs of earlier phases of this tick; it writes only its own module's tables and queues postings for P13. Postings never commit before P13. A failed invariant rolls the tick back and replays it in safe mode. Consequences of tick N that other modules react to land in tick N+1 (via `ctx.send(..., 'NEXT')` or events).

## G6. The engine module contract (binding names; owned by tasks of unit 02)

```ts
// @tycoon/engine/core — primitives
export type Tick = number; export type Money = bigint; export type Qty = bigint; export type Price = bigint;
export type Ccy = 'FDL' | 'EUN' | 'PYN' | 'NKR' | 'SRL'; export type Id = string;
export type PhaseId = 'P0'|'P1'|'P2'|'P3'|'P4'|'P5'|'P6'|'P7'|'P8'|'P9'|'P10'|'P11'|'P12'|'P13'|'P14';
export type Visibility = 'PUBLIC' | 'PARTIES' | 'PRIVATE' | 'SEALED';
export type Boundary = 'HOUR' | 'DAY_OPEN' | 'DAY_CLOSE' | 'WEEK_CLOSE' | 'MONTH_CLOSE' | 'QUARTER_CLOSE' | 'YEAR_CLOSE' | 'CHAPTER_CLOSE';
export class SortedMap<K extends string, V> { get(k): V|undefined; set(k, v): SortedMap<K,V>; delete(k); has(k); size; entries(): Iterable<[K,V]> /* byte order of key */; keys(); values(); }
export class SortedSet<K extends string> { /* same ordering */ }
export function cmpStr(a: string, b: string): -1|0|1;            // UTF-16 code-unit byte order
export function sortBy<T>(arr: readonly T[], key: (t: T) => (string|number|bigint)[]): T[]; // stable, total
export * as dmath from './dmath';   // exp, ln, log2, log10, pow, sin, cos, atan, atan2, tanh, sigmoid, erf, erfc,
                                    // normCdf, normInv, lgamma, expm1, log1p, kahanSum, clamp, lerp,
                                    // bsPrice, bsGreeks, solveBisection(f,a,b,iters), newton(f,df,x0,iters), cholesky
export function roundHalfEven(x: number): number;
export function toMoney(x: number, ccy: Ccy): Money; export function toQty(x: number, lotScale: bigint, mode?: 'HALF_EVEN'|'LOT_FLOOR'): Qty;
export function toPrice(x: number): Price; export function fromMoney(m: Money): number;
export function divRoundHalfEven(n: bigint, d: bigint): bigint; export function mulRate(m: Money, rateE6: bigint): Money;
export function mulRateE12(m: Money, rateE12: bigint): Money; export function accrue(m: Money, annualRateE6: bigint, days: number): Money;
export function notional(qty: Qty, price: Price, lotScale: bigint): Money; export function fxConvert(m: Money, rateE6: bigint): Money;
export function allocate(total: bigint, weights: readonly { id: string; w: bigint }[]): Map<string, bigint>; // largest remainder, parts sum exactly
export function proRata(total: bigint, holdings: SortedMap<string, bigint>): SortedMap<string, bigint>;
export function assertFinite(x: number, ctx: string): number; export function safeDiv(a: number, b: number, fallback: number): number;
export function sha256(bytes: Uint8Array): Uint8Array; export function fnv1a32(s: string): number;
export function canonEncode(v: unknown): Uint8Array;  // canonical encoder (from @tycoon/protocol, re-exported)
export function ticksToGameDate(t: Tick): GameDate; export function calendarOf(t: Tick): CalendarInfo;

export interface Rng {            // one deterministic stream; keys '<module>.<purpose>[:<subjectId>]' (02 §3.10.4)
  next(): number; u53(): number; uOpen(): number; int(n: number): number; bernoulli(p: number): boolean;
  normal(): number; studentT(nu: number): number; exponential(lambda: number): number; poisson(lambda: number): number;
  kouJump(pUp: number, etaUp: number, etaDown: number): number;
  categorical<T extends string>(weights: readonly [T, number][]): T; shuffle<T>(a: T[]): T[];
}

export interface CalendarInfo { tick: Tick; tickOfDay: number; gameDay: number; weekday: 0|1|2|3|4|5|6; isTradingDay: boolean;
  gameHour: number; boundaries: ReadonlySet<Boundary>; quarter: number; year: number; chapter: number; }

export interface TableDef<T> { name: string /* '<module>.<table>' e.g. 'mkt.order' */; module: string; idOf(e: T): Id; schema?: unknown }

export interface StoreRead {
  get<T>(table: string, id: Id): T | undefined;
  iter<T>(table: string): Iterable<T>;                       // sorted by id (byte order)
  range<T>(table: string, fromId: Id, toId: Id): Iterable<T>;
  index<T>(table: string, indexName: string, key: string): Iterable<T>; // secondary index declared in TableDef, sorted by id
  count(table: string): number;
}
export interface Store extends StoreRead {                    // writes check ownership: OwnershipViolation if table.module !== caller
  put<T>(table: string, entity: T): void;                    // records undo entry; normalizes -0; rejects NaN/Infinity
  del(table: string, id: Id): void;
}

export interface EngineEvent { tick: Tick; seq: number; kind: string; subjectIds: Id[]; payload: unknown; visibility: Visibility }
export interface PhaseMessage { fromEntity: Id; toEntity: Id; phase: PhaseId; tick: Tick; kind: string; body: unknown; canonicalKey: string }

export interface PhaseCtx {
  readonly tick: Tick; readonly phase: PhaseId; readonly cal: CalendarInfo; readonly header: TickHeader;
  readonly module: string; readonly safeMode: boolean;
  readonly store: Store;
  rng(key: string): Rng;                                     // only the module's own registered streams
  newId(kind: string): Id;
  readonly params: ParamsView;                                // from @tycoon/params
  readonly content: ContentView;                              // from @tycoon/content
  readonly ledger: LedgerApi;                                 // from 03 (see G7); throws if 03 not loaded
  readonly holds: HoldApi;                                    // from 03 (see G7)
  emit(kind: string, subjectIds: Id[], payload: unknown, visibility: Visibility): void;
  send(toEntity: Id, kind: string, body: unknown, when: 'B1' | 'B2' | 'B3' | 'NEXT'): void;
  inbox(kind?: string): readonly PhaseMessage[];              // messages delivered to this phase, sorted by canonicalKey
  delta(recipient: Id | `pub:${string}`, channel: string, ops: unknown[]): void;  // client deltas (P14 flush)
  fail(invariantId: string, entityIds: Id[], observed: string, expected: string): void; // never throw for control flow
}
export interface ValidateCtx extends Omit<PhaseCtx, 'emit' | 'send' | 'delta'> {}   // P1: read state, place holds

export interface SealedIntent<P = unknown> { intentId: Id; actorId: Id; onBehalfOf?: Id; mandateId?: Id; kind: string;
  payload: P; channel: 'UI'|'API'|'AI'|'MANAGER'|'SYSTEM'; orderKey: string; tick: Tick }
export interface Reject { code: string /* '<MOD>_<REASON>' e.g. 'MKT_INSUFFICIENT_FUNDS' */; params?: Record<string, string> }
export interface IntentHandler<P = unknown> {
  kind: string;                       // namespaced: mkt.*, bank.*, fund.*, biz.*, prop.*, lab.*, ops.*, law.*, soc.*, life.*, acct.*
  schema: import('zod').ZodType<P>;   // registered in @tycoon/protocol too
  applyPhase: PhaseId;                // phase in which apply() runs (P1 if immediate)
  validate(ctx: ValidateCtx, i: SealedIntent<P>): Reject | null;   // P1, in fair order; place holds here
  apply(ctx: PhaseCtx, i: SealedIntent<P>): Reject | null;          // effect; may still reject (PARTIAL/REJECTED)
}
export interface InvariantImpl { def: InvariantDef /* 20 §2.1 */; check(ctx: InvariantCtx): { ok: true } | { ok: false; entityIds: Id[]; observed: string; expected: string } }
export interface ViewHandler<A = unknown, R = unknown> { id: string; schema: import('zod').ZodType<A>; run(store: StoreRead, args: A, viewer: ViewerContext): R }

export interface ModuleDef {
  id: string;                         // build unit id, e.g. '05', '06A'; module number = first two chars
  module: string;                     // '05'
  dependsOn: string[];                // unit ids (hard edges, 19 §12.2)
  tables: TableDef<any>[];            // tables this module owns (only it may write them)
  streams: string[];                  // RNG stream key prefixes it owns, e.g. ['mkt.factor', 'mkt.idio']
  phases: Partial<Record<PhaseId, (ctx: PhaseCtx) => void>>;
  boundaries?: Partial<Record<Boundary, (ctx: PhaseCtx) => void>>; // run in P2 when the boundary is in cal.boundaries
  intents: IntentHandler<any>[];
  events: Record<string, import('zod').ZodType>;   // event kind -> payload schema
  invariants: InvariantImpl[];
  views: ViewHandler<any, any>[];
  genesis?(ctx: PhaseCtx): void;     // creates the module's initial world state from content at world creation
}
export function defineModule(m: ModuleDef): ModuleDef;

// testing (the main tool of every task's tests): @tycoon/engine/core/testing
export interface TestWorld {
  readonly store: StoreRead; readonly tick: Tick;
  submit(actorId: Id, kind: string, payload: unknown, opts?: Partial<SealedIntent>): Id;  // queued for next step
  step(): TickOutcome;                 // runs one full tick P0..P14
  runTicks(n: number): TickOutcome[]; runUntil(pred: (w: TestWorld) => boolean, maxTicks: number): TickOutcome[];
  runToTickOfDay(t: number): void; runGameDays(d: number): void;
  events(filter?: { kind?: string; since?: Tick }): EngineEvent[];
  postings(filter?: { reason?: string; entityId?: Id; since?: Tick }): Posting[];
  intentResult(intentId: Id): IntentResult | undefined;
  balance(entityId: Id, code: number, ccy: Ccy, sub?: string): Money;
  view<R>(viewId: string, args: unknown, viewer?: Id): R;
  setParam(key: string, value: unknown): void;     // test-only override
  stateHash(): string; snapshot(): Uint8Array; 
  spawnCharacter(opts?: { cash?: Money; license?: string; rank?: string; city?: string }): Id; // available once 14.A is built
  asSystem<T>(fn: (ctx: PhaseCtx) => T): T;       // test-only direct state setup (bypasses ownership; never in prod)
}
export interface TickOutcome { tick: Tick; committed: boolean; safeMode: boolean; failedInvariants: string[]; stateHash: string }
export function createTestWorld(opts: { modules: ModuleDef[]; seed?: string; partitions?: number; params?: Record<string, unknown>;
  content?: 'full' | 'minimal' | ContentOverrides; startTick?: Tick }): TestWorld;
```

### G6.1 Ports for later modules (dependency inversion)

A module may never import a module built after it. When its rules need data from a later module (for example 05 needs fundamental values from 09 or index weights from 08), it declares a **port**: a TypeScript interface in its own `ports.ts` (e.g. `MarketPorts`), and its factory takes the implementations: `createMarketsModule(ports: Partial<MarketPorts>)`. The later module exports an implementation of that port, and `packages/engine/index.ts` wires them when building the world. A missing port uses the default the spec gives for "module not present" (stated in the card), never an invented rule.

## G7. Ledger and holds API (binding names; owned by tasks of unit 03)

All money and asset quantities move only through these template functions (03 §3.3.3). Each validates cheaply, queues one balanced `Entry` for P13 and returns its `entryId`. Codes come from 03's reason-code catalog (each code has exactly one class: FAUCET, SINK, TRANSFER, CREDIT_CREATE, CREDIT_DESTROY, REVALUE; a code may only use its allowed templates).

```ts
export interface PostOpts { refs?: Id[]; holdId?: Id; valueLegA?: number; valueLegB?: number; sub?: string; memo?: string }
export interface LedgerApi {
  pay(from: Id, to: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;                 // TRANSFER
  swapAsset(buyer: Id, seller: Id, assetId: Id, qty: Qty, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;
  mint(to: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;                          // FAUCET, no elastic sector
  burn(from: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;                        // SINK
  elasticIn(sector: Id, to: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;          // FAUCET from hh/frm/row
  elasticOut(from: Id, sector: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;       // SINK to hh/frm/row
  lend(bank: Id, borrower: Id, amt: Money, ccy: Ccy, code: string, loanId: Id, o?: PostOpts): Id;   // CREDIT_CREATE
  repay(borrower: Id, bank: Id, principal: Money, ccy: Ccy, code: string, loanId: Id, o?: PostOpts): Id; // CREDIT_DESTROY
  cbCredit(cb: Id, bank: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;
  cbCreditUnwind(bank: Id, cb: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;
  accrue(e: Id, amt: Money, ccy: Ccy, code: string, drAcct: number, crAcct: number, o?: PostOpts): Id; // REVALUE, one entity
  accruePair(a: Id, b: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;
  fx(a: Id, b: Id, ccy1: Ccy, amt1: Money, ccy2: Ccy, amt2: Money, code: string, o?: PostOpts): Id;
  moveQty(from: Id, to: Id, assetId: Id, qty: Qty, bookValue: Money, ccy: Ccy, code: string, o?: PostOpts): Id;
  reclass(e: Id, amt: Money, ccy: Ccy, code: string, fromAcct: number, toAcct: number, o?: PostOpts): Id;
  // reads (committed state + this tick's queued entries are NOT included unless stated)
  balance(accountKey: string): Money; cash(entityId: Id, ccy: Ccy): Money; available(entityId: Id, ccy: Ccy): Money; // cash − active holds
  position(entityId: Id, assetId: Id): Qty; availableQty(entityId: Id, assetId: Id): Qty;
  netWorth(entityId: Id): Money;   // marked, in reporting currency (03 §3.10)
}
export interface HoldApi {
  placeCash(owner: Id, ccy: Ccy, amt: Money, expiresTick: Tick, ref: Id): Id | Reject;   // Reject {code:'LED_INSUFFICIENT_FUNDS'}
  placeQty(owner: Id, assetId: Id, qty: Qty, expiresTick: Tick, ref: Id): Id | Reject;
  release(holdId: Id): void; reduce(holdId: Id, byAmount: bigint): void; get(holdId: Id): Hold | undefined;
}
```
Entity kinds (00 §5.3): `chr cmp biz prop fnd bnk ins spv gov cbk ccp exc rat reg crt npc hh frm row ali sys`. Every entity has one balance sheet (registered with 03 via `registerEntity(ctx, {id, kind, reportingCcy, ownerId, homeCity?})`, exported by 03).

## G8. Determinism rules (02 §3.7, 19 Rule 3.6.2) — lint-enforced in packages/engine

Forbidden in engine code: `Date`, `performance`, `Math.random`, `crypto` randomness, timers, `process`, `globalThis`, `Intl`, `toLocaleString`, `localeCompare`, `async/await`/Promises, `for…in`, iterating `Object.keys/values/entries` of map-like objects, `Map`/`Set` iteration where order matters (use `SortedMap`/`SortedSet`), `Array.sort` without a total comparator (use `sortBy`), `JSON.stringify` for hashing/persistence (use `canonEncode`), `WeakMap/WeakRef`, `Math.exp/log/pow/sin/cos/tan/atan2/cbrt/hypot/...` (use `dmath`), `Math.round` (use `roundHalfEven`), `Number` for money or quantities. Allowed raw math: `+ - * /`, `Math.sqrt/abs/floor/ceil/trunc/min/max/sign/fround/imul/clz32`.
NaN/Infinity are illegal in state. Ties are broken by entity id then intent id. Iterate collections only in sorted order. Rejection sampling is forbidden; each variate uses a fixed number of draws. A module may draw only from its own streams. Split money into parts only with `allocate`. No exceptions for control flow: report impossible states with `ctx.fail`.

## G9. Events, intents, rates

- Event kinds are namespaced like intents (`mkt.fill`, `acct.rank.up`); every kind has a zod payload schema in the module's `events.ts` and is registered in `@tycoon/protocol`. Visibility per 00 §5.6; SEALED = court evidence only.
- Intent results: `ACCEPTED | REJECTED | PARTIAL | QUEUED_NEXT` with stable reject codes `<MOD>_<REASON>` (localized via i18n keys `err.<code>`).
- Rate limits: 20 intents per tick per character + 20 per operator, ≤ 100 combined (enforced by 19/02 intake, not by modules). AI: 2,000 DU per tick per player.
- Fairness: humans, player AIs and delegated managers use the same intents. No private API.
- L11 privacy: nothing automatically reveals a player's holdings, strategy or style. Disclosure only by opt-in, legal filing rule, or in-game espionage.

## G10. Locked decisions (never change)

L1 one persistent world, invisible partitions. L2 breach floor 1%. L3 hidden sessions accumulate progress (ceiling 0.85). L4 visual direction Ink & Brass (+ Shadow palette for Lab/Security). L5 16+, no gambling mechanics. L6 fully fictional brands, cities, currencies. L7 monetization cosmetic only, never money/rank/odds, no loot boxes. L8 English first, French second, string keys from day one (no raw UI text). L9 1 real hour = 1 game day. L10 derivatives, IPOs, takeovers gated behind late licenses; player tokens later (flag off); no prediction markets, no vice businesses. L11 no automatic leaks. L12 rewarded ads $250 each, max 10/day, only under $1,000 NW. L13 approved features (player IPOs, funds, honeypots, AI tournament, rival funds, world events, rumors, bankruptcy comeback, trade journal, "Why it moved", company building). L14 rebuilt from scratch. L15 full ambition, nothing cut.
Spec precedence when two texts disagree: 24 Decisions register > the owning module > 23 Parameter registry > other text. 22 catalogs win on content names and counts.
Conflict/cyber content is purely game-mechanical (named verbs, probabilities, budgets, cooldowns). Never implement or describe real-world attack techniques.

## G11. Shared enums (00 §5.8)

Ranks `R0 Broke, R1 Hustler, R2 Owner, R3 Mogul, R4 Tycoon, R5 Titan, R6 Dynasty`. Licenses `LIC0 Cash, LIC1 Retail, LIC2 Pro, LIC3 Derivatives, LIC4 Institutional`; charters `CH_BANK, CH_FUND, CH_INSURER, CH_EXCHANGE_MEMBER, CH_CUSTODIAN`. AI tiers `T0 … T5`. Business tiers `B1 … B6`. Property tiers `working, mid, prime, trophy`. Severity `S1 … S6`. World: 5 blocs (Federal Union FDL, Euran Compact EUN, Pacific League PYN, Nordic Alliance NKR, Southern Coalition SRL), 15 cities (3 per bloc) + Isla Serena (FDL). Player start: $5,000 FDL, LIC0, R0, home city among the 3 FDL cities, 72 real hours protection.

## G12. Your report (end of task)

```
TASK <id> DONE | BLOCKED
files: <list with line counts>
tests: <n passed> / <n>; acceptance tests covered: <ids>
exports: unchanged from card | changed: <diff>   (changing exports requires reviewer approval)
missing exports / spec questions: <list or none>
```
