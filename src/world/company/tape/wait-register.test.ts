/**
 * Tape rows that do not run in v1.7 yet, recorded as skipped with the reason (tape-company-building.md section 3 status
 * WAIT, DEFERRED, PENDING-MATHIS, N/A). Each skip keeps the check id visible in the Vitest report. Nothing here is a pass.
 */
import { describe, it } from 'vitest';

describe('Tape WAIT rows (not run in v1.7)', () => {
  it.skip('inst_stock_derivs [WAIT-INSTR: options, futures and perps on the stock, Quant 6.5]', () => {});
  it.skip('inst_sector_etf [WAIT: sector ETF instrument, Quant 6.5 item 3, not built]', () => {});
  it.skip('inst_sector_etf_derivs [WAIT: derivatives on the sector ETF, Quant 6.5]', () => {});
  it.skip('inst_index_weight_boundary [WAIT: index ETF 5% weight clause, Quant 6.5]', () => {});
  it.skip('inst_weight_frozen [WAIT: index weight snapshot at listing and F+21 close, Q23 decided, instrument not built]', () => {});
  it.skip('inst_broad_etf_free [WAIT: broad index below 5% is free, instrument not built]', () => {});
  it.skip('repay_derivative_delta [WAIT-INSTR: derivative delta in S_k, G16]', () => {});
  it.skip('lockup_hedge_accept (N14) [WAIT-INSTR: snapshot of covered instruments at listing, Q23 decided, instruments not built]', () => {});
  it.skip('ipo_short_open [WAIT-INSTR: shorting at listing+2 and +3, Quant 6.5]', () => {});
  it.skip('plan_split [WAIT: DEFERRED, splits are not in v1, X4]', () => {});
  it.skip('split_cosmetic_value / split_cosmetic_flow (X4) [WAIT: DEFERRED, no split action in v1]', () => {});
  it.skip('tender_price_floor [WAIT: DEFERRED takeovers, Quant 9.2; the T0 and 1.2x VWAP30 rule is decided by Ledger Q15]', () => {});
  it.skip('short_dump_buyout_ev (X8) [WAIT: DEFERRED shorts and takeovers, Quant 9.2]', () => {});
  it.skip('agm_sign_test (X13) [WAIT: DEFERRED, no AGM in v1]', () => {});
  it.skip('crime_pump_ev_ratio (X10) [WAIT: DEFERRED crime model, M30]', () => {});
  it.skip('rp_t1_roundtrip [WAIT: stage-0 T1 business is PENDING-MATHIS, Tape 467-468]', () => {});
  it.skip('t1_payback_20gd [WAIT: PENDING-MATHIS, stage-0 T1 payback]', () => {});
  it.skip('t1_63gd_band [WAIT: PENDING-MATHIS, stage-0 T1 $13k-$22k band]', () => {});
  it.skip('co_speed [TIMING: balance-script row, companyDay median under 50 us per company per gd]', () => {});
  it.skip('co_property_is_cost (X14) [N/A: no property income path in the company world]', () => {});
});
