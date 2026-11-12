// M3-05: mutating routes that had no limiter return 429 before any ledger write.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as brokerMe } from "@/app/api/broker/me/route";
import { POST as placeRoute } from "@/app/api/broker/orders/route";
import { POST as cancelRoute } from "@/app/api/broker/orders/cancel/route";
import { POST as launchRoute } from "@/app/api/launchpad/launch/route";
import { POST as tradeRoute } from "@/app/api/launchpad/trade/route";
import { POST as wireRoute } from "@/app/api/wire/route";
import { LP } from "@/launchpad/rules";
import { resetListingsForTests } from "@/market/listings";
import type { BrokerIntentReply, BrokerLedgerView } from "@/market/brokerLedger";
import {
  SESSION_COOKIE_NAME,
  START_CASH_CENTS,
  AuthService,
  MemoryAuthStore,
  setAuthServiceForTests,
} from "@/server/auth";
import { setBrokerForTests } from "@/server/broker";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";
import {
  MUTATION_SESSION_LIMIT_DEFAULT,
  assertMutationAllowed,
  forwardedClientFromRight,
  mutationBucketCountForTests,
  resetMutationLimits,
  setMutationLimitNowForTests,
} from "@/server/mutationLimit";
import type { OrderDraft } from "@/shell/contracts/channels";

const ENV_KEYS = [
  "QUAY_MUTATION_SESSION_LIMIT",
  "QUAY_MUTATION_IP_LIMIT",
  "QUAY_MUTATION_WINDOW_MS",
  "QUAY_MUTATION_MAX_KEYS",
  "QUAY_TRUSTED_PROXY_HOPS",
  "QUAY_TRUST_PROXY",
] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]])) as Record<(typeof ENV_KEYS)[number], string | undefined>;

function restoreEnv(): void {
  for (const k of ENV_KEYS) {
    const v = savedEnv[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

let now = 10_000_000;
function configure(opts: { session?: number; ip?: number; windowMs?: number; trust?: boolean; maxKeys?: number; hops?: number }): void {
  now = 10_000_000;
  setMutationLimitNowForTests(() => now);
  if (opts.session !== undefined) process.env.QUAY_MUTATION_SESSION_LIMIT = String(opts.session);
  else delete process.env.QUAY_MUTATION_SESSION_LIMIT;
  if (opts.ip !== undefined) process.env.QUAY_MUTATION_IP_LIMIT = String(opts.ip);
  else delete process.env.QUAY_MUTATION_IP_LIMIT;
  process.env.QUAY_MUTATION_WINDOW_MS = String(opts.windowMs ?? 60_000);
  if (opts.maxKeys !== undefined) process.env.QUAY_MUTATION_MAX_KEYS = String(opts.maxKeys);
  else delete process.env.QUAY_MUTATION_MAX_KEYS;
  if (opts.hops !== undefined) process.env.QUAY_TRUSTED_PROXY_HOPS = String(opts.hops);
  else delete process.env.QUAY_TRUSTED_PROXY_HOPS;
  if (opts.trust) process.env.QUAY_TRUST_PROXY = "1";
  else delete process.env.QUAY_TRUST_PROXY;
  resetMutationLimits();
}

function cookieFrom(res: Response): string {
  const hit = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!hit) throw new Error("missing session cookie");
  return hit.split(";")[0]!;
}

async function signUp(handle: string): Promise<string> {
  const res = await register(new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ handle, password: "password1" }),
  }));
  expect(res.status).toBe(201);
  return cookieFrom(res);
}

function post(url: string, cookie: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: "http://localhost", ...headers },
    body: JSON.stringify(body),
  });
}

const mkt = (assetId: string, side: "BUY" | "SELL", qty: string): OrderDraft => ({ assetId, side, type: "market", qty, tif: "day" });

async function place(cookie: string, key: string, draft: OrderDraft, headers: Record<string, string> = {}): Promise<Response> {
  return placeRoute(post("/api/broker/orders", cookie, { idempotencyKey: key, draft }, headers));
}

async function ledger(cookie: string): Promise<BrokerLedgerView> {
  const res = await brokerMe(new Request("http://localhost/api/broker/me", { headers: { cookie } }));
  expect(res.status).toBe(200);
  return res.json();
}

