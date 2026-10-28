// Broker is built:false until BRK-A (Producer follow-up to #67): the registry does not present it as built, and its
// body is ComingLater rendered synchronously, with no lazy chunk and no Suspense fallback in between.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/shell/ShellContext", () => ({ useShell: <T,>(sel: (s: { vis: Record<string, string> }) => T): T => sel({ vis: new Proxy({}, { get: () => "unlocked" }) }) }));
vi.mock("@/apps/city/CityWindow", () => ({ CityWindow: () => null }));

import { AppBody } from "@/components/shell/AppBody";
import { APPS, REGISTRY } from "@/shell/registry";

const STATE = { focused: true, collapsed: false, background: false };

describe("Broker is not a built app", () => {
  it("registry: built is false for Broker (portfolio, wire and settings stay built)", () => {
    expect(APPS.broker.built).toBe(false);
    expect(REGISTRY.filter((a) => a.built).map((a) => a.id).sort()).toEqual(["portfolio", "settings", "wire"]);
  });

  it("AppBody renders Broker's ComingLater on the first synchronous render (no lazy chunk, no loading fallback)", () => {
    const html = renderToStaticMarkup(createElement(AppBody, { app: "broker", state: STATE }));
    expect(html).toContain('data-testid="coming-later"');
    expect(html).toContain("Broker");
    expect(html).not.toContain("app-skeleton");
    expect(html).not.toContain("aria-busy");
  });

  it("nothing imports a Broker app chunk", () => {
    for (const f of ["src/components/shell/AppBody.tsx", "src/shell/appModules.ts"]) expect(readFileSync(f, "utf8")).not.toMatch(/apps\/broker/);
  });
});
