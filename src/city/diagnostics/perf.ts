export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[i];
}

/** Rolling frame statistics: intervals between consecutive rendered frames and CPU render time. */
export class FrameStats {
  private intervals: number[] = [];
  private renderMs: number[] = [];
  private last: number | null = null;

  constructor(private readonly cap = 600) {}

  frame(now: number, cpuMs: number, continuous: boolean): void {
    if (this.last !== null && continuous) this.push(this.intervals, now - this.last);
    this.last = continuous ? now : null;
    this.push(this.renderMs, cpuMs);
  }

  /** Call when the loop idles so the gap is not counted as a frame interval. */
  pause(): void {
    this.last = null;
  }

  frameMsP95(): number | null {
    return percentile(this.intervals, 95);
  }

  fps(): number | null {
    if (this.intervals.length === 0) return null;
    const mean = this.intervals.reduce((a, b) => a + b, 0) / this.intervals.length;
    return mean > 0 ? 1000 / mean : null;
  }

  renderP(p: number): number | null {
    return percentile(this.renderMs, p);
  }

  private push(arr: number[], v: number): void {
    arr.push(v);
    if (arr.length > this.cap) arr.shift();
  }
}

export interface UiPerfSample {
  tickRenderMs: { p50: number | null; p95: number | null };
  fps: number | null;
  heapMb: number | null;
  renderTier: string;
}

export function heapMb(): number | null {
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return mem ? mem.usedJSHeapSize / (1024 * 1024) : null;
}
