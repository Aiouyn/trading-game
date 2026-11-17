# Work order 66: Quay polish pass

Read `AGENTS.md` (including the Next.js block), `docs/DIRECTION.md` (surface rule), `docs/DESIGN.md` (Ink & Brass: the rules on brass, mono numbers, signs on gains and losses, borders not shadows, motion only for change) and look at every screenshot in `docs/design/quay-*.png`. Quay is the V1 look and every app in `src/apps/` now runs on the simulation. This order makes them feel like one finished product.

You own `src/apps/*` (presentation only: markup, CSS, copy, layout), `src/components/ui`, `src/styles/`. Do not change `src/server/`, `src/shell/` data code or `sim/`; if a screen needs data the simulation has but does not send, note it in your reply instead.

## Do

1. **Walk every app** at 1440×900 and 390×844 in Ink & Brass, with a fresh "First paycheck" game and with a 10-year sandbox world (rich data). Fix what looks broken or unfinished: overflowing text, cut-off tables, empty panels with no empty state, raw ids (`frm_silicrest`, `eq:frm_…`, `p_123`) shown to the player instead of names, numbers without units or signs, inconsistent spacing and headings.
2. **One language across apps**: the same names for the same things, sentence case, money as `$1,394.45`, percentages with a sign, dates as "Year 2, March 14" (or the game's own format), people and firms always clickable to their page.
3. **Empty, loading and error states** in every app, in Quay's style, never a blank window.
4. **Charts**: every price, net worth and macro series uses the same chart component and colours; hover shows the value and date.
5. **Make it feel alive**: subtle number ticks when a value changes, the Wire's newest item highlighted, a quiet pulse on the clock when time runs, all within the design rules and respecting reduced motion.

## Done

Screenshots after your pass, one per app at desktop width plus Portfolio, Broker and Wire at phone width, saved over the old `docs/design/quay-*.png`. `npx tsc --noEmit` passes. Commit after `git pull --rebase`, push to v1-build, reply with the list of what you fixed per app and your cost. Then stop. No test suites, no docs.
