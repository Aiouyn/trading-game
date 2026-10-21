// Orthographic city camera (spec §6): 45° yaw, 30° elevation (2:1 diamond), 4 quarter turns,
// zoom 0.25×–4×. Pure maths, no three.js, so it is unit-testable.

export const ELEVATION_DEG = 30;
export const YAW0_DEG = 45;
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;

export type Vec3 = [number, number, number];

export interface CameraState {
  target: [number, number]; // x, z on the ground
  rotation: 0 | 1 | 2 | 3;
  zoom: number;
}

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(z) ? z : 1));
}

export function rotate(r: CameraState['rotation'], step: 1 | -1): CameraState['rotation'] {
  return (((r + step) % 4) + 4) % 4 as CameraState['rotation'];
}

/** Unit vector from the target towards the camera. */
export function viewDirection(rotation: number): Vec3 {
  const yaw = ((YAW0_DEG + 90 * rotation) * Math.PI) / 180;
  const el = (ELEVATION_DEG * Math.PI) / 180;
  return [Math.cos(el) * Math.sin(yaw), Math.sin(el), Math.cos(el) * Math.cos(yaw)];
}

/** Screen basis (right, up) for a camera looking along -viewDirection with world +Y up. */
export function screenBasis(rotation: number): { right: Vec3; up: Vec3 } {
  const [dx, dy, dz] = viewDirection(rotation);
  // right = normalize(up × back) with back = view direction
  const rl = Math.hypot(dz, dx);
  const right: Vec3 = [dz / rl, 0, -dx / rl];
  // up = back × right
  const up: Vec3 = [dy * right[2] - dz * right[1], dz * right[0] - dx * right[2], dx * right[1] - dy * right[0]];
  return { right, up };
}

/** Orthographic projection of a world point onto the screen plane (metres, y up). */
export function projectOrtho(p: Vec3, rotation: number): [number, number] {
  const { right, up } = screenBasis(rotation);
  return [p[0] * right[0] + p[1] * right[1] + p[2] * right[2], p[0] * up[0] + p[1] * up[1] + p[2] * up[2]];
}

/** Ground-plane offset for a screen-space pan of (du, dv) metres. */
export function panGround(rotation: number, du: number, dv: number): [number, number] {
  const { right } = screenBasis(rotation);
  const [dx, , dz] = viewDirection(rotation);
  const fl = Math.hypot(dx, dz);
  // forward on the ground points away from the camera; one screen metre up = 1/sin(el) ground metres
  const k = 1 / Math.sin((ELEVATION_DEG * Math.PI) / 180);
  return [du * right[0] - dv * k * (dx / fl), du * right[2] - dv * k * (dz / fl)];
}
