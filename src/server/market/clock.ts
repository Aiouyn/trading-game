// Single-process authoritative quote clock (M1-05).
// One MockFeed (the ShockFeed subclass, M1-09), seed 17, advanced on FEED_TICK_MS. Reads never step it.
// Not multi-instance (same limit as the auth file store).
// M1-09: each step also publishes that tick's Wire story (src/market/wireStories.ts) and applies its price effect to
// these quotes once, before the step listeners (resting-order sweep, candles) see the tick. Reads never publish or
// apply. A restart starts a new epoch for the walk (virgin marks + rematerialized residual / ERP / rumor X / printed belief).
// The feed and storm scheduler resume from persisted lastTick so Wire items and claim clocks stay aligned with the response tick.
import { ASSETS, ASSET_BY_ID, WATCHLISTS, type AssetFixture } from "@/market/catalog";
import { appendAsset, listVersion } from "@/market/listings";
import type { MarketSnapshot } from "@/market/quoteSnapshot";
import { STORY_KEEP, storyAt } from "@/market/wireStories";
import { claimCauseKey, claimPhase, publicRecord, sourceBand, type RumorClaim, type RumorStepEvent } from "./rumorClaims";
import { denialItemId, farmBand, farmSourceName, isFarmSourceId } from "./rumorFarm";
import type { WireSnapshot } from "@/market/wireSnapshot";
import { FEED_TICK_MS, START_TICK, fmt } from "@/shell/contracts/mockFeed";
import { DEMO_CRISIS_HALF_LIFE_DAYS, MARKET_FACTOR_ASSET, ShockFeed, kindFromAppliedId, shockHalfLifeDays, type CoinNewsOut, type PoolInputs } from "./shockFeed";
import type { StormKind, StormWireOut } from "./storms";
import type { CrisisWireOut, MajorKindV1 } from "./crises";
import { TICKS_PER_DAY } from "./meme";
import type { WorldView } from "./world";
import type { PriceEffect, TickerBody, WireItem } from "@/shell/contracts/channels";
import { PORT_AVALON_MARKET_SEED, PORT_AVALON_WORLD_ID } from "@/shell/worldIdentity";
import {
  createDefaultStormWorldStore, type StormWorldStore,
} from "./stormWorldStore";

const globalForMarket = globalThis as typeof globalThis & {
  __portAvalonLiveMarket?: LiveMarket;
};

export type LiveMarketOptions = {
  /** Override only in tests. Production uses FEED_TICK_MS. */
  tickMs?: number;
  /** Override only in tests. Production uses PORT_AVALON_MARKET_SEED. */
  seed?: number;
  /** Override storm-world store (tests). Default: createDefaultStormWorldStore(). */
  stormWorld?: StormWorldStore;
  /** When false, skip loading/saving the storm-world store (pure unit clocks). Default true. */
  persistStorms?: boolean;
  /** Inject a rumor truth secret (tests). Production generates one and persists it in the storm-world store. */
  rumorSecret?: string;
};


/** Resume the quote clock at the persisted storm/rumor lastTick when it is a real post-START tick. */
function resumeFeedTick(snap: { lastTick?: number | null; rumors?: { lastTick: number | null } | null } | null): number {
  const t = snap?.rumors?.lastTick ?? snap?.lastTick ?? null;
  if (typeof t === "number" && Number.isSafeInteger(t) && t >= START_TICK) return t;
  return START_TICK;
}

export class LiveMarket {
  readonly tickMs: number;
  private readonly feed: ShockFeed;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly stepListeners = new Set<() => void>();
  private readonly listListeners = new Set<() => void>();
  private stories: WireItem[] = [];
  /** L4 listings on this clock, oldest first (public defs). */
  private readonly listedDefs: AssetFixture[] = [];
  /** Names this clock's history (new per process / clock), so a client never mixes two runs' stories. */
  readonly epoch = Math.random().toString(36).slice(2, 10) || "0";
  private readonly stormWorld: StormWorldStore;
  private readonly persistStorms: boolean;
  /** Storm ids whose stock shocks were already applied onto this epoch's marks (restart idempotency). */
  private readonly stockAppliedThisEpoch = new Set<string>();

