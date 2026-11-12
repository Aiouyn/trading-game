import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as postError } from "@/app/api/telemetry/error/route";
import { POST as postFeedback } from "@/app/api/telemetry/feedback/route";
import { AuthService, MemoryAuthStore, SESSION_COOKIE_NAME, setAuthServiceForTests } from "@/server/auth";
import {
  clientKey,
  forwardedClientFromRight,
  resetTelemetryLimits,
  setTelemetryGlobalLimits,
  setTelemetryLimits,
  TELEMETRY_GUEST_COOKIE,
} from "@/server/telemetry/ratelimit";

function request(url: string, headers: Record<string, string>, body: unknown): Request {
  const h = new Headers({ "content-type": "application/json", origin: "http://localhost" });
  for (const [key, value] of Object.entries(headers)) h.set(key, value);
  return new Request(url, { method: "POST", headers: h, body: JSON.stringify(body) });
}

function feedback(headers: Record<string, string> = {}, text = "The ticket is confusing."): Request {
  return request("http://localhost/api/telemetry/feedback", headers, { text, route: "/broker" });
}

function error(headers: Record<string, string> = {}, message = "boom"): Request {
  return request("http://localhost/api/telemetry/error", headers, { route: "/broker", message });
}

function withSocket(req: Request, remoteAddress: string): Request {
  Object.defineProperty(req, "socket", { value: { remoteAddress } });
  return req;
}

