// QA #71 follow-up: one source of truth for built apps. The registry's `built` is derived from APP_MODULES, the record
// AppBody renders from, so an app is built exactly when it has a body, and a built app never shows "Coming later".
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

// Every app unlocked (so LockTile never stands in for a body); everything else is the real default shell state.
vi.mock("@/components/shell/ShellContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/shell/ShellContext")>();
  const { createShellStore } = await import("@/shell/store");
  const { defaultChannels } = await import("@/shell/mockChannels");
  const state = { ...createShellStore(defaultChannels()).getState(), vis: new Proxy({}, { get: () => "unlocked" }) };
  return { ...actual, useShell: <T,>(sel: (s: typeof state) => T): T => sel(state) };
});
vi.mock("@/apps/city/CityWindow", () => ({ CityWindow: () => null }));
vi.mock("@/apps/settings/SettingsApp", () => ({ SettingsApp: () => createElement("div", { "data-testid": "settings" }) }));

import { AppBody } from "@/components/shell/AppBody";
import { APP_MODULES, type BuiltAppId, type EagerAppId, type LazyAppId } from "@/shell/appModules";
import { REGISTRY, type AppId } from "@/shell/registry";

const STATE = { focused: true, collapsed: false, background: false };
const html = (app: AppId) => renderToStaticMarkup(createElement(AppBody, { app, state: STATE }));

describe("built apps: one source of truth (APP_MODULES)", () => {
  it("registry built === has an APP_MODULES entry, for all 32 apps", () => {
    for (const a of REGISTRY) expect([a.id, a.built]).toEqual([a.id, Object.hasOwn(APP_MODULES, a.id)]);
    expect(Object.keys(APP_MODULES).sort()).toEqual(["portfolio", "settings", "wire"]);
  });

  it("type level: Broker is not a built app until BRK-A ships a module (adding it without one fails typecheck)", () => {
    expectTypeOf<BuiltAppId>().toEqualTypeOf<"settings" | "portfolio" | "wire">();
    expectTypeOf<LazyAppId>().toEqualTypeOf<"portfolio" | "wire">();
    expectTypeOf<EagerAppId>().toEqualTypeOf<"settings">();
  });

  it.each(REGISTRY.filter((a) => a.built).map((a) => a.id))("%s (built) renders a body or its loading skeleton, never ComingLater", (id) => {
    expect(html(id)).not.toContain('data-testid="coming-later"');
  });

  it.each(REGISTRY.filter((a) => !a.built && a.id !== "city").map((a) => a.id))("%s (built:false) renders ComingLater synchronously", (id) => {
    const out = html(id);
    expect(out).toContain('data-testid="coming-later"');
    expect(out).not.toContain("aria-busy");
  });

  it.each(Object.entries(APP_MODULES).flatMap(([id, m]) => (m.kind === "lazy" ? [[id, m.load] as const] : [])))(
    "%s: its lazy loader resolves to a real module with a default component", async (_id, load) => {
      expect(typeof (await load()).default).toBe("function");
    },
  );
});
