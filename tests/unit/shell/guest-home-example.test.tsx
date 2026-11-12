// @vitest-environment happy-dom
// Card 36: guest Home names the example portfolio and points to an account.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhoneHome } from "@/components/shell/PhoneHome";
import { StatusStrip } from "@/components/shell/StatusStrip";
import { ShellCtx } from "@/components/shell/ShellContext";
import { mockChannels } from "@/shell/mockChannels";
import { authSession } from "@/shell/authSession";
import { createShellStore, type ShellStore } from "@/shell/store";
import { applySignedInDemo } from "@/shell/accountDemoBoundary";
import { setFeed } from "@/shell/contracts/useChannel";
import { SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { S } from "@/shell/strings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const signedInBody = (handle: string) => ({
  account: { accountId: "acc_g36", handle, createdAtMs: 1, worldId: "world_port_avalon" },
  session: { sessionId: "ses_g36", expiresAtMs: 9 },
  player: { accountId: "acc_g36", cashCents: 1_000_000, positions: {}, openOrders: {} },
  world: { worldId: "world_port_avalon", marketSeed: 17, persistence: "player_private" },
});

describe("card 36 guest Home example caption", () => {
  let el: HTMLDivElement;
  let root: Root;
  let store: ShellStore;
  const fetchMock = vi.fn();

  beforeEach(() => {
    el = document.createElement("div");
    document.body.append(el);
    root = createRoot(el);
    authSession._resetForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    store = createShellStore(mockChannels(new URLSearchParams()));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    el.remove();
    setFeed(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function paint() {
    await act(async () => { await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 20); await Promise.resolve(); });
  }

  it("a guest phone Home keeps Net worth and the demo amount, and captions it as an example", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PhoneHome)));
    });
    await paint();
    expect(el.querySelector("[data-testid=widget] .label")?.textContent).toBe(S.netWorth);
    expect(el.querySelector("[data-testid=hero-nw]")?.textContent).toMatch(/412/);
    expect(el.querySelector("[data-testid=sign-in-entry]")?.textContent).toBe(S.signIn);
    const caption = el.querySelector("[data-testid=home-example-caption]");
    expect(caption).not.toBeNull();
    expect(caption?.textContent).toBe("Example portfolio · not your account");
    expect(el.querySelector("[data-testid=home-example-skel]")).toBeNull();
    await act(async () => { el.querySelector<HTMLButtonElement>("[data-testid=sign-in-entry]")!.click(); });
    expect(store.getState().local.windows.some((w) => w.app === "settings")).toBe(true);
  });

  it("a signed-in phone Home has no example caption", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(signedInBody("qa_g36")), { status: 200, headers: { "content-type": "application/json" } }));
    applySignedInDemo(store, "acc_g36");
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PhoneHome)));
    });
    await paint();
    expect(el.querySelector("[data-testid=account-chip-home]")?.textContent).toBe("qa_g36");
    expect(el.querySelector("[data-testid=widget] .label")?.textContent).toBe(S.netWorth);
    expect(el.querySelector("[data-testid=home-example-caption]")).toBeNull();
    expect(el.querySelector("[data-testid=home-example-skel]")).toBeNull();
    expect(el.querySelector("[data-testid=phone-demo-disclaimer]")).toBeNull();
    expect(el.textContent).not.toMatch(/Example portfolio/i);
  });

  it("a guest desktop strip shows an Example tag; a signed-in strip does not", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(StatusStrip)));
    });
    await paint();
    expect(el.querySelector("[data-testid=sign-in-entry]")?.textContent).toBe(S.signIn);
    expect(el.querySelector("[data-testid=strip-demo-tag]")?.textContent).toBe("Example");
    expect(el.querySelector("[data-testid=strip-nw]")?.textContent).toMatch(/412/);

    await act(async () => root.unmount());
    el.replaceChildren();
    authSession._resetForTests();
    const signedStore = createShellStore(mockChannels(new URLSearchParams()));
    applySignedInDemo(signedStore, "acc_g36");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(signedInBody("qa_strip36")), { status: 200, headers: { "content-type": "application/json" } }));
    root = createRoot(el);
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: signedStore }, createElement(StatusStrip)));
    });
    await paint();
    expect(el.querySelector("[data-testid=account-chip]")?.textContent).toBe("qa_strip36");
    expect(el.querySelector("[data-testid=strip-demo-tag]")).toBeNull();
    expect(el.textContent).not.toMatch(/Example portfolio|\bExample\b/i);
  });

  it("while /api/auth/me is held, the example caption is a muted skeleton and the strip tag stays off", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => { /* held */ }));
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement("div", null,
        createElement(StatusStrip),
        createElement(PhoneHome),
      )));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(el.querySelector("[data-testid=home-example-caption]")).toBeNull();
    expect(el.querySelector("[data-testid=strip-demo-tag]")).toBeNull();
    const skel = el.querySelector("[data-testid=home-example-skel]");
    expect(skel).not.toBeNull();
    expect(skel?.textContent ?? "").not.toMatch(/\d/);
    expect(el.textContent).not.toMatch(/Example portfolio/i);
    expect(el.querySelector("[data-testid=account-chip-home]")).toBeNull();
  });
});
