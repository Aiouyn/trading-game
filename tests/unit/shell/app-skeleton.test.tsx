// @vitest-environment happy-dom
// Studio Q3: a shell-level generic window skeleton while ANY built app's lazy chunk loads; "Coming later" is only for
// built:false apps. The built 17B chunks (Portfolio, Wire, Broker) are held behind a gate here so the Suspense fallback can be observed.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => {
  let open!: () => void;
  const p = new Promise<void>((r) => { open = r; });
  const body = (id: string) => async () => { await p; return { default: () => createElement("div", { "data-testid": `${id}-body` }) }; };
  return { p, open, body };
});
vi.mock("@/apps/portfolio/App", gate.body("portfolio"));
vi.mock("@/apps/wire/App", gate.body("wire"));
vi.mock("@/apps/broker/App", gate.body("broker"));

const { AppBody } = await import("@/components/shell/AppBody");
const { ShellCtx } = await import("@/components/shell/ShellContext");
const { defaultChannels } = await import("@/shell/mockChannels");
const { createShellStore } = await import("@/shell/store");
type AppId = import("@/shell/registry").AppId;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let el: HTMLDivElement, root: Root;
const store = createShellStore(defaultChannels());
store.setState({ vis: { ...store.getState().vis, broker: "unlocked", portfolio: "unlocked", wire: "unlocked", markets: "unlocked" } });
beforeEach(() => { el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); });
afterEach(async () => { await act(async () => root.unmount()); el.remove(); store.setState({ prefs: { ...store.getState().prefs, locale: "en" } }); });

const STATE = { focused: true, collapsed: false, background: false };
const render = (app: AppId) => act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(AppBody, { app, state: STATE }))); });
const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

describe("Q3 chunk loading (gate closed)", () => {
  it.each([["portfolio", "Portfolio"], ["broker", "Broker"]] as const)("%s: generic skeleton, never 'Coming later'", async (app, name) => {
    await render(app);
    const sk = q("app-skeleton")!;
    expect(sk.dataset.app).toBe(app);
    expect(sk.getAttribute("aria-busy")).toBe("true");
    expect(sk.querySelector('[role="status"]')?.textContent).toBe(`Loading ${name}…`);
    expect(sk.querySelectorAll('[data-testid="app-skeleton-row"]')).toHaveLength(3);
    expect(q("coming-later")).toBeNull();
    expect(el.textContent).not.toContain("Coming later");
  });
  it("FR status line", async () => {
    store.setState({ prefs: { ...store.getState().prefs, locale: "fr" } });
    await render("portfolio");
    expect(q("app-skeleton")!.querySelector('[role="status"]')?.textContent).toBe("Chargement de Portfolio…");
  });
  it("wire keeps its own first-paint skeleton (#66)", async () => {
    await render("wire");
    expect(q("wire-boot")?.dataset.state).toBe("loading");
    expect(q("app-skeleton")).toBeNull();
    expect(q("coming-later")).toBeNull();
  });
  it("a built:false app shows 'Coming later' at once, no skeleton", async () => {
    await render("markets");
    expect(q("coming-later")?.textContent).toBe("MarketsComing later");
    expect(q("app-skeleton")).toBeNull();
  });
});

describe("Q3 chunk loaded (gate open)", () => {
  it("the skeleton is replaced by the app body", async () => {
    await render("portfolio");
    expect(q("app-skeleton")).not.toBeNull();
    await act(async () => { gate.open(); await gate.p; });
    await act(async () => {});
    expect(q("portfolio-body")).not.toBeNull();
    expect(q("app-skeleton")).toBeNull();
  });
});
