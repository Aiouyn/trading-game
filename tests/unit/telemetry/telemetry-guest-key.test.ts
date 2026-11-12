import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as postError } from "@/app/api/telemetry/error/route";
import { POST as postFeedback } from "@/app/api/telemetry/feedback/route";
import {
  clientKey,
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

describe("telemetry guest keys and trusted forwarding", () => {
  beforeEach(() => {
    delete process.env.QUAY_TRUST_PROXY;
    resetTelemetryLimits();
  });

  afterEach(() => {
    delete process.env.QUAY_TRUST_PROXY;
    resetTelemetryLimits();
  });

  it("does not let one guest at the feedback cap 429 a second guest", async () => {
    setTelemetryLimits({ feedback: { n: 8, windowMs: 60_000 } });
    setTelemetryGlobalLimits({ feedback: { n: 32, windowMs: 60_000 } });
    const guestA = "a".repeat(16);
    const guestB = "b".repeat(16);
    const keyA = clientKey(feedback({ cookie: `${TELEMETRY_GUEST_COOKIE}=${guestA}` }));
    const keyB = clientKey(feedback({ cookie: `${TELEMETRY_GUEST_COOKIE}=${guestB}` }));
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
    expect(clientKey(error({ "x-forwarded-for": spoofed }))).toBe(`ip:${right}`);
    expect(clientKey(error({ "x-forwarded-for": spoofed }))).not.toContain("203.0.113.9");
    expect(clientKey(error({ "x-forwarded-for": `203.0.113.9, ${other}` }))).toBe(`ip:${other}`);

    delete process.env.QUAY_TRUST_PROXY;
    expect(clientKey(error({ "x-forwarded-for": spoofed }))).toBe("anon-missing");
    process.env.QUAY_TRUST_PROXY = "1";

    setTelemetryLimits({ error: { n: 1, windowMs: 60_000 } });
    setTelemetryGlobalLimits({ error: { n: 50, windowMs: 60_000 } });
    expect((await postError(error({ "x-forwarded-for": `1.1.1.1, ${right}` }, "first"))).status).toBe(200);
    expect((await postError(error({ "x-forwarded-for": `9.9.9.9, ${right}` }, "same hop"))).status).toBe(429);
    expect((await postError(error({ "x-forwarded-for": `1.1.1.1, ${other}` }, "other hop"))).status).toBe(200);
  });
});
