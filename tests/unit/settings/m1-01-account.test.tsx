// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountSettings } from "@/apps/settings/AccountSettings";
import { ShellCtx } from "@/components/shell/ShellContext";
import { mockChannels } from "@/shell/mockChannels";
import { authSession } from "@/shell/authSession";
import { createShellStore } from "@/shell/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("M1-01 Account UI (Settings SET-01)", () => {
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
  }

  function fill(handle: string, password: string) {
    const h = el.querySelector<HTMLInputElement>("[data-testid=account-handle-input]")!;
    const p = el.querySelector<HTMLInputElement>("[data-testid=account-password-input]")!;
    const setNative = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setNative.call(h, handle);
    h.dispatchEvent(new Event("input", { bubbles: true }));
    setNative.call(p, password);
    p.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("logged-out shows plain demo disclaimer before login", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await mount();
    await act(async () => { await Promise.resolve(); });
    const d = el.querySelector("[data-testid=account-disclaimer]")?.textContent ?? "";
    expect(d).toMatch(/saved on the server/i);
    expect(d).toMatch(/priced and filled by the server/i);
    expect(d).toMatch(/not saved/i);
    expect(d).toMatch(/demo/i);
    expect(d.toLowerCase()).not.toContain("mock broker");
    expect(el.querySelector("[data-testid=account-intro]")?.textContent).toBe("Start with $10,000 in game money and a goal of $20,000.");
    expect(el.querySelector("[data-testid=account-save-notice]")?.textContent).toBe("Demo trades are not saved.");
    expect(el.querySelector("[data-testid=account-save-details]")?.hasAttribute("open")).toBe(false);
    expect(el.querySelector("[data-testid=account-open-portfolio]")).toBeNull();
  });

  it("in-app short password message (noValidate)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await mount();
    await act(async () => { await Promise.resolve(); });
    await act(async () => { fill("Nova", "short"); });
    await act(async () => { el.querySelector<HTMLFormElement>("form")!.requestSubmit(); });
    const err = el.querySelector("[data-testid=account-error]")?.textContent ?? "";
    expect(err).toMatch(/8/i);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/api/auth/register"))).toBe(false);
  });

  it("register then shows handle, saved $10k balance, honest disclaimer; no Owner/$412k", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            account: { accountId: "acc_1", handle: "Nova", createdAtMs: 1, worldId: "world_port_avalon" },
            session: { sessionId: "ses_1", expiresAtMs: 9 },
            world: { worldId: "world_port_avalon", marketSeed: 17, persistence: "player_private" },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            account: { accountId: "acc_1", handle: "Nova", createdAtMs: 1, worldId: "world_port_avalon" },
            session: { sessionId: "ses_1", expiresAtMs: 9 },
            player: { accountId: "acc_1", cashCents: 1_000_000, positions: {}, openOrders: {} },
            world: { worldId: "world_port_avalon", marketSeed: 17, persistence: "player_private" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    await mount();
    await act(async () => { await Promise.resolve(); });
    await act(async () => { fill("Nova", "password1"); });
    await act(async () => { el.querySelector<HTMLFormElement>("form")!.requestSubmit(); });
    await act(async () => { await Promise.resolve(); });

    expect(el.querySelector("[data-testid=account-handle]")?.textContent).toBe("Nova");
    const disc = el.querySelector("[data-testid=account-disclaimer]")?.textContent ?? "";
    expect(disc).toMatch(/saved on the server/i);
    expect(disc).toMatch(/priced and filled by the server/i);
    expect(disc).toMatch(/not saved/i);
    expect(disc).toMatch(/demo/i);
    const starter = el.querySelector("[data-testid=account-starter]")?.textContent ?? "";
    expect(starter).toMatch(/Saved balance/i);
    expect(starter).toMatch(/\$10k|10,?000|10000/);
    expect(el.textContent).not.toMatch(/R2\s*·\s*Owner/);
    expect(el.textContent).not.toMatch(/\$412/);
    expect(el.querySelector("[data-testid=account-open-portfolio]")?.textContent).toBe("Open Portfolio");
    expect(el.querySelector("[data-testid=account-next-step]")?.textContent).toContain("first-trade guide");
    expect(el.querySelector("[data-testid=account-save-details]")?.hasAttribute("open")).toBe(false);
  });

  it("signed-in boot; logout returns to form with disclaimer", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            account: { accountId: "acc_2", handle: "Reef", createdAtMs: 1, worldId: "world_port_avalon" },
            session: { sessionId: "ses_2", expiresAtMs: 9 },
            player: { accountId: "acc_2", cashCents: 1_000_000, positions: {}, openOrders: {} },
            world: { worldId: "world_port_avalon", marketSeed: 17, persistence: "player_private" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await mount();
    await act(async () => { await Promise.resolve(); });
    expect(el.querySelector("[data-testid=account-handle]")?.textContent).toBe("Reef");
    await act(async () => { el.querySelector<HTMLButtonElement>("[data-testid=account-logout]")!.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(el.querySelector("[data-testid=account-handle-input]")).toBeTruthy();
    expect(el.querySelector("[data-testid=account-disclaimer]")?.textContent).toMatch(/demo/i);
  });
});
