// @vitest-environment happy-dom
// M1-07 B1, chart level: the server's candle history restarts (new
// process: new epoch, revision from 0) while the chart holds revision 3 of the old one; a late save in the new process
// gets revision 1 (<= 3) before the client's next read, on a bar outside the live read. At 14a1f2e8 the old cursor
// filtered it out (shown 3 from the dead history, server 5). Recovery must need no asset change and no page reload.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { brokerChartEnv } from "../helpers/brokerChart";

const env = brokerChartEnv();
beforeEach(() => env.before());
afterEach(() => env.after());

describe("server candle history restart while the client holds a nonzero revision", () => {
  it("the chart reloads the new history by itself and shows the new process's late volume", async () => {
    await env.signedInChart();
    const T = env.market.tick;
    for (let i = 0; i < 3; i++) env.late(T, "1", `old-${i}`);
    await env.poll(3);
    expect(env.shownV(T)).toBe("3");
    const before = env.reads.length;
    env.restart();
    env.late(T, "5", "new-late"); // revision 1 in the new history, before the client reads it
    expect(env.recorder().revision).toBeLessThanOrEqual(3);
    for (let i = 0; i < 6; i++) env.market.step(); // T is no longer the live bar
    await env.poll(5);
    expect(env.shownV(T)).toBe("5");
    expect(env.q("br-chart")?.dataset.state).toBe("plot");
    expect(env.q("br-chart")?.dataset.range).toBe("1D"); // same asset, same range: no user action
    // The range was reloaded from the new history (a history read after the restart); its bars are the new process's.
    expect(env.reads.slice(before).some((r) => env.isHistory(r.url))).toBe(true);
    expect(env.shownT()[0]).toBe(T); // the dead history's older bars are gone (history is ephemeral)
    for (const t of env.shownT()) expect(env.shownV(t), `t ${t}`).toBe(env.server(t));
  });
});
