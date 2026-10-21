// Shell-owned telemetry (17 §5.2). The City renderer reports ui.perf through the injected
// onPerfSample sink, never a window event. Mock: samples are kept locally for e2e (window.__quayPerf).
export interface PerfSample { tickRenderMsP50: number; tickRenderMsP95: number; fps: number | null; heapMb: number; renderTier: string }
// fps is null when the renderer has no measurement yet (e.g. first frames, hidden tab). Never coerce to 0.
export interface UiPerfEvent extends PerfSample { event: "ui.perf" }

const log: UiPerfEvent[] = [];
export function perfLog(): readonly UiPerfEvent[] { return log; }

export function recordPerf(s: PerfSample): void {
  log.push({ event: "ui.perf", ...s });
}

if (typeof window !== "undefined") {
  (window as Window & { __quayPerf?: () => readonly UiPerfEvent[] }).__quayPerf = perfLog;
}
