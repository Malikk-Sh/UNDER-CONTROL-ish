/**
 * Детерминированный генератор псевдослучайных чисел.
 *
 * Опасности рассчитываются от серверного времени и seed (GDD §16.1), поэтому
 * любая «случайность» должна воспроизводиться на клиенте по тем же входным
 * данным. Math.random для этого не годится.
 */

export class Rng {
  private state: number;

  constructor(seed: number) {
    // mulberry32 требует ненулевого 32-битного состояния.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, maxExclusive: number): number {
    return Math.floor(this.range(min, maxExclusive));
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length)];
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  fork(salt: number): Rng {
    return new Rng((this.state ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0);
  }
}

/** Стабильный числовой хеш строки — для seed по коду комнаты. */
export function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