  constructor(opts: LiveMarketOptions = {}) {
    this.tickMs = opts.tickMs ?? FEED_TICK_MS;
    this.stormWorld = opts.stormWorld ?? createDefaultStormWorldStore();
    this.persistStorms = opts.persistStorms !== false;
    const snap = this.persistStorms ? this.stormWorld.load() : null;
    const resume = resumeFeedTick(snap);
    this.feed = new ShockFeed(
      { seed: opts.seed ?? PORT_AVALON_MARKET_SEED, empty: true },
      { autoStart: false, tickMs: this.tickMs, startTick: resume, rumorSecret: opts.rumorSecret ?? snap?.rumors?.secret },
    );
    if (this.persistStorms) this.restoreStormWorld();
    // Bookkeeping-only catch-up from tick 0 so day closes 24–37 (and ripples/majors) do not reprice virgin marks
    // or flood the Wire at boot (GK latent historical-trigger note). Live-forward observe emits normally.
    if (this.feed.storms.observedTick() === null) {
      this.feed.storms.bootstrapTo(this.feed.tick);
      if (this.persistStorms) this.saveStormWorld();
    }
  }

  /** Load durable scheduler + Fear/regime + residual (or legacy full stockApplied re-apply). */
  private restoreStormWorld(): void {
    const snap = this.stormWorld.load();
    this.feed.storms.hydrate(snap);
    if (snap.world) this.feed.world.hydrate(snap.world);
    const hasResidual = Array.isArray(snap.shockResidual) && snap.shockResidual.length > 0;
    if (hasResidual) {
      // Mid-decay continue: hydrate residual; marks already include prior shock — do not re-apply stockApplied bp.
      this.feed.hydrateResidual(snap.shockResidual);
      for (const row of snap.stockApplied) this.stockAppliedThisEpoch.add(row.stormId);
    } else {
      // Old schema / empty residual: re-apply stockApplied once with kind HL, then decay goes forward.
      this.feed.hydrateResidual([]);
      for (const row of snap.stockApplied) {
        if (this.stockAppliedThisEpoch.has(row.stormId)) continue;
        for (const e of row.shocks) this.feed.applyShock(e.assetId, e.bp, shockHalfLifeDays(kindFromAppliedId(row.stormId)));
        this.stockAppliedThisEpoch.add(row.stormId);
      }
    }
    // ERP leftover is independent of residual; older snapshots without erpAccrued start at 0.
    this.feed.hydrateErp(snap.erpAccrued);
    // Older snapshots without rumors start empty. Rematerialize confirmed X + belief onto virgin marks.
    this.feed.hydrateRumors(snap.rumors, true);
    this.stories = this.rebuildRumorStories();
  }

  private saveStormWorld(): void {
    if (!this.persistStorms) return;
    this.stormWorld.save({
      ...this.feed.storms.snapshot(),
      world: this.feed.world.snapshot(),
      shockResidual: this.feed.residualSnapshot(),
      erpAccrued: this.feed.erpSnapshot(),
      rumors: this.feed.rumorSnapshot(),
    });
  }

  /** Idempotent. A second start does not add another interval. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { this.step(); }, this.tickMs);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** One cadence step. The HTTP route never calls this. Listeners (the M1-06 resting-order sweep) run after it. */
  step(): void {
    this.feed.advance();
    this.publishStory();
    this.publishFarm();
    for (const n of this.feed.takeNews()) this.publishCoinNews(n);
    for (const s of this.feed.takeStormWire()) this.publishStorm(s);
    for (const s of this.feed.takeCrisisWire()) this.publishCrisis(s);
    const evs = this.feed.advanceRumors(this.feed.tick);
    this.publishCompanyDenials(evs);
    this.applyRumorResolutions(evs.filter((e) => e.kind !== "denied"));
    this.saveStormWorld();
    for (const fn of this.stepListeners) fn();
  }

