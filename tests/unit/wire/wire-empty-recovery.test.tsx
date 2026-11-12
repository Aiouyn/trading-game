// @vitest-environment happy-dom
// Card 35: Wire empty states explain the wait and recover a filter.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Feed, type WireHost } from "@/apps/wire/Feed";
import { EN, FR } from "@/apps/wire/strings";
import type { NewsBody } from "@/shell/contracts/channels";
import { MockFeed } from "@/shell/contracts/mockFeed";
import type { ChannelView } from "@/shell/contracts/useChannel";
import { authSession } from "@/shell/authSession";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const emptyLive: ChannelView<NewsBody> = { state: "live", body: { items: [] }, tick: 1 };
const populated = (): ChannelView<NewsBody> => {
  const f = new MockFeed({}, { autoStart: false });
  return { state: "live", body: f.body("news") as NewsBody, tick: 1 };
};

const signedInBody = {
  account: { accountId: "acc_w", handle: "WireNova", createdAtMs: 1, worldId: "world_port_avalon" },
  session: { sessionId: "ses_w", expiresAtMs: 9 },
  player: { accountId: "acc_w", cashCents: 1_000_000, positions: {}, openOrders: {} },
  world: { worldId: "world_port_avalon", marketSeed: 17, persistence: "player_private" },
};

const NO_HOST: WireHost = { phone: false, openAsset: () => undefined, filing: () => null, pushPhone: () => undefined };

let root: Root | null = null;
let el: HTMLElement;
const fetchMock = vi.fn();

async function render(view: ChannelView<NewsBody>, t = EN, host: WireHost = NO_HOST) {
  if (!root) {
    el = document.createElement("div");
    document.body.append(el);
    root = createRoot(el);
  }
  await act(async () => { root!.render(createElement(Feed, { view, t, host })); });
  return el;
}

async function settle() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  authSession._resetForTests();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  el?.remove();
  vi.unstubAllGlobals();
});

describe("card 35 Wire empty-state recovery", () => {
  it("a signed-in empty All feed keeps the existing label and offers a wait line plus Open Broker", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(signedInBody), { status: 200, headers: { "content-type": "application/json" } }));
    const openBroker = vi.fn();
    await render(emptyLive, EN, { ...NO_HOST, openBroker } as WireHost);
    await act(async () => { await authSession.ensureBoot(); });
    await settle();
    expect(el.querySelector("[data-testid=wire-empty]")?.textContent).toBe("Nothing in this filter yet.");
    const help = el.querySelector("[data-testid=wire-empty-help]");
    expect(help).not.toBeNull();
    expect(help?.textContent ?? "").toMatch(/appear as events happen/i);
    expect(help?.textContent ?? "").toMatch(/Broker/);
    expect(help?.textContent ?? "").not.toMatch(/saved to (your|this) account/i);
    const open = el.querySelector<HTMLButtonElement>("[data-testid=wire-open-broker]");
    expect(open).not.toBeNull();
    expect(open?.textContent).toBe("Open Broker");
    expect(el.querySelector("[data-testid=wire-show-all]")).toBeNull();
    expect(el.querySelector("[data-testid=wire-empty-auth-skel]")).toBeNull();
    await act(async () => { open!.click(); });
    expect(openBroker).toHaveBeenCalledTimes(1);
  });

  it("a guest empty All feed has no live-world wait line and no Open Broker", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await render(emptyLive);
    await act(async () => { await authSession.ensureBoot(); });
    await settle();
    expect(el.querySelector("[data-testid=wire-empty]")?.textContent).toBe("Nothing in this filter yet.");
    expect(el.querySelector("[data-testid=wire-empty-help]")).toBeNull();
    expect(el.querySelector("[data-testid=wire-open-broker]")).toBeNull();
    expect(el.querySelector("[data-testid=wire-show-all]")).toBeNull();
    expect(el.querySelector("[data-testid=wire-empty-auth-skel]")).toBeNull();
    expect(el.textContent ?? "").not.toMatch(/appear as events happen/i);
  });

  it("while /api/auth/me is held, the All-empty help is a muted skeleton and Open Broker stays off", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => { /* held */ }));
    await render(emptyLive);
    await settle();
    expect(el.querySelector("[data-testid=wire-empty]")?.textContent).toBe("Nothing in this filter yet.");
    expect(el.querySelector("[data-testid=wire-empty-auth-skel]")).not.toBeNull();
    expect(el.querySelector("[data-testid=wire-empty-help]")).toBeNull();
    expect(el.querySelector("[data-testid=wire-open-broker]")).toBeNull();
    expect(el.querySelector("[data-testid=wire-show-all]")).toBeNull();
    expect(el.textContent ?? "").not.toMatch(/appear as events happen/i);
  });

  it("an empty selected filter offers Show all stories and focuses the All chip", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await render(populated());
    await act(async () => { await authSession.ensureBoot(); });
    await settle();
    await act(async () => { el.querySelector<HTMLButtonElement>("[data-testid=wire-filter-verdicts]")!.click(); });
    expect(el.querySelector("[data-testid=wire-empty]")?.textContent).toBe("Nothing in this filter yet.");
    const help = el.querySelector("[data-testid=wire-empty-help]");
    expect(help?.textContent ?? "").toMatch(/Try All/i);
    const reset = el.querySelector<HTMLButtonElement>("[data-testid=wire-show-all]");
    expect(reset).not.toBeNull();
    expect(reset?.textContent).toBe("Show all stories");
    expect(el.querySelector("[data-testid=wire-open-broker]")).toBeNull();
    await act(async () => { reset!.click(); });
    const all = el.querySelector<HTMLButtonElement>("[data-testid=wire-filter-all]");
    expect(all?.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(all);
    expect(el.querySelector("[data-testid=wire-list]")).not.toBeNull();
    expect(el.querySelector("[data-testid=wire-empty]")).toBeNull();
  });

  it("French copy renders for the wait line, Open Broker, and Show all stories", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(signedInBody), { status: 200, headers: { "content-type": "application/json" } }));
    await render(emptyLive, FR);
    await act(async () => { await authSession.ensureBoot(); });
    await settle();
    const help = el.querySelector("[data-testid=wire-empty-help]");
    expect(help?.textContent ?? "").toMatch(/fil des événements/i);
    expect(el.querySelector("[data-testid=wire-open-broker]")?.textContent).toBe("Ouvrir le Courtier");

    await act(async () => { root?.unmount(); });
    root = null;
    authSession._resetForTests();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await render(populated(), FR);
    await act(async () => { await authSession.ensureBoot(); });
    await settle();
    await act(async () => { el.querySelector<HTMLButtonElement>("[data-testid=wire-filter-verdicts]")!.click(); });
    expect(el.querySelector("[data-testid=wire-empty]")?.textContent).toBe("Rien dans ce filtre pour l'instant.");
    expect(el.querySelector("[data-testid=wire-empty-help]")?.textContent ?? "").toMatch(/Essayez Tout/i);
    expect(el.querySelector("[data-testid=wire-show-all]")?.textContent).toBe("Afficher toutes les dépêches");
  });
});
