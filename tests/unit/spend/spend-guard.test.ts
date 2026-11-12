import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as healthGet } from "@/app/api/health/route";
import { ReviewBlock } from "@/apps/broker/TicketReview";
import { EN } from "@/apps/broker/strings-en";
import { register } from "@/instrumentation";
import { proxy } from "@/proxy";
import { LiveMarket, shouldAutostartClock } from "@/server/market/clock";
import {
  SpendGuardError,
  assertPaidProviderEnabled,
  clockAutostartAllowed,
  readOnlyBlock,
  resolveSpendGuard,
  type PaidProviderId,
} from "@/server/spend/guard";
import { authErrorCopy, registerAccount, loginAccount } from "@/shell/authClient";
import { GamePaused } from "@/shell/contracts/network";
import { marketDayDraft, placeOrder, type AssetId, type OrderTransport, type WholeQty } from "@/shell/contracts/orders";
import { FEED_TICK_MS } from "@/shell/contracts/mockFeed";
import { runReady } from "../../../tools/ops/ready";

const SECRET = "super-secret-value";

function bootRegister(extra: Record<string, string>): { status: number | null; stderr: string } {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.QUAY_SPEND_OPT_IN;
  delete env.QUAY_KILL_SWITCH;
  delete env.DATABASE_URL;
  delete env.VERCEL;
  Object.assign(env, extra);
  const result = spawnSync(
    path.join(process.cwd(), "node_modules", ".bin", "tsx"),
    ["tools/ops/boot-register.ts"],
    { cwd: process.cwd(), env: env as NodeJS.ProcessEnv, encoding: "utf8", timeout: 30_000 },
  );
  return { status: result.status, stderr: result.stderr ?? "" };
}

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

  it("fails boot validation when a flag is not exactly 1 or a paid URL is malformed", async () => {
    expect(() => resolveSpendGuard({ QUAY_SPEND_OPT_IN: "yes" })).toThrow(/QUAY_SPEND_OPT_IN must be unset or exactly "1"/);
    expect(() => resolveSpendGuard({ QUAY_SPEND_OPT_IN: " 1" })).toThrow(/QUAY_SPEND_OPT_IN must be unset or exactly "1"/);
    expect(() => resolveSpendGuard({ QUAY_SPEND_OPT_IN: "1 " })).toThrow(/QUAY_SPEND_OPT_IN must be unset or exactly "1"/);
    expect(() => resolveSpendGuard({ QUAY_KILL_SWITCH: "true" })).toThrow(/QUAY_KILL_SWITCH must be unset or exactly "1"/);
    expect(() => resolveSpendGuard({ QUAY_KILL_SWITCH: " 1" })).toThrow(/QUAY_KILL_SWITCH must be unset or exactly "1"/);
    expect(() => resolveSpendGuard({ QUAY_SPEND_OPT_IN: "1", DATABASE_URL: "not-a-url" })).toThrow(/DATABASE_URL/);
    expect(resolveSpendGuard({ QUAY_SPEND_OPT_IN: "1", DATABASE_URL: "https://db.example" }).enabled).toContain("database");
    await expect(register()).resolves.toBeUndefined();
  });

  it("register exits non-zero when a paid URL is set without an exact opt-in", () => {
    const refuse = bootRegister({ DATABASE_URL: "https://example.supabase.co", QUAY_SPEND_OPT_IN: " 1" });
    expect(refuse.status).toBe(1);
    expect(refuse.stderr).toMatch(/QUAY_SPEND_OPT_IN/);
    expect(refuse.stderr).not.toContain("example.supabase.co");
    const allow = bootRegister({ DATABASE_URL: "https://example.supabase.co", QUAY_SPEND_OPT_IN: "1" });
    expect(allow.status).toBe(0);
  });

  it("kill switch tells register, login, and Place that the game is paused", async () => {
    const env = process.env as Record<string, string | undefined>;
    const prev = env.QUAY_KILL_SWITCH;
    env.QUAY_KILL_SWITCH = "1";
    try {
      const res = proxy(new NextRequest("http://localhost/api/auth/register", { method: "POST" }));
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: { code: "READ_ONLY", message: "The game is paused." } });
    } finally {
      if (prev === undefined) delete env.QUAY_KILL_SWITCH;
      else env.QUAY_KILL_SWITCH = prev;
    }

    const body = JSON.stringify({ error: { code: "READ_ONLY", message: "The game is paused." } });
    const fetchMock = vi.fn(async () => new Response(body, { status: 503, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(registerAccount("ada", "password1")).rejects.toMatchObject({ code: "READ_ONLY", message: "The game is paused." });
      await expect(loginAccount("ada", "password1")).rejects.toMatchObject({ code: "READ_ONLY", message: "The game is paused." });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(authErrorCopy({ code: "READ_ONLY", message: "The game is paused.", status: 503 }, "en")).toBe("The game is paused.");
    expect(authErrorCopy({ code: "READ_ONLY", message: "The game is paused.", status: 503 }, "fr")).toBe("Le jeu est en pause.");

    const transport: OrderTransport = {
      preview: () => { throw new GamePaused("The game is paused."); },
      submit: () => { throw new GamePaused("The game is paused."); },
      cancel: () => { throw new GamePaused("The game is paused."); },
    };
    const placed = await placeOrder(marketDayDraft("HALC" as AssetId, "BUY", "1" as WholeQty), transport);
    expect(placed.ok).toBe(false);
    if (!placed.ok) expect(placed.error).toEqual({ kind: "paused", message: "The game is paused." });
    const html = renderToStaticMarkup(createElement(ReviewBlock, {
      t: EN, locale: "en", action: "Buy 1 HALC", preview: null, stale: false, halted: false, canPlace: false,
      pendingTick: null, failed: "paused", offline: false, onEdit: () => {}, onPlace: () => {},
    }));
    expect(html).toContain("The game is paused.");
    expect(html).not.toContain("Couldn&#x27;t load");
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
