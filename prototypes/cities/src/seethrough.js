// See-through: which built buildings stand between the camera and the focus buildings (the selected one and yours).
//
// The camera is orthographic with a fixed pitch, so a building's box projects to a rectangle on the view plane that
// depends only on the yaw. projectBoxes computes those rectangles once per yaw; findSeeThrough then runs the occluder
// test on plain numbers for whatever the focus set and the growth are. Units: metres on the view plane (right, up) and
// along the view direction (depth: smaller = closer to the camera). World: x east, y up, z = map y (south).

/** Per-building state bits (see render.js load): 2 = see-through occluder (ghost pass), 4 = focus. */
export const BIT_OCCLUDER = 2;
export const BIT_FOCUS = 4;

const STRIDE = 6; // per building: minR, maxR, minU, maxU, depth, baseMinU
const CORNER_A = [-1, 1, 1, -1]; // footprint corners as signs of (w / 2, dp / 2), counter-clockwise in the local frame
const CORNER_B = [-1, -1, 1, 1];

/**
 * Screen boxes of every building for one camera orientation. right, up and fwd are unit vectors in world space.
 * Returns a Float64Array with STRIDE values per building, in city.buildings order (index = id - 1), where
 * minR..maxU bound the projected box, depth is the depth of its centre, and baseMinU is the lowest point of its base.
 * Pass the previous result as `out` to reuse the buffer.
 */
export function projectBoxes(buildings, right, up, fwd, out = null) {
  const n = buildings.length;
  const data = out && out.length === n * STRIDE ? out : new Float64Array(n * STRIDE);
  const [rx, ry, rz] = right, [ux, uy, uz] = up, [fx, fy, fz] = fwd;
  for (let i = 0; i < n; i++) {
    const b = buildings[i];
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const hw = b.w / 2, hd = b.dp / 2, base = b.gz, top = b.gz + b.h;
    let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity, baseMinU = Infinity;
    for (let k = 0; k < 4; k++) {
      const la = CORNER_A[k] * hw, lb = CORNER_B[k] * hd;
      const X = b.x + c * la - s * lb, Z = b.y + s * la + c * lb;
      for (let t = 0; t < 2; t++) {
        const Y = t === 0 ? base : top;
        const r = X * rx + Y * ry + Z * rz;
        const u = X * ux + Y * uy + Z * uz;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (t === 0 && u < baseMinU) baseMinU = u;
      }
    }
    const o = i * STRIDE;
    data[o] = minR; data[o + 1] = maxR; data[o + 2] = minU; data[o + 3] = maxU;
    data[o + 4] = b.x * fx + (base + b.h / 2) * fy + b.y * fz;
    data[o + 5] = baseMinU;
  }
  return data;
}

/**
 * The focus buildings that are built, and the built buildings that hide them. A building hides a focus building when
 * it is not itself a focus building, it is closer to the camera, its screen box overlaps the focus box grown by
 * `margin` (metres), and its top reaches above the focus building's base on screen. Returns ids (bids).
 */
export function findSeeThrough(buildings, boxes, focusIds, growth, margin) {
  const n = buildings.length;
  const isFocus = new Uint8Array(n);
  const focus = [];
  for (const id of focusIds) {
    const i = id - 1;
    if (i < 0 || i >= n || isFocus[i] || buildings[i].order > growth) continue;
    isFocus[i] = 1;
    focus.push(i);
  }
  const occluders = [];
  if (!focus.length) return { focus: [], occluders };
  for (let i = 0; i < n; i++) {
    if (isFocus[i] || buildings[i].order > growth) continue;
    const o = i * STRIDE;
    for (const f of focus) {
      const q = f * STRIDE;
      if (boxes[o] < boxes[q + 1] + margin && boxes[o + 1] > boxes[q] - margin &&
          boxes[o + 2] < boxes[q + 3] + margin && boxes[o + 3] > boxes[q + 2] - margin &&
          boxes[o + 4] < boxes[q + 4] && boxes[o + 3] > boxes[q + 5]) {
        occluders.push(i + 1);
        break;
      }
    }
  }
  return { focus: focus.map((i) => i + 1), occluders };
}
