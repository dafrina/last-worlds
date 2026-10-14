export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function approach(value: number, target: number, step: number): number {
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}

/** Earliest segment/circle impact, including a segment starting inside the circle. */
export function segmentCircleHit(x0: number, s0: number, x1: number, s1: number, x: number, s: number, radius: number): number | null {
  const dx = x1 - x0;
  const ds = s1 - s0;
  const ox = x0 - x;
  const os = s0 - s;
  const c = ox * ox + os * os - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + ds * ds;
  if (a < 1e-12) return null;
  const b = 2 * (ox * dx + os * ds);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}
