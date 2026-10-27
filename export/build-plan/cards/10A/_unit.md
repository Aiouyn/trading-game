# Unit 10A - Cities, districts, properties, addresses, procedural city, city map data

Scope: 19 §12.2 row 10.A (depends on 03, 04, 22.A). 10B (mortgages, development, property exchange, growth) builds on it. Stage: S3 Real economy (STAGES-AND-GATES). Files: `packages/engine/city/**` and `packages/citygen/**`.

## Tasks (one PR each)
T10A-01 Schema, ids, ports
T10A-02 Launch geography
T10A-03 @game/citygen (10#2-5)
T10A-04 Genesis calibration and pools (10#1, 6; INV-BS-009)
T10A-05 Macro and district market, valuation (10#8, 9, 16)
T10A-06 Rent, leases, operations, homes, premises (10#7, 18, 23, 25, 36)
T10A-07 Props as ledger entities, appraisal schedule, dormancy
T10A-08 Addresses, history, bindings, market lights (10#24, 28, 29)
T10A-09 Publication, privacy, renderer seam (10#26, 27, 38)
T10A-10 Hall of Patrons, cosmetic sinks (10#34)
T10A-11 Assembly and suites (10#32, 37)
T10A-12 Sector placement rules (City Dev; packages/citygen/src/placement/**, reference map)
T10A-13 District placement flags content (Systems + Designer; stub)

## DAG
01 → 02 → 03 → 04 → 05 → 06 ; 04, 05 → 07 ; 03, 06 → 08 → 09 ; 08 → 10 ; all → 11 ; 01, 02, 03 → 12 → 13 (12 U6 waits for IR-1 to IR-4).

## 10B scope (not here)
Tests 10#10-15, 17, 19-22, 30, 31, 33, 35; §3.9-§3.12, §3.16, §3.21.

## Open questions (conservative choice in force)
1. **Entity ids (resolved, E-26).** Producer accepted one regex-compliant scheme: `cty_`, `dst_`, `pcl_`, `bld_`, `unt_`, `lse_`, `prop_`, `lon_`; extended by `unq_` (E-27) and `dyn_`, `pty_`, `cau_`, `bil_`, `ele_`, `lob_` (E-30) and `hst_`, `fct_`, `sec_`, `brf_`, `brk_` (E-33) and `mac_`, `mcl_`, `dfe_`, `lot_`, `csa_`, `esc_`, `clm_`, `ccp_` (07B, E-38) and `lst_`, `dev_`, `ofr_`, `prm_`, `psl_`, `lau_`, `mqt_`, `obj_` (10B, E-39) and `mrl_` (04 releases, E-40) and `pln_`, `rdp_`, `tof_`, `mrg_`, `vrd_`, `rst_`, `mot_`, `lbo_`, `ipo_` (09B, E-44) and `srf_`, `opn_`, `hsn_`, `lgc_`, `anm_`, `dcp_`, `itl_` (12, E-46) and `lab_`, `cls_`, `dts_`, `res_`, `run_`, `mdl_`, `dep_`, `grf_`, `lic_`, `rpj_`, `evl_` (11, E-50) and `chn_`, `wir_`, `brd_`, `lgr_`, `chp_`, `chl_`, `riv_`, `itp_`, `ics_` (15B, E-52). Spec 10, 22 and 03 (T03-11 `lon_1`) updated. Unique-plot ids renamed `uq_` → `unq_` (E-27); `uq_` added to the lint's rejected prefixes.
2. **Renderer seam (resolved, E-26 City Dev).** The seam is the V3 port in `src/city` on PR #4: server output is `CityManifest` / `CitySnapshot` / `CityDelta` (`src/city/data/types.ts`) plus `CTY1` v1 binary chunks (`src/city/worker/format.ts`), at `manifestUrl`/`hashedUrl` (`src/city/data/urls.ts`). No prototype typing. Remaining: PR #4 still uses `city_port_avalon` and `dist_port_avalon_*` (see E-26 list); Front/City Dev switch to `cty_`/`dst_`.
3. **Parcel keys.** The prototype key `<city>:<seed>:p:<qx>:<qy>:<qrot>` is coordinate-derived; the spec's `pcl_` id is a persistent feature sequence. Choice: store both, with the spec id authoritative (game-integration.md itself says coordinate ids are not a migration strategy).
4. **Isla Serena unlock (resolved, E-27: R4 tier kept per spec).** Encoded per spec: view R0, non-island assets and free-zone domicile R4 (10 §3.2.5, 14 §3.2.6), islands R6. The Producer's ruling read 'R0, R2, R6' and called R4 a prototype value, but R4 is also in spec 10 §3.2.5 and 14 §3.2.6. Producer to confirm whether the R4 tier for non-island assets stays (current choice) or is dropped.
5. **22A content port.** 22A has no cards; names come through a port with the prototype's personality data as default.
