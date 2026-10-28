// T04-20 step 1 (04 §3.19): macro genesis. E-97: the launch debt split into whole 1,000-face bond units (read by 06 genesis, T06A-01 step 8).
import { fromMoney, toMoney, type Money, type ParamsView } from '@tycoon/engine-core';
import { BLOC_DEFAULTS } from '../blocs';
import type { BlocId } from '../schema';
import { nominalGdpLocal } from '../rules/scale';

const UNIT = 1000000000n;   // one 1,000-face launch bond unit in micro

/** T04-20: genesis nominal GDP = nominalGdpLocal(b, S, 100, 100, p). */
export function genesisNominalGdp(b: BlocId, S: number, p: ParamsView): Money {
  return nominalGdpLocal(b, S, 100, 100, p);
}

/** E-97 (iv): local launch mix, percent of the local part, a genesis constant (Quant's choice, not a param). The remainder line is the largest share. */
export const LAUNCH_DEBT_MIX: Readonly<Record<BlocId, readonly (readonly [string, bigint])[]>> = Object.freeze({
  FDL: [['B3M', 15n], ['N2Y', 20n], ['N5Y', 20n], ['N10Y', 25n], ['N30Y', 10n], ['L10Y', 10n]],
  EUN: [['B3M', 15n], ['N2Y', 20n], ['N5Y', 20n], ['N10Y', 25n], ['N30Y', 10n], ['L10Y', 10n]],
  PYN: [['B3M', 15n], ['N2Y', 20n], ['N5Y', 20n], ['N10Y', 25n], ['N30Y', 10n], ['L10Y', 10n]],
  NKR: [['B3M', 15n], ['N2Y', 20n], ['N5Y', 20n], ['N10Y', 25n], ['N30Y', 10n], ['L10Y', 10n]],
  SRL: [['B3M', 20n], ['B1Y', 20n], ['N2Y', 25n], ['N5Y', 20n], ['N10Y', 15n]],
});
const REMAINDER_LINE: Readonly<Record<BlocId, string>> = Object.freeze({ FDL: 'N10Y', EUN: 'N10Y', PYN: 'N10Y', NKR: 'N10Y', SRL: 'N2Y' });
/** 22 §4.3 FDL launch lines (today SRL G10Y only). PYN has fxDebtShare0 0.05 but no FDL line, so it keeps all its debt local. */
const FDL_LINE: Readonly<Record<BlocId, string | null>> = Object.freeze({ FDL: null, EUN: null, PYN: null, NKR: null, SRL: 'G10Y' });

export interface LaunchDebtSplit { debt: Money; residue: Money; units: Readonly<Record<string, bigint>>; fdlUnits: bigint; fdlEq: Money }

/** AC-04-20-LAUNCHDEBT (E-97): pure, left to right, BigInt division floors. Σ units × 1e9 + fdlEq = debt. */
export function launchDebtSplit(b: BlocId, S: number, p: ParamsView): LaunchDebtSplit {
  const d = BLOC_DEFAULTS[b];
  const D = toMoney(d.initialDebtGdp * fromMoney(genesisNominalGdp(b, S, p)), d.ccy);
  let fdlUnits = 0n, fdlEq = 0n;
  if (d.fxDebtShare0 > 0 && FDL_LINE[b] !== null) {
    fdlUnits = toMoney(d.fxDebtShare0 * fromMoney(D) * d.fx0, 'FDL') / UNIT;
    fdlEq = toMoney(fromMoney(fdlUnits * UNIT) / d.fx0, d.ccy);
  }
  const L = D - fdlEq, U = L / UNIT, residue = L - U * UNIT;
  const units: Record<string, bigint> = {};
  let rest = U;
  for (const [k, pct] of LAUNCH_DEBT_MIX[b]) { if (k !== REMAINDER_LINE[b]) { units[k] = U * pct / 100n; rest -= units[k]; } else units[k] = 0n; }
  units[REMAINDER_LINE[b]] = rest;
  return { debt: D - residue, residue, units: Object.freeze(units), fdlUnits, fdlEq };
}
