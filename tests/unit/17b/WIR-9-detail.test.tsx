// @vitest-environment happy-dom
// UI card 9 WIR-9 item detail on the bare Feed (a fake shell host): WIR-9-01 open/selection/focus, WIR-9-02 only the
// fields present, WIR-9-03 headline parity + fallback, layout (split vs replace), Esc/Back focus return, stale.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Feed, SPLIT_MIN, type PhoneSub, type WireHost } from "@/apps/wire/Feed";
import { EN, FR, headline } from "@/apps/wire/strings";
import type { NewsBody, WireItem } from "@/shell/contracts/channels";
import { MockFeed } from "@/shell/contracts/mockFeed";
import type { ChannelView } from "@/shell/contracts/useChannel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bodyAfter = (ticks: number, tier: "free" | "terminal" = "free"): NewsBody => {
  const f = new MockFeed({ tier }, { autoStart: false });
  for (let i = 0; i < ticks; i++) f.advance();
  return f.body("news") as NewsBody;
};
const view = (body: NewsBody, state: "live" | "stale" = "live"): ChannelView<NewsBody> => ({ state, body, tick: 1 });

interface Fake extends WireHost { opened: string[]; subs: (PhoneSub | null)[]; filings: string[] }
function fakeHost(phone = false): Fake {
  const h: Fake = {
    phone, opened: [], subs: [], filings: [],
    openAsset: (id) => { h.opened.push(id); },
    filing: (id) => { h.filings.push(id); return createElement("div", { "data-testid": "fake-filing" }, id); },
    pushPhone: (s) => { h.subs.push(s); },
  };
  return h;
}

let root: Root | null = null;
let el: HTMLElement;
let width = 0;
async function render(v: ChannelView<NewsBody>, host: WireHost = fakeHost(), t = EN) {
  if (!root) { el = document.createElement("div"); document.body.append(el); root = createRoot(el); }
  await act(async () => { root!.render(createElement(Feed, { view: v, t, host })); });
  return el;
}
const wide = () => {
  width = SPLIT_MIN;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("wire") ? width : 0; });
};
afterEach(async () => { await act(async () => root?.unmount()); root = null; el?.remove(); vi.restoreAllMocks(); });

