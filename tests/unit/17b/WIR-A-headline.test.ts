// UI card 1 WIR-1-08: headlines come from strings[headlineKey] with verbatim slots; an unknown key (or a missing
// slot) shows kind label + entity labels and never a raw `wire.` key. EN and FR carry the same keys.
import { describe, expect, it } from "vitest";
import { EN, FR, fill, headline, timeLabel } from "@/apps/wire/strings";
import type { WireItem } from "@/shell/contracts/channels";
import { NEWS, NEWS_ROTATION } from "@/shell/contracts/fixtures/news";
import { clockLabel } from "@/game/clock";
import { TICKS_PER_DAY } from "@/shell/mockChannels";

const all: WireItem[] = [...NEWS, ...NEWS_ROTATION.map((r, i) => ({ ...r, id: `r${i}`, tick: 1 }))];

describe("WIR-1-08 headline", () => {
  it("every mock key has an EN and FR template; output never shows `wire.` or `{`", () => {
    for (const t of [EN, FR]) for (const i of all) {
      const h = headline(i, t);
      expect(h, i.headlineKey).not.toMatch(/wire\.|\{|\}/);
      expect(h).not.toBe(t.kind[i.kind]); // a real template, not the fallback
    }
    expect(Object.keys(FR.headlines).sort()).toEqual(Object.keys(EN.headlines).sort());
  });

  it("slots are inserted verbatim", () => {
    expect(headline(NEWS[3]!, EN)).toBe("Block trade: 50000 KILN");
    expect(headline({ ...NEWS[0]!, slots: { company: "1,234.50 <b>&" } }, EN)).toBe("1,234.50 <b>& beats earnings expectations");
  });

  it("unknown key → kind label + entity labels, never the key", () => {
    const u = { ...NEWS[0]!, headlineKey: "wire.news.neverSeen" };
    expect(headline(u, EN)).toBe("News · HALC");
    expect(headline(u, FR)).toBe("Actualité · HALC");
    expect(headline({ ...u, entities: [] }, EN)).toBe("News");
    expect(headline({ ...u, kind: "WORLD_EVENT", entities: [{ id: "a", kind: "asset", label: "A" }, { id: "b", kind: "asset", label: "B" }] }, EN)).toBe("World event · A, B");
  });

  it("a template slot missing from the item falls back too", () => {
    expect(headline({ ...NEWS[2]!, slots: { company: "Avalon Bank" } }, EN)).toBe("Filing · AVB");
    expect(fill("{a} {b}", { a: "x" })).toBeNull();
  });

  it("time is clockLabel(tick, TICKS_PER_DAY) in EN", () => {
    for (const i of NEWS) expect(timeLabel(i.tick, EN)).toBe(clockLabel(i.tick, TICKS_PER_DAY));
    expect(timeLabel(27_690, FR)).toMatch(/^Jour 39 · \d\d:\d\d$/);
  });
});
