// 17A T3-05 (MarketPhase labels + dot tokens, phone aria-label) and TickRing state rendering (T3-03 structure).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SystemState } from "@/shell/channels";

const sys: Pick<SystemState, "connection" | "halted"> = { connection: "live", halted: false };
vi.mock("@/components/shell/ShellContext", () => ({ useShell: <T,>(sel: (s: unknown) => T): T => sel({ channels: { system: sys } }) }));

import { MarketPhase, phaseTone } from "@/components/shell/MarketPhase";

const CASES = [
  ["pre", false, "Pre-market · Port Avalon", "faint"],
  ["open_auction", false, "Opening auction · Port Avalon", "warn"],
  ["continuous", false, "Market open · Port Avalon", "gain"],
  ["close_auction", false, "Closing auction · Port Avalon", "warn"],
  ["after", false, "After hours · Port Avalon", "faint"],
  ["weekend", false, "Weekend · Port Avalon", "faint"],
  ["continuous", true, "Trading halted · Port Avalon", "steel"],
] as const;

describe("T3-05 MarketPhase", () => {
  it.each(CASES)("%s (halted=%s): label %s, dot %s", (phase, halted, label, tone) => {
    const html = renderToStaticMarkup(createElement(MarketPhase, { phase, city: "Port Avalon", halted }));
    expect(html).toContain(`data-tone="${tone}"`);
    expect(html).toContain(`mp-${tone}`);
    expect(html).toContain(`>${label}</span>`);
    expect(phaseTone(phase, halted)).toBe(tone);
  });
  it.each(CASES)("phone dot variant %s: no visible label, aria-label carries it", (phase, halted, label) => {
    const html = renderToStaticMarkup(createElement(MarketPhase, { phase, city: "Port Avalon", halted, variant: "dot" }));
    expect(html).toContain(`aria-label="${label}"`);
    expect(html).not.toContain(`>${label}<`);
  });
});

describe("Studio T3 answers", () => {
  it("reconnecting: 'Reconnecting… · Port Avalon', dashed tone; halted wins over reconnecting", () => {
    const html = renderToStaticMarkup(createElement(MarketPhase, { phase: "continuous", city: "Port Avalon", reconnecting: true }));
    expect(html).toContain(">Reconnecting… · Port Avalon</span>");
    expect(html).toContain("mp-reconnecting");
    expect(phaseTone("continuous", true, true)).toBe("steel");
  });
  it("phone dot carries the full phase text in aria-label for halted and reconnecting", () => {
    for (const [props, label] of [[{ halted: true }, "Trading halted · Port Avalon"], [{ reconnecting: true }, "Reconnecting… · Port Avalon"]] as const) {
      const html = renderToStaticMarkup(createElement(MarketPhase, { phase: "pre", city: "Port Avalon", variant: "dot", ...props }));
      expect(html).toMatch(new RegExp(`role="img" aria-label="${label}"`));
    }
  });
  it("initial render does not fade the label in (only a phase change cross-fades)", () => {
    const html = renderToStaticMarkup(createElement(MarketPhase, { phase: "pre", city: "Port Avalon" }));
    expect(html).toContain('<span class="mp-text" data-testid="phase-label">Pre-market · Port Avalon</span>');
    expect(html).not.toContain("mp-in");
  });
  it("initial render announces nothing (only changes are announced)", () => {
    const html = renderToStaticMarkup(createElement(MarketPhase, { phase: "pre", city: "Port Avalon" }));
    expect(html).toContain('aria-live="polite" data-testid="phase-live"></span>');
  });
});

describe("?phase= override is gated at build time (module-level constant the bundler folds)", () => {
  const load = async (env: Record<string, string>) => {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const m = await import("@/shell/mockChannels");
    vi.unstubAllEnvs();
    return m;
  };
  const q = new URLSearchParams("phase=weekend&tick=" + (38 * 720 + 340));
  it("production build without the e2e opt-in: hook compiled out, ?phase= ignored", async () => {
    const { PHASE_HOOK, phaseOverride, mockChannels } = await load({ NODE_ENV: "production", NEXT_PUBLIC_QUAY_MOCK_PHASE: "" });
    expect(PHASE_HOOK).toBe(false);
    expect(phaseOverride(q)).toBeNull();
    expect(mockChannels(q).clock.phase).toBe("continuous");
  });
  it("production e2e build (NEXT_PUBLIC_QUAY_MOCK_PHASE=1) honours it", async () => {
    const { phaseOverride } = await load({ NODE_ENV: "production", NEXT_PUBLIC_QUAY_MOCK_PHASE: "1" });
    expect(phaseOverride(q)).toBe("weekend");
  });
  it("development honours it", async () => {
    const { phaseOverride } = await load({ NODE_ENV: "development" });
    expect(phaseOverride(q)).toBe("weekend");
  });
});
