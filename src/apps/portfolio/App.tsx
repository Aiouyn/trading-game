"use client";
// Portfolio app (UI card 2, 17B PF-A): frame + Overview. Positions arrives with card 3.
// The `me` mock (src/shell/contracts/mockFeed.ts) sends everything the Overview shows (nwStats, a second currency,
// restricted buckets), so there is no e2e body injection here; `?empty=1` / `?feed=` script the other states.
import { PortfolioFrame } from "./PortfolioFrame";

export default function PortfolioApp() {
  return <PortfolioFrame />;
}
