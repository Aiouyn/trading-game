// M1-07 chart-level harness: the real Broker (PriceChart on the real feed hook, fake clock), the real candles and place
// routes, the real recorder and a memory auth store whose order saves a test can hold, commit or fail. The chart is read
// from its table view (the same bars the plot gets): the canvas plot cannot draw in happy-dom, and a vi.mock of its lazy
// chunk was observed not to hold reliably across files, so the table is switched on before the plot could mount.
import { act } from "react";
import { expect, vi } from "vitest";
import { POST as placeRoute } from "@/app/api/broker/orders/route";
import { GET as candlesRoute } from "@/app/api/market/candles/route";
import { AuthService, MemoryAuthStore, SESSION_COOKIE_NAME, getAuthService, setAuthServiceForTests } from "@/server/auth";
import type { AuthStoreSnapshot } from "@/server/auth/store";
import { setBrokerForTests } from "@/server/broker";
import { getCandles } from "@/server/market/candles";
import { setLiveMarketForTests, type LiveMarket } from "@/server/market/clock";
import type { OrderDraft } from "@/shell/contracts/channels";
import { MockFeed } from "@/shell/contracts/mockFeed";
import { click, mount, q, setup, teardown, type Harness } from "../17b/br-harness";
import { ControlledMarket, asMarket } from "./controlledMarket";
import { portAvalonServer } from "./portAvalonServer";
import { serverHalfLoaded } from "./serverHalf";

/** Memory store that holds the save carrying `key` (an order's own persist in flight) until the test commits or fails
 *  it; other saves (e.g. a session touch) pass. */
export class GatedStore extends MemoryAuthStore {
  private gate: Promise<void> | null = null;
  private fail = false;
  private key = "";
  waiting = 0;
  hold(key: string, opts: { fail?: boolean } = {}): () => void {
    let open!: () => void;
    this.key = key;
    this.gate = new Promise<void>((r) => { open = r; });
    this.fail = opts.fail ?? false;
    return () => { this.gate = null; open(); };
  }
  override async save(snapshot: AuthStoreSnapshot): Promise<void> {
    if (this.gate && JSON.stringify(snapshot).includes(this.key)) {
      const fail = this.fail;
      this.waiting += 1;
      await this.gate;
      this.waiting -= 1;
      if (fail) throw new Error("injected save failure");
    }
    return super.save(snapshot);
  }
}

export interface Read { readonly url: URL; readonly body: string }