  /** A listed coin's 16 news item (src/server/market/coinNews.ts) on the Wire, naming the coin; it cites its committed
   *  event and states only what is true now (16 N1/N2). */
  private publishCoinNews({ assetId, item }: CoinNewsOut): void {
    const a = ASSET_BY_ID[assetId];
    if (!a) return;
    const entities = [{ id: assetId, kind: "asset", label: a.ticker }];
    // no `phase`: the item causes no price effect of its own (the Wire's "Price effect" section is for stories)
    const base = { kind: "NEWS" as const, entities, tick: item.tick, breaking: false };
    const wi: WireItem = item.kind === "listing"
      ? { ...base, id: `w-${item.tick}-${assetId}-listed`, headlineKey: "wire.news.coinListed", slots: { coin: a.ticker }, causeEventIds: [`lp-grad:${assetId}`], causeKey: "wire.cause.coin-listed" }
      : {
        ...base, id: `w-${item.tick}-${assetId}-move${Math.round(item.level! * 100)}`, headlineKey: item.sign > 0 ? "wire.news.coinUp" : "wire.news.coinDown",
        slots: { coin: a.ticker, move: fmt(Math.round(Math.abs(item.to! / item.from! - 1) * 1000), 1) },
        causeEventIds: [`mkt-move:${assetId}:${Math.floor((item.tick - 1) / TICKS_PER_DAY)}:${Math.round(item.level! * 100)}`], causeKey: "wire.cause.coin-move",
      };
    this.stories = this.retainStories([...this.stories, wi]);
  }

  /** The story of the tick just reached, if any: its effects move these quotes now, once (the tick only grows). */
  private publishStory(): void {
    const tick = this.feed.tick;
    const def = storyAt(this.feed.scenario.seed, tick);
    if (!def) return;
    if (def.kind === "RUMOR") {
      const asserted = (def.asserted ?? def.effects)[0];
      if (asserted) {
        this.feed.openRumor({
          id: `w-${tick}`,
          defId: def.defId,
          assetId: asserted.assetId,
          headlineKey: def.headlineKey,
          slots: { ...def.slots },
          causeKey: def.causeKey,
          publishTick: tick,
          bp: asserted.bp,
        });
      }
      const claim = this.feed.rumorClaim(`w-${tick}`);
      const item: WireItem = {
        id: `w-${tick}`, kind: def.kind, headlineKey: def.headlineKey, slots: claim ? this.rumorItemSlots(claim, def.slots) : { ...def.slots },
        entities: def.assets.map((id) => ({ id, kind: "asset", label: ASSET_BY_ID[id]?.ticker ?? id })),
        tick, breaking: def.breaking, causeEventIds: [def.defId],
        phase: claim ? claimPhase(claim) : def.phase,
        causeKey: claim ? claimCauseKey(claim) : def.causeKey,
        ...this.rumorRecordFields(claim),
      };
      this.stories = this.retainStories([...this.stories, item]);
      return;
    }
    const effects: PriceEffect[] = [];
    for (const e of def.effects) {
      const hl = def.crisis ? DEMO_CRISIS_HALF_LIFE_DAYS : undefined;
      const a = ASSET_BY_ID[e.assetId], r = this.feed.applyShock(e.assetId, e.bp, hl);
      if (!a || !r) continue;
      effects.push({ assetId: e.assetId, from: fmt(r.from, a.displayDecimals), to: fmt(r.to, a.displayDecimals), pct: fmt(Math.round(((r.to - r.from) * 10_000) / r.from), 2) });
      // 05 §3.3 factor jumps: a story that moves the index moves each listed coin through its market loading, now
      if (e.assetId === MARKET_FACTOR_ASSET) {
        for (const c of this.feed.factorJump(Math.log(r.to / r.from))) {
          const ca = ASSET_BY_ID[c.assetId];
          if (ca) effects.push({ assetId: c.assetId, from: fmt(c.from, ca.displayDecimals), to: fmt(c.to, ca.displayDecimals), pct: fmt(Math.round(((c.to - c.from) * 10_000) / c.from), 2) });
        }
      }
    }
    const item: WireItem = {
      id: `w-${tick}`, kind: def.kind, headlineKey: def.headlineKey, slots: { ...def.slots },
      entities: def.assets.map((id) => ({ id, kind: "asset", label: ASSET_BY_ID[id]?.ticker ?? id })),
      tick, breaking: def.breaking, causeEventIds: [def.defId], phase: def.phase, causeKey: def.causeKey,
      ...(effects.length ? { effects } : {}),
    };
    this.stories = this.retainStories([...this.stories, item]);
  }

