// UI card 1 WIR-1-08: headlines come from strings[headlineKey] with verbatim slots; an unknown key (or a missing
// slot) shows kind label + entity labels and never a raw `wire.` key. EN and FR carry the same keys.
import { describe, expect, it } from "vitest";
import { EN, FR, fill, groupQuantity, headline, timeLabel } from "@/apps/wire/strings";
import type { WireItem } from "@/shell/contracts/channels";
import { NEWS, NEWS_ROTATION } from "@/shell/contracts/fixtures/news";
import { clockAt, clockLabel } from "@/shell/mockChannels";
import { clockStrings } from "@/shell/strings";

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

  it("slots are inserted verbatim; quantity slots get the locale's digit grouping (Studio art b)", () => {
    expect(headline(NEWS[3]!, EN)).toBe("Block trade: 50,000 KILN");
    expect(headline(NEWS[3]!, FR)).toBe(FR.headlines["wire.market.blockTrade"]!.replace("{qty}", "50\u202f000").replace("{asset}", "KILN"));
    expect(headline(NEWS[3]!, FR)).toContain("50\u202f000 KILN");
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

  it("time uses the top bar's clock source and formatter (Studio ruling: identical \"Day N · HH:MM\")", () => {
    const strip = (tick: number, l: "en" | "fr") => { const { day, hhmm } = clockLabel(clockAt(tick)); return clockStrings(l).strip(day, hhmm); };
    for (const i of NEWS) {
      expect(timeLabel(i.tick, EN)).toBe(strip(i.tick, "en"));
      expect(timeLabel(i.tick, FR)).toBe(strip(i.tick, "fr"));
    }
    // The shell's default tick (top bar "Day 38 · 11:20") and the newest fixture item 10 ticks earlier.
    expect(timeLabel(27_700, EN)).toBe("Day 38 · 11:20");
    expect(timeLabel(27_690, EN)).toBe("Day 38 · 11:00");
    expect(timeLabel(27_690, FR)).toBe("Jour\u00a038\u00a0· 11:00");
  });
});

describe("groupQuantity: i18n grouping of a decimal-string slot, never parsed or rounded (WIR-1-11)", () => {
  it.each([
    ["50000", "en", "50,000"], ["50000", "fr", "50\u202f000"], ["999", "en", "999"],
    ["12345678901234567890.5", "en", "12,345,678,901,234,567,890.5"], ["12345678901234567890.5", "fr", "12\u202f345\u202f678\u202f901\u202f234\u202f567\u202f890,5"],
  ] as const)("%s (%s) -> %s", (v, loc, want) => expect(groupQuantity(v, loc)).toBe(want));
  it.each(["1,234", "-5", "5e3", "abc", "", " 12"])("non-decimal %j is shown as sent", (v) => expect(groupQuantity(v, "en")).toBe(v));
  it("only quantity slots are grouped", () => {
    expect(headline({ ...NEWS[0]!, slots: { company: "50000" } }, EN)).toBe("50000 beats earnings expectations");
  });
});
