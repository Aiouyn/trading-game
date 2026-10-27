// T02-21 params.ts only (the rest of T02-21, ModuleDef / TestWorld, depends on T02-09..20 and is not part of this PR).
import { PHASES, type PhaseId } from './types';

import type { ParamsView } from '@tycoon/params';
/** E-70 (4): ParamsView is owned by @tycoon/params; core re-exports the type and declares none (AC-02-11-PARAMS-PKG). */
export type { ParamsView } from '@tycoon/params';

export interface CoreParams { intentsPerTickPerActor: number; intentsPerTickPerPrincipal: number; intentMaxAgeTicks: number; sealGraceMs: number; safeModeMaxAttempts: number;
  safeModeSubsystemRepeatHalt: number; resumeNoticeMs: number; versionNoticeTicks: number; shadowVerifyFraction: number; catchupMinIntervalMs: number; catchupMaxLagMs: number;
  clockMaxSkewMs: number; outageCompensationThresholdMin: number; snapshotDailyRetentionDays: number; coordFailoverTimeoutMs: number; entropyEpochTicks: number;
  entropyCommitLeadTicks: number; entropyRevealLagTicks: number; holidayFxDepthMult: number; displayClockOffsetMin: number; invXpartSettleMaxTicks: number; phaseBudgetMs: Record<PhaseId, number> }

const INT: readonly [keyof CoreParams, string][] = [
  ['intentsPerTickPerActor', 'intents_per_tick_per_actor'], ['intentsPerTickPerPrincipal', 'intents_per_tick_per_principal'],
  ['intentMaxAgeTicks', 'intent_max_age_ticks'], ['sealGraceMs', 'seal_grace_ms'], ['safeModeMaxAttempts', 'safe_mode_max_attempts'],
  ['safeModeSubsystemRepeatHalt', 'safe_mode_subsystem_repeat_halt'], ['resumeNoticeMs', 'resume_notice_ms'], ['versionNoticeTicks', 'version_notice_ticks'],
  ['catchupMinIntervalMs', 'catchup_min_interval_ms'], ['catchupMaxLagMs', 'catchup_max_lag_ms'], ['clockMaxSkewMs', 'clock_max_skew_ms'],
  ['outageCompensationThresholdMin', 'outage_compensation_threshold_min'], ['snapshotDailyRetentionDays', 'snapshot_daily_retention_days'],
  ['coordFailoverTimeoutMs', 'coord_failover_timeout_ms'], ['entropyEpochTicks', 'entropy_epoch_ticks'], ['entropyCommitLeadTicks', 'entropy_commit_lead_ticks'],
  ['entropyRevealLagTicks', 'entropy_reveal_lag_ticks'], ['displayClockOffsetMin', 'display_clock_offset_min'], ['invXpartSettleMaxTicks', 'inv_xpart_settle_max_ticks'],
];
const NUM: readonly [keyof CoreParams, string][] = [['shadowVerifyFraction', 'shadow_verify_fraction'], ['holidayFxDepthMult', 'holiday_fx_depth_mult']];
const phaseKey = (p: PhaseId): string => `phase_budget_ms_${p}`;

/** Every key above in 23 spelling. */
export const CORE_PARAM_KEYS: readonly string[] = [...INT.map(([, k]) => k), ...NUM.map(([, k]) => k), ...PHASES.map(phaseKey)];

/** Reads every 02 parameter once (callers keep the object for the tick). No defaults are hard-coded here. */
export function coreParams(p: ParamsView): CoreParams {
  const o: Record<string, unknown> = {};
  for (const [f, k] of INT) o[f] = p.int(k);
  for (const [f, k] of NUM) o[f] = p.num(k);
  const budget = {} as Record<PhaseId, number>;
  for (const ph of PHASES) budget[ph] = p.int(phaseKey(ph));
  o.phaseBudgetMs = budget;
  return o as unknown as CoreParams;
}
