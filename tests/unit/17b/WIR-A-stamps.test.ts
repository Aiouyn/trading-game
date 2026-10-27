// Studio ruling (22:11): Wire stamps use the top bar's clock source and formatter, and the mock stamps line up with it:
// no seeded item or filing is stamped after the clock, and "as of" reads the clock now (not the previous day).
import { describe, expect, it } from "vitest";
import { EN, timeLabel } from "@/apps/wire/strings";
import type { NewsBody } from "@/shell/contracts/channels";
import { FILINGS, NEWS } from "@/shell/contracts/fixtures/news";
import { MockFeed, START_TICK } from "@/shell/contracts/mockFeed";
import { defaultChannels } from "@/shell/mockChannels";

const items = (f: MockFeed) => (f.body("news") as NewsBody).items;

describe("WIR-A mock stamps aligned with the top-bar clock", () => {
  it("the feed starts on the shell's default clock tick (top bar Day 38 · 11:20)", () => {
    expect(START_TICK).toBe(defaultChannels().clock.tick);
    expect(timeLabel(START_TICK, EN)).toBe("Day 38 · 11:20");
  });
  it("no seeded Wire item or filing is stamped after the clock", () => {
    for (const s of [...NEWS, ...FILINGS]) expect(s.tick, s.id).toBeLessThanOrEqual(START_TICK);
  });
  it("terminal 'as of' is the clock now: seeded rows read Day 38 · 11:20; a rotation reads its own insert tick", () => {
    const f = new MockFeed({ tier: "terminal" }, { autoStart: false });
    for (const n of items(f)) {
      if (n.pricedInAsOf === undefined) continue;
      expect(timeLabel(n.pricedInAsOf, EN), n.id).toBe("Day 38 · 11:20");
    }
    for (let i = 0; i < 12; i++) f.advance();
    const rot = items(f).find((n) => n.id === `n-t${START_TICK + 12}`)!;
    expect(rot.pricedInAsOf).toBe(rot.tick);
    for (const n of items(f)) {
      expect(n.tick, n.id).toBeLessThanOrEqual(START_TICK + 12);
      if (n.pricedInAsOf !== undefined) expect(n.pricedInAsOf, n.id).toBeGreaterThanOrEqual(n.tick);
    }
  });
});
