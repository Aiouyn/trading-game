// T02-05: per-bloc holiday table, 02 §3.2 (D016), copied verbatim from vision-review/complete/02-TIME-ENGINE-CORE.md §3.2.
// D071 (IN FORCE): NO holidays at launch, 260 trading days per year, matching 05 (T05-02/03). The table is DATA behind
// a flag that defaults OFF: every calendar function takes `holidays = HOLIDAYS_ENABLED_DEFAULT` (false).
import { GAME_DAYS_PER_GAME_YEAR } from './constants';

export type BlocCode = 'FDL' | 'EUN' | 'PYN' | 'NKR' | 'SRL';
export interface Holiday { id: string; nameKey: string; blocs: BlocCode[]; dayOfYear: number; scope: 'EXCHANGE_CLOSED' }

/** D071: holidays off at launch. Pass `true` to use the D016 table. */
export const HOLIDAYS_ENABLED_DEFAULT = false;

const ALL: BlocCode[] = ['FDL', 'EUN', 'PYN', 'NKR', 'SRL'];
const h = (id: string, blocs: BlocCode[], dayOfYear: number): Holiday => {
  const [, bloc, suffix] = id.split('_') as [string, string, string | undefined];
  const nameKey = suffix === undefined ? `holiday.all.${bloc.toLowerCase()}` : `holiday.${bloc.toLowerCase()}.${suffix.toLowerCase()}`;
  return Object.freeze({ id, nameKey, blocs: Object.freeze([...blocs]) as BlocCode[], dayOfYear, scope: 'EXCHANGE_CLOSED' as const });
};
/** 02 §3.2 table (D016), 16 rows. */
export const HOLIDAYS: readonly Holiday[] = Object.freeze([
  h('hol_GENESIS', ALL, 1),
  h('hol_PYN_TIDE', ['PYN'], 39),
  h('hol_SRL_CARNIVAL', ['SRL'], 50),
  h('hol_FDL_CHARTER', ['FDL'], 60),
  h('hol_NKR_ICEBREAK', ['NKR'], 95),
  h('hol_EUN_COMPACT', ['EUN'], 129),
  h('hol_NKR_ALLIANCE', ['NKR'], 156),
  h('hol_EUN_MIDSUMMER', ['EUN'], 177),
  h('hol_PYN_LEAGUE', ['PYN'], 186),
  h('hol_SRL_COALITION', ['SRL'], 213),
  h('hol_FDL_HARVEST', ['FDL'], 236),
  h('hol_PYN_MOON', ['PYN'], 271),
  h('hol_SRL_SUNFEAST', ['SRL'], 299),
  h('hol_EUN_LANTERN', ['EUN'], 318),
  h('hol_NKR_LONGNIGHT', ['NKR'], 344),
  h('hol_FDL_FOUNDERS', ['FDL'], 352),
]);

export function holidayOn(bloc: BlocCode, dayOfYear: number, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): Holiday | undefined {
  if (!holidays) return undefined;
  for (const x of HOLIDAYS) if (x.dayOfYear === dayOfYear && x.blocs.includes(bloc)) return x;
  return undefined;
}
export function holidaysOnDay(dayIndex: number, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): Holiday[] {
  if (!holidays) return [];
  const doy = (dayIndex % GAME_DAYS_PER_GAME_YEAR) + 1;
  return HOLIDAYS.filter((x) => x.dayOfYear === doy);
}
/** Errors: weekend, a quarter's first or last day, unknown bloc, day outside 1..364. */
export function validateHolidayTable(hs: readonly Holiday[]): string[] {
  const errs: string[] = [];
  for (const x of hs) {
    if (!Number.isInteger(x.dayOfYear) || x.dayOfYear < 1 || x.dayOfYear > GAME_DAYS_PER_GAME_YEAR) { errs.push(`${x.id}: dayOfYear ${x.dayOfYear} out of range`); continue; }
    if ((x.dayOfYear - 1) % 7 >= 5) errs.push(`${x.id}: weekend`);
    const dIQ = (x.dayOfYear - 1) % 91;
    if (x.id !== 'hol_GENESIS' && (dIQ === 0 || dIQ === 90)) errs.push(`${x.id}: quarter first/last day`);
    for (const b of x.blocs) if (!ALL.includes(b)) errs.push(`${x.id}: unknown bloc ${b}`);
  }
  return errs;
}
