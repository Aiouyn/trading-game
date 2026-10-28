// Shared harness for the BR-4 unit suites (UI card 4): Broker mounted on the real feed hook with a fake clock.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { vi } from "vitest";
import BrokerApp from "@/apps/broker/App";
import { MoneyText } from "@/components/shell/MoneyText";
import { ShellCtx } from "@/components/shell/ShellContext";
import { MockFeed, SNAP_DELAY_MS, type Scenario } from "@/shell/contracts/mockFeed";
import { setFeed } from "@/shell/contracts/useChannel";
import { defaultChannels } from "@/shell/mockChannels";
import { createShellStore, type ShellStore } from "@/shell/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Ticks only when a test calls `feed.advance()` (the interval is an hour). */
export const MANUAL_TICK_MS = 3_600_000;

export interface Harness { el: HTMLDivElement; root: Root; store: ShellStore }
export function setup(): Harness {
  vi.useFakeTimers();
  const el = document.createElement("div");
  document.body.appendChild(el);
  return { el, root: createRoot(el), store: createShellStore(defaultChannels()) };
}
export async function teardown(h: Harness): Promise<void> {
  await act(async () => h.root.unmount());
  h.el.remove();
  setFeed(null);
  vi.useRealTimers();
}

export interface MountOpts { vw?: number; context?: string; scenario?: Partial<Scenario>; locale?: "en" | "fr"; textScale?: number; feed?: MockFeed }
export async function mount(h: Harness, o: MountOpts = {}): Promise<MockFeed> {
  const feed = o.feed ?? new MockFeed(o.scenario ?? {}, { tickMs: MANUAL_TICK_MS });
  setFeed(feed);
  const prefs = h.store.getState().prefs;
  h.store.setState({ vw: o.vw ?? 1440, prefs: { ...prefs, locale: o.locale ?? "en", textScale: o.textScale ?? 1 } });
  await act(async () => { h.root.render(createElement(ShellCtx.Provider, { value: h.store }, createElement(BrokerApp, { context: o.context }))); });
  await act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS); });
  return feed;
}

export const q = (h: Harness, id: string) => h.el.ownerDocument.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
export const text = (h: Harness, id: string) => q(h, id)?.textContent ?? null;
export const click = (n: HTMLElement) => act(async () => { n.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
export const wait = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); });
export const tick = (feed: MockFeed) => act(async () => { feed.advance(); });
export const key = (n: HTMLElement, k: string) => act(async () => { n.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); });

/** Type into a React-controlled input: native value setter + input event. */
export async function typeInto(n: HTMLElement, value: string): Promise<void> {
  const input = n as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}

/** Type a quantity and let the 300 ms preview land. */
export async function typeQty(h: Harness, value: string): Promise<void> {
  await typeInto(q(h, "br-qty")!, value);
  await wait(300);
}

/** What MoneyText renders for an amount in a table cell: the expected text of a money row. */
export const moneyText = (amount: string): string => {
  const box = document.createElement("div");
  box.innerHTML = renderToStaticMarkup(createElement(MoneyText, { amount, ctx: "table" }));
  return box.textContent ?? "";
};
