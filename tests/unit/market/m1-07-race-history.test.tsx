// @vitest-environment happy-dom
// M1-07 B1, chart level: a range (history) request is read by the server
// BEFORE a late save commits and its reply is held; the commit lands and the feed moves on to newer revisions while the
// request is in flight; then the stale reply is installed. At 14a1f2e8 the feed had already acknowledged the change
// (cursor 0 -> 1) as a one-shot frame the loading chart dropped, and the stale reply hid it for good (shown 0, server 7).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { click } from "../17b/br-harness";
import { brokerChartEnv } from "../helpers/brokerChart";

const env = brokerChartEnv();
beforeEach(() => env.before());
afterEach(() => env.after());

describe("history request in flight across a late commit", () => {
  it("the stale reply is installed, then the chart catches up from the revision it was requested at: T shows the volume once", async () => {
    await env.signedInChart();
    const T = env.market.tick - 1; // a closed bar on the chart
    expect(env.shownV(T)).toBe("0");
    env.holdHistory = true;
    await click(env.q("br-chart-ranges")!.querySelector('[data-range="1H"]') as HTMLElement);
    expect(env.release).not.toBeNull();
    const held = env.reads.at(-1)!;
    expect(JSON.parse(held.body).bars.find((b: { t: number }) => b.t === T).v).toBe("0"); // read before the commit
    const revBefore = env.recorder().revision;
    env.late(T, "7", "late-hist");
    expect(env.recorder().revision).toBe(revBefore + 1);
    env.market.step(); // the feed sees newer revisions while the request is still in flight
    await env.poll(3);
    const ackedInFlight = env.catchUps().length; // revision reads while the history was in flight
    env.release!();
    const seen: (string | null)[] = [];
    for (let i = 0; i < 4; i++) { await env.poll(1); seen.push(env.shownV(T)); }
    expect(env.server(T)).toBe("7");
    expect(seen.at(-1)).toBe("7");
    expect(seen.filter((v, i) => i > 0 && v !== seen[i - 1])).toHaveLength(0); // shown once installed, never flips back
    expect(ackedInFlight).toBe(0); // nothing is acknowledged before the bars are installed
    // The first catch-up asked from the revision the stale reply was requested at (it cannot be past the commit).
    const first = Number(env.catchUps()[0]!.url.searchParams.get("since"));
    expect(first).toBeLessThanOrEqual(revBefore);
    // Later catch-ups only move forward and never resend T: shown == server for every bar the server still has.
    const sinces = env.catchUps().map((r) => Number(r.url.searchParams.get("since")));
    expect([...sinces].sort((a, b) => a - b)).toEqual(sinces);
    for (const t of env.shownT()) if (env.server(t) !== null) expect(env.shownV(t), `t ${t}`).toBe(env.server(t));
  });
});