function expectLimited(res: Response, body: { error: { code: string } }): void {
  expect(res.status).toBe(429);
  expect(res.headers.get("retry-after")).toMatch(/^[1-9]\d*$/);
  expect(body.error.code).toBe("RATE_LIMITED");
}

describe("M3-05 mutation rate limits", () => {
  beforeEach(() => {
    restoreEnv();
    setAuthServiceForTests(new AuthService({ store: new MemoryAuthStore() }));
    setLiveMarketForTests(new LiveMarket({ persistStorms: false }));
    setBrokerForTests(undefined);
    configure({ session: 2, ip: 100 });
  });

  afterEach(() => {
    setBrokerForTests(undefined);
    setLiveMarketForTests(undefined);
    setAuthServiceForTests(undefined);
    resetListingsForTests();
    setMutationLimitNowForTests(null);
    restoreEnv();
    resetMutationLimits();
  });

  it("returns 429 before a third order and does not fill a replay until the window passes", async () => {
    const a = await signUp("LimitA");
    const first = await place(a, "key-lim-0001", mkt("HALC", "BUY", "1"));
    const firstBody = (await first.json()) as BrokerIntentReply;
    expect(first.status).toBe(200);
    expect(firstBody.result.status).toBe("ACCEPTED");
    const second = await place(a, "key-lim-0002", mkt("HALC", "BUY", "1"));
    const secondBody = (await second.json()) as BrokerIntentReply;
    expect(second.status).toBe(200);
    const cash = secondBody.ledger.cashCents;
    expect(cash).toBeLessThan(START_CASH_CENTS);

    const blocked = await place(a, "key-lim-0003", mkt("HALC", "BUY", "1"));
    expectLimited(blocked, await blocked.json());
    expect((await ledger(a)).cashCents).toBe(cash);

    const replayBlocked = await place(a, "key-lim-0001", mkt("HALC", "BUY", "1"));
    expectLimited(replayBlocked, await replayBlocked.json());
    expect((await ledger(a)).cashCents).toBe(cash);

    now += 60_000;
    const replay = await place(a, "key-lim-0001", mkt("HALC", "BUY", "1"));
    const replayBody = (await replay.json()) as BrokerIntentReply;
    expect(replay.status).toBe(200);
    expect(replayBody.intentId).toBe(firstBody.intentId);
    expect(replayBody.ledger.cashCents).toBe(cash);
    expect((await ledger(a)).cashCents).toBe(cash);
  });

  it("does not cancel an open order when the player is already at the cap", async () => {
    configure({ session: 1, ip: 100 });
    const a = await signUp("LimitCancel");
    const placed = await place(a, "key-can-0001", { assetId: "HALC", side: "BUY", type: "limit", qty: "1", limit: "0.01", tif: "day" });
    const placedBody = (await placed.json()) as BrokerIntentReply;
    expect(placed.status).toBe(200);
    expect(placedBody.result.status).toBe("ACCEPTED");
    const orderId = Object.keys(placedBody.ledger.orders)[0];
    expect(orderId).toBeTruthy();

    const blocked = await cancelRoute(post("/api/broker/orders/cancel", a, { idempotencyKey: "key-can-0002", orderId }));
    expectLimited(blocked, await blocked.json());
    expect(Object.keys((await ledger(a)).orders)).toEqual([orderId]);
  });

  it("caps a shared trusted IP across players and ignores a spoofed forwarding header", async () => {
    configure({ session: 100, ip: 1, trust: true });
    const a = await signUp("IpA");
    const b = await signUp("IpB");
    const ok = await place(a, "key-ip-00001", mkt("HALC", "BUY", "1"), { "x-forwarded-for": "198.51.100.9, 203.0.113.8" });
    expect(ok.status).toBe(200);
    const shared = await place(b, "key-ip-00002", mkt("HALC", "BUY", "1"), { "x-forwarded-for": "203.0.113.1, 203.0.113.8" });
    expectLimited(shared, await shared.json());
    expect((await ledger(b)).cashCents).toBe(START_CASH_CENTS);

    const otherIp = await place(a, "key-ip-00003", mkt("HALC", "BUY", "1"), { "x-forwarded-for": "203.0.113.8, 203.0.113.9" });
    expect(otherIp.status).toBe(200);

    configure({ session: 100, ip: 1, trust: false });
    const c = await signUp("IpC");
    const first = await place(c, "key-ip-00004", mkt("HALC", "BUY", "1"), { "x-forwarded-for": "203.0.113.8" });
    const second = await place(c, "key-ip-00005", mkt("HALC", "BUY", "1"), { "x-forwarded-for": "203.0.113.8" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it("does not charge a launch, a trade, or a Wire post once the player cap is spent", async () => {
    configure({ session: 1, ip: 100 });
    const a = await signUp("LimitLaunch");
    const launched = await launchRoute(post("/api/launchpad/launch", a, {
      idempotencyKey: "launch-key-01", name: "Frog Club", ticker: "FROG", tagline: "tg5", fee: LP.LAUNCH_FEE,
    }));
    expect(launched.status).toBe(200);
    const afterLaunch = (await launched.json()) as { cashCents: number };
    expect(afterLaunch.cashCents).toBe(START_CASH_CENTS - LP.LAUNCH_FEE);

    const again = await launchRoute(post("/api/launchpad/launch", a, {
      idempotencyKey: "launch-key-02", name: "Gull Club", ticker: "GULL", tagline: "tg5", fee: LP.LAUNCH_FEE,
    }));
    expectLimited(again, await again.json());
    const traded = await tradeRoute(post("/api/launchpad/trade", a, {
      idempotencyKey: "trade-key-001", ticker: "FROG", side: "buy", amount: 50_000, min: 1,
    }));
    expectLimited(traded, await traded.json());
    const posted = await wireRoute(post("/api/wire", a, {
      idempotencyKey: "wire-key-0001", text: "HALC looks steady today.", assetTags: ["HALC"],
    }));
    expectLimited(posted, await posted.json());
    expect((await ledger(a)).cashCents).toBe(START_CASH_CENTS - LP.LAUNCH_FEE);
  });

  it("uses the default per-player cap of 120 in a one-minute window", async () => {
    configure({ windowMs: 60_000 });
    const a = await signUp("LimitDefault");
    const req = () => new Request("http://localhost/api/broker/orders", { headers: { cookie: a, origin: "http://localhost" } });
    for (let i = 0; i < MUTATION_SESSION_LIMIT_DEFAULT; i++) await assertMutationAllowed(req());
    await expect(assertMutationAllowed(req())).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });

  it("junk cookies share one IP cap and the bucket map stays bounded", async () => {
    configure({ session: 1000, ip: 2, trust: true, maxKeys: 4, hops: 1 });
    expect(forwardedClientFromRight("1.1.1.1, 203.0.113.8", 1)).toBe("203.0.113.8");
    expect(forwardedClientFromRight("9.9.9.9, 203.0.113.8, 198.51.100.2", 2)).toBe("203.0.113.8");
    const junk = (n: number, xff: string) => new Request("http://localhost/api/broker/orders", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=junk-${n}-not-a-session`, origin: "http://localhost", "x-forwarded-for": xff },
    });
    await assertMutationAllowed(junk(0, "9.9.9.9, 203.0.113.8"));
    await assertMutationAllowed(junk(1, "8.8.8.8, 203.0.113.8"));
    await expect(assertMutationAllowed(junk(2, "7.7.7.7, 203.0.113.8"))).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
    for (let i = 0; i < 5000; i++) {
      await assertMutationAllowed(junk(1000 + i, `spoof-${i}, 203.0.113.8`)).catch((err: unknown) => {
        if (!(err instanceof Error) || !("code" in err) || (err as { code?: string }).code !== "RATE_LIMITED") throw err;
      });
    }
    expect(mutationBucketCountForTests()).toBe(1);

    for (let i = 1; i <= 20; i++) {
      await assertMutationAllowed(junk(i, `1.2.3.4, 203.0.113.${i}`)).catch(() => undefined);
    }
    expect(mutationBucketCountForTests()).toBeLessThanOrEqual(4);
  });

  it("drops expired buckets on the next check", async () => {
    configure({ session: 10, ip: 10, trust: true, windowMs: 1_000, maxKeys: 10 });
    const req = (ip: string) => new Request("http://localhost/api/broker/orders", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=junk-${ip}`, origin: "http://localhost", "x-forwarded-for": ip },
    });
    await assertMutationAllowed(req("203.0.113.1"));
    await assertMutationAllowed(req("203.0.113.2"));
    expect(mutationBucketCountForTests()).toBe(2);
    now += 1_000;
    await assertMutationAllowed(req("203.0.113.3"));
    expect(mutationBucketCountForTests()).toBe(1);
  });
});
