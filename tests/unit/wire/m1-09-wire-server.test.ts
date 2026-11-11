// M1-09 Wire stories move prices: a seeded schedule (company stories + four crises named in the macro crisis catalog)
// published by the one server clock as it steps, each realized effect applied to the server quotes once at the story's
// tick, before the resting-order sweep and the candles see that tick. Checks: the schedule is pure and honest
// (forecasts carry no effect and do not always come true); the server equals the seeded walk plus exactly the logged
// effects (so nothing is applied twice or by a read); two clocks with one seed replay the same stories and prices;
// GET /api/wire is strict, public, read-only; a market order at the story tick fills at the moved price, and the tick
// bar's close is the moved price; signed-in feeds show only the server's stories (first-read error, older reply
// dropped, a restarted server's epoch replaces), guests keep the fixtures.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as candlesRoute } from "@/app/api/market/candles/route";
import { GET as marketRoute } from "@/app/api/market/route";
import { POST as placeRoute } from "@/app/api/broker/orders/route";
import { GET as wireRoute } from "@/app/api/wire/route";
import { CAUSES } from "@/apps/wire/causes";
import { EN } from "@/apps/wire/strings";
import { ASSET_BY_ID } from "@/market/catalog";
import { CRISES, COMPANY_STORIES, STORY_EVERY, crisisHits, storyAt, type StoryDef } from "@/market/wireStories";
import { parseWireSnapshot, type WireSnapshot } from "@/market/wireSnapshot";
import { AuthService, MemoryAuthStore, SESSION_COOKIE_NAME, setAuthServiceForTests, type AuthStore, type AuthStoreSnapshot } from "@/server/auth";
import { setBrokerForTests } from "@/server/broker";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";
import type { NewsBody, TickerBody } from "@/shell/contracts/channels";
import { MockFeed, SNAP_DELAY_MS, START_TICK, fmt } from "@/shell/contracts/mockFeed";
import { DEMO_CRISIS_HALF_LIFE_DAYS, ShockFeed, shockedMinor } from "@/server/market/shockFeed";
import { openChannel, setFeed } from "@/shell/contracts/useChannel";
import { PORT_AVALON_MARKET_SEED, PORT_AVALON_WORLD_ID } from "@/shell/worldIdentity";
import { serverHalfLoaded } from "../helpers/serverHalf";

const SEED = PORT_AVALON_MARKET_SEED;
const minor = (q: TickerBody, id: string) => Math.round(Number(q.rows[id]!.last) * 10 ** ASSET_BY_ID[id]!.displayDecimals);
const stepTo = (m: LiveMarket, tick: number) => { while (m.snapshot().tick < tick) m.step(); };

class CountingStore implements AuthStore {
  saves = 0;
  constructor(private readonly inner: AuthStore) {}
  load(): Promise<AuthStoreSnapshot> { return this.inner.load(); }
  save(s: AuthStoreSnapshot): Promise<void> { this.saves++; return this.inner.save(s); }
}

