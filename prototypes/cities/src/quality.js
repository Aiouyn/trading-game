export const QUALITY = Object.freeze({
  high: { dpr: 1.5, detail: 1, pixels: 2400000, animationFps: 12 },
  balanced: { dpr: 1, detail: 0.5, pixels: 1400000, animationFps: 8 },
  low: { dpr: 0.75, detail: 0, pixels: 700000, animationFps: 4 },
});
export function renderPixelRatio(tier, width, height, deviceDpr = 1) {
  const q = QUALITY[tier] ?? QUALITY.high;
  return Math.min(deviceDpr, q.dpr, Math.sqrt(q.pixels / Math.max(1, width * height)));
}
export function qualityWindow(state, { p95, active, hidden, manual }) {
  if (manual || hidden || !active || !Number.isFinite(p95)) return state;
  const slow = p95 > 34 ? state.slow + 1 : 0;
  if (slow < 3) return { ...state, slow };
  const tier = state.tier === 'high' ? 'balanced' : 'low';
  return { tier, slow: 0 };
}
