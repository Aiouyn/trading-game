import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as healthGet } from "@/app/api/health/route";
import { register } from "@/instrumentation";
import { LiveMarket, shouldAutostartClock } from "@/server/market/clock";
import {
  SpendGuardError,
  assertPaidProviderEnabled,
  clockAutostartAllowed,
  readOnlyBlock,
  resolveSpendGuard,
  type PaidProviderId,
} from "@/server/spend/guard";
import { FEED_TICK_MS } from "@/shell/contracts/mockFeed";
import { runReady } from "../../../tools/ops/ready";

const SECRET = "super-secret-value";

const SAMPLES: { id: PaidProviderId; key: string; value: string }[] = [
  { id: "hosting", key: "VERCEL", value: "1" },
  { id: "database", key: "DATABASE_URL", value: "https://db.example" },
  { id: "analytics", key: "QUAY_ANALYTICS_SINK", value: "posthog" },
  { id: "log_sink", key: "QUAY_LOG_SINK", value: "https://logs.example/drain" },
  { id: "tick_host", key: "QUAY_TICK_HOST", value: "https://ticks.example" },
];

describe("M3-06 spend guard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts the local alpha when no paid provider is configured", () => {
    const decision = resolveSpendGuard({});
    expect(decision.optIn).toBe(false);
    expect(decision.enabled).toEqual([]);
    expect(decision.killSwitch).toBe(false);
    expect(decision.readOnly).toBe(false);
    expect(() => assertPaidProviderEnabled({}, "database")).toThrow(SpendGuardError);
  });

  it("refuses each paid provider without opt-in and allows the same config when opted in", () => {
    for (const sample of SAMPLES) {
      let refused = "";
      try {
        resolveSpendGuard({ [sample.key]: sample.value });
      } catch (error) {
        refused = error instanceof Error ? error.message : "";
      }
      expect(refused).toMatch(/QUAY_SPEND_OPT_IN=1/);
      expect(refused).toContain(sample.key);
      expect(refused).not.toContain(sample.value === "1" ? "super-secret-value" : sample.value);

      const allowed = resolveSpendGuard({ [sample.key]: sample.value, QUAY_SPEND_OPT_IN: "1" });
      expect(allowed.optIn).toBe(true);
      expect(allowed.enabled).toContain(sample.id);
      expect(() => assertPaidProviderEnabled({ [sample.key]: sample.value, QUAY_SPEND_OPT_IN: "1" }, sample.id)).not.toThrow();
    }
  });

  it("does not echo a secret and does not enable a provider that is only opted in", () => {
    expect(() => resolveSpendGuard({ SUPABASE_SERVICE_ROLE_KEY: SECRET })).toThrowError(
      expect.objectContaining({ message: expect.not.stringContaining(SECRET) as string }),
    );
    try {
      resolveSpendGuard({ SUPABASE_SERVICE_ROLE_KEY: SECRET });
    } catch (error) {
      expect(error).toBeInstanceOf(SpendGuardError);
      expect((error as Error).message).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect((error as Error).message).not.toContain(SECRET);
    }
    expect(() => assertPaidProviderEnabled({ QUAY_SPEND_OPT_IN: "1" }, "database")).toThrow(/not configured/);
  });

  it("fails boot validation when a flag is not exactly 1 or a paid URL is malformed", () => {
    expect(() => resolveSpendGuard({ QUAY_SPEND_OPT_IN: "yes" })).toThrow(/QUAY_SPEND_OPT_IN must be unset or exactly "1"/);
    expect(() => resolveSpendGuard({ QUAY_KILL_SWITCH: "true" })).toThrow(/QUAY_KILL_SWITCH must be unset or exactly "1"/);
    expect(() => resolveSpendGuard({ QUAY_SPEND_OPT_IN: "1", DATABASE_URL: "not-a-url" })).toThrow(/DATABASE_URL/);
    expect(() => register()).not.toThrow();
  });

  it("kill switch pauses tick autostart and refuses mutations", () => {
    expect(clockAutostartAllowed({ NODE_ENV: "production" })).toBe(true);
    expect(clockAutostartAllowed({ NODE_ENV: "production", QUAY_KILL_SWITCH: "1" })).toBe(false);
    expect(readOnlyBlock({ QUAY_KILL_SWITCH: "1" }, "POST")?.status).toBe(503);
    expect(readOnlyBlock({ QUAY_KILL_SWITCH: "1" }, "GET")).toBeNull();
    expect(readOnlyBlock({}, "POST")).toBeNull();

    const env = process.env as Record<string, string | undefined>;
    const prevNode = env.NODE_ENV;
    const prevKill = env.QUAY_KILL_SWITCH;
    env.NODE_ENV = "production";
    env.QUAY_KILL_SWITCH = "1";
    try {
      expect(shouldAutostartClock()).toBe(false);
    } finally {
      env.NODE_ENV = prevNode;
      if (prevKill === undefined) delete env.QUAY_KILL_SWITCH;
      else env.QUAY_KILL_SWITCH = prevKill;
    }
  });

  it("kill switch does not start the quote interval", () => {
    vi.useFakeTimers();
    const env = process.env as Record<string, string | undefined>;
    const prev = env.QUAY_KILL_SWITCH;
    env.QUAY_KILL_SWITCH = "1";
    const market = new LiveMarket({ persistStorms: false });
    try {
      const tick = market.snapshot().tick;
      market.start();
      vi.advanceTimersByTime(FEED_TICK_MS);
      expect(market.snapshot().tick).toBe(tick);
    } finally {
      market.stop();
      if (prev === undefined) delete env.QUAY_KILL_SWITCH;
      else env.QUAY_KILL_SWITCH = prev;
    }
  });

  it("health reports the local process and refuses a paid database without opt-in", async () => {
    const ok = await healthGet();
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { ok: boolean; spendOptIn: boolean; paidProviders: string[]; killSwitch: boolean; tickAutostart: boolean };
    expect(body).toMatchObject({ ok: true, spendOptIn: false, paidProviders: [], killSwitch: false, tickAutostart: false });

    const env = process.env as Record<string, string | undefined>;
    env.DATABASE_URL = "https://example.supabase.co";
    try {
      const refused = await healthGet();
      expect(refused.status).toBe(503);
      const failure = (await refused.json()) as { ok: boolean; message: string };
      expect(failure.ok).toBe(false);
      expect(failure.message).toMatch(/QUAY_SPEND_OPT_IN/);
      expect(failure.message).not.toContain("example.supabase.co");
    } finally {
      delete env.DATABASE_URL;
    }
  });

  it("ready checks a fresh file store and fails closed without opt-in", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "avalon-ready-"));
    try {
      const report = await runReady({
        QUAY_AUTH_DATA_DIR: path.join(dir, "auth"),
        QUAY_STORM_DATA_DIR: path.join(dir, "market"),
      });
      expect(report).toMatch(/local file stores are writable/);
      expect(report).toMatch(/paid providers: none/);
      await expect(runReady({ DATABASE_URL: "https://db.example", QUAY_AUTH_DATA_DIR: dir })).rejects.toThrow(/QUAY_SPEND_OPT_IN/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
