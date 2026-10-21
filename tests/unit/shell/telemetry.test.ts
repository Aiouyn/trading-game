import { describe, expect, it } from "vitest";
import { perfLog, recordPerf, type PerfSample } from "@/shell/telemetry";

describe("telemetry ui.perf", () => {
  it("keeps fps: null as null (no coercion to 0)", () => {
    const s: PerfSample = { tickRenderMsP50: 1, tickRenderMsP95: 2, fps: null, heapMb: 3, renderTier: "low" };
    recordPerf(s);
    const last = perfLog()[perfLog().length - 1];
    expect(last).toEqual({ event: "ui.perf", ...s });
    expect(last.fps).toBeNull();
  });
  it("keeps numeric fps", () => {
    recordPerf({ tickRenderMsP50: 0, tickRenderMsP95: 0, fps: 60, heapMb: 0, renderTier: "high" });
    expect(perfLog()[perfLog().length - 1].fps).toBe(60);
  });
});
