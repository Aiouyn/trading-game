// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatusStrip } from "@/components/shell/StatusStrip";
import { ShellCtx } from "@/components/shell/ShellContext";
import { mockChannels } from "@/shell/mockChannels";
import { authSession } from "@/shell/authSession";
import { createShellStore } from "@/shell/store";
import { DEMO_STARTER_NW } from "@/shell/authChrome";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("M1-01 shell auth chrome", () => {
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

  it("logged-out: discoverable Sign in; may still show demo rank", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const store = createShellStore(mockChannels(new URLSearchParams()));
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(StatusStrip)));
    });
    await act(async () => { await Promise.resolve(); });
    expect(el.querySelector("[data-testid=sign-in-entry]")?.textContent).toMatch(/Sign in/i);
    expect(el.querySelector("[data-testid=rank-chip]")?.textContent).toMatch(/R2/);
  });

  it("signed-in: shows own handle; hides Owner/$412k; shows $10k demo balance", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          account: { accountId: "acc_x", handle: "qa_player", createdAtMs: 1, worldId: "world_port_avalon" },
          session: { sessionId: "ses_x", expiresAtMs: 9 },
          player: { accountId: "acc_x", cashCents: 1_000_000, positions: {}, openOrderIds: [] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const store = createShellStore(mockChannels(new URLSearchParams()));
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(StatusStrip)));
    });
    await act(async () => { await Promise.resolve(); });
    expect(el.querySelector("[data-testid=account-chip]")?.textContent).toBe("qa_player");
    expect(el.querySelector("[data-testid=sign-in-entry]")).toBeNull();
    expect(el.querySelector("[data-testid=rank-chip]")).toBeNull();
    expect(el.textContent).not.toMatch(/R2\s*·\s*Owner/);
    expect(el.textContent).not.toMatch(/412/);
    expect(el.querySelector("[data-testid=strip-demo-tag]")?.textContent).toMatch(/Demo balance/i);
    // MoneyText formats DEMO_STARTER_NW
    expect(DEMO_STARTER_NW).toBe("10000.00");
    expect(el.querySelector("[data-testid=strip-nw]")?.textContent).toMatch(/\$10k|10,?000|10000/);
  });
});
