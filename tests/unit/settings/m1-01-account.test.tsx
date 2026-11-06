// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Account } from "@/apps/settings/Account";
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
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(Account)));
    });
  }

  it("signed-out: create account form; submit registers and shows handle", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 })) // ensureBoot /me
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            account: { accountId: "acc_1", handle: "Nova", createdAtMs: 1, worldId: "world_port_avalon" },
            session: { sessionId: "ses_1", expiresAtMs: 9 },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            account: { accountId: "acc_1", handle: "Nova", createdAtMs: 1, worldId: "world_port_avalon" },
            session: { sessionId: "ses_1", expiresAtMs: 9 },
            player: { accountId: "acc_1", cashCents: 1_000_000, positions: {}, openOrderIds: [] },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    await mount();
    await act(async () => { await Promise.resolve(); });
    expect(el.querySelector("[data-testid=account-handle-input]")).toBeTruthy();
    expect(el.querySelector("[data-testid=account-disclaimer]")?.textContent).toMatch(/cookie/i);

    const handle = el.querySelector<HTMLInputElement>("[data-testid=account-handle-input]")!;
    const pass = el.querySelector<HTMLInputElement>("[data-testid=account-password-input]")!;
    await act(async () => {
      handle.value = "Nova";
      handle.dispatchEvent(new Event("input", { bubbles: true }));
      pass.value = "password1";
      pass.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // React controlled inputs need onChange - set via native setter + input event may not update state.
    // Use change event with value onChange path:
    await act(async () => {
      const setNative = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setNative.call(handle, "Nova");
      handle.dispatchEvent(new Event("input", { bubbles: true }));
      setNative.call(pass, "password1");
      pass.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      el.querySelector<HTMLFormElement>("form")!.requestSubmit();
    });
    await act(async () => { await Promise.resolve(); });

    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/api/auth/register"))).toBe(true);
    expect(el.querySelector("[data-testid=account-handle]")?.textContent).toBe("Nova");
    expect(el.querySelector("[data-testid=account-cash-note]")?.textContent).toMatch(/placeholder/i);
  });

  it("signed-in boot from /me; logout returns to form", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            account: { accountId: "acc_2", handle: "Reef", createdAtMs: 1, worldId: "world_port_avalon" },
            session: { sessionId: "ses_2", expiresAtMs: 9 },
            player: { accountId: "acc_2", cashCents: 1_000_000, positions: {}, openOrderIds: [] },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await mount();
    await act(async () => { await Promise.resolve(); });
    expect(el.querySelector("[data-testid=account-handle]")?.textContent).toBe("Reef");

    await act(async () => {
      el.querySelector<HTMLButtonElement>("[data-testid=account-logout]")!.click();
    });
    await act(async () => { await Promise.resolve(); });
    expect(el.querySelector("[data-testid=account-handle-input]")).toBeTruthy();
  });

  it("shows private error copy on failed login (no stack / password echo)", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "BAD_CREDENTIALS", message: "Invalid handle or password." } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      );

    await mount();
    await act(async () => { await Promise.resolve(); });

    // switch to login mode
    const radios = el.querySelectorAll('[data-testid=account-mode] button');
    await act(async () => { (radios[1] as HTMLButtonElement).click(); });

    const handle = el.querySelector<HTMLInputElement>("[data-testid=account-handle-input]")!;
    const pass = el.querySelector<HTMLInputElement>("[data-testid=account-password-input]")!;
    await act(async () => {
      const setNative = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setNative.call(handle, "Reef");
      handle.dispatchEvent(new Event("input", { bubbles: true }));
      setNative.call(pass, "password1");
      pass.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { el.querySelector<HTMLFormElement>("form")!.requestSubmit(); });
    await act(async () => { await Promise.resolve(); });

    const err = el.querySelector("[data-testid=account-error]")?.textContent ?? "";
    expect(err).toMatch(/incorrect/i);
    expect(err.toLowerCase()).not.toContain("password1");
  });
});
