import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as postConsent } from "@/app/api/telemetry/consent/route";
import { POST as postError } from "@/app/api/telemetry/error/route";
import { POST as postEvent } from "@/app/api/telemetry/event/route";
import { AuthService, MemoryAuthStore, setAuthServiceForTests } from "@/server/auth";
import {
  addConsent,
  anonIdForAccount,
  flushTelemetry,
  resetOptOutCache,
  resetTelemetryLimits,
  resetTelemetrySecretCache,
  setTelemetryBypassConsentForTests,
  setTelemetryGlobalLimits,
  setTelemetryLimits,
  scrubTelemetryText,
  TELEMETRY_DIR_MAX_BYTES,
  TELEMETRY_FILE_MAX_BYTES,
  TELEMETRY_FILE_ROTATIONS,
  TELEMETRY_MAX_BODY_BYTES,
  TELEMETRY_SECRET_FILE,
  telemetrySecret,
} from "@/server/telemetry";
import { readJsonObjectCappedStreaming } from "@/server/telemetry/http";

async function dirBytes(dir: string): Promise<number> {
  const names = await readdir(dir);
  let n = 0;
  for (const name of names) n += (await stat(path.join(dir, name))).size;
  return n;
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

describe("telemetry delta: ceiling, scrub, stream, HMAC, per-client limit, opt-in", () => {
  let dir: string;
  const temps: string[] = [];

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "quay-tel-d-"));
    temps.push(dir);
    process.env.QUAY_TELEMETRY_DIR = dir;
    process.env.QUAY_TELEMETRY_SECRET = "test-telemetry-secret-key-32b";
    resetOptOutCache();
    resetTelemetrySecretCache();
    resetTelemetryLimits();
    setTelemetryBypassConsentForTests(false);
    setAuthServiceForTests(new AuthService({ store: new MemoryAuthStore() }));
  });

  afterEach(async () => {
    delete process.env.QUAY_TELEMETRY_DIR;
    delete process.env.QUAY_TELEMETRY_SECRET;
    delete process.env.QUAY_TRUST_PROXY;
    resetOptOutCache();
    resetTelemetrySecretCache();
    resetTelemetryLimits();
    setTelemetryBypassConsentForTests(false);
    setAuthServiceForTests(undefined);
    await flushTelemetry();
    await Promise.all(temps.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it("scrub matrix: folded emails, phones, IPs, and stripped URL secrets", () => {
    const zwsp = "\u200B";
    const rows: { name: string; input: string; forbidden: RegExp; must?: RegExp }[] = [
      { name: "plain email", input: "user test@example.com failed", forbidden: /test@example\.com/i, must: /\[redacted\]/ },
      { name: "[at] email", input: "mail alice[at]example.com", forbidden: /alice\[at\]example\.com|alice@example\.com/i, must: /\[redacted\]/ },
      { name: "(at) email", input: "mail alice(at)example.com", forbidden: /alice\(at\)example\.com|alice@example\.com/i, must: /\[redacted\]/ },
      { name: "ZWSP-split email", input: `a${zwsp}lice@example.com`, forbidden: /alice@example\.com|a\u200blice/i, must: /\[redacted\]/ },
      { name: "FR phone", input: "call +33 6 12 34 56 78 now", forbidden: /\+33 6 12 34 56 78/, must: /\[redacted\]/ },
      { name: "IPv4", input: "peer 203.0.113.44 timed out", forbidden: /203\.0\.113\.44/, must: /\[redacted\]/ },
      { name: "IPv6", input: "peer 2001:db8:85a3::8a2e:370:7334 timed out", forbidden: /2001:db8:85a3::8a2e:370:7334/i, must: /\[redacted\]/ },
      { name: "loopback v6", input: "bound on ::1", forbidden: /::1/, must: /\[redacted\]/ },
      { name: "URL query", input: "see https://quay.example/cb?token=sekrit&x=1#frag", forbidden: /token=sekrit|#frag|\?token/, must: /https:\/\/quay\.example\/cb/ },
      { name: "stack URL", input: "at https://cdn.example/app.js?token=abc#L12:4", forbidden: /token=abc|#L12/, must: /https:\/\/cdn\.example\/app\.js/ },
      { name: "path query", input: "GET /api/auth/me?token=sekrit ok", forbidden: /token=sekrit|\?token/, must: /\/api\/auth\/me/ },
    ];
    for (const row of rows) {
      const out = scrubTelemetryText(row.input);
      expect(out, row.name).not.toMatch(row.forbidden);
      if (row.must) expect(out, row.name).toMatch(row.must);
    }
    // Clock times are not IPv6.
    expect(scrubTelemetryText("Day 39 · 11:20")).toContain("11:20");
  });

  it("a flood cannot grow the telemetry dir past the ceiling", async () => {
    setTelemetryLimits({ error: { n: 100_000, windowMs: 60_000 } });
    setTelemetryGlobalLimits({ error: { n: 100_000, windowMs: 60_000 } });
    const msg = "flood ".repeat(80); // well under the 2k cap, a few hundred bytes each
    // Without a ceiling, ~2,000 of these lines is well over four 64 KB files (~1 MB of raw log).
    for (let i = 0; i < 2_000; i++) {
      const res = await postError(post("/api/telemetry/error", { route: "/broker", message: `${msg}#${i}` }));
      expect([200, 503], `write ${i}`).toContain(res.status);
    }
    await flushTelemetry();
    const total = await dirBytes(dir);
    expect(total).toBeLessThanOrEqual(TELEMETRY_DIR_MAX_BYTES);
    const names = await readdir(dir);
    const errors = names.filter((n) => n === "errors.jsonl" || n.startsWith("errors.jsonl."));
    expect(errors.length).toBeGreaterThan(1); // rotation happened
    expect(errors.length).toBeLessThanOrEqual(1 + TELEMETRY_FILE_ROTATIONS);
    for (const n of errors) {
      expect((await stat(path.join(dir, n))).size).toBeLessThanOrEqual(TELEMETRY_FILE_MAX_BYTES);
    }
    // A single stream's retained bytes stay at the 4 × 64 KB envelope, not the raw flood size.
    const errorBytes = (await Promise.all(errors.map((n) => stat(path.join(dir, n))))).reduce((s, st) => s + st.size, 0);
    expect(errorBytes).toBeLessThanOrEqual(TELEMETRY_FILE_MAX_BYTES * (1 + TELEMETRY_FILE_ROTATIONS));
    await postError(post("/api/telemetry/error", { route: "/broker", message: "after cap" }));
    await flushTelemetry();
    expect(await dirBytes(dir)).toBeLessThanOrEqual(TELEMETRY_DIR_MAX_BYTES);
  }, 60_000);

  it("enforces the body cap on the stream and cancels after the cap", async () => {
    let pulled = 0;
    const chunk = 1024;
    const stream = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        if (pulled >= TELEMETRY_MAX_BODY_BYTES + chunk * 8) {
          ctrl.close();
          return;
        }
        pulled += chunk;
        ctrl.enqueue(new Uint8Array(chunk).fill(0x78));
      },
    });
    const req = new Request("http://localhost/api/telemetry/error", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: stream,
      // @ts-expect-error Node's Request accepts duplex for streamed bodies
      duplex: "half",
    });
    await expect(readJsonObjectCappedStreaming(req, TELEMETRY_MAX_BODY_BYTES)).rejects.toMatchObject({
      status: 400,
      message: "Request body is too large.",
    });
    expect(pulled).toBeLessThanOrEqual(TELEMETRY_MAX_BODY_BYTES + chunk);
    expect(pulled).toBeGreaterThan(TELEMETRY_MAX_BODY_BYTES);

    const declared = new Request("http://localhost/api/telemetry/error", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        "content-length": String(TELEMETRY_MAX_BODY_BYTES + 50),
      },
      body: "x".repeat(TELEMETRY_MAX_BODY_BYTES + 50),
    });
    await expect(readJsonObjectCappedStreaming(declared, TELEMETRY_MAX_BODY_BYTES)).rejects.toMatchObject({ status: 400 });
  });

  it("salts the anon id with HMAC; acc_ is not enough to compute it; logs without a secret fail closed", async () => {
    const acc = "acc_deadbeef12dead";
    const a = anonIdForAccount(acc);
    expect(a).toEqual(expect.stringMatching(/^anon_[a-f0-9]{16}$/));
    // Unsalted sha256 / the old prefix scheme must not match.
    const { createHash, createHmac } = await import("node:crypto");
    const unsalted = `anon_${createHash("sha256").update(`telemetry-anon:${acc}`).digest("hex").slice(0, 16)}`;
    expect(a).not.toBe(unsalted);
    const other = createHmac("sha256", "some-other-secret-key-32bxxxx").update(acc).digest("hex").slice(0, 16);
    expect(a).not.toBe(`anon_${other}`);
    expect(telemetrySecret()).toBe("test-telemetry-secret-key-32b");

    // Fail closed: existing logs, no env, no secret file → no new key, no hash.
    delete process.env.QUAY_TELEMETRY_SECRET;
    resetTelemetrySecretCache();
    const emptyish = await mkdtemp(path.join(tmpdir(), "quay-tel-fc-"));
    temps.push(emptyish);
    await writeFile(path.join(emptyish, "events.jsonl"), "{\"ts\":\"x\",\"event\":\"signup\",\"anonId\":\"anon_abcdabcdabcdabcd\"}\n");
    process.env.QUAY_TELEMETRY_DIR = emptyish;
    resetTelemetrySecretCache();
    expect(telemetrySecret()).toBeNull();
    expect(anonIdForAccount(acc)).toBeNull();
    expect(await readdir(emptyish)).not.toContain(TELEMETRY_SECRET_FILE);
  });

  it("rate-limits per client so one flooder does not 429 another, with a global backstop", async () => {
    setTelemetryLimits({ error: { n: 3, windowMs: 60_000 } });
    setTelemetryGlobalLimits({ error: { n: 5, windowMs: 60_000 } });
    const a = "anon_aaaaaaaaaaaaaaaa";
    const b = "anon_bbbbbbbbbbbbbbbb";
    const statusesA: number[] = [];
    const statusesB: number[] = [];
    for (let i = 0; i < 3; i++) {
      statusesA.push((await postError(post("/api/telemetry/error", { route: "/broker", message: `a${i}`, anonId: a }))).status);
    }
    expect(statusesA).toEqual([200, 200, 200]);
    expect((await postError(post("/api/telemetry/error", { route: "/broker", message: "a3", anonId: a }))).status).toBe(429);
    // B is a different client and can still write.
    statusesB.push((await postError(post("/api/telemetry/error", { route: "/broker", message: "b0", anonId: b }))).status);
    statusesB.push((await postError(post("/api/telemetry/error", { route: "/broker", message: "b1", anonId: b }))).status);
    expect(statusesB).toEqual([200, 200]);
    // Global cap is 5: A used 3 accepted, B used 2 accepted; the next global write 429s even for B.
    expect((await postError(post("/api/telemetry/error", { route: "/broker", message: "b2", anonId: b }))).status).toBe(429);
  });

  it("does not record analytics until the anon id consents; errors still land", async () => {
    const anon = "anon_cccccccccccccccc";
    const ev = await postEvent(post("/api/telemetry/event", { event: "first_wire_open", anonId: anon }));
    expect(ev.status).toBe(200);
    await flushTelemetry();
    expect((await readFile(path.join(dir, "events.jsonl"), "utf8").catch(() => "")).trim()).toBe("");
    const err = await postError(post("/api/telemetry/error", { route: "/broker", message: "still logs" }));
    expect(err.status).toBe(200);
    await addConsent(anon, true);
    const ev2 = await postEvent(post("/api/telemetry/event", { event: "first_wire_open", anonId: anon }));
    expect(ev2.status).toBe(200);
    await flushTelemetry();
    const events = (await readFile(path.join(dir, "events.jsonl"), "utf8")).trim().split("\n");
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]!)).toMatchObject({ event: "first_wire_open", anonId: anon });

    const granted = await postConsent(post("/api/telemetry/consent", { anonId: "anon_dddddddddddddddd", granted: true }));
    expect(granted.status).toBe(200);
  });
});