  /** 04 §3.16 storm trigger on the Wire (precursor is not announced). CRYPTO_FLUSH names listed coins;
   *  stock-effect kinds apply one-shot catalog mark moves (applyShock) from the WireOut-bound prices only. */
  private publishStorm(s: StormWireOut): void {
    const tick = this.feed.tick;
    const listed = this.listedDefs.map((d) => d.assetId);
    // Bound per WireOut — do not drain the shared queue (GK DRAIN_HAZARD).
    const priceShocks = s.prices;
    this.feed.takeStormPrices(); // clear any legacy flat queue leftover so tests stay honest
    const effects: PriceEffect[] = [];
    const already = this.stockAppliedThisEpoch.has(s.id);
    for (const e of priceShocks) {
      const a = ASSET_BY_ID[e.assetId];
      if (!a) continue;
      if (already) {
        // Restored at boot: mark already includes this bp; list a synthetic effect from current last for Wire honesty.
        const last = this.feed.lastMinor(e.assetId);
        if (last == null) continue;
        const from = Math.max(1, Math.round((last * 10_000) / (10_000 + e.bp)));
        effects.push({
          assetId: e.assetId,
          from: fmt(from, a.displayDecimals),
          to: fmt(last, a.displayDecimals),
          pct: fmt(Math.round(((last - from) * 10_000) / from), 2),
        });
        continue;
      }
      const r = this.feed.applyShock(e.assetId, e.bp, shockHalfLifeDays(s.kind));
      if (!r) continue;
      effects.push({ assetId: e.assetId, from: fmt(r.from, a.displayDecimals), to: fmt(r.to, a.displayDecimals), pct: fmt(Math.round(((r.to - r.from) * 10_000) / r.from), 2) });
      if (e.assetId === MARKET_FACTOR_ASSET) {
        for (const c of this.feed.factorJump(Math.log(r.to / r.from))) {
          const ca = ASSET_BY_ID[c.assetId];
          if (ca) effects.push({ assetId: c.assetId, from: fmt(c.from, ca.displayDecimals), to: fmt(c.to, ca.displayDecimals), pct: fmt(Math.round(((c.to - c.from) * 10_000) / c.from), 2) });
        }
      }
    }
    if (priceShocks.length && !already) this.stockAppliedThisEpoch.add(s.id);
    const assets = s.kind === "CRYPTO_FLUSH" && listed.length
      ? listed
      : [...new Set(effects.map((e) => e.assetId))];
    const item: WireItem = {
      id: `w-${tick}-${s.id}`, kind: "WORLD_EVENT", headlineKey: s.headlineKey, slots: {},
      entities: assets.map((id) => ({ id, kind: "asset", label: ASSET_BY_ID[id]?.ticker ?? id })),
      tick, breaking: s.breaking, causeEventIds: [s.id], phase: s.phase, causeKey: s.causeKey,
      ...(effects.length ? { effects } : {}),
    };
    this.stories = this.retainStories([...this.stories, item]);
  }

