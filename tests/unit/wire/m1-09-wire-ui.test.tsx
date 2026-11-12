// @vitest-environment happy-dom
// M1-09 Wire UI on server stories (items from a real LiveMarket): a realized story's row shows its effect, its detail
// the cause → consequence and the effect the server applied (from → to, %, when, "applied once", later moves not part
// of it); a forecast says it moves nothing and may not happen; an all-clear says no effect. Guests see the demo label;
// a signed-in account does not. Broker's News tab shows the story's effect on that asset.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetNews } from "@/apps/broker/AssetNews";
import { brStrings } from "@/apps/broker/strings";
import WireApp from "@/apps/wire/App";
import { ShellCtx } from "@/components/shell/ShellContext";
import { STORY_EVERY } from "@/market/wireStories";
import { EN, headline, pctLabel, timeLabel } from "@/apps/wire/strings";
import { LiveMarket } from "@/server/market/clock";
import { authSession } from "@/shell/authSession";
import type { ChannelName, NewsBody, WireItem } from "@/shell/contracts/channels";
import { START_TICK } from "@/shell/contracts/mockFeed";
import { setFeed, type FeedTransport } from "@/shell/contracts/useChannel";
import { defaultChannels } from "@/shell/mockChannels";
import { createShellStore, type ShellStore } from "@/shell/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class HandFeed implements FeedTransport {
  readonly tickMs = 3_600_000;
  readonly subs = new Map<ChannelName, Set<(raw: unknown) => void>>();
  private seq = 0;
  subscribe(ch: ChannelName, fn: (raw: unknown) => void) {
    const s = this.subs.get(ch) ?? new Set(); s.add(fn); this.subs.set(ch, s);
    return () => { s.delete(fn); };
  }
  resync() {}
  async snap(body: NewsBody) { await act(async () => { for (const fn of this.subs.get("news") ?? []) fn({ t: "snap", ch: "news", seq: ++this.seq, tick: body.items.at(-1)?.tick ?? 0, body }); }); }
}

const market = new LiveMarket();
while (market.snapshot().tick < START_TICK + 4 * STORY_EVERY) market.step();
const ITEMS = market.wire().items; // t27706 ORCA realized, t27712 credit watch, t27718 NMBS realized, t27724 credit eased
const byPhase = (p: WireItem["phase"]) => ITEMS.find((i) => i.phase === p)!;

let el: HTMLDivElement, root: Root, store: ShellStore, feed: HandFeed;
beforeEach(() => {
  el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
  store = createShellStore(defaultChannels());
  feed = new HandFeed();
  setFeed(feed);
  authSession._resetForTests();
});
afterEach(async () => { await act(async () => root.unmount()); el.remove(); setFeed(null); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const qa = (id: string) => [...el.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
async function signIn() {
  vi.stubGlobal("fetch", vi.fn(async (u: string) => u === "/api/auth/me"
    ? Response.json({ account: { accountId: "acc_w", handle: "WirePlayer", createdAtMs: 1, worldId: "world_port_avalon" }, session: { sessionId: "ses_w", expiresAtMs: 9e15 }, player: { accountId: "acc_w", cashCents: 1_000_000, positions: {}, openOrders: {} }, world: { worldId: "world_port_avalon", marketSeed: 17 } })
    : new Response(null, { status: 404 })));
  await act(async () => { await authSession.refresh(); });
}
async function mount() {
  store.setState({ vw: 1440 });
  await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(WireApp))); });
  await feed.snap({ items: ITEMS });
}
const open = (id: string) => act(async () => { el.querySelector<HTMLElement>(`[data-testid=wire-row][data-id="${id}"] [data-testid=wire-open]`)!.click(); });

describe("M1-09 Wire stories in the app", () => {
  it("realized: row effect chip; detail cause, from → to (%), applied once at the story time, later moves not part of it", async () => {
    await signIn();
    await mount();
    expect(q("wire-demo")).toBeNull();
    const r = byPhase("realized"), e = r.effects![0]!;
    const row = el.querySelector<HTMLElement>(`[data-testid=wire-row][data-id="${r.id}"]`)!;
    const ticker = r.entities.find((x) => x.id === e.assetId)?.label ?? e.assetId;
    expect(row.querySelector('[data-testid="wire-entity"]')!.textContent).toBe(`${ticker} ${pctLabel(e.pct)}`);
    expect(row.querySelector('[data-testid="wire-effect"]')!.textContent).toBe(` ${pctLabel(e.pct)}`);
    await open(r.id);
    expect(q("wire-detail-headline")!.textContent).toBe(headline(r, EN));
    expect(q("wire-detail-cause")!.textContent!.length).toBeGreaterThan(0);
    const line = q("wire-effect-line")!;
    expect(line.textContent).toBe(`${ticker} ${e.from} → ${e.to} (${pctLabel(e.pct)})`);
    expect([line.dataset.from, line.dataset.to, line.dataset.pct]).toEqual([e.from, e.to, e.pct]);
    expect(q("wire-effect-applied")!.textContent).toBe(`Applied once by the Port Avalon market at ${timeLabel(r.tick, EN)}.`);
    expect(q("wire-effect-later")!.textContent).toMatch(/Later moves aren't part of this story/);
    expect(q("wire-effect-forecast")).toBeNull();
  });

  it("forecast: chip + 'no price effect, it may not happen'; all-clear: 'no price effect: the risk passed'; neither lists an effect", async () => {
    await signIn();
    await mount();
    const f = byPhase("forecast"), x = byPhase("eased");
    expect(el.querySelector(`[data-testid=wire-row][data-id="${f.id}"] [data-testid="wire-forecast"]`)!.textContent).toBe("Forecast");
    expect(el.querySelector(`[data-testid=wire-row][data-id="${x.id}"] [data-testid="wire-no-effect"]`)!.textContent).toBe("No effect");
    await open(f.id);
    expect(q("wire-detail-headline")!.textContent).toBe(headline(f, EN));
    expect(q("wire-effect-forecast")!.textContent).toBe("A forecast, not an outcome: no price effect. It may not happen.");
    expect(qa("wire-effect-line")).toHaveLength(0);
    await open(x.id);
    expect(q("wire-effect-none")!.textContent).toBe("No price effect: the risk passed.");
    expect(qa("wire-effect-line")).toHaveLength(0);
  });

  it("guest: the feed is labelled as example stories that move nothing", async () => {
    await mount();
    expect(q("wire-demo")!.textContent).toBe("Example stories · no price effect");
  });

  it("Broker News tab: the story's effect on this asset", async () => {
    const hit = ITEMS.find((i) => i.effects && i.effects.length > 0)!;
    const assetId = hit.effects![0]!.assetId;
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(AssetNews, { t: brStrings("en"), assetId }))); });
    await feed.snap({ items: ITEMS });
    const story = q("ap-story")!;
    expect(story.dataset.id).toBe(hit.id);
    expect(story.querySelector('[data-testid="ap-story-effect"]')!.textContent).toBe(pctLabel(hit.effects![0]!.pct));
  });
});