describe("telemetry guest keys and trusted forwarding", () => {
  beforeEach(() => {
    delete process.env.QUAY_TRUST_PROXY;
    delete process.env.QUAY_TRUSTED_PROXY_HOPS;
    resetTelemetryLimits();
  });

  afterEach(() => {
    delete process.env.QUAY_TRUST_PROXY;
    delete process.env.QUAY_TRUSTED_PROXY_HOPS;
    setAuthServiceForTests(undefined);
    resetTelemetryLimits();
  });

  it("does not let one guest at the feedback cap 429 a second guest", async () => {
    setTelemetryLimits({ feedback: { n: 8, windowMs: 60_000 } });
    setTelemetryGlobalLimits({ feedback: { n: 32, windowMs: 60_000 } });
    const guestA = "a".repeat(16);
    const guestB = "b".repeat(16);
    const keyA = await clientKey(feedback({ cookie: `${TELEMETRY_GUEST_COOKIE}=${guestA}` }));
    const keyB = await clientKey(feedback({ cookie: `${TELEMETRY_GUEST_COOKIE}=${guestB}` }));
    expect(keyA).not.toBe("anon-missing");
    expect(keyB).not.toBe("anon-missing");
    expect(keyA).not.toBe(keyB);

    const statusesA: number[] = [];
    for (let i = 0; i < 8; i++) {
      statusesA.push((await postFeedback(feedback({ cookie: `${TELEMETRY_GUEST_COOKIE}=${guestA}` }, `note ${i}`))).status);
    }
    expect(statusesA).toEqual([200, 200, 200, 200, 200, 200, 200, 200]);
    expect((await postFeedback(feedback({ cookie: `${TELEMETRY_GUEST_COOKIE}=${guestA}` }, "ninth"))).status).toBe(429);
    expect((await postFeedback(feedback({ cookie: `${TELEMETRY_GUEST_COOKIE}=${guestB}` }, "other guest"))).status).toBe(200);
  });

  it("still applies the global feedback cap across guests", async () => {
    setTelemetryLimits({ feedback: { n: 8, windowMs: 60_000 } });
    setTelemetryGlobalLimits({ feedback: { n: 3, windowMs: 60_000 } });
    const a = "c".repeat(16);
    const b = "d".repeat(16);
    for (let i = 0; i < 3; i++) {
      expect((await postFeedback(feedback({ cookie: `${TELEMETRY_GUEST_COOKIE}=${a}` }, `g ${i}`))).status).toBe(200);
    }
    expect((await postFeedback(feedback({ cookie: `${TELEMETRY_GUEST_COOKIE}=${b}` }, "blocked by global"))).status).toBe(429);
  });

  it("mints a guest cookie when the request has none", async () => {
    const res = await postFeedback(feedback());
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((cookie) => new RegExp(`^${TELEMETRY_GUEST_COOKIE}=[a-f0-9]{32};`).test(cookie))).toBe(true);
    expect(cookies.some((cookie) => cookie.includes("HttpOnly"))).toBe(true);
  });

  it("keys trusted clients by the rightmost X-Forwarded-For hop", async () => {
    process.env.QUAY_TRUST_PROXY = "1";
    const right = "198.51.100.10";
    const other = "198.51.100.11";
    const spoofed = `203.0.113.9, ${right}`;
    expect(await clientKey(error({ "x-forwarded-for": spoofed }))).toBe(`ip:${right}`);
    expect(await clientKey(error({ "x-forwarded-for": spoofed }))).not.toContain("203.0.113.9");
    expect(await clientKey(error({ "x-forwarded-for": `203.0.113.9, ${other}` }))).toBe(`ip:${other}`);

    delete process.env.QUAY_TRUST_PROXY;
    expect(await clientKey(error({ "x-forwarded-for": spoofed }))).toBe("anon-missing");
    process.env.QUAY_TRUST_PROXY = "1";

    setTelemetryLimits({ error: { n: 1, windowMs: 60_000 } });
    setTelemetryGlobalLimits({ error: { n: 50, windowMs: 60_000 } });
    expect((await postError(error({ "x-forwarded-for": `1.1.1.1, ${right}` }, "first"))).status).toBe(200);
    expect((await postError(error({ "x-forwarded-for": `9.9.9.9, ${right}` }, "same hop"))).status).toBe(429);
    expect((await postError(error({ "x-forwarded-for": `1.1.1.1, ${other}` }, "other hop"))).status).toBe(200);
  });

  it("skips QUAY_TRUSTED_PROXY_HOPS from the right and will not use a left spoof on a short chain", async () => {
    process.env.QUAY_TRUST_PROXY = "1";
    process.env.QUAY_TRUSTED_PROXY_HOPS = "2";
    const client = "198.51.100.20";
    const proxy = "203.0.113.1";
    expect(await clientKey(error({ "x-forwarded-for": `203.0.113.9, ${client}, ${proxy}` }))).toBe(`ip:${client}`);
    expect(await clientKey(error({ "x-forwarded-for": `198.51.100.99, ${client}, 203.0.113.8` }))).toBe(`ip:${client}`);

    setTelemetryLimits({ error: { n: 1, windowMs: 60_000 } });
    setTelemetryGlobalLimits({ error: { n: 50, windowMs: 60_000 } });
    expect((await postError(error({ "x-forwarded-for": `203.0.113.9, ${client}, ${proxy}` }, "first"))).status).toBe(200);
    expect((await postError(error({ "x-forwarded-for": `198.51.100.99, ${client}, 203.0.113.8` }, "same client"))).status).toBe(429);
    expect((await postError(error({ "x-forwarded-for": `203.0.113.9, 198.51.100.21, ${proxy}` }, "other client"))).status).toBe(200);

    process.env.QUAY_TRUSTED_PROXY_HOPS = "4";
    expect(await clientKey(error({ "x-forwarded-for": `203.0.113.9, ${client}` }))).toBe(`ip:${client}`);
    process.env.QUAY_TRUSTED_PROXY_HOPS = "nope";
    expect(await clientKey(error({ "x-forwarded-for": `203.0.113.9, ${client}` }))).toBe(`ip:${client}`);
    const huge = "h".repeat(65);
    expect(forwardedClientFromRight(`${huge}, ${client}`, 1)).toBe(client);
    expect(forwardedClientFromRight(`${huge}, ${client}`, 2)).toBe(client);
  });

  it("stops a guest rotating quay_tel at the socket backstop and lets another socket through", async () => {
    setTelemetryLimits({ feedback: { n: 2, windowMs: 60_000 } });
    setTelemetryGlobalLimits({ feedback: { n: 100, windowMs: 60_000 } });
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const cookie = `${TELEMETRY_GUEST_COOKIE}=${String(i).padStart(16, "a")}`;
      statuses.push((await postFeedback(withSocket(feedback({ cookie }, `rot ${i}`), "10.0.0.1"))).status);
    }
    expect(statuses).toEqual([200, 200, 429]);
    expect((await postFeedback(withSocket(feedback({ cookie: `${TELEMETRY_GUEST_COOKIE}=${"b".repeat(16)}` }, "other"), "10.0.0.2"))).status).toBe(200);
  });

  it("does not mint quay_tel on a 429 for a missing or invalid cookie", async () => {
    setTelemetryLimits({ feedback: { n: 1, windowMs: 60_000 } });
    const first = await postFeedback(feedback());
    expect(first.status).toBe(200);
    expect(first.headers.getSetCookie().some((cookie) => cookie.startsWith(`${TELEMETRY_GUEST_COOKIE}=`))).toBe(true);
    const missing = await postFeedback(feedback({}, "again"));
    expect(missing.status).toBe(429);
    expect(missing.headers.getSetCookie()).toEqual([]);
    const invalid = await postFeedback(feedback({ cookie: `${TELEMETRY_GUEST_COOKIE}=short` }, "bad"));
    expect(invalid.status).toBe(429);
    expect(invalid.headers.getSetCookie()).toEqual([]);
  });

  it("keys a live session and not a forged quay_sid", async () => {
    const auth = new AuthService({ store: new MemoryAuthStore() });
    setAuthServiceForTests(auth);
    const { rawToken } = await auth.register({ handle: "LiveUser", password: "password1" });
    const live = await clientKey(error({ cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}` }));
    const forgedA = await clientKey(error({ cookie: `${SESSION_COOKIE_NAME}=forged-token-aaaa` }));
    const forgedB = await clientKey(error({ cookie: `${SESSION_COOKIE_NAME}=forged-token-bbbb` }));
    expect(live.startsWith("s:")).toBe(true);
    expect(forgedA).toBe("anon-missing");
    expect(forgedB).toBe(forgedA);
    expect(forgedA).not.toBe(live);
  });
});
