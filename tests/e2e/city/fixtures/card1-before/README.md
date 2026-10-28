Card 1 "before" captures for tests/e2e/city/card1.spec.ts (after phase), taken on main at the SHA in ./SHA
(36f22b9f, the #60 merge-base) by the one-off capture step of city CI run 40592816560, job t0-ab.
Only the files the after phase reads: T2 (1440x900) and T1 (390x844) before PNGs, before/T0-before/P4-target json.

anchorsP1 corrected (city/hotfix-label-anchors): the capture placed P1 labels with fallback-font widths
(Instrument Serif not yet loaded, font-display: block) and P1 never re-places (home pose = same cache key).
Five entries now hold the font-loaded placement, as measured by CI: desktop financial_mile (run 40607575410,
main e213a0b6); phone eastside_docks, glasshill, industrial_basin, riverside_lofts (card 2 e2e runs).
