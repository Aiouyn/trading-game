// T04-01: 04 §3.19 stream names mapped onto the binding 02 §3.10.4 registry (19 CI rejects unknown keys).
// 04's fixed draw order is kept inside each stream:
//   04 macro:global                                   → macro.global_regime
//   04 macro:<bloc>:regime                            → macro.regime:<bloc>
//   04 gap, infl, rstar, release measurement+consensus → macro.shock:<bloc>          (one stream, fixed draw order)
//   04 hawk draws, hawk drift, member offsets, governor r* bias → macro.cb_personality:cbk_<bloc>
//   04 guidance noise                                 → macro.cb_decision:cbk_<bloc>
//   04 fiscal                                         → macro.fiscal:gov_<bloc>
//   04 fx                                             → macro.fx:<CCY>/FDL
//   04 macro:events, macro:events:kind                → macro.crisis                (fixed order)
//   04 sovereign HAZARD default draw, NPC exchange votes → macro.sovereign_event:gov_<bloc>
//   04 CB output-gap estimate noise ε (E-45)        → macro.gapest:<bloc>          (S root; T04-01b)
//   04 nowcast                                        → macro.nowcast:<chrId>:<releaseId>   REGISTRY GAP: not in 02 §3.10.4
import type { Ccy, Id } from '@tycoon/engine-core';
import type { BlocId } from './schema';

export const MACRO_STREAMS: readonly string[] = Object.freeze(['macro.global_regime', 'macro.regime', 'macro.shock', 'macro.cb_decision', 'macro.cb_personality',
  'macro.fiscal', 'macro.fx', 'macro.gapest', 'macro.crisis', 'macro.sovereign_event', 'macro.nowcast']);

export const S = Object.freeze({
  globalRegime: (): string => 'macro.global_regime',
  regime: (b: BlocId): string => `macro.regime:${b}`,
  shock: (b: BlocId): string => `macro.shock:${b}`,
  cbPersonality: (b: BlocId): string => `macro.cb_personality:cbk_${b}`,
  cbDecision: (b: BlocId): string => `macro.cb_decision:cbk_${b}`,
  fiscal: (b: BlocId): string => `macro.fiscal:gov_${b}`,
  fx: (c: Ccy): string => `macro.fx:${c}/FDL`,
  gapest: (b: BlocId): string => `macro.gapest:${b}`,
  crisis: (): string => 'macro.crisis',
  sov: (b: BlocId): string => `macro.sovereign_event:gov_${b}`,
  nowcast: (chrId: Id, releaseId: Id): string => `macro.nowcast:${chrId}:${releaseId}`,
});
