// Production stand-in for the dev-only /__ds primitives sheet: next.config.ts aliases `@ds/primitives-sheet` here unless
// the build opts in (QUAY_DS=1, e2e only), so the sheet's code is never bundled. page.tsx 404s before rendering it.
export function DesignSystemSheet(_: { palette: string }): null { return null; }