const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const row = (id: string) => el.querySelector<HTMLElement>(`[data-testid=wire-row][data-id="${id}"]`)!;
const openBtn = (id: string) => row(id).querySelector<HTMLButtonElement>("[data-testid=wire-open]")!;
const click = (n: HTMLElement) => act(async () => { n.click(); });
const esc = (n: HTMLElement) => act(async () => { n.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
const detail = () => q("wire-detail");

describe("WIR-9-01 open", () => {
  it("one headline button per row, named 'Open: {headline}'; click opens that id; selected row aria-current; focus on h2", async () => {
    await render(view(bodyAfter(0)));
    const rows = [...el.querySelectorAll<HTMLElement>("[data-testid=wire-row]")];
    expect(rows.map((r) => r.querySelectorAll("button").length)).toEqual([1, 1, 1, 1]);
    expect(rows.map((r) => r.querySelector("[data-testid=wire-headline] > button") !== null)).toEqual([true, true, true, true]);
    expect(openBtn("n-2").getAttribute("aria-label")).toBe(`Open: ${row("n-2").querySelector("[data-testid=wire-headline]")!.textContent}`);
    expect(detail()).toBeNull();
    await click(openBtn("n-2"));
    expect(detail()!.dataset.id).toBe("n-2");
    expect(row("n-2").getAttribute("aria-current")).toBe("true");
    expect(row("n-2").classList).toContain("is-selected");
    expect(el.querySelectorAll("[aria-current]")).toHaveLength(1);
    const h2 = q("wire-detail-headline")!;
    expect(h2.tagName).toBe("H2");
    expect(document.activeElement).toBe(h2);
    expect(detail()!.tagName).toBe("SECTION");
    expect(detail()!.getAttribute("aria-labelledby")).toBe(h2.id);
    expect(h2.id).not.toBe("");
  });
  it("entity labels in the row stay plain text (no link, no button)", async () => {
    await render(view(bodyAfter(0)));
    for (const e of el.querySelectorAll("[data-testid=wire-row] .wire-entity")) expect(e.closest("a, button")).toBeNull();
  });
});

describe("WIR-9-02 only fields present", () => {
  it("n-2 RUMOR: '3 of 7 past claims held up' + Mixed band; n-1 NEWS neither; no body / cause / related / follow", async () => {
    await render(view(bodyAfter(0)));
    await click(openBtn("n-2"));
    expect(q("wire-detail-record")!.textContent).toBe("3 of 7 past claims held up");
    expect(q("wire-detail-band")!.textContent).toBe("Mixed");
    expect(q("wire-detail-band")!.dataset.band).toBe("mixed");
    expect(q("wire-detail-assets")!.textContent).toContain("ORCA");
    await click(openBtn("n-1"));
    expect(detail()!.dataset.id).toBe("n-1");
    expect(q("wire-detail-source")).toBeNull();
    expect(q("wire-detail-record")).toBeNull();
    expect(q("wire-detail-band")).toBeNull();
    expect(q("wire-detail-priced")).toBeNull(); // free tier
    expect(q("wire-detail-breaking")).toBeNull();
    const d = detail()!;
    expect(d.querySelector("[data-testid*=body], [data-testid*=cause], [data-testid*=related], [data-testid*=follow]")).toBeNull();
    expect(d.textContent).not.toMatch(/ev-10\d|Follow|Related|Cause/i);
  });
  it("breaking n-4: steel outline chip; Terminal: priced-in section with band + as-of (same component as the row)", async () => {
    await render(view(bodyAfter(0, "terminal")));
    await click(openBtn("n-4"));
    const b = q("wire-detail-breaking")!;
    expect(b.textContent).toBe("Breaking");
    expect(b.className).toMatch(/\bchip-steel\b|steel/);
    const priced = q("wire-detail-priced")!;
    expect(priced.querySelector("[data-testid=wire-priced-band]")!.textContent).toBe(row("n-4").querySelector("[data-testid=wire-priced-band]")!.textContent);
    expect(priced.querySelector("[data-testid=wire-asof]")!.textContent).toMatch(/^as of Day \d+ · \d\d:\d\d$/);
    expect(priced.querySelector("h3")!.textContent).toBe("Priced in");
  });
  it("FILING n-3 asks the host for f-1's summary; other kinds never mount it", async () => {
    const host = fakeHost();
    await render(view(bodyAfter(0)), host);
    await click(openBtn("n-1"));
    expect(host.filings).toEqual([]);
    await click(openBtn("n-3"));
    expect(q("fake-filing")!.textContent).toBe("f-1");
    expect(new Set(host.filings)).toEqual(new Set(["f-1"]));
  });
  it("Open in Broker: one per asset entity, aria names the ticker, calls openAsset(id) once; other entity kinds text only", async () => {
    const host = fakeHost();
    const b = bodyAfter(0);
    const mixed: WireItem = { ...b.items[0]!, entities: [{ id: "HALC", kind: "asset", label: "HALC" }, { id: "p-1", kind: "person", label: "R. Okafor" }] };
    await render(view({ items: [mixed, ...b.items.slice(1)] }), host);
    await click(openBtn("n-1"));
    const assets = [...el.querySelectorAll<HTMLElement>("[data-testid=wire-asset]")];
    expect(assets.map((a) => a.querySelector(".wire-asset-label")!.textContent)).toEqual(["HALC", "R. Okafor"]);
    expect(assets[1]!.querySelector("button")).toBeNull();
    const btn = assets[0]!.querySelector<HTMLButtonElement>("[data-testid=wire-open-broker]")!;
    expect(visible(btn)).toBe("Open in Broker");
    expect(btn.textContent).toBe("Open HALC in Broker"); // the accessible name, from content (sr-only ticker)
    expect(btn.hasAttribute("aria-label")).toBe(false); // no label that hides the visible words (axe label-content-name-mismatch)
    await click(btn);
    expect(host.opened).toEqual(["HALC"]);
  });
  it("FR: Ouvrir dans Broker on screen, Ouvrir HALC dans Broker as the name", async () => {
    await render(view(bodyAfter(0)), fakeHost(), FR);
    await click(openBtn("n-1"));
    const btn = el.querySelector<HTMLButtonElement>("[data-testid=wire-open-broker]")!;
    expect(visible(btn)).toBe(FR.openInBroker);
    expect(btn.textContent).toBe("Ouvrir HALC dans Broker");
  });
});

/** Text a sighted user reads: sr-only spans out, whitespace collapsed as the browser lays it out. */
function visible(n: HTMLElement): string {
  const c = n.cloneNode(true) as HTMLElement;
  c.querySelectorAll(".sr-only").forEach((x) => x.remove());
  return c.textContent!.replace(/\s+/g, " ").trim();
}

describe("WIR-9-03 headline", () => {
  it("h2 equals the row's headline(); an unknown key shows the card 1 fallback, never the key", async () => {
    const b = bodyAfter(0);
    const odd: WireItem = { ...b.items[1]!, headlineKey: "wire.nope.unknown" };
    await render(view({ items: [b.items[0]!, odd, ...b.items.slice(2)] }));
    await click(openBtn("n-1"));
    expect(q("wire-detail-headline")!.textContent).toBe(headline(b.items[0]!, EN));
    expect(q("wire-detail-headline")!.textContent).toBe(row("n-1").querySelector("[data-testid=wire-headline]")!.textContent);
    await click(openBtn("n-2"));
    const text = q("wire-detail-headline")!.textContent!;
    expect(text).toBe(headline(odd, EN));
    expect(text).toContain("ORCA");
    expect(text).not.toContain("wire.nope");
  });
});

describe("layout", () => {
  it(`Wire box >= ${SPLIT_MIN} px: feed + pane side by side; nothing selected shows noSelection; feed stays visible`, async () => {
    wide();
    await render(view(bodyAfter(0)));
    expect(q("wire")!.dataset.layout).toBe("split");
    expect(q("wire-no-selection")!.textContent).toBe("Select a story to read it here.");
    await click(openBtn("n-2"));
    expect(q("wire-no-selection")).toBeNull();
    expect(q("wire-feed")!.hidden).toBe(false);
    expect(q("wire-back")).toBeNull();
  });
  it(`< ${SPLIT_MIN} px: the detail replaces the feed (kept mounted, hidden) with 'Back to Wire' + kind title; no empty pane`, async () => {
    wide(); width = SPLIT_MIN - 1;
    await render(view(bodyAfter(0)));
    expect(q("wire")!.dataset.layout).toBe("single");
    expect(q("wire-pane")).toBeNull();
    await click(openBtn("n-2"));
    expect(q("wire-feed")!.hidden).toBe(true);
    expect(q("wire-list")).not.toBeNull();
    expect(q("wire-back")!.textContent).toBe("Back to Wire");
    expect(q("wire-detail-bar-title")!.textContent).toBe("Rumor");
  });
});

describe("close", () => {
  it("Back returns focus to the row's button and shows the feed again", async () => {
    await render(view(bodyAfter(0)));
    await click(openBtn("n-3"));
    await click(q("wire-back")!);
    expect(detail()).toBeNull();
    expect(q("wire-feed")!.hidden).toBe(false);
    expect(document.activeElement).toBe(openBtn("n-3"));
  });
  it("Esc inside the detail closes it (default prevented, not bubbled) and returns focus; split too", async () => {
    wide();
    await render(view(bodyAfter(0)));
    await click(openBtn("n-1"));
    const outer = vi.fn();
    document.body.addEventListener("keydown", outer);
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => { q("wire-detail-headline")!.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
    expect(outer).not.toHaveBeenCalled(); // the shell's window Esc never sees it
    document.body.removeEventListener("keydown", outer);
    expect(detail()).toBeNull();
    expect(q("wire-no-selection")).not.toBeNull();
    expect(document.activeElement).toBe(openBtn("n-1"));
  });
  it("other keys do nothing", async () => {
    await render(view(bodyAfter(0)));
    await click(openBtn("n-1"));
    await act(async () => { q("wire-detail")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(detail()).not.toBeNull();
  });
  it("the list scroll position comes back after the replaced detail closes", async () => {
    await render(view(bodyAfter(0)));
    const list = q("wire-list")!;
    await act(async () => { list.scrollTop = 120; list.dispatchEvent(new Event("scroll")); });
    await click(openBtn("n-1"));
    await act(async () => { list.scrollTop = 0; }); // display:none drops it in a browser
    await esc(q("wire-detail")!);
    expect(list.scrollTop).toBe(120);
  });
});

describe("phone", () => {
  it("open pushes {title: kind, back 'Back to Wire'}; its onBack closes and refocuses; no bar; unmount clears", async () => {
    const host = fakeHost(true);
    await render(view(bodyAfter(0)), host);
    expect(host.subs).toEqual([]);
    await click(openBtn("n-3"));
    expect(q("wire-back")).toBeNull();
    expect(q("wire-feed")!.hidden).toBe(true);
    const sub = host.subs.at(-1)!;
    expect([sub.title, sub.backLabel]).toEqual(["Filing", "Back to Wire"]);
    await act(async () => sub.onBack());
    expect(detail()).toBeNull();
    expect(host.subs.at(-1)).toBeNull();
    expect(document.activeElement).toBe(openBtn("n-3"));
    await click(openBtn("n-2"));
    expect(host.subs.at(-1)!.title).toBe("Rumor");
    await act(async () => root!.unmount()); root = null;
    expect(host.subs.at(-1)).toBeNull();
  });
  it("FR: pushed title and back label in French", async () => {
    const host = fakeHost(true);
    await render(view(bodyAfter(0)), host, FR);
    await click(openBtn("n-2"));
    expect(host.subs.at(-1)!.backLabel).toBe("Retour au fil");
    expect(host.subs.at(-1)!.title).toBe(FR.kind.RUMOR);
  });
  it("desktop never touches the phone sub", async () => {
    const host = fakeHost(false);
    await render(view(bodyAfter(0)), host);
    await click(openBtn("n-2"));
    await esc(q("wire-detail")!);
    expect(host.subs).toEqual([]);
  });
});

describe("stale and the ring", () => {
  it("stale keeps the open detail, dimmed, with 'Updating…' in the pane when the feed is hidden", async () => {
    const b = bodyAfter(0);
    const host = fakeHost();
    await render(view(b), host);
    await click(openBtn("n-2"));
    expect(detail()!.dataset.stale).toBeUndefined();
    await render(view(b, "stale"), host);
    expect(detail()!.dataset.id).toBe("n-2");
    expect(detail()!.dataset.stale).toBe("1");
    expect(q("wire-detail-updating")!.textContent).toBe(EN.updating);
  });
  it("split + stale: the feed's own 'Updating…' line, none doubled in the pane", async () => {
    wide();
    const b = bodyAfter(0);
    const host = fakeHost();
    await render(view(b), host);
    await click(openBtn("n-2"));
    await render(view(b, "stale"), host);
    expect(detail()!.dataset.stale).toBe("1");
    expect(q("wire-detail-updating")).toBeNull();
    expect(q("wire-updating")).not.toBeNull();
  });
  it("an updated item refreshes in place; once it leaves the body the last snapshot stays with notInFeed", async () => {
    const b = bodyAfter(0);
    const host = fakeHost();
    await render(view(b), host);
    await click(openBtn("n-2"));
    expect(q("wire-not-in-feed")).toBeNull();
    const moved = { ...b.items[1]!, sourceRecord: { hits: 4, resolved: 8 } };
    await render(view({ items: [b.items[0]!, moved, ...b.items.slice(2)] }), host);
    expect(q("wire-detail-record")!.textContent).toBe("4 of 8 past claims held up");
    await render(view({ items: b.items.filter((i) => i.id !== "n-2") }), host);
    expect(detail()!.dataset.id).toBe("n-2");
    expect(q("wire-detail-record")!.textContent).toBe("4 of 8 past claims held up");
    expect(q("wire-not-in-feed")!.textContent).toBe("This story is no longer in your feed.");
  });
});
