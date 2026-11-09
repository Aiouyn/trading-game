// The rule tests/e2e/17b/M1-05-live-ticks.spec.ts uses for "the live UI shows the server's book" (tickBound.ts), on
// controlled values: the a9903413 failure (UI 27703 read, then the server served 27704) and genuine stale / mismatch.
import { describe, expect, it } from "vitest";
import { bookAtUiTick, type ServerBook, type UiBook } from "../../e2e/17b/tickBound";

const book = (tick: number, halc: string, gx = "4211.63"): ServerBook => ({ worldId: "world_port_avalon", tick, quotes: { rows: { HALC: { last: halc }, GX: { last: gx } } } });
const ui = (tick: number, halc: string, gx = "4211.63"): UiBook => ({ tick: String(tick), world: "world_port_avalon", clock: String(tick), lasts: { HALC: halc, GX: gx } });
/** The assertion the spec made before (UI read, then one GET, ticks equal). */
const oldRule = (u: UiBook, after: ServerBook) => u.tick === String(after.tick) && Object.entries(after.quotes.rows).every(([id, r]) => u.lasts[id] === r.last);

describe("M1-05 tick-bound observation", () => {
  it("the a9903413 boundary: the UI showed 27703 exactly and the server advanced to 27704 before the next read", () => {
    const pre = book(27703, "42.18"), post = book(27704, "42.25"), u = ui(27703, "42.18");
    expect(oldRule(u, post)).toBe(false); // the old single-read equality fails a correct UI
    expect(bookAtUiTick(pre, u, post)).toEqual({ book: pre }); // the bracketed rule: equal to the book at its tick
    // the UI having caught up to 27704 passes too, against 27704's book
    expect(bookAtUiTick(pre, ui(27704, "42.25"), post)).toEqual({ book: post });
  });
  it("still fails a genuinely stale UI, a quote mismatch, a clock mismatch, a skipped tick and a UI ahead", () => {
    const pre = book(27704, "42.25"), post = book(27704, "42.25");
    expect(bookAtUiTick(pre, ui(27703, "42.18"), post)).toEqual({ error: "UI is stale: tick 27703 after the server already served 27704" });
    expect(bookAtUiTick(pre, ui(27704, "42.18"), post)).toEqual({ error: "HALC: UI 42.18 ≠ server 42.25 at tick 27704" });
    // same tick, but quotes of the PREVIOUS tick: the straddle never excuses wrong prices
    expect("error" in bookAtUiTick(book(27703, "42.18"), ui(27704, "42.18"), book(27704, "42.25"))).toBe(true);
    expect(bookAtUiTick(pre, { ...ui(27704, "42.25"), clock: "27703" }, post)).toEqual({ error: "the shell clock shows 27703, the Broker 27704" });
    expect(bookAtUiTick(book(27703, "1"), ui(27704, "1"), book(27705, "1"))).toEqual({ error: "UI tick 27704 lies between the reads 27703..27705: no book read at it" });
    expect(bookAtUiTick(pre, ui(27705, "42.25"), post)).toEqual({ error: "UI tick 27705 is ahead of the server (27704)" });
    expect(bookAtUiTick(pre, { ...ui(27704, "42.25"), world: "other" }, post)).toEqual({ error: "UI world other ≠ world_port_avalon" });
    expect(bookAtUiTick(pre, { ...ui(27704, "42.25"), lasts: { HALC: "42.25", GX: "4211.63", ZZZ: "1" } }, post)).toEqual({ error: "UI shows ZZZ, which the server book at 27704 has not" });
  });
});
