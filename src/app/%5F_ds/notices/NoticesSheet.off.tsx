// Production stand-in for the dev-only notices demo: next.config.ts aliases `@ds/notices-sheet` here unless the
// build opts in (QUAY_DS=1, e2e only), so the demo's code is never bundled. page.tsx 404s before rendering it.
export function NoticesSheet(_: { show: string; palette: string }): null { return null; }
