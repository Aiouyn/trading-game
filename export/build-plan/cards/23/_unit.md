# Unit 23: `packages/params`, the parameter registry (stage S0)

## Purpose
Transcribes every row of 23 §4 (1,019 keys in 20 owner tables, plus family members) into typed, ranged, owner-tagged and live-flagged data in `@tycoon/params`, builds the versioned launch parameter set (`params/v1.json`, `paramsVersion = 1`), provides the `ParamsView` that `ctx.params` exposes to engine code (GLOBAL-CONTEXT G6), the 23 range validator used by `sys.param_change` (19 Rule 3.16.2), and the static checks that keep spec, registry and code in agreement (INV-STR-007, alias check).

## Tasks (build order)
1. T23-01 Core types, verbatim-cell parsing rules, range and live parsing, `buildParamSet`, `ParamsView`, `validateParamChange` (23#6, 23#7, 23#8, 23#10).
2. T23-02 Owner tables 02, 03, 04, 05 (195 keys) with overrides and family members.
3. T23-03 Owner tables 06, 07, 08 (194 keys) with family members.
4. T23-04 Owner tables 09, 10 (120 keys); `grid_mw_<district>` content-sourced.
5. T23-05 Owner table 11 (137 keys) with table/struct overrides.
6. T23-06 Owner tables 12 to 18 (212 keys).
7. T23-07 Owner tables 19, 20, 21 (161 keys).
8. T23-08 Registry assembly, `params/v1.json`, aliases, reserved keys, spec re-extraction, code scan, INV-STR-007 and PARAM-ALIAS static checks (23#1, 23#2, 23#3, 23#4, 23#5, 23#9).

## Internal DAG
- T23-01 -> T23-02, T23-03, T23-04, T23-05, T23-06, T23-07
- T23-01..07 (+ T19A-05) -> T23-08

## Exports to downstream units
- `ParamsView` (`num`, `int`, `bool`, `str`, `money`, `ticks`, `ms`, `list`, `uniform`, `struct`, `table`, `text`, `has`, `row`), `createParamsView`, `ParamSet`, `buildParamSet`, `toJsonFile`, `fromJsonFile` (T23-01).
- `validateParamChange` with codes `PARAM_UNKNOWN_KEY`, `PARAM_KIND_MISMATCH`, `PARAM_STALE_OLD`, `PARAM_OUT_OF_RANGE`, `PARAM_NOT_LIVE`, `PARAM_STEP_TOO_LARGE`, `PARAM_TOO_FREQUENT`; `paramChangedPayload` (T23-01), used by 19B's `sys.param_change` and 21's console.
- `launchParamSet`, `launchParamsView` (default for 02's TestWorld), `withContentMembers`, `ALIASES`, `RESERVED`, `OWNER_TABLES` (T23-08).
- Convention for every engine module: `params.ts` exports `PARAM_KEYS` (read by the INV-STR-007 scan).

## Acceptance tests split
- T23-01: 23#6, 23#7, 23#8, 23#10. T23-08: 23#1, 23#2, 23#3, 23#4, 23#5, 23#9. T23-02..07: none (row counts and adopted values tested per table).
- Invariant INV-STR-007 -> T23-08.

## Registry gaps
- `grid_mw_<district>` (10): family row with no per-district values in 10 §3.4.2; exported as content-sourced, members come from 22's district content (`withContentMembers`).
- `cityRentMult_<city>` (10): no value for Isla Serena in 10 §3.6.1; no member is created.
- `assemble.py` WARN "params not in registry" on T23-03 and T23-08 are family-name fragments (`eq_sector_<ID>_*`, `cmd_<ID>_*`, alias keys), not missing keys.

## Spec contradictions resolved
- `holiday_fx_depth_mult` row says live "yes" but its owner 02 is under 23 §2.2 rule E (every 02 and 19 key is live = no) and 23#9: transcribed as live = no (E) in T23-02 (23's own rule over a row cell).
