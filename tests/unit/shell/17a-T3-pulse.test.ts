// 17A T3-05 (MarketPhase labels + dot tokens, phone aria-label) and TickRing state rendering (T3-03 structure).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SystemState } from "@/shell/channels";

let sys: Pick<SystemState, "connection" | "halted"> = { connection: "live", halted: false };
vi.mock("@/components/shell/ShellContext", () => ({ useShell: <T,>(sel: (s: unknown) => T): T => sel({ channels: { system: sys } }) }));

import { MarketPhase, phaseTone } from "@/components/shell/MarketPhase";
import { TickRing } from "@/components/shell/TickRing";

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
  it("initial render announces nothing (only changes are announced)", () => {
    const html = renderToStaticMarkup(createElement(MarketPhase, { phase: "pre", city: "Port Avalon" }));
    expect(html).toContain('aria-live="polite" data-testid="phase-live"></span>');
  });
});

describe("?phase= override is unreachable in a production build", () => {
  it("production without the e2e opt-in ignores ?phase=", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_QUAY_MOCK_PHASE", "");
    const { phaseOverride, mockChannels } = await import("@/shell/mockChannels");
    const q = new URLSearchParams("phase=weekend&tick=" + (38 * 720 + 340));
    expect(phaseOverride(q)).toBeNull();
    expect(mockChannels(q).clock.phase).toBe("continuous");
    vi.stubEnv("NEXT_PUBLIC_QUAY_MOCK_PHASE", "1");
    expect(phaseOverride(q)).toBe("weekend");
    vi.unstubAllEnvs();
  });
  it("development honours it", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { phaseOverride } = await import("@/shell/mockChannels");
    expect(phaseOverride(new URLSearchParams("phase=weekend"))).toBe("weekend");
    vi.unstubAllEnvs();
  });
});

describe("TickRing states", () => {
  const ring = (verbose = false) => renderToStaticMarkup(createElement(TickRing, { tick: 7, verbose }));
  it("running: sweep present, no pause glyph, aria-hidden svg", () => {
    sys = { connection: "live", halted: false };
    expect(ring()).toContain("tickring-sweep");
    expect(ring()).not.toContain("tickring-pause");
    expect(ring()).toMatch(/<svg[^>]*aria-hidden="true"/);
  });
  it("reconnecting: no sweep (dashed track only)", () => {
    sys = { connection: "reconnecting", halted: false };
    expect(ring()).toContain('data-state="reconnecting"');
    expect(ring()).not.toContain("tickring-sweep");
  });
  it("halted: pause glyph, no sweep", () => {
    sys = { connection: "live", halted: true };
    expect(ring()).toContain("tickring-pause");
    expect(ring()).not.toContain("tickring-sweep");
  });
  it("announces Tick only in verbose mode", () => {
    sys = { connection: "live", halted: false };
    expect(ring(false)).not.toContain(">Tick<");
    expect(ring(true)).toContain(">Tick<");
  });
});
