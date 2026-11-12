// @vitest-environment happy-dom
// Card 32: after creating an account, a next step is visible.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountSettings } from "@/apps/settings/AccountSettings";
import { ShellCtx } from "@/components/shell/ShellContext";
import { mockChannels } from "@/shell/mockChannels";
import { authSession } from "@/shell/authSession";
import { createShellStore } from "@/shell/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const signedInBody = {
  account: { accountId: "acc_1", handle: "Nova", createdAtMs: 1, worldId: "world_port_avalon" },
  session: { sessionId: "ses_1", expiresAtMs: 9 },
  player: { accountId: "acc_1", cashCents: 1_000_000, positions: {}, openOrders: {} },
  world: { worldId: "world_port_avalon", marketSeed: 17, persistence: "player_private" },
};

describe("card 32 Account next step", () => {
  let el: HTMLDivElement;
  let root: Root;
  const fetchMock = vi.fn();

  beforeEach(() => {
    el = document.createElement("div");
    document.body.append(el);
    root = createRoot(el);
    authSession._resetForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    el.remove();
    vi.unstubAllGlobals();
  });

  async function mount() {
    const store = createShellStore(mockChannels(new URLSearchParams()));
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(AccountSettings)));
    });
    return store;
  }

  it("a signed-in Account shows the $10k / $20k goal and Open Portfolio; Sign out remains", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(signedInBody), { status: 200, headers: { "content-type": "application/json" } }));
    const store = await mount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const start = el.querySelector("[data-testid=account-start]")?.textContent ?? "";
    expect(start).toMatch(/10,?000/);
    expect(start).toMatch(/20,?000/);
    const next = el.querySelector("[data-testid=account-open-portfolio]");
    expect(next).not.toBeNull();
    expect(el.querySelector("[data-testid=account-logout]")).not.toBeNull();
    expect(el.textContent ?? "").not.toMatch(/M1-06/);
    await act(async () => { (next as HTMLButtonElement).click(); });
    const windows = store.getState().local.windows;
    expect(windows.some((w) => w.app === "portfolio")).toBe(true);
  });

  it("logged-out Account names the $10k start and $20k goal, and has no Open Portfolio", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await mount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const start = el.querySelector("[data-testid=account-start]")?.textContent ?? "";
    expect(start).toMatch(/10,?000/);
    expect(start).toMatch(/20,?000/);
    expect(el.querySelector("[data-testid=account-open-portfolio]")).toBeNull();
    expect(el.querySelector("[data-testid=account-handle-input]")).not.toBeNull();
    expect(el.textContent ?? "").not.toMatch(/M1-06/);
  });

  it("while /api/auth/me is held, Open Portfolio and the account handle do not flash in", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => { /* held */ }));
    await mount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(el.querySelector("[data-testid=account-loading]")).not.toBeNull();
    expect(el.querySelector("[data-testid=account-open-portfolio]")).toBeNull();
    expect(el.querySelector("[data-testid=account-handle]")).toBeNull();
    expect(el.querySelector("[data-testid=account-chip-home]")).toBeNull();
  });
});
