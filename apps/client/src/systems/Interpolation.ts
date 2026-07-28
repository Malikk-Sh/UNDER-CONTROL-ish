/**
 * Интерполяция удалённых объектов.
 *
 * Снимки приходят 20 раз в секунду, а рисуем мы 60. Показываем прошлое на
 * ~110 мс назад и интерполируем между двумя ближайшими снимками: это убирает
 * дёрганье и не требует экстраполяции, которая на платформере выглядит как
 * «проезд сквозь стену и рывок назад».
 */

import { NET } from '@uc/shared';

interface Sample {
  t: number;
  x: number;
  y: number;
  extra: Float32Array;
}

export interface InterpolatedValue {
  x: number;
  y: number;
  extra: Float32Array;
}

const MAX_SAMPLES = 24;

export class InterpolationBuffer {
  private readonly tracks = new Map<string, Sample[]>();
  private readonly scratch: InterpolatedValue = { x: 0, y: 0, extra: new Float32Array(0) };

  /** Кладёт снимок. `extra` — произвольные числовые поля для интерполяции. */
  push(id: string, x: number, y: number, extra: readonly number[] = [], now = performance.now()): void {
    let track = this.tracks.get(id);
    if (!track) {
      track = [];
      this.tracks.set(id, track);
    }
    const last = track[track.length - 1];
    // Дубликаты снимков только съедают память.
    if (last && last.x === x && last.y === y && now - last.t < 8) return;

    track.push({ t: now, x, y, extra: Float32Array.from(extra) });
    if (track.length > MAX_SAMPLES) track.shift();
  }

  /** Значение на момент «сейчас минус задержка буфера». */
  sample(id: string, now = performance.now()): InterpolatedValue | null {
    const track = this.tracks.get(id);
    if (!track || track.length === 0) return null;

    const target = now - NET.interpolationDelayMs;
    if (track.length === 1 || target <= track[0].t) {
      return this.assign(track[0], track[0], 0);
    }

    const last = track[track.length - 1];
    if (target >= last.t) {
      // Снимки перестали приходить — замираем на последнем, не экстраполируем.
      return this.assign(last, last, 0);
    }

    for (let i = track.length - 1; i > 0; i--) {
      const to = track[i];
      const from = track[i - 1];
      if (target >= from.t && target <= to.t) {
        const span = to.t - from.t;
        const t = span <= 0 ? 0 : (target - from.t) / span;
        return this.assign(from, to, t);
      }
    }
    return this.assign(track[0], track[0], 0);
  }

  private assign(from: Sample, to: Sample, t: number): InterpolatedValue {
    this.scratch.x = from.x + (to.x - from.x) * t;
    this.scratch.y = from.y + (to.y - from.y) * t;

    const count = Math.min(from.extra.length, to.extra.length);
    if (this.scratch.extra.length !== count) this.scratch.extra = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.scratch.extra[i] = from.extra[i] + (to.extra[i] - from.extra[i]) * t;
    }
    return this.scratch;
  }

  /** Мгновенная позиция без задержки — для телепортов и смены комнаты. */
  reset(id: string): void {
    this.tracks.delete(id);
  }

  clear(): void {
    this.tracks.clear();
  }

  has(id: string): boolean {
    return this.tracks.has(id);
  }

  ids(): IterableIterator<string> {
    return this.tracks.keys();
  }
}
