// Shell-owned telemetry (17 §5.2). The City renderer reports ui.perf through the injected
// onPerfSample sink, never a window event. Mock: samples are kept locally for e2e (window.__quayPerf).
export interface PerfSample { tickRenderMsP50: number; tickRenderMsP95: number; fps: number; heapMb: number; renderTier: string }
export interface UiPerfEvent extends PerfSample { event: "ui.perf" }

const log: UiPerfEvent[] = [];

export function recordPerf(s: PerfSample): void {
  log.push({ event: "ui.perf", ...s });
}

if (typeof window !== "undefined") {
  (window as Window & { __quayPerf?: () => readonly UiPerfEvent[] }).__quayPerf = () => log;
}
