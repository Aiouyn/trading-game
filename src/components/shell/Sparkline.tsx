// Sparkline stub, 92×22 (17 §3.2.3, §3.5). No data yet: a flat dashed line.
export function Sparkline({ points = [], width = 92, height = 22 }: { points?: number[]; width?: number; height?: number }) {
  if (points.length < 2) {
    return (
      <svg className="sparkline sparkline-empty" data-testid="sparkline" width={width} height={height} aria-hidden="true">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} />
      </svg>
    );
  }
  const min = Math.min(...points);
  const span = Math.max(...points) - min || 1;
  const d = points.map((p, i) => `${i ? "L" : "M"}${(i / (points.length - 1)) * width} ${height - ((p - min) / span) * height}`).join("");
  return (
    <svg className="sparkline" data-testid="sparkline" width={width} height={height} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