export function brokerChartEnv(asset = "HALC") {
  const env = {
    h: null as unknown as Harness,
    market: null as unknown as ControlledMarket,
    store: null as unknown as GatedStore,
    reads: [] as Read[],
    /** The next history (range) request is read by the server now, its reply held until `release()`. */
    holdHistory: false,
    release: null as (() => void) | null,
    before() {
      env.h = setup();
      env.store = new GatedStore();
      setAuthServiceForTests(new AuthService({ store: env.store }));
      env.market = new ControlledMarket();
      setLiveMarketForTests(asMarket(env.market));
      setBrokerForTests(undefined);
      env.reads = []; env.holdHistory = false; env.release = null;
      const clock = { snapshot: () => env.market.snapshot() } as unknown as LiveMarket; // follows a restarted market
      vi.stubGlobal("fetch", portAvalonServer({ market: clock, other: async (url) => {
        const u = new URL(url, "http://localhost");
        if (u.pathname !== "/api/market/candles") return new Response(null, { status: 404 });
        const res = await candlesRoute(new Request(u)); // the server reads now
        env.reads.push({ url: u, body: await res.clone().text() });
        if (env.holdHistory && env.isHistory(u)) { env.holdHistory = false; return new Promise<Response>((ok) => { env.release = () => ok(res); }); }
        return res;
      } }));
    },
    async after() {
      await teardown(env.h);
      vi.unstubAllGlobals();
      setBrokerForTests(undefined); setLiveMarketForTests(undefined); setAuthServiceForTests(undefined);
    },
    isHistory: (u: URL) => !u.searchParams.has("since") && Number(u.searchParams.get("to")) - Number(u.searchParams.get("from")) > 4,
    recorder: () => getCandles(asMarket(env.market)),
    /** A late save landing now, recorded at its decision tick (what Broker onFills does after the commit). */
    late: (tick: number, qty: string, id: string) => env.recorder().recordFills([{ fillId: id, assetId: asset, tick, qty }]),
    /** A new server process: new clock (`back` ticks earlier: the clock is process-local), new recorder (new epoch,
     *  revision from 0). */
    restart(back = 0) {
      env.market = new ControlledMarket(env.market.tick - back);
      setLiveMarketForTests(asMarket(env.market));
      setBrokerForTests(undefined);
      env.recorder();
    },
    server: (t: number) => env.recorder().history({ assetId: asset, res: "tick", from: t, to: t })[0]?.v ?? null,
    serverBar: (res: "tick" | "hour" | "day", t: number) => env.recorder().history({ assetId: asset, res, from: t, to: t })[0] ?? null,
    shownCol: (t: number, col: "open" | "high" | "low" | "close" | "volume") => env.rows().find((r) => Number(r.dataset.t) === t)?.querySelector(`[data-col="${col}"]`)?.textContent?.trim() ?? null,
    rows: () => [...env.h.el.querySelectorAll<HTMLElement>('[data-testid="br-chart-table"] tr[data-t]')],
    shownT: () => env.rows().map((r) => Number(r.dataset.t)).sort((a, b) => a - b),
    shownV: (t: number) => env.rows().find((r) => Number(r.dataset.t) === t)?.querySelector('[data-col="volume"]')?.textContent?.trim() ?? null,
    /** n feed polls (1 s each, fake clock), with every microtask between. */
    poll: (n: number) => act(async () => { for (let i = 0; i < n; i++) await vi.advanceTimersByTimeAsync(1000); }),
    /** The chart's catch-up requests (the only reads that carry `since`). */
    catchUps: () => env.reads.filter((r) => r.url.searchParams.has("since")),
    /** Mounts the signed-in Broker on HALC and switches the chart to its table view before the first history reply
     *  lands, so the canvas plot never mounts (it cannot draw in happy-dom); the table renders the same bars. */
    async signedInChart() {
      env.recorder(); // the recorder samples this clock
      for (let i = 0; i < 3; i++) env.market.step();
      const feed = new MockFeed({ empty: true }, { authoritativeQuotes: true });
      env.holdHistory = true;
      await mount(env.h, { context: asset, feed });
      await serverHalfLoaded(feed);
      await env.poll(1);
      expect(env.release).not.toBeNull();
      await click(q(env.h, "br-chart-toggle")!);
      env.release!(); env.release = null;
      await env.poll(2);
      expect(q(env.h, "br-chart")?.dataset.state).toBe("plot");
      expect(env.rows().length).toBeGreaterThan(0);
      expect(env.shownT().at(-1)).toBe(env.market.tick);
      return feed;
    },
    /** A registered player's session cookie (through the auth service: happy-dom's Response drops Set-Cookie). */
    async signUp(handle: string): Promise<string> {
      const { rawToken } = await getAuthService().register({ handle, password: "password1" });
      return `${SESSION_COOKIE_NAME}=${rawToken}`;
    },
    /** POST /api/broker/orders through the real route. happy-dom's Request drops the (browser-forbidden) cookie header,
     *  so the route gets a Request whose headers are read from a plain map (it only calls headers.get). */
    place: (cookie: string, key: string, draft: OrderDraft) => {
      const req = new Request("http://localhost/api/broker/orders", { method: "POST", body: JSON.stringify({ idempotencyKey: key, draft }) });
      const hs: Record<string, string> = { "content-type": "application/json", cookie, origin: "http://localhost" };
      Object.defineProperty(req, "headers", { value: { get: (k: string) => hs[k.toLowerCase()] ?? null } });
      return placeRoute(req);
    },
    q: (id: string) => q(env.h, id),
  };
  return env;
}