  /** 04 §3.16 major / ripple / Crisis Week announce on the Wire. Prices bound per WireOut (no shared drain). */
  private publishCrisis(s: CrisisWireOut): void {
    const tick = this.feed.tick;
    const priceShocks = s.prices;
    const effects: PriceEffect[] = [];
    const already = this.stockAppliedThisEpoch.has(s.id);
    for (const e of priceShocks) {
      const a = ASSET_BY_ID[e.assetId];
      if (!a) continue;
      if (already) {
        const last = this.feed.lastMinor(e.assetId);
        if (last == null) continue;
        const from = Math.max(1, Math.round((last * 10_000) / (10_000 + e.bp)));
        effects.push({
          assetId: e.assetId,
          from: fmt(from, a.displayDecimals),
          to: fmt(last, a.displayDecimals),
          pct: fmt(Math.round(((last - from) * 10_000) / from), 2),
        });
        continue;
      }
      const r = this.feed.applyShock(e.assetId, e.bp, shockHalfLifeDays(s.kind));
      if (!r) continue;
      effects.push({ assetId: e.assetId, from: fmt(r.from, a.displayDecimals), to: fmt(r.to, a.displayDecimals), pct: fmt(Math.round(((r.to - r.from) * 10_000) / r.from), 2) });
      if (e.assetId === MARKET_FACTOR_ASSET) {
        for (const c of this.feed.factorJump(Math.log(r.to / r.from))) {
          const ca = ASSET_BY_ID[c.assetId];
          if (ca) effects.push({ assetId: c.assetId, from: fmt(c.from, ca.displayDecimals), to: fmt(c.to, ca.displayDecimals), pct: fmt(Math.round(((c.to - c.from) * 10_000) / c.from), 2) });
        }
      }
    }
    if (priceShocks.length && !already) this.stockAppliedThisEpoch.add(s.id);
    const assets = [...new Set(effects.map((e) => e.assetId))];
    const item: WireItem = {
      id: `w-${tick}-${s.id}`, kind: "WORLD_EVENT", headlineKey: s.headlineKey, slots: {},
      entities: assets.map((id) => ({ id, kind: "asset", label: ASSET_BY_ID[id]?.ticker ?? id })),
      tick, breaking: s.breaking, causeEventIds: [s.id], phase: s.phase, causeKey: s.causeKey,
      ...(effects.length ? { effects } : {}),
    };
    this.stories = this.retainStories([...this.stories, item]);
  }



