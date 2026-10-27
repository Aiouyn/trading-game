// 23 / E-70 (4), E-71 (2): the ParamsView read interface. This package owns it; @tycoon/engine-core re-exports the type and declares none.
export type ParamCcy = 'FDL' | 'EUN' | 'PYN' | 'NKR' | 'SRL';   // = G6 Ccy (kept local: @tycoon/params imports nothing)

export interface ParamsView {
  num(key: string): number;                       // finite float64
  int(key: string): number;                       // E-71 (2): faults unless the value is a safe integer
  money(key: string, ccy: ParamCcy): bigint;      // Money (micro-units of ccy)
  bool(key: string): boolean;
  str(key: string): string;
  list<T = unknown>(key: string): readonly T[];
  readonly version: number;                       // params version (TickHeaderView.paramsVersion)
}

export type ParamsErrorCode = 'PARAM_UNKNOWN' | 'PARAM_TYPE' | 'PARAM_NOT_INT' | 'PARAM_NOT_FINITE' | 'PARAM_NO_CCY' | 'PARAM_DUP';
export class ParamsError extends Error {
  readonly code: ParamsErrorCode; readonly key: string;
  constructor(code: ParamsErrorCode, key: string, message: string) { super(`${key}: ${message}`); this.name = 'ParamsError'; this.code = code; this.key = key; }
}
