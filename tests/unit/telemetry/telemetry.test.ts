import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as postError } from "@/app/api/telemetry/error/route";
import { POST as postEvent } from "@/app/api/telemetry/event/route";
import { POST as postFeedback } from "@/app/api/telemetry/feedback/route";
import { POST as postOptOut } from "@/app/api/telemetry/optout/route";
import { AuthService, MemoryAuthStore, setAuthServiceForTests } from "@/server/auth";
import { BrokerService, setBrokerForTests } from "@/server/broker";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";
import {
  anonIdForAccount,
  flushTelemetry,
  resetOptOutCache,
  resetTelemetryLimits,
  setTelemetryLimits,
  TELEMETRY_MAX_BODY_BYTES,
} from "@/server/telemetry";

async function lines(dir: string, file: string): Promise<Record<string, unknown>[]> {
  try {
    const raw = await readFile(path.join(dir, file), "utf8");
    return raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  } catch {
    return [];
  }
}

function post(url: string, body: unknown, headers: Record<string, string | undefined> = {}): Request {
  const h = new Headers({ "content-type": "application/json" });
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) h.delete(k);
    else h.set(k, v);
  }
  if (!h.has("origin") && headers.origin !== "") h.set("origin", "http://localhost");
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new Request(`http://localhost${url}`, { method: "POST", headers: h, body: payload });
}

