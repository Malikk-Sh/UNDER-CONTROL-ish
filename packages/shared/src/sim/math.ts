/** Мелкие математические помощники, общие для клиента и сервера. */

export interface Vec2 {
  x: number;
  y: number;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Плавное приближение, независимое от частоты кадров. */
export function damp(a: number, b: number, smoothing: number, dt: number): number {
  return lerp(a, b, 1 - Math.pow(smoothing, dt));
}

export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return current;
}

export function sign(value: number): number {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

export function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** Квантование угла в один байт — используется для направления броска. */
export function packAngle(radians: number): number {
  const normalized = ((radians % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.round((normalized / (Math.PI * 2)) * 255) & 0xff;
}

export function unpackAngle(byte: number): number {
  return ((byte & 0xff) / 255) * Math.PI * 2;
}

/** Округление до сетки, чтобы клиент и сервер не расходились из-за float-шума. */
export function quantize(value: number, step = 1 / 64): number {
  return Math.round(value / step) * step;
}
