import { describe, expect, it, vi } from "vitest";
import { EMPTY_FEED, parseFeedEvent, reduceFeed, type FeedEvent } from "@/shell/feed";

const alert = { kind: "alert", alert: { id: "a", priority: "P0", text: "t", action: { label: "Open", href: "/risk" } } };
const world = { kind: "world-event", event: { name: "Crash", day: 3, index: "GX", sincePct: "-18.40", todayPct: "-2.10" } };

describe("17A T6 feed boundary parsing", () => {
  it("accepts well-formed alerts and world events", () => {
    expect(parseFeedEvent(alert)?.kind).toBe("alert");
    expect(parseFeedEvent(world)?.kind).toBe("world-event");
    expect(parseFeedEvent({ kind: "alert-resolved", id: "a" })).toEqual({ kind: "alert-resolved", id: "a" });
    expect(parseFeedEvent({ kind: "world-event-ended" })).toEqual({ kind: "world-event-ended" });
  });
  it.each([
    ["null", null], ["array", []], ["unknown kind", { kind: "toast" }],
    ["bad priority", { ...alert, alert: { ...alert.alert, priority: "P2" } }],
    ["external href", { ...alert, alert: { ...alert.alert, action: { label: "x", href: "https://evil.example" } } }],
    ["script href", { ...alert, alert: { ...alert.alert, action: { label: "x", href: "javascript:alert(1)" } } }],
    ["empty text", { ...alert, alert: { ...alert.alert, text: "" } }],
    ["non-integer day", { ...world, event: { ...world.event, day: 2.5 } }],
    ["non-numeric pct", { ...world, event: { ...world.event, sincePct: "lots" } }],
    ["resolved without id", { kind: "alert-resolved" }],
  ])("drops %s", (_n, raw) => expect(parseFeedEvent(raw)).toBeNull());
  it("strips unknown fields", () => {
    const e = parseFeedEvent({ ...world, event: { ...world.event, endsInDays: 27 } }) as Extract<FeedEvent, { kind: "world-event" }>;
    expect(Object.keys(e.event).sort()).toEqual(["day", "index", "name", "sincePct", "todayPct"]);
  });
});

describe("17A T6 feed reducer", () => {
  it("adds, dedupes and resolves alerts; sets and ends the world event", () => {
    const a = parseFeedEvent(alert)!;
    let s = reduceFeed(reduceFeed(EMPTY_FEED, a), a);
    expect(s.alerts).toHaveLength(1);
    s = reduceFeed(s, { kind: "alert-resolved", id: "a" });
    expect(s.alerts).toHaveLength(0);
    s = reduceFeed(s, parseFeedEvent(world)!);
    expect(s.world?.name).toBe("Crash");
    expect(reduceFeed(s, { kind: "world-event-ended" }).world).toBeNull();
  });
  it("mock source is gated at build time: QUAY_HOOKS=0 emits nothing", async () => {
    vi.resetModules(); vi.stubEnv("QUAY_HOOKS", "0");
    const m = await import("@/shell/feed");
    const got: unknown[] = [];
    m.mockFeedSource(new URLSearchParams("alerts=p0&world=crash"))((r) => got.push(r));
    expect(m.FEED_HOOKS).toBe(false);
    expect(got).toHaveLength(0);
    vi.unstubAllEnvs(); vi.resetModules();
  });
  it("mock source emits raw messages from the URL, including the malformed one", async () => {
    vi.resetModules(); vi.stubEnv("QUAY_HOOKS", "1");
    const { mockFeedSource } = await import("@/shell/feed");
    vi.unstubAllEnvs();
    const got: unknown[] = [];
    mockFeedSource(new URLSearchParams("alerts=p0,bad&world=crash"))((r) => got.push(r));
    expect(got).toHaveLength(3);
    expect(got.map(parseFeedEvent).filter(Boolean)).toHaveLength(2);
  });
});
