export const QUALITY = Object.freeze({
  high: { dpr: 1.5, detail: 1, tile: 400 },
  balanced: { dpr: 1, detail: 0.5, tile: 400 },
  low: { dpr: 1, detail: 0, tile: 400 },
});
export function qualityWindow(state, { p95, active, hidden, manual }) {
  if (manual || hidden || !active || !Number.isFinite(p95)) return state;
  const slow = p95 > 34 ? state.slow + 1 : 0;
  if (slow < 3) return { ...state, slow };
  const tier = state.tier === 'high' ? 'balanced' : 'low';
  return { tier, slow: 0 };
}
