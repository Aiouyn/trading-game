// @vitest-environment happy-dom
// Card 9: the phone Home tells a logged-out stranger what Quay is and what to do; signed-in Home is unchanged.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhoneHome } from "@/components/shell/PhoneHome";
import { ShellCtx } from "@/components/shell/ShellContext";
import { mockChannels } from "@/shell/mockChannels";
import { authSession } from "@/shell/authSession";
import { createShellStore, type ShellStore } from "@/shell/store";
import { applySignedInDemo } from "@/shell/accountDemoBoundary";
import { setFeed } from "@/shell/contracts/useChannel";
import { SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { portAvalonServer } from "../helpers/portAvalonServer";
import { serverHalfLoaded } from "../helpers/serverHalf";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Card 9 phone guest first screen", () => {
  let el: HTMLDivElement;
  let root: Root;
  const fetchMock = vi.fn();
  const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  beforeEach(() => {
    el = document.createElement("div");
    document.body.append(el);
    root = createRoot(el);
    authSession._resetForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    el.remove();
    setFeed(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function guest(locale: "en" | "fr"): Promise<ShellStore> {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const store = createShellStore(mockChannels(new URLSearchParams()));
    store.setState({ vw: 390, vh: 844, prefs: { ...store.getState().prefs, locale } });
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PhoneHome))); });
    await act(async () => { await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 20); await Promise.resolve(); });
    return store;
  }

  it("EN: labels the canned numbers as an example, says what the game is, and offers Create account or sign in", async () => {
    await guest("en");
    expect(q("widget-nw-label")?.textContent).toBe("Example account");
    expect(q("guest-pitch")?.textContent).toBe("Quay is a trading game. Start with $10,000 in game money and try to grow it to $20,000. No real money.");
    const cta = q("sign-in-entry")!;
    expect(cta.textContent).toBe("Create account or sign in");
    expect(cta.getAttribute("aria-label")).toBeNull(); // the visible text is the name
    expect(cta.className).toMatch(/btn-primary/);
    // Order a stranger reads in: what this is, then the one thing to do, then the example numbers.
    const order = ["widget-nw-label", "guest-pitch", "sign-in-entry", "hero-nw"].map((id) => q(id)!);
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The example numbers stay visible: they show what the game looks like.
    expect(q("hero-nw")).toBeTruthy();
    // Card 20: do not present the example book's R2 · Owner / Next: Mogul as the visitor's rank.
    expect(el.textContent).not.toMatch(/R2\s*·\s*Owner/);
    expect(q("rank-bar")).toBeNull();
    expect(q("rank-next")).toBeNull();
    expect(el.textContent).not.toMatch(/Next:\s*Mogul/);
  });

  it("FR: the same three things in French", async () => {
    await guest("fr");
    expect(q("widget-nw-label")?.textContent).toBe("Compte d’exemple");
    expect(q("guest-pitch")?.textContent).toBe("Quay est un jeu de trading. Commencez avec 10\u202f000\u00a0$ d’argent fictif et essayez d’atteindre 20\u202f000\u00a0$. Pas d’argent réel.");
    expect(q("sign-in-entry")?.textContent).toBe("Créer un compte ou se connecter");
  });

  it("the CTA opens Settings -> Account", async () => {
    const store = await guest("en");
    await act(async () => { q("sign-in-entry")!.click(); });
    expect(store.getState().phoneApp?.app).toBe("settings");
  });

  it("signed in: no example label, no pitch, no CTA", async () => {
    fetchMock.mockImplementation(portAvalonServer({
      cashCents: 1_000_000,
      other: () => new Response(JSON.stringify({
        account: { accountId: "acc_x", handle: "qa_player", createdAtMs: 1, worldId: "world_port_avalon" },
        session: { sessionId: "ses_x", expiresAtMs: 9 },
        player: { accountId: "acc_x", cashCents: 1_000_000, positions: {}, openOrders: {} },
      }), { status: 200, headers: { "content-type": "application/json" } }),
    }));
    const store = createShellStore(mockChannels(new URLSearchParams()));
    applySignedInDemo(store, "acc_x");
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PhoneHome))); });
    await serverHalfLoaded();
    await act(async () => { await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 20); await Promise.resolve(); });
    expect(q("account-chip-home")?.textContent).toBe("qa_player");
    expect(q("guest-pitch")).toBeNull();
    expect(q("sign-in-entry")).toBeNull();
    expect(q("widget-nw-label")?.textContent).toBe("Saved net worth");
  });
});
