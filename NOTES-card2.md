# Card 2: work-in-progress notes (paused 2026-10-28 04:10 Paris, to save usage)

Head: see `git log -1` on city/card2-materials (round-2 code is 7c99003f; this note sits on top). No PR opened; it waits for the @/game/format inline PR.

## Done
- Studio AC5 round 1: 3a (rust C .056; 36.0 % base / 44.9 % worst case are the records), 3b (murmur3 fmix32 after FNV-1a; rust industrial_basin 9.5 %, eastside_docks 9.7 %, all 3.1 %; mutant "no fmix32" caught by 2 unit tests), 2a (material walls scaled to the lit/shadow lightness, `MAT_SHADOW_MIX` .25).
- Studio AC5 round 2 applied in 7c99003f: midtown glass back to u .27; 1a industrial metal u .35 → .42; AC5 P2 Old Harbor target C ≥ .028 (hue 25–60° kept); new check: midtown vs financial_mile wherever both are in view.
- Last full CI (40622241768 at 474ec306, before round 2): unit, prod-hook pass; T0 A/B vs e213a0b6 desktop 1.035, phone 1.000 (pass); calls/tris +0; AC3 coverage('parts') bitsDiff 0; e2e 99/101 (the AC5 P1 desktop and P2 rows).

## Open
- **The round-2 head 7c99003f has no complete CI.** Run 40624272674 was cancelled during e2e; its unit, T0 A/B and prod-hook jobs passed.
- Mutant runs (card2.spec "clock" tests only):
  - 40624276158 (metal .35): AC5 P1 fails as required (desktop midtown vs industrial ΔE 1.56 / ΔL .012).
  - 40624279591 (mix .45): AC5 P2 fails on desktop (C .0259) but not on phone (C .0327). So the P2 mutant is caught on desktop only.
- **New blocker for Studio: financial_mile is in view at P1**, and midtown vs financial_mile fails on both viewports in both mutant runs: ΔE 2.06 / 1.96 at mix .25 (metal run), 1.20 / 1.43 at mix .45. Metal doesn't affect financial_mile, so the head will very likely fail this pair too. The cause is midtown glass u .27 against the financial_mile shaft u .20 (model ΔE 2.57).
- Midtown vs industrial at metal .42 isn't measured yet. A calibrated model (evidence/city-card2/ac5-round2.ts) predicts ΔE 3.18 / ΔL .026, which would fail. The raw model says 5.53.
- P2 Old Harbor C spread at mix .25: .0288 / .0289 (desktop / phone) in both 40622241768 and 40624276158. It is stable run to run but only .0008–.0009 above .028.
- Evidence body (evidence/pr-bodies/card2.md) and fresh round-2 shots are not updated for round 2. The shots in evidence/city-card2 are from 474ec306.

## Next steps
1. Ask Studio about midtown vs financial_mile (shaft u .20 vs midtown .27) and the phone-only escape of the mix-.45 mutant.
2. One full CI on the head, then read AC5 P1/P2 and save the P1/P2 desktop and phone 13:00 shots.
3. Finish card2.md (round-2 table, mutants, A/B, spread) and leave the PR for after the format-inline PR.
- Mutant branches city/mut-ac5-metal35 and city/mut-ac5-mix45 are left in place (no deletes).