  /** Keep pending and just-resolved rumors even when the ordinary STORY_KEEP window would drop them. */
  private retainStories(items: WireItem[]): WireItem[] {
    const tick = this.feed.tick;
    const byId = new Map(this.feed.rumorClaims().map((c) => [c.id, c]));
    const hold = (it: WireItem): boolean => {
      const rumorId = it.kind === "RUMOR" ? it.id : it.kind === "STATEMENT" ? it.slots?.rumorId : undefined;
      if (!rumorId) return false;
      const c = byId.get(rumorId);
      if (!c) return false;
      if (c.resolution === "PENDING") return true;
      return tick - c.resolvesByTick <= 60;
    };
    const held: WireItem[] = [];
    const rest: WireItem[] = [];
    for (const it of items) (hold(it) ? held : rest).push(it);
    const room = Math.max(0, STORY_KEEP - held.length);
    return [...rest.slice(-room), ...held].sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id));
  }

  private rumorRecordFields(claim?: RumorClaim | null): { sourceRecord: { hits: number; resolved: number }; sourceBand: import("@/shell/contracts/channels").SourceBand } {
    const id = claim?.sourceId;
    const s = id ? this.feed.rumorSourceOf(id) : this.feed.rumorSource();
    const rec = publicRecord(s);
    const band = (claim && (claim.channel === "farm" || isFarmSourceId(claim.sourceId)))
      ? farmBand(rec.hits, rec.resolved)
      : sourceBand(rec.hits, rec.resolved);
    return { sourceRecord: rec, sourceBand: band };
  }

  private farmEntities(c: RumorClaim): WireItem["entities"] {
    const asset = { id: c.assetId, kind: "asset" as const, label: ASSET_BY_ID[c.assetId]?.ticker ?? c.assetId };
    if (!(c.channel === "farm" || isFarmSourceId(c.sourceId)) || !c.sourceId) return [asset];
    return [asset, { id: c.sourceId, kind: "actor", label: c.slots.source ?? farmSourceName(c.sourceId) }];
  }

  private farmWireItem(c: RumorClaim): WireItem {
    const effects = this.rumorEffect(c);
    return {
      id: c.id, kind: "RUMOR", headlineKey: c.headlineKey, slots: this.rumorItemSlots(c),
      entities: this.farmEntities(c),
      tick: c.publishTick, breaking: false, causeEventIds: [c.defId],
      phase: claimPhase(c), causeKey: claimCauseKey(c),
      ...this.rumorRecordFields(c),
      ...(effects.length ? { effects } : {}),
    };
  }

  /** Farm rumors due at this tick (16:562: generated at the previous day close). */
  private publishFarm(): void {
    const opened = this.feed.openFarmDue(this.feed.tick);
    if (!opened.length) return;
    this.stories = this.retainStories([...this.stories, ...opened.map((c) => this.farmWireItem(c))]);
  }

  private rumorEffect(c: RumorClaim): PriceEffect[] {
    if (!c.effect) return [];
    const a = ASSET_BY_ID[c.effect.assetId];
    if (!a || !(c.effect.from > 0)) return [];
    return [{
      assetId: c.effect.assetId,
      from: fmt(c.effect.from, a.displayDecimals),
      to: fmt(c.effect.to, a.displayDecimals),
      pct: fmt(Math.round(((c.effect.to - c.effect.from) * 10_000) / c.effect.from), 2),
    }];
  }

  private rumorItemSlots(claim: RumorClaim, base?: Record<string, string>): Record<string, string> {
    const slots = { ...(base ?? {}), ...claim.slots };
    if (claim.resolution === "CONFIRMED") slots.appliedTick = String(claim.resolvesByTick);
    return slots;
  }

  private stampRumorItem(item: WireItem, claim: RumorClaim): WireItem {
    const rest = { ...item };
    delete rest.effects;
    const effects = this.rumorEffect(claim);
    return {
      ...rest,
      slots: this.rumorItemSlots(claim, item.slots),
      phase: claimPhase(claim),
      causeKey: claimCauseKey(claim),
      ...this.rumorRecordFields(claim),
      ...(effects.length ? { effects } : {}),
    };
  }

  private companyDenialItem(c: RumorClaim): WireItem {
    const company = c.slots.company ?? ASSET_BY_ID[c.assetId]?.name ?? c.assetId;
    const tick = c.deniedAtTick ?? c.publishTick;
    return {
      id: denialItemId(c.id),
      kind: "STATEMENT",
      headlineKey: "wire.statement.denies",
      slots: { company, rumorId: c.id },
      entities: [{ id: c.assetId, kind: "asset", label: ASSET_BY_ID[c.assetId]?.ticker ?? c.assetId }],
      tick,
      breaking: false,
      causeEventIds: [c.id],
      causeKey: "wire.cause.company-denial",
    };
  }

  private publishCompanyDenials(evs: RumorStepEvent[]): void {
    const denials = evs.filter((e) => e.kind === "denied");
    if (!denials.length) return;
    const have = new Set(this.stories.map((it) => it.id));
    const added: WireItem[] = [];
    for (const ev of denials) {
      const item = this.companyDenialItem(ev.claim);
      if (!have.has(item.id)) { have.add(item.id); added.push(item); }
    }
    if (added.length) this.stories = this.retainStories([...this.stories, ...added]);
  }

  private applyRumorResolutions(resolved: RumorStepEvent[]): void {
    // Stamp only when a claim resolves: phase/cause/effects/appliedTick change then,
    // and that author's other pending items need the updated public record. Mid-pending
    // restamping every tick does not change the Wire row and is too expensive for 8/day farm.
    if (!resolved.length) return;
    const byId = new Map(this.feed.rumorClaims().map((c) => [c.id, c]));
    const touched = new Set(resolved.map((e) => e.claim.id));
    const sources = new Set(resolved.map((e) => e.claim.sourceId).filter((id): id is string => !!id));
    this.stories = this.stories.map((item) => {
      const c = byId.get(item.id);
      if (!c) return item;
      if (touched.has(item.id) || (c.sourceId && sources.has(c.sourceId))) return this.stampRumorItem(item, c);
      return item;
    });
  }

  /** Rebuild Wire rows for persisted rumors after a restart (other stories are a new epoch, as today). */
  private rebuildRumorStories(): WireItem[] {
    const items = this.feed.rumorClaims().map((c) => this.farmWireItem(c));
    for (const c of this.feed.rumorClaims()) {
      if (c.deniedAtTick != null) items.push(this.companyDenialItem(c));
    }
    items.sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id));
    return this.retainStories(items);
  }

  /** The stories published so far (newest last), at the current tick. A copy: reading changes nothing. */
  wire(): WireSnapshot {
    return structuredClone({ worldId: PORT_AVALON_WORLD_ID, epoch: this.epoch, tick: this.feed.tick, items: this.stories });
  }

  /** L4 listing path: append the def to the catalog (list version + 1) and quote it on this clock from the current tick,
   *  with its meme-template path. Idempotent: listing the same def again changes nothing. Throws on a def that collides
   *  with a different asset (never silently replaced). */
  list(def: AssetFixture, opts: { hype?: number | null; announce?: boolean } = {}): void {
    if (!appendAsset(def, { ASSETS, ASSET_BY_ID, WATCHLISTS })) throw new Error(`listing ${def.assetId} collides with an existing asset`);
    if (!this.listedDefs.some((d) => d.assetId === def.assetId)) {
      this.feed.listMeme(ASSET_BY_ID[def.assetId]!, opts.hype ?? undefined);
      this.listedDefs.push({ ...def });
      for (const fn of this.listListeners) fn(); // candles sample the new asset at its listing tick (fills there count)
    }
    // a fresh graduation (not a relist after a restart): its listing on the Wire, once per coin on this clock
    if (opts.announce) {
      const item = this.feed.announceListing(def.assetId);
      if (item) this.publishCoinNews({ assetId: def.assetId, item });
    }
  }

  /** The saved hype of a listed coin (its pools' H), read by its next path step; called after the pools' save. */
  setHype(assetId: string, h: number): void { if (this.isListed(assetId)) this.feed.setHype(assetId, h); }

  /** DEGEN liquidation episode start on the Wire (after pools' save). Once per episode; idempotent id. */
  announceDegenLiq(ev: { assetId: string; tick: number; qty: number }): void {
    if (!this.isListed(ev.assetId)) return;
    const a = ASSET_BY_ID[ev.assetId];
    if (!a) return;
    const id = `w-${ev.tick}-${ev.assetId}-degenliq`;
    if (this.stories.some((s) => s.id === id)) return;
    const wi: WireItem = {
      id, kind: "NEWS", headlineKey: "wire.news.coinLiq",
      slots: { coin: a.ticker, qty: String(ev.qty) },
      entities: [{ id: ev.assetId, kind: "asset", label: a.ticker }],
      tick: ev.tick, breaking: true,
      causeEventIds: [`lp-degen-liq:${ev.assetId}:${ev.tick}`],
      causeKey: "wire.cause.coin-liq",
    };
    this.stories = this.retainStories([...this.stories, wi]);
  }
  /** The hype a listed coin's next path step reads, or null. */
  hypeOf(assetId: string): number | null { return this.isListed(assetId) ? this.feed.hypeOf(assetId) : null; }
  /** 04's regime and Fear Index on this clock now (world.ts). */
  worldView(): WorldView { return this.feed.world.view(); }

  /** A listed coin's mark now (1e-8 $), or null when this clock has not listed it. */
  listedMark(assetId: string): number | null {
    return this.isListed(assetId) ? this.feed.lastMinor(assetId) : null;
  }

  /** L4: a committed book fill's permanent impact on a listed coin (src/server/broker/book.ts). Not durable, like the
   *  path itself (a restart starts it again). Returns the new mark, or null when not listed here. */
  impactListed(assetId: string, logMove: number): number | null {
    return this.isListed(assetId) ? this.feed.impactListed(assetId, logMove) : null;
  }

  depthInputs(assetId: string) { return this.feed.depthInputs(assetId); }

  /** CRYPTO_FLUSH hype shocks armed this tick (consumed once; broker applies into saved pools). */
  takeStormHype() { return this.feed.takeStormHype(); }

  /** Test-only: arm a storm bypassing the day-close rate (engine forceEvent analogue). */
  forceStormForTests(kind: StormKind, opts: { severity?: number; precursorDays?: number; sectorIndex?: number } = {}): void {
    this.feed.storms.forceStorm(kind, { atTick: this.feed.tick, ...opts });
    this.saveStormWorld();
  }

  /** Test-only: arm a V1 major bypassing rate/constraints. */
  forceMajorForTests(kind: MajorKindV1, opts: { severity?: number; precursorDays?: number; contagionDays?: number } = {}): void {
    this.feed.storms.forceMajor(kind, { atTick: this.feed.tick, ...opts });
    this.saveStormWorld();
  }

  /** Durable storm snapshot (tests / restart proof). */
  stormSnapshot() { return { ...this.feed.storms.snapshot(), shockResidual: this.feed.residualSnapshot(), erpAccrued: this.feed.erpSnapshot(), rumors: this.feed.rumorSnapshot() }; }

  /** The trader pools' inputs for a listed coin (ShockFeed.poolInputs), or null. Reads only. */
  poolInputs(assetId: string): PoolInputs | null {
    return this.isListed(assetId) ? this.feed.poolInputs(assetId) : null;
  }

  isListed(assetId: string): boolean {
    return this.listedDefs.some((d) => d.assetId === assetId);
  }

  /** Run `fn` after every new listing (L4), at the listing tick. Returns the unsubscribe. */
  onList(fn: () => void): () => void {
    this.listListeners.add(fn);
    return () => { this.listListeners.delete(fn); };
  }

  /** Run `fn` after every step. Returns the unsubscribe. */
  onStep(fn: () => void): () => void {
    this.stepListeners.add(fn);
    return () => { this.stepListeners.delete(fn); };
  }

  snapshot(): MarketSnapshot {
    const quotes = this.feed.body("ticker:wl_default") as TickerBody;
    const w = this.feed.world.view();
    return {
      worldId: PORT_AVALON_WORLD_ID,
      marketSeed: this.feed.scenario.seed,
      tick: this.feed.tick,
      tickMs: this.tickMs,
      quotes,
      // 04 §3.14.1 macro.fear PUBLIC (hourly F, RA).
      fear: w.fear,
      riskAppetite: w.riskAppetite,
      // L4: once a coin is listed, the list version and every listed def, so a client adds them to its catalog before
      // reading their rows (absent until then: the snapshot is exactly the pre-listing shape).
      ...(this.listedDefs.length ? { listVersion: listVersion(), listed: this.listedDefs.map((d) => ({ ...d })) } : {}),
    };
  }
}

export function shouldAutostartClock(): boolean {
  return process.env.NODE_ENV !== "test";
}

/** Process singleton. The first production read starts the one interval. */
export function getLiveMarket(): LiveMarket {
  if (!globalForMarket.__portAvalonLiveMarket) {
    const market = new LiveMarket();
    globalForMarket.__portAvalonLiveMarket = market;
    if (shouldAutostartClock()) market.start();
  }
  return globalForMarket.__portAvalonLiveMarket;
}

/** Test-only: replace the singleton. Stops the previous clock. */
export function setLiveMarketForTests(market: LiveMarket | undefined): void {
  const prev = globalForMarket.__portAvalonLiveMarket;
  if (prev && prev !== market) prev.stop();
  globalForMarket.__portAvalonLiveMarket = market;
}
