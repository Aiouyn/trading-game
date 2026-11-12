// @vitest-environment happy-dom
// M1-07 B1, chart level: fault injection. A real market order decided
// at T whose save fails after T closed: no volume anywhere, and no revision is spent on it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brokerChartEnv } from "../helpers/brokerChart";

const env = brokerChartEnv();
beforeEach(() => env.before());
afterEach(() => env.after());

describe("a save that fails after its bar closed", () => {
  it("adds no volume, live or on the server", async () => {
    const a = await env.signUp("Fail1");
    await env.signedInChart();
    const T = env.market.tick;
    const release = env.store.hold("fail-0001", { fail: true });
    const pending = env.place(a, "fail-0001", { assetId: "HALC", side: "BUY", type: "market", qty: "10", tif: "day" });
    await env.poll(0);
    await vi.waitFor(() => expect(env.store.waiting).toBe(1));
    env.market.step();
    await env.poll(3);
    const rev = env.recorder().revision;
    release();
    expect((await pending).status).not.toBe(200); // the order did not happen
    expect(env.recorder().revision).toBe(rev); // nothing counted
    for (let i = 0; i < 2; i++) env.market.step();
    await env.poll(4);
    expect(env.server(T)).toBe("0");
    for (const t of env.shownT()) expect(env.shownV(t), `t ${t}`).toBe(env.server(t));
    expect(env.shownT().reduce((n, t) => n + Number(env.shownV(t)), 0)).toBe(0);
  });
});
