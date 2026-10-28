// UI card 1 WIR-1-01: each filter shows exactly its mock items (seeded fixtures + one full rotation), newest first.
import { describe, expect, it } from "vitest";
import { FILTERS, filterItems } from "@/apps/wire/FilterChips";
import { orderNewest } from "@/apps/wire/Feed";
import type { NewsBody } from "@/shell/contracts/channels";
import { MockFeed, START_TICK } from "@/shell/contracts/mockFeed";

function itemsAfter(ticks: number) {
  const feed = new MockFeed({}, { autoStart: false });
  for (let i = 0; i < ticks; i++) feed.advance();
  return (feed.body("news") as NewsBody).items;
}
const S = START_TICK;
const ids = (f: Parameters<typeof filterItems>[1], items = itemsAfter(36)) => orderNewest(filterItems(items, f)).map((i) => i.id);

describe("WIR-1-01 filter → items", () => {
  it("each filter holds exactly its kinds", () => {
    const want: Record<(typeof FILTERS)[number], string[]> = {
      all: [`n-t${S + 36}`, `n-t${S + 24}`, `n-t${S + 12}`, "n-4", "n-3", "n-2", "n-1"],
      news: [`n-t${S + 36}`, "n-1"],
      filings: ["n-3"],
      trades: ["n-4"],
      verdicts: [],
      purchases: [],
      milestones: [],
      rumors: [`n-t${S + 24}`, "n-2"],
      world: [],
      statements: [`n-t${S + 12}`],
    };
    for (const f of FILTERS) expect(ids(f), f).toEqual(want[f]);
  });

  it("the chip set is All · News · Filings · Trades · Verdicts · Purchases · Milestones · Rumors · World events · Statements", () => {
    expect(FILTERS).toEqual(["all", "news", "filings", "trades", "verdicts", "purchases", "milestones", "rumors", "world", "statements"]);
  });

  it("Milestones = RECORD | RANK, World events = WORLD_EVENT, Verdicts = VERDICT, Purchases = PURCHASE", () => {
    const base = itemsAfter(0)[0]!;
    const mk = (kind: typeof base.kind, id: string) => ({ ...base, kind, id });
    const extra = [mk("RECORD", "r"), mk("RANK", "k"), mk("WORLD_EVENT", "w"), mk("VERDICT", "v"), mk("PURCHASE", "p"), mk("ALLIANCE", "a")];
    expect(ids("milestones", extra)).toEqual(["r", "k"]);
    expect(ids("world", extra)).toEqual(["w"]);
    expect(ids("verdicts", extra)).toEqual(["v"]);
    expect(ids("purchases", extra)).toEqual(["p"]);
    expect(ids("all", extra)).toHaveLength(6); // kinds without a chip still show under All
  });

  it("newest first by tick; equal ticks keep array order", () => {
    const base = itemsAfter(0)[0]!;
    const list = [{ ...base, id: "a", tick: 5 }, { ...base, id: "b", tick: 9 }, { ...base, id: "c", tick: 5 }];
    expect(orderNewest(list).map((i) => i.id)).toEqual(["b", "a", "c"]);
  });
});
