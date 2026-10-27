import { describe, expect, it } from 'vitest';
import { generateCity } from '../../e2e/city/fixtures/generate-city';
import { decodeChunk } from '@/city/worker/decode';
import { fitPicture, PICTURE_PADDING_PX, PORTRAIT_FLOOR } from '@/city/renderer/picture';
import { buildModel, polygonCentroid } from '@/city/renderer/model';
import { inPolygon } from '@/city/renderer/labels';
import { districtName } from '@/city/data/names';
import { projectOrtho } from '@/city/renderer/camera';

// #26 follow-up (Producer/QA): the phone T0 crop keeps every district label point in view and
// never fills less than PORTRAIT_FLOOR of the height. Fails if the anchor fit is reverted.
const ab = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const EPS = 1e-9;
const VIEWS = [[390, 844], [390, 700], [360, 740]] as const; // css px, phone portrait
const DPR = 2;

function world(seed?: number) {
  const g = generateCity(seed);
  const chunks = new Map(g.manifests.get(1)!.chunks.map((c) => [c.contentHash, decodeChunk(ab(g.files.get(c.url)!))] as const));
  const model = buildModel(g.snapshot, chunks);
  // same candidate rings as create.ts labelSpecs (water check omitted: the invariant holds for any candidates)
  const labels = g.snapshot.districts.map((d) => {
    const a = polygonCentroid(d.polygon);
    const ground: [number, number][] = [a];
    for (const r of [30, 60, 90, 130, 170])
      for (let k = 0; k < 12; k++) {
        const t = (k / 12) * Math.PI * 2;
        const x = a[0] + Math.cos(t) * r, z = a[1] + Math.sin(t) * r;
        if (inPolygon(x * 100, z * 100, d.polygon)) ground.push([x, z]);
      }
    // generous serif estimate: 9 css px per char + 6 px padding, in device px
    return { ground, w: (districtName(d.nameKey).length * 9 + 6) * DPR };
  });
  return { parts: model.parts, labels };
}

describe('T0 picture phone crop (#26)', () => {
  for (const seed of [undefined, 1, 2, 3, 4, 5, 6]) {
    it(`seed ${seed ?? 'reference'}: every district label point in the crop, fill ≥ floor`, () => {
      const w = world(seed);
      expect(w.labels.length).toBe(8);
      for (const [cw, ch] of VIEWS) {
        const W = cw * DPR, H = ch * DPR, pad = PICTURE_PADDING_PX * DPR;
        const f = fitPicture({ parts: w.parts, labels: w.labels, W, H, pad });
        const fill = ((f.v1 - f.v0) * f.scale) / H;
        expect(fill).toBeGreaterThanOrEqual(PORTRAIT_FLOOR - EPS);
        expect(f.anchors.length).toBe(8); // portrait branch taken
        const half = (W / 2 - pad) / f.scale;
        w.labels.forEach((l, i) => {
          // the chosen point is one of the district's own candidates
          expect(l.ground.some(([x, z]) => Math.abs(projectOrtho([x, 0, z], 0)[0] - f.anchors[i]) < 1e-9)).toBe(true);
          // the label point itself is always inside the crop
          expect(f.anchors[i], `seed ${seed} ${cw}x${ch} label ${i} point`).toBeGreaterThanOrEqual(f.uc - half - EPS);
          expect(f.anchors[i], `seed ${seed} ${cw}x${ch} label ${i} point`).toBeLessThanOrEqual(f.uc + half + EPS);
          // and the whole label width too, unless the crop is already at the floor
          if (fill > PORTRAIT_FLOOR + 1e-6) {
            const lh = l.w / 2 / f.scale;
            expect(f.anchors[i] - lh, `seed ${seed} ${cw}x${ch} label ${i} left`).toBeGreaterThanOrEqual(f.uc - half - EPS);
            expect(f.anchors[i] + lh, `seed ${seed} ${cw}x${ch} label ${i} right`).toBeLessThanOrEqual(f.uc + half + EPS);
          }
        });
      }
    });
  }
});

describe('PORTRAIT_FLOOR', () => {
  it('is pinned to the review M6 literal 0.41 (41 %)', () => {
    expect(PORTRAIT_FLOOR).toBe(0.41);
  });
});
