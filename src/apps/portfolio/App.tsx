"use client";
// Portfolio app (UI card 2, 17B PF-A): frame + Overview. Positions arrives with card 3.
import type { MeTradingBody } from "@/shell/contracts/channels";
import { getFeed, setFeed, type FeedTransport } from "@/shell/contracts/useChannel";
import { PortfolioFrame } from "./PortfolioFrame";

// Module-local gate (not imported from @/shell/hooks): the bundler folds this literal per chunk, so the no-flag build
// drops the injection branch entirely (check-hooks scans for "__quayFeed").
const MOCK_HOOKS = process.env.QUAY_HOOKS === "1";

type MePatch = Partial<MeTradingBody>;
declare global { interface Window { __quayFeedMe?: MePatch } }

/** QUAY_HOOKS e2e only: shallow-merge `window.__quayFeedMe` into every `me` snap the mock sends, so specs can show
 *  bodies the mock never emits (nwStats, a second currency, restricted buckets). Object fields merge; others replace. */
export function patchMeFeed(inner: FeedTransport, patch: MePatch): FeedTransport {
  const merge = (body: Record<string, unknown>) => {
    const out: Record<string, unknown> = { ...body };
    for (const [k, v] of Object.entries(patch)) {
      const cur = out[k];
      out[k] = v && cur && typeof v === "object" && typeof cur === "object" && !Array.isArray(v) ? { ...cur, ...v } : v;
    }
    return out;
  };
  return {
    tickMs: inner.tickMs,
    resync: (ch) => inner.resync(ch),
    subscribe: (ch, fn) => inner.subscribe(ch, (raw) => {
      const f = raw as { t?: string; body?: Record<string, unknown> };
      fn(ch === "me" && f.t === "snap" && f.body ? { ...f, body: merge(f.body) } : raw);
    }),
  };
}

let patched = false;
function applyE2EPatch() {
  if (patched || typeof window === "undefined" || !window.__quayFeedMe) return;
  patched = true;
  setFeed(patchMeFeed(getFeed(), window.__quayFeedMe));
}

export default function PortfolioApp() {
  if (MOCK_HOOKS) applyE2EPatch();
  return <PortfolioFrame />;
}
