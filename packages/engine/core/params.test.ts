import { describe, expect, it } from 'vitest';
import { CORE_PARAM_KEYS, coreParams, PHASES, type ParamsView } from './index';

describe('coreParams (T02-21 params.ts)', () => {
  it('reads every key once through the ParamsView; no defaults hard-coded', () => {
    const reads: string[] = [];
    const v: ParamsView = { num: (k) => { reads.push(k); return 0.5; }, int: (k) => { reads.push(k); return 7; } };
    const p = coreParams(v);
    expect([...reads].sort()).toEqual([...CORE_PARAM_KEYS].sort());
    expect(new Set(CORE_PARAM_KEYS).size).toBe(CORE_PARAM_KEYS.length);
    expect(p.intentsPerTickPerActor).toBe(7); expect(p.shadowVerifyFraction).toBe(0.5);
    expect(Object.keys(p.phaseBudgetMs)).toEqual([...PHASES]);
    expect(CORE_PARAM_KEYS).toContain('phase_budget_ms_P14');
    // QA M52: the key list is pinned literally, so dropping a key from the reader (and thus from CORE_PARAM_KEYS) fails
    expect(CORE_PARAM_KEYS.filter((k) => !k.startsWith('phase_budget_ms_'))).toEqual(['intents_per_tick_per_actor', 'intents_per_tick_per_principal',
      'intent_max_age_ticks', 'seal_grace_ms', 'safe_mode_max_attempts', 'safe_mode_subsystem_repeat_halt', 'resume_notice_ms', 'version_notice_ticks',
      'catchup_min_interval_ms', 'catchup_max_lag_ms', 'clock_max_skew_ms', 'outage_compensation_threshold_min', 'snapshot_daily_retention_days',
      'coord_failover_timeout_ms', 'entropy_epoch_ticks', 'entropy_commit_lead_ticks', 'entropy_reveal_lag_ticks', 'display_clock_offset_min',
      'inv_xpart_settle_max_ticks', 'shadow_verify_fraction', 'holiday_fx_depth_mult']);
    expect(Object.keys(p).sort()).toEqual(['catchupMaxLagMs', 'catchupMinIntervalMs', 'clockMaxSkewMs', 'coordFailoverTimeoutMs', 'displayClockOffsetMin',
      'entropyCommitLeadTicks', 'entropyEpochTicks', 'entropyRevealLagTicks', 'holidayFxDepthMult', 'intentMaxAgeTicks', 'intentsPerTickPerActor',
      'intentsPerTickPerPrincipal', 'invXpartSettleMaxTicks', 'outageCompensationThresholdMin', 'phaseBudgetMs', 'resumeNoticeMs', 'safeModeMaxAttempts',
      'safeModeSubsystemRepeatHalt', 'sealGraceMs', 'shadowVerifyFraction', 'snapshotDailyRetentionDays', 'versionNoticeTicks']);
  });
});
