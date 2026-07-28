/**
 * Проверка ввода на сервере (GDD §16.3).
 *
 * Хост не является источником истины, поэтому каждый кадр ввода проверяется:
 * монотонность sequence ID, диапазоны значений, частота отправки и отсутствие
 * телепортаций. Допуск при лаге сохраняется — цель не наказать за плохую
 * связь, а не дать переписать симуляцию.
 */

import { NET, TICK_RATE, type InputFrame } from '@uc/shared';

export interface ValidationStats {
  accepted: number;
  rejectedStale: number;
  rejectedRate: number;
  rejectedRange: number;
  corrections: number;
}

const MAX_INPUTS_PER_SECOND = TICK_RATE * 2.5;

export class PlayerValidator {
  readonly stats: ValidationStats = {
    accepted: 0,
    rejectedStale: 0,
    rejectedRate: 0,
    rejectedRange: 0,
    corrections: 0,
  };

  private lastSeq = 0;
  private windowStartMs = 0;
  private windowCount = 0;

  /**
   * Принимает кадр ввода. Возвращает нормализованный кадр либо `null`, если
   * кадр устарел, продублирован или превысил допустимую частоту.
   */
  accept(frame: InputFrame, nowMs: number): InputFrame | null {
    if (this.windowStartMs === 0) this.windowStartMs = nowMs;
    if (nowMs - this.windowStartMs >= 1000) {
      this.windowStartMs = nowMs;
      this.windowCount = 0;
    }
    this.windowCount++;
    if (this.windowCount > MAX_INPUTS_PER_SECOND) {
      this.stats.rejectedRate++;
      return null;
    }

    // Устаревшие и повторные кадры отбрасываются: sequence ID строго растёт.
    if (frame.seq <= this.lastSeq) {
      this.stats.rejectedStale++;
      return null;
    }

    if (!Number.isFinite(frame.axis) || !Number.isFinite(frame.buttons)) {
      this.stats.rejectedRange++;
      return null;
    }

    this.lastSeq = frame.seq;
    this.stats.accepted++;
    return {
      seq: frame.seq >>> 0,
      axis: Math.max(-1, Math.min(1, frame.axis)),
      buttons: frame.buttons & 0xff,
      aim: frame.aim & 0xff,
    };
  }

  /**
   * Проверка смещения за тик. Сервер сам симулирует движение, поэтому это
   * страховка от ошибок в симуляции, а не от клиента.
   */
  checkStep(previousX: number, previousY: number, x: number, y: number): boolean {
    const moved = Math.hypot(x - previousX, y - previousY);
    if (moved > NET.maxStepDistance * 3) {
      this.stats.corrections++;
      return false;
    }
    return true;
  }

  reset(): void {
    this.lastSeq = 0;
    this.windowCount = 0;
    this.windowStartMs = 0;
  }
}