describe("V1 alpha telemetry", () => {
  let dir: string;
  let auth: AuthService;
  const temps: string[] = [];

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "quay-tel-"));
    temps.push(dir);
    process.env.QUAY_TELEMETRY_DIR = dir;
    resetOptOutCache();
    resetTelemetryLimits();
    auth = new AuthService({ store: new MemoryAuthStore() });
    setAuthServiceForTests(auth);
  });

  afterEach(async () => {
    delete process.env.QUAY_TELEMETRY_DIR;
    resetOptOutCache();
    resetTelemetryLimits();
    setAuthServiceForTests(undefined);
    setBrokerForTests(undefined);
    setLiveMarketForTests(undefined);
    await flushTelemetry();
    await Promise.all(temps.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it("error POST writes a scrubbed JSON line with request id and route", async () => {
    const res = await postError(post("/api/telemetry/error", {
      route: "/broker",
      message: "Authorization: Bearer secret.token Cookie: sid=abc user acc_deadbeef12 mailed test@example.com",
    }, { "x-request-id": "req-error-0001" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-error-0001");
    const rows = await lines(dir, "errors.jsonl");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ requestId: "req-error-0001", route: "/broker", level: "error" });
    const msg = String(rows[0]!.message);
    expect(msg).not.toMatch(/secret\.token|sid=abc|acc_deadbeef12|test@example.com/i);
    expect(msg).toContain("[redacted]");
  });

  it("rejects an oversize error body and a missing Origin, and holds the rate limit", async () => {
    const huge = "x".repeat(TELEMETRY_MAX_BODY_BYTES + 20);
    const over = await postError(post("/api/telemetry/error", `{"route":"/x","message":"${huge}"}`));
    expect(over.status).toBe(400);

    const noOrigin = await postError(new Request("http://localhost/api/telemetry/error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ route: "/broker", message: "boom" }),
    }));
    expect(noOrigin.status).toBe(403);

    const evil = await postError(post("/api/telemetry/error", { route: "/broker", message: "boom" }, { origin: "https://evil.example" }));
    expect(evil.status).toBe(403);

    setTelemetryLimits({ error: { n: 3, windowMs: 60_000 } });
    resetTelemetryLimits(); // resets to defaults — re-apply after reset in this test
    setTelemetryLimits({ error: { n: 3, windowMs: 60_000 } });
    const ok: number[] = [];
    for (let i = 0; i < 4; i++) {
      ok.push((await postError(post("/api/telemetry/error", { route: "/broker", message: `n${i}` }))).status);
    }
    expect(ok.slice(0, 3)).toEqual([200, 200, 200]);
    expect(ok[3]).toBe(429);
    expect((await lines(dir, "errors.jsonl")).length).toBe(3);
  });

  it("feedback POST stores text and route; cap and CSRF apply", async () => {
    const res = await postFeedback(post("/api/telemetry/feedback", { text: "The ticket is confusing.", route: "/broker" }, { "x-request-id": "req-fb-0001" }));
    expect(res.status).toBe(200);
    const rows = await lines(dir, "feedback.jsonl");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      requestId: "req-fb-0001",
      route: "/broker",
      text: "The ticket is confusing.",
    });

    const long = await postFeedback(post("/api/telemetry/feedback", { text: "n".repeat(1001), route: "/broker" }));
    expect(long.status).toBe(400);
    const noOrigin = await postFeedback(new Request("http://localhost/api/telemetry/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hi", route: "/broker" }),
    }));
    expect(noOrigin.status).toBe(403);
  });

  it("counts events by anon id; hooks fire once as specified; DNT and opt-out skip analytics", async () => {
    const { view } = await auth.register({ handle: "TelUser", password: "password1" });
    const anon = anonIdForAccount(view.account.accountId);
    expect(anon).toMatch(/^anon_[a-f0-9]{16}$/);
    expect(anon).not.toContain(view.account.accountId);
    expect(anon).not.toContain("TelUser");

    const loggedIn = await auth.login({ handle: "TelUser", password: "password1" });
    expect(loggedIn.view.account.accountId).toBe(view.account.accountId);
    await auth.postWireStatement({
      accountId: view.account.accountId,
      handle: view.account.handle,
      idempotencyKey: "stmt-tel-01",
      text: "hello world",
      assetTags: ["HALC"],
      tick: 27_700,
      marks: { HALC: "100" },
    });
    await auth.postWireStatement({
      accountId: view.account.accountId,
      handle: view.account.handle,
      idempotencyKey: "stmt-tel-01",
      text: "hello world",
      assetTags: ["HALC"],
      tick: 27_700,
      marks: { HALC: "100" },
    });

    const market = new LiveMarket();
    setLiveMarketForTests(market);
    const broker = new BrokerService({ auth: () => auth, market: () => market });
    setBrokerForTests(broker);
    const draft = { assetId: "HALC", side: "BUY" as const, type: "market" as const, qty: "1", tif: "day" as const };
    const first = await broker.place(view, "ft-key-0001", draft);
    expect(first.result.status).toBe("ACCEPTED");
    const replay = await broker.place(view, "ft-key-0001", draft);
    expect(replay.result.status).toBe("ACCEPTED");
    const second = await broker.place(view, "ft-key-0002", draft);
    expect(second.result.status).toBe("ACCEPTED");
    market.stop();
    await flushTelemetry();

    let events = await lines(dir, "events.jsonl");
    const kinds = events.map((e) => e.event);
    expect(kinds.filter((e) => e === "signup")).toEqual(["signup"]);
    expect(kinds.filter((e) => e === "session_start")).toHaveLength(2); // register + login
    expect(kinds.filter((e) => e === "statement_post")).toEqual(["statement_post"]);
    expect(kinds.filter((e) => e === "first_trade")).toEqual(["first_trade"]);
    expect(events.every((e) => e.anonId === anon)).toBe(true);

    // Client may only post first_wire_open; signup is rejected.
    const bad = await postEvent(post("/api/telemetry/event", { event: "signup", anonId: anon }));
    expect(bad.status).toBe(400);
    const wireOpen = await postEvent(post("/api/telemetry/event", { event: "first_wire_open", anonId: "anon_abcd1234abcd1234" }));
    expect(wireOpen.status).toBe(200);

    // DNT skips analytics, still accepts errors.
    const dnt = await postEvent(post("/api/telemetry/event", { event: "first_wire_open", anonId: "anon_dddd1111eeee2222" }, { dnt: "1" }));
    expect(dnt.status).toBe(200);
    const stillErr = await postError(post("/api/telemetry/error", { route: "/wire", message: "dnt still logs errors" }, { dnt: "1" }));
    expect(stillErr.status).toBe(200);

    await flushTelemetry();
    const beforeOpt = (await lines(dir, "events.jsonl")).length;
    const opt = await postOptOut(post("/api/telemetry/optout", { anonId: "anon_ffff0000aaaa1111" }));
    expect(opt.status).toBe(200);
    const skipped = await postEvent(post("/api/telemetry/event", { event: "first_wire_open", anonId: "anon_ffff0000aaaa1111" }));
    expect(skipped.status).toBe(200);
    await flushTelemetry();
    expect((await lines(dir, "events.jsonl")).length).toBe(beforeOpt); // DNT and opt-out must not append

    events = await lines(dir, "events.jsonl");
    const allLogs = [
      ...(await lines(dir, "events.jsonl")),
      ...(await lines(dir, "errors.jsonl")),
      ...(await lines(dir, "feedback.jsonl")),
    ];
    const blob = JSON.stringify(allLogs);
    expect(blob).not.toMatch(/\bacc_[a-z0-9]+\b/i);
    expect(blob).not.toMatch(/@/);
  });
});
