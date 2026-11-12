// @vitest-environment happy-dom
// E-66 copylint: the game clock copy comes from src/shell/strings.ts in both locales.
// Guest labels are asserted on a known signed-out session. An unknown (SSR / still-loading)
// session must not invent the boot Day 39 · 11:20.
import { act, createElement as ce } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup as rsm } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhoneHome } from "@/components/shell/PhoneHome";
import { ShellCtx } from "@/components/shell/ShellContext";
import { StatusStrip } from "@/components/shell/StatusStrip";
import { authSession } from "@/shell/authSession";
import { defaultChannels } from "@/shell/mockChannels";
import { createShellStore } from "@/shell/store";
import { CLOCK_STRINGS, clockStrings } from "@/shell/strings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NBSP = "\u00a0";
// defaultChannels(): game day index 38 (1-based Day 39, engine calendar), tick-of-day 340 -> 11:20.
const render = (Comp: () => React.ReactNode, locale: "en" | "fr", focus = false) => {
  const store = createShellStore(defaultChannels());
  store.getState().setPrefs({ locale });
  if (focus) store.setState((s) => ({ local: { ...s.local, focusMode: true } }));
  // renderToStaticMarkup reads zustand's server snapshot (getInitialState); point it at the updated state.
  const ssr = { ...store, getInitialState: store.getState } as typeof store;
  return rsm(ce(ShellCtx.Provider, { value: ssr }, ce(Comp)));
};
const isFocus = (html: string) => html.includes("strip-focus");
const clockSpans = (root: HTMLElement) =>
  [...root.querySelectorAll("[data-testid=clock]")].map((n) => n.textContent ?? "");

let mounted: { el: HTMLDivElement; root: Root } | null = null;
afterEach(async () => {
  if (mounted) {
    await act(async () => mounted!.root.unmount());
    mounted.el.remove();
    mounted = null;
  }
  authSession._resetForTests();
  vi.unstubAllGlobals();
});

async function renderGuest(Comp: () => React.ReactNode, locale: "en" | "fr", focus = false) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    if (input === "/api/auth/me") return new Response("", { status: 401 });
    return new Response(null, { status: 404 });
  }));
  authSession._resetForTests();
  await authSession.ensureBoot();
  const store = createShellStore(defaultChannels());
  store.getState().setPrefs({ locale });
  if (focus) store.setState((s) => ({ local: { ...s.local, focusMode: true } }));
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(ce(ShellCtx.Provider, { value: store }, ce(Comp)));
  });
  mounted = { el, root };
  return el;
}

describe("E-66 clock strings", () => {
  it("EN keeps the exact pre-E-66 text (no visual change)", () => {
    expect(CLOCK_STRINGS.en.strip(39, "11:20")).toBe("Day 39 · 11:20");
    expect(CLOCK_STRINGS.en.phone(39, "11:20")).toBe("D39 · 11:20");
  });
  it("FR uses Jour / J with no-break spaces and the same 24-hour time", () => {
    expect(CLOCK_STRINGS.fr.strip(39, "11:20")).toBe(`Jour${NBSP}39${NBSP}· 11:20`);
    expect(CLOCK_STRINGS.fr.phone(39, "11:20")).toBe(`J39${NBSP}· 11:20`);
  });
  it("unknown locales fall back to EN", () => {
    expect(clockStrings("de")).toBe(CLOCK_STRINGS.en);
    expect(clockStrings("fr")).toBe(CLOCK_STRINGS.fr);
  });
  it("a static first paint (unknown session) does not invent Day 39 · 11:20", () => {
    const html = render(StatusStrip, "en");
    expect(html).toContain("Time loading…");
    expect(html).toContain("—");
    expect(html).not.toContain("Day 39 · 11:20");
    expect(html).not.toContain("11:20");
    expect(html).not.toContain("Market open");
    const phone = render(PhoneHome, "en");
    expect(phone).toContain("Time loading…");
    expect(phone).not.toContain("D39 · 11:20");
    expect(phone).not.toContain("11:20");
    expect(phone).not.toContain("Market open");
  });
  it("StatusStrip renders the clock in EN and FR (normal and Focus mode)", async () => {
    expect(clockSpans(await renderGuest(StatusStrip, "en"))).toEqual(["Day 39 · 11:20"]);
    expect(clockSpans(await renderGuest(StatusStrip, "fr"))).toEqual([`Jour${NBSP}39${NBSP}· 11:20`]);
    const focused = await renderGuest(StatusStrip, "fr", true);
    expect(isFocus(focused.innerHTML)).toBe(true);
    expect(clockSpans(focused)).toEqual([`Jour${NBSP}39${NBSP}· 11:20`]);
    expect(clockSpans(await renderGuest(StatusStrip, "en", true))).toEqual(["Day 39 · 11:20"]);
  });
  it("PhoneHome status bar renders the clock in EN and FR", async () => {
    expect(clockSpans(await renderGuest(PhoneHome, "en"))).toEqual(["D39 · 11:20"]);
    expect(clockSpans(await renderGuest(PhoneHome, "fr"))).toEqual([`J39${NBSP}· 11:20`]);
  });
});
