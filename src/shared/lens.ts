import { VIEW } from './contracts';

/**
 * The release camera's lens as pure math (user, 21 October: "fix it properly"): the renderer places its perspective
 * camera from these numbers, and the simulation projects ground enemies through the same line of sight, so a turret
 * on the terrain and its gameplay target on the flight plane always share a pixel. No Three.js, no browser state.
 *
 * Frame: x lateral, y up, s forward from the player row (the renderer's z is −s).
 */
/** Vertical field of view (degrees) of the release camera. */
export const LENS_FOV = 25;
const ELEVATION = VIEW.elevation * Math.PI / 180;
/** The canonical 9:16 view's height at the centre depth (the orthographic frame the lens matches there). */
export const TACTICAL_HEIGHT = VIEW.width * 16 / 9;
const CENTER_S = (VIEW.minS + VIEW.maxS) / 2;

/** Distance from the eye to the view centre that fits the tactical height for a vertical field of view. */
export const lensDistance = (fov = LENS_FOV) => TACTICAL_HEIGHT / 2 / Math.tan(fov * Math.PI / 360);

/**
 * How much further the lens follows the simulation's camera toward the world edges: the view is narrower at the ship's
 * row than at its centre, so the eye moves out far enough that a ship at the edge, wingtips included, stays in view.
 */
export function lensFollow(fov = LENS_FOV): number {
  const d = lensDistance(fov), depth = d - CENTER_S * Math.cos(ELEVATION);
  const halfWidth = depth * (9 / 16) * Math.tan(fov * Math.PI / 360);
  const limit = VIEW.worldWidth / 2 - VIEW.width / 2, edge = VIEW.worldWidth / 2 - VIEW.playerRadius + .55;
  return Math.max(1, (edge - halfWidth) / limit);
}
export const LENS_FOLLOW = lensFollow();

export interface LensPoint { x: number; y: number; s: number }
/** The eye for a simulation camera x (the lens follows it by LENS_FOLLOW). */
export function lensEye(cameraX: number, fov = LENS_FOV): LensPoint {
  const d = lensDistance(fov);
  return { x: cameraX * lensFollow(fov), y: VIEW.flightHeight + Math.sin(ELEVATION) * d, s: CENTER_S - Math.cos(ELEVATION) * d };
}
/** Where the line of sight through world point (x, y, s) crosses the flight plane: the point's gameplay position. */
export function toFlightPlane(cameraX: number, x: number, y: number, s: number): { x: number; s: number } {
  const eye = lensEye(cameraX), t = (eye.y - VIEW.flightHeight) / (eye.y - y);
  return { x: eye.x + (x - eye.x) * t, s: eye.s + (s - eye.s) * t };
}
/** The world point at height y on the line of sight through flight-plane point (x, s). */
export function fromFlightPlane(cameraX: number, x: number, s: number, y: number): { x: number; s: number } {
  const eye = lensEye(cameraX), t = (eye.y - y) / (eye.y - VIEW.flightHeight);
  return { x: eye.x + (x - eye.x) * t, s: eye.s + (s - eye.s) * t };
}