describe("M1-09 story schedule", () => {
  const slots = (n: number) => Array.from({ length: n }, (_, i) => START_TICK + (i + 1) * STORY_EVERY);
  it("pure: one story every STORY_EVERY ticks after the first tick, none between; same seed same story", () => {
    expect(storyAt(SEED, START_TICK)).toBeNull();
    for (let d = 1; d < STORY_EVERY; d++) expect(storyAt(SEED, START_TICK + d)).toBeNull();
    for (const t of slots(64)) {
      expect(storyAt(SEED, t)).not.toBeNull();
      expect(storyAt(SEED, t)).toEqual(storyAt(SEED, t));
      expect(storyAt(SEED, t + 1)).toBeNull();
    }
    expect(slots(64).map((t) => storyAt(SEED, t)!.defId)).not.toEqual(slots(64).map((t) => storyAt(SEED + 1, t)!.defId));
  });

  it("each crisis watch is a forecast with no effect, and its outcome two slots later is the hit or the all-clear of the same crisis", () => {
    let hits = 0, eased = 0;
    const seen = new Set<string>();
    for (const t of slots(16 * 12)) {
      const s = storyAt(SEED, t)!;
      if (s.kind !== "WORLD_EVENT" || s.phase !== "forecast") continue;
      expect(s.effects).toEqual([]);
      expect(s.kind).toBe("WORLD_EVENT");
      const out = storyAt(SEED, t + 2 * STORY_EVERY)!;
      expect(out.crisis).toBe(s.crisis);
      expect(storyAt(SEED, t + STORY_EVERY)!.crisis).toBeUndefined(); // a company story in between
      if (out.phase === "realized") { hits++; expect(out.effects.length).toBeGreaterThan(0); expect(out.breaking).toBe(true); }
      else { eased++; expect(out.phase).toBe("eased"); expect(out.effects).toEqual([]); }
      seen.add(s.crisis!);
    }
    expect(seen).toEqual(new Set(CRISES.map((c) => c.kind)));
    expect(hits).toBeGreaterThan(0);
    expect(eased).toBeGreaterThan(0); // a forecast is not a promise
    expect(hits + eased).toBe(4 * 12);
    expect(crisisHits(SEED, 0, 0)).toBe(crisisHits(SEED, 0, 0));
  });

  it("stable definitions: crisis kinds are in the macro crisis catalog, assets in the catalog, copy for every headline and cause", () => {
    const catalog = readFileSync(path.join(process.cwd(), "packages/engine/macro/rules/crisisCatalog.ts"), "utf8");
    for (const c of CRISES) expect(catalog).toContain(`kind: '${c.kind}'`);
    const all: StoryDef[] = slots(16 * 8).map((t) => storyAt(SEED, t)!);
    expect(new Set(all.filter((s) => !s.crisis).map((s) => s.defId))).toEqual(new Set(COMPANY_STORIES.map((c) => c.defId)));
    for (const s of all) {
      for (const id of s.assets) expect(ASSET_BY_ID[id], id).toBeDefined();
      for (const e of s.effects) { expect(s.assets).toContain(e.assetId); expect(Math.abs(e.bp)).toBeLessThanOrEqual(600); expect(e.bp).not.toBe(0); }
      expect(EN.headlines[s.headlineKey], s.headlineKey).toBeDefined();
      expect(CAUSES[s.causeKey], s.causeKey).toBeDefined();
    }
  });
});

describe("M1-09 server clock: stories move the authoritative quotes once", () => {
  it("the server is the seeded walk plus exactly the logged effects, each at its tick; reads publish and apply nothing", () => {
    const market = new LiveMarket();
    const ref = new ShockFeed({ seed: SEED, empty: true }, { autoStart: false });
    let published = 0;
    for (let i = 0; i < 16 * STORY_EVERY * 2; i++) {
      // reads between steps: nothing changes
      const before = market.snapshot(), wire = market.wire();
      for (let n = 0; n < 5; n++) { market.snapshot(); market.wire(); }
      expect(market.snapshot()).toEqual(before);
      expect(market.wire()).toEqual(wire);
      market.step();
      ref.advance();
      const tick = market.snapshot().tick;
      const w = market.wire();
      const def = storyAt(SEED, tick);
      const item = w.items.find((i) => i.id === `w-${tick}`) ?? w.items.at(-1);
      if (def) {
        published++;
        expect(item!.id).toBe(`w-${tick}`);
        expect(item!.tick).toBe(tick);
        expect(item!.phase).toBe(def.phase);
        expect(item!.causeEventIds).toEqual([def.defId]);
        expect(item!.entities.map((e) => e.id)).toEqual(def.assets);
        expect((item!.effects ?? []).map((e) => e.assetId)).toEqual(def.effects.map((e) => e.assetId));
        for (const e of def.effects) {
          const from = minor(ref.body("ticker:wl_default") as TickerBody, e.assetId); // the walk's price at this tick
          const r = ref.applyShock(e.assetId, e.bp, def.crisis ? DEMO_CRISIS_HALF_LIFE_DAYS : undefined)!;
          expect(r).toEqual({ from, to: shockedMinor(from, e.bp) });
          const got = item!.effects!.find((x) => x.assetId === e.assetId)!;
          const dp = ASSET_BY_ID[e.assetId]!.displayDecimals;
          expect(got).toEqual({ assetId: e.assetId, from: fmt(r.from, dp), to: fmt(r.to, dp), pct: fmt(Math.round(((r.to - r.from) * 10_000) / r.from), 2) });
        }
        if (def.kind === "RUMOR") {
          const a = (def.asserted ?? def.effects)[0];
          expect(item!.phase).toBe("forecast");
          expect(item!.effects).toBeUndefined();
          expect(item!.sourceRecord).toBeDefined();
          if (a) {
            ref.openRumor({
              id: `w-${tick}`, defId: def.defId, assetId: a.assetId, headlineKey: def.headlineKey,
              slots: { ...def.slots }, causeKey: def.causeKey, publishTick: tick, bp: a.bp,
            });
          }
        }
      } else {
        for (const it of w.items.filter((i) => i.tick === tick)) {
          expect(it.kind).toBe("STATEMENT");
          expect(it.headlineKey).toBe("wire.statement.denies");
        }
      }
      ref.advanceRumors(tick);
      expect(market.snapshot().quotes).toEqual(ref.body("ticker:wl_default"));
      expect(w.items.filter((i) => /^w-\d+$/.test(i.id)).length).toBe(published); // one catalog story per story tick; company denials may also appear
    }
    expect(published).toBe(32);
    expect(market.wire().items.filter((i) => i.effects?.length).length).toBeGreaterThan(16);
  });

  it("same seed replays the same stories and prices (a restart is a new epoch with the same replay)", () => {
    const a = new LiveMarket(), b = new LiveMarket();
    for (let i = 0; i < 200; i++) { a.step(); b.step(); }
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.wire().items).toEqual(b.wire().items);
    expect(a.epoch).not.toBe(b.epoch);
    expect(a.wire().epoch).toBe(a.epoch);
  });
});

