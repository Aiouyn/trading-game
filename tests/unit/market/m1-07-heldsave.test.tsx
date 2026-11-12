// @vitest-environment happy-dom
// M1-07 B1, chart level: a real market order through the real place
// route, decided at T, its save held across the bar boundary while the client keeps reading; then the save commits.
// Replays and rejects afterwards add nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brokerChartEnv } from "../helpers/brokerChart";

const env = brokerChartEnv();
beforeEach(() => env.before());
afterEach(() => env.after());

describe("late save across a bar boundary (real place route, held save)", () => {
  it("the trade shows in its closed bar exactly once, live; net volume equals the server's", async () => {
    const a = await env.signUp("Held1");
    await env.signedInChart();
    const T = env.market.tick;
    const release = env.store.hold("held-0001");
    const pending = env.place(a, "held-0001", { assetId: "HALC", side: "BUY", type: "market", qty: "10", tif: "day" });
    await env.poll(0);
    await vi.waitFor(() => expect(env.store.waiting).toBe(1)); // decided at T, save in flight
    env.market.step(); // T closes while the save is held
    await env.poll(3); // the client reads T+1 and T before the commit
    expect(env.shownT().at(-1)).toBe(T + 1);
    expect(env.shownV(T)).toBe("0");
    release();
    expect((await pending).status).toBe(200);
    expect(env.server(T)).toBe("10");
    const seen: (string | null)[] = [];
    for (let i = 0; i < 3; i++) { await env.poll(1); seen.push(env.shownV(T)); }
    await expect(env.place(a, "held-0001", { assetId: "HALC", side: "BUY", type: "market", qty: "10", tif: "day" }).then((r) => r.status)).resolves.toBe(200);
    const b = await env.signUp("Held2");
    const rej = await env.place(b, "held-0002", { assetId: "HALC", side: "SELL", type: "market", qty: "5", tif: "day" });
    expect((await rej.json()).result.status).toBe("REJECTED");
    env.market.step();
    for (let i = 0; i < 3; i++) { await env.poll(1); seen.push(env.shownV(T)); }
    expect(seen.every((v) => v === "10")).toBe(true); // installed on the first read after the commit, never changed again
    expect(env.server(T)).toBe("10");
    for (const t of env.shownT()) expect(env.shownV(t), `t ${t}`).toBe(env.server(t));
    expect(env.shownT().reduce((n, t) => n + Number(env.shownV(t)), 0)).toBe(10);
  });
});
