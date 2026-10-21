// Build-time gate for every mock URL override and test hook (17B CH-00; same pattern as 17A T5's QUAY_DS).
// next.config always defines QUAY_HOOKS as "1" or "0", so the bundler inlines a literal: in a no-flag production
// build this is `false` and every gated branch (with its param names) is dropped from .next/static and .next/server.
// On in `next dev` and in the e2e build (playwright webServer env); vitest sets it in vitest.config.
export const MOCK_HOOKS = process.env.QUAY_HOOKS === "1";
