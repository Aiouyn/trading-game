// The signed-in feed's network half (src/shell/contracts/serverSync.ts) is a lazy chunk: the feed imports it on the
// first signed-in subscribe, and every quote, ledger, Wire and candle read waits for it. Its load is real module I/O,
// not a timer, so a fixed fake-clock step (vi.advanceTimersByTimeAsync) never waits for it; how long it takes depends
// on the runner's transform cache (a lone file cold vs the full suite warm). A test that drives a signed-in feed on
// fake time awaits this explicit readiness first, then steps the clock as before; no extra delay, retry or skip.
import { expect } from "vitest";
import { MockFeed } from "@/shell/contracts/mockFeed";
import { getFeed } from "@/shell/contracts/useChannel";

/** Resolves once `feed`'s server half (default: the active feed) has loaded: the same memoized promise the feed's own
 *  reads wait on, so it changes no order of steps, only stops the test from stepping the clock before the chunk exists. */
export async function serverHalfLoaded(feed: unknown = getFeed()): Promise<void> {
  expect(feed).toBeInstanceOf(MockFeed);
  await (feed as MockFeed).serverSync();
}
