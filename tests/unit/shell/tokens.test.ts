import { describe, expect, it } from "vitest";
import { MOTION, PALETTES } from "@/styles/tokens";

import { SPEC_TABLE } from "./paletteTable";

const IDS = ["ink-brass", "broadsheet", "phosphor", "riviera"] as const;

describe("palette table (S1-03)", () => {
  it.each(IDS.map((p, i) => [p, i] as const))("%s matches §7.1", (p, i) => {
    for (const row of SPEC_TABLE) expect([row[0], PALETTES[p][row[0]]]).toEqual([row[0], row[i + 1]]);
  });
  it("motion tokens match §7.4", () => {
    expect(MOTION).toEqual({ fast: 120, base: 220, slow: 420, ambient: 2400, tick: 5000, easeOut: "cubic-bezier(0.22, 1, 0.36, 1)", easeInOut: "cubic-bezier(0.6, 0, 0.2, 1)" });
  });
});