describe("M1-09 routes", () => {
  let market: LiveMarket;
  let store: CountingStore;
  beforeEach(() => {
    store = new CountingStore(new MemoryAuthStore());
    setAuthServiceForTests(new AuthService({ store }));
    market = new LiveMarket();
    setLiveMarketForTests(market);
    setBrokerForTests(undefined);
  });
  afterEach(() => {
    setBrokerForTests(undefined);
    setLiveMarketForTests(undefined);
    setAuthServiceForTests(undefined);
    setFeed(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("GET /api/wire: strict reply of the one world, public, no-store; repeated reads change nothing and write nothing", async () => {
    stepTo(market, START_TICK + 4 * STORY_EVERY);
    const r1 = await wireRoute();
    expect(r1.status).toBe(200);
    expect(r1.headers.get("cache-control")).toContain("no-store");
    const raw = await r1.json() as WireSnapshot;
    expect(Object.keys(raw).sort()).toEqual(["epoch", "items", "tick", "worldId"]);
    const v = parseWireSnapshot(raw)!;
    expect(v).not.toBeNull();
    expect(v.worldId).toBe(PORT_AVALON_WORLD_ID);
    expect(v.tick).toBe(market.snapshot().tick);
    expect(v.items.filter((i) => /^w-\d+$/.test(i.id)).map((i) => i.tick)).toEqual([1, 2, 3, 4].map((k) => START_TICK + k * STORY_EVERY));
    const quotes = market.snapshot();
    for (let i = 0; i < 10; i++) expect(parseWireSnapshot(await (await wireRoute()).json())).toEqual(v);
    expect(market.snapshot()).toEqual(quotes);
    expect(store.saves).toBe(0);
    // strict client parse: an extra key, a future item or another world is refused
    expect(parseWireSnapshot({ ...raw, extra: 1 })).toBeNull();
    expect(parseWireSnapshot({ ...raw, worldId: "world_other" })).toBeNull();
    expect(parseWireSnapshot({ ...raw, items: [{ ...raw.items[0]!, tick: raw.tick + 1 }] })).toBeNull();
    expect(parseWireSnapshot({ ...raw, items: [{ ...raw.items[0]!, cashCents: 1 }] })).toBeNull();
  });

  it("Broker and candles see the moved price: a market buy at the story tick fills at it; the tick bar closes at it", async () => {
    await marketRoute(); // attaches the sweep and the candle recorder to this clock (as the first read does)
    const first = START_TICK + STORY_EVERY;
    let item = null as ReturnType<LiveMarket["wire"]>["items"][number] | null;
    let e: NonNullable<NonNullable<typeof item>["effects"]>[number] | undefined;
    let at = first;
    for (let k = 0; k < 16; k++) {
      at = START_TICK + (k + 1) * STORY_EVERY;
      stepTo(market, at);
      item = market.wire().items.at(-1)!;
      e = item.effects?.[0];
      if (e) break;
    }
    expect(item).not.toBeNull();
    expect(e).toBeDefined();
    expect(item!.tick).toBe(at);
    expect((await marketRoute().then((r) => r.json()) as { quotes: TickerBody }).quotes.rows[e!.assetId]!.last).toBe(e!.to);
    const reg = await register(new Request("http://localhost/api/auth/register", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ handle: "WireBuyer", password: "password1" }) }));
    const cookie = (reg.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(";")[0]!;
    const res = await placeRoute(new Request("http://localhost/api/broker/orders", {
      method: "POST", headers: { "content-type": "application/json", cookie, origin: "http://localhost" },
      body: JSON.stringify({ idempotencyKey: "m1-09-buy-0001", draft: { assetId: e!.assetId, side: "BUY", type: "market", qty: "3", tif: "day" } }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { ledger: { fills: { price: string; tick: number }[] } };
    expect(body.ledger.fills.at(-1)).toMatchObject({ price: e!.to, tick: at });
    const c = await candlesRoute(new Request(`http://localhost/api/market/candles?assetId=${e!.assetId}&res=tick&from=${at}&to=${at}`));
    const bars = (await c.json() as { bars: { t: number; c: string }[] }).bars;
    expect(bars.at(-1)).toMatchObject({ t: at, c: e!.to });
  });

  it("signed-in feed: news waits for the server Wire; first read failure errors; then only server stories; older reply dropped; new epoch replaces", async () => {
    stepTo(market, START_TICK + 3 * STORY_EVERY);
    let mode: "fail" | "ok" | "old" | "epoch" = "fail";
    const old = market.wire();
    stepTo(market, START_TICK + 4 * STORY_EVERY);
    const other = new LiveMarket();
    stepTo(other, START_TICK + STORY_EVERY);
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (input === "/api/market") return Response.json(market.snapshot());
      if (input === "/api/wire") {
        if (mode === "fail") return new Response("{}", { status: 500 });
        if (mode === "old") return Response.json(old);
        if (mode === "epoch") return Response.json(other.wire());
        return Response.json(market.wire());
      }
      return new Response(null, { status: 404 });
    }));
    const feed = new MockFeed({ empty: true, seed: SEED }, { authoritativeQuotes: true });
    setFeed(feed);
    const news = openChannel(feed, "news");
    await serverHalfLoaded(feed);
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 50);
    expect(news.get().state).toBe("error");
    mode = "ok";
    feed.resync("news");
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 50);
    expect(news.get().state).toBe("live");
    const ids = () => (news.get().body as NewsBody).items.map((i) => i.id);
    expect(ids()).toEqual(market.wire().items.map((i) => i.id));
    expect(ids().some((id) => /^n-/.test(id))).toBe(false); // never the guest fixtures
    mode = "old";
    feed.resync("news");
    await vi.advanceTimersByTimeAsync(50);
    expect(ids()).toEqual(market.wire().items.map((i) => i.id)); // an older reply of the same epoch is dropped
    mode = "epoch";
    feed.resync("news");
    await vi.advanceTimersByTimeAsync(50);
    expect(ids()).toEqual(other.wire().items.map((i) => i.id)); // a restarted server replaces the list
    news.close();
    // Guest: the fixture stories (labelled demo in the Wire app), no server read.
    const guest = new MockFeed({ seed: SEED }, { autoStart: false });
    expect((guest.body("news") as NewsBody).items.map((i) => i.id)).toEqual(["n-1", "n-2", "n-3", "n-4"]);
  });
});
