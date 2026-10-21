import { describe, expect, it } from 'vitest';
import { FrameStats, sampleFps } from '../../../src/city/diagnostics/perf';

describe('C-15 ui.perf fps', () => {
  it('is null when no frames were drawn since the last sample (never NaN, never 0)', () => {
    expect(sampleFps(0, 60)).toBeNull();
    expect(sampleFps(0, null)).toBeNull();
    expect(sampleFps(-1, 60)).toBeNull();
  });
  it('is null for a non-finite or non-positive mean', () => {
    expect(sampleFps(5, Number.NaN)).toBeNull();
    expect(sampleFps(5, Number.POSITIVE_INFINITY)).toBeNull();
    expect(sampleFps(5, 0)).toBeNull();
    expect(sampleFps(5, null)).toBeNull();
  });
  it('passes a measured value through', () => {
    expect(sampleFps(12, 59.5)).toBe(59.5);
  });
  it('an empty FrameStats gives null fps', () => {
    expect(new FrameStats().fps()).toBeNull();
  });
});
