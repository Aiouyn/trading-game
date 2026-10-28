// T04-21 step 1: module 04 as one ModuleDef. Assembly only; no logic of its own.
import { defineModule, type ModuleDef } from '@tycoon/engine-core';
import { macroBoundaries, macroPhases, MACRO_VIEWS } from './core/dispatch';
import { MACRO_EVENTS } from './events';
import { macroModuleGenesis } from './genesis';
import { MACRO_INTENTS } from './intents';
import { MACRO_INVARIANTS } from './invariants';
import { defaultMacroPorts, type MacroPorts } from './ports';
import { MACRO_REASON_ROWS } from './reasonCodes';
import { ALL_MACRO_TABLES } from './schema';
import { MACRO_STREAMS } from './streams';
import type { StabReportPort } from './views/stabReport';

export interface MacroModuleOptions { ports?: Partial<MacroPorts>; stab?: StabReportPort }
export const NULL_STAB: StabReportPort = Object.freeze({ latestDailyReport: () => null });

export function createMacroModule(opts: MacroModuleOptions = {}): ModuleDef {
  const ports: MacroPorts = { ...defaultMacroPorts(), ...opts.ports };
  const stab = opts.stab ?? NULL_STAB;
  return defineModule({
    id: '04', module: '04', dependsOn: ['03'],
    tables: ALL_MACRO_TABLES, streams: [...MACRO_STREAMS],
    phases: macroPhases(ports, stab), boundaries: macroBoundaries,
    intents: MACRO_INTENTS, events: MACRO_EVENTS,
    invariants: MACRO_INVARIANTS, views: MACRO_VIEWS,
    genesis: (ctx) => macroModuleGenesis(ctx, ports),
    services: { reasonCodes: MACRO_REASON_ROWS },
  });
}
/** createMacroModule(): defaultMacroPorts(), stab NULL_STAB. */
export const MACRO_MODULE: ModuleDef = createMacroModule();
