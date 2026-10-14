export function overlaps(a, b, gap = 4) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x
    && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}
export function packLabels(candidates, width, height, exclusions = []) {
  const kept = [];
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority || String(a.id).localeCompare(String(b.id), 'en'));
  for (const r of sorted) {
    if (r.x < 0 || r.y < 0 || r.x + r.w > width || r.y + r.h > height) continue;
    if (exclusions.some(e => overlaps(r, e)) || kept.some(e => overlaps(r, e))) continue;
    kept.push(r);
  }
  return kept.map(r => r.id);
}
