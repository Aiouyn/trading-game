"use client";
// TickRing stub (17 §3.5): one sweep per tick, restarted by the `clock` channel, never a free timer.
export function TickRing({ tick, size = 22 }: { tick: number; size?: number }) {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className="tickring" data-testid="tickring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="tickring-track" />
      <circle
        key={tick}
        cx={size / 2} cy={size / 2} r={r}
        className="tickring-sweep"
        style={{ strokeDasharray: c, strokeDashoffset: c }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
