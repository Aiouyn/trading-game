// E-66 copylint: the game clock copy comes from src/shell/strings.ts in both locales.
import { createElement as ce } from "react";
import { renderToStaticMarkup as rsm } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PhoneHome } from "@/components/shell/PhoneHome";
import { ShellCtx } from "@/components/shell/ShellContext";
import { StatusStrip } from "@/components/shell/StatusStrip";
import { defaultChannels } from "@/shell/mockChannels";
import { createShellStore } from "@/shell/store";
import { CLOCK_STRINGS, clockStrings } from "@/shell/strings";

const NBSP = "\u00a0";
// defaultChannels(): game day 38, tick-of-day 340 -> 11:20.
const render = (Comp: () => React.ReactNode, locale: "en" | "fr", focus = false) => {
  const store = createShellStore(defaultChannels());
  store.getState().setPrefs({ locale });
  if (focus) store.setState((s) => ({ local: { ...s.local, focusMode: true } }));
  // renderToStaticMarkup reads zustand's server snapshot (getInitialState); point it at the updated state.
  const ssr = { ...store, getInitialState: store.getState } as typeof store;
  return rsm(ce(ShellCtx.Provider, { value: ssr }, ce(Comp)));
};
const isFocus = (html: string) => html.includes("strip-focus");
const clockSpans = (html: string) => [...html.matchAll(/<span class="num clock"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);

describe("E-66 clock strings", () => {
  it("EN keeps the exact pre-E-66 text (no visual change)", () => {
    expect(CLOCK_STRINGS.en.strip(38, "11:20")).toBe("Day 38 · 11:20");
    expect(CLOCK_STRINGS.en.phone(38, "11:20")).toBe("D38 · 11:20");
  });
  it("FR uses Jour / J with no-break spaces and the same 24-hour time", () => {
    expect(CLOCK_STRINGS.fr.strip(38, "11:20")).toBe(`Jour${NBSP}38${NBSP}· 11:20`);
    expect(CLOCK_STRINGS.fr.phone(38, "11:20")).toBe(`J38${NBSP}· 11:20`);
  });
  it("unknown locales fall back to EN", () => {
    expect(clockStrings("de")).toBe(CLOCK_STRINGS.en);
    expect(clockStrings("fr")).toBe(CLOCK_STRINGS.fr);
  });
  it("StatusStrip renders the clock in EN and FR (normal and Focus mode)", () => {
    expect(clockSpans(render(StatusStrip, "en"))).toEqual(["Day 38 · 11:20"]);
    expect(clockSpans(render(StatusStrip, "fr"))).toEqual([`Jour${NBSP}38${NBSP}· 11:20`]);
    expect(isFocus(render(StatusStrip, "fr", true))).toBe(true);
    expect(clockSpans(render(StatusStrip, "en", true))).toEqual(["Day 38 · 11:20"]);
    expect(clockSpans(render(StatusStrip, "fr", true))).toEqual([`Jour${NBSP}38${NBSP}· 11:20`]);
  });
  it("PhoneHome status bar renders the clock in EN and FR", () => {
    expect(clockSpans(render(PhoneHome, "en"))).toEqual(["D38 · 11:20"]);
    expect(clockSpans(render(PhoneHome, "fr"))).toEqual([`J38${NBSP}· 11:20`]);
  });
});
