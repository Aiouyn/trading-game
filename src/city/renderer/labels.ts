// Collision-aware district label layout (review B1; idea from the prototype's label-layout.js).
// Pure: screen-space boxes in, one chosen box per label out. A label moves off tall parts and
// other labels onto the district's open ground.

export interface LabelBox {
  x: number; // left, CSS px
  y: number; // top
  w: number;
  h: number;
}

export interface Obstacle extends LabelBox {
  weight: number;
}

export interface LabelInput {
  w: number;
  h: number;
  /** Anchor points (label centre), most preferred first. */
  candidates: { x: number; y: number }[];
}

const overlap = (a: LabelBox, b: LabelBox) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Greedy placement, labels in the given order. Obstacles should be bucketed by the caller if many. */
export function placeLabels(labels: LabelInput[], obstacles: Obstacle[], view: { w: number; h: number }, margin = 4): LabelBox[] {
  const placed: LabelBox[] = [];
  for (const l of labels) {
    let best: LabelBox | null = null;
    let bestCost = Infinity;
    let bestHitsLabel = false;
    l.candidates.forEach((c, rank) => {
      const box = { x: c.x - l.w / 2, y: c.y - l.h / 2, w: l.w, h: l.h };
      const pad = { x: box.x - margin, y: box.y - margin, w: box.w + 2 * margin, h: box.h + 2 * margin };
      let cost = rank * 0.02 * l.w * l.h; // prefer the district centre a little
      if (box.x < margin || box.y < margin || box.x + box.w > view.w - margin || box.y + box.h > view.h - margin) cost += 50 * l.w * l.h;
      let hitsLabel = false;
      for (const p of placed) {
        const ov = overlap(box, p);
        if (ov > 0) hitsLabel = true;
        cost += 100 * overlap(pad, p);
      }
      for (const o of obstacles) {
        if (o.x > pad.x + pad.w || o.x + o.w < pad.x || o.y > pad.y + pad.h || o.y + o.h < pad.y) continue;
        cost += o.weight * overlap(pad, o);
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = box;
        bestHitsLabel = hitsLabel;
      }
    });
    // never draw a label over another: when every candidate collides, this one is hidden (later = lower priority)
    const chosen: LabelBox = best && !bestHitsLabel ? best : { x: -1e4, y: -1e4, w: l.w, h: l.h };
    placed.push(chosen);
  }
  return placed;
}

/** Point in polygon (even-odd), any units. */
export function inPolygon(x: number, z: number, poly: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
