// @vitest-environment happy-dom
// M1-07 B1, chart level: an hour bar's last sample lands after the client's last read of it, and the next hour starts
// before the client reads again. The feed only sends the live bar; the chart's catch-up (every sample is a revision)
// installs the closed bar's final values. Replaces the feed's former one-shot closed-bar frame.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { click } from "../17b/br-harness";
import { brokerChartEnv } from "../helpers/brokerChart";
import { fmt } from "@/shell/contracts/mockFeed";

const env = brokerChartEnv();
beforeEach(() => env.before());
afterEach(() => env.after());

describe("a closed bar's final values", () => {
  it("1W (hour bars): the hour's last sample, unseen live, shows in the closed bar once the next hour has started", async () => {
    await env.signedInChart();
    await click(env.q("br-chart-ranges")!.querySelector('[data-range="1W"]') as HTMLElement);
    await env.poll(2);
    while (env.market.tick % 30 !== 28) env.market.step();
    await env.poll(2);
    const H = env.market.tick - 28;
    const p = env.market.last("HALC");
    env.market.step({ HALC: p + 77 }); // H's last tick: new high and close
    env.market.step({ HALC: p + 10 }); // the next hour opens before the client reads again
    await env.poll(3);
    const srv = env.serverBar("hour", H)!;
    expect(srv.c).toBe(fmt(p + 77, 2));
    expect(env.shownCol(H, "close")).toBe(srv.c);
    expect(env.shownCol(H, "high")).toBe(srv.h);
    expect(env.shownT().at(-1)).toBe(H + 30);
  });

  it("ticks the client never read live (it polled slower than the clock) still land as bars, with their own values", async () => {
    await env.signedInChart();
    const t0 = env.market.tick;
    const p = env.market.last("HALC");
    for (let i = 1; i <= 3; i++) env.market.step({ HALC: p + i * 11 }); // three ticks between two reads
    env.late(t0 + 2, "6", "skipped-late");
    await env.poll(3);
    expect(env.shownT().slice(-4)).toEqual([t0, t0 + 1, t0 + 2, t0 + 3]);
    for (const t of [t0 + 1, t0 + 2, t0 + 3]) {
      const srv = env.serverBar("tick", t)!;
      expect([env.shownCol(t, "close"), env.shownCol(t, "volume")], `t ${t}`).toEqual([srv.c, srv.v]);
    }
    expect(env.shownCol(t0 + 2, "volume")).toBe("6");
  });
});
