/**
 * Автотесты опасностей (GDD §9.1, §20.1).
 *
 * Главная проверка: правило трёх фаз. У каждой периодической опасности обязаны
 * быть предупреждение, активная фаза и гарантированное окно восстановления —
 * иначе игрок не сможет объяснить причину провала.
 */

import { describe, expect, it } from 'vitest';
import {
  ELECTRIC_CYCLE,
  HAZARD,
  HazardPhase,
  MAGNET_CYCLE,
  PRESS_CYCLE,
  electricPhase,
  jetPhase,
  magnetPhase,
  pressPose,
} from '@uc/shared';

/** Прогоняет полный цикл и собирает набор встреченных фаз. */
function samplePhases(cycle: number, read: (time: number) => HazardPhase): Set<HazardPhase> {
  const phases = new Set<HazardPhase>();
  const steps = 600;
  for (let i = 0; i < steps; i++) phases.add(read((i / steps) * cycle * 1.02));
  return phases;
}

describe('пресс', () => {
  it('проходит все три фазы за цикл', () => {
    const phases = samplePhases(PRESS_CYCLE, (t) => pressPose(t, 0, 128, 1).phase);
    expect(phases.has(HazardPhase.Warn)).toBe(true);
    expect(phases.has(HazardPhase.Active)).toBe(true);
    expect(phases.has(HazardPhase.Recover)).toBe(true);
  });

  it('начинает цикл с предупреждения, а не с удара', () => {
    expect(pressPose(0, 0, 128, 1).phase).toBe(HazardPhase.Warn);
    expect(pressPose(0.05, 0, 128, 1).drop).toBe(0);
  });

  it('опускается на полный ход и возвращается наверх', () => {
    const travel = 128;
    let maxDrop = 0;
    let minDrop = travel;
    for (let i = 0; i < 400; i++) {
      const drop = pressPose((i / 400) * PRESS_CYCLE, 0, travel, 1).drop;
      maxDrop = Math.max(maxDrop, drop);
      minDrop = Math.min(minDrop, drop);
    }
    expect(maxDrop).toBeCloseTo(travel, 0);
    expect(minDrop).toBeCloseTo(0, 1);
  });

  it('детерминирован: одинаковое время даёт одинаковую позу', () => {
    const a = pressPose(3.14159, 0.4, 128, 1.3);
    const b = pressPose(3.14159, 0.4, 128, 1.3);
    expect(a).toEqual(b);
  });

  it('сохраняет окно восстановления даже при максимальной интенсивности', () => {
    const phases = samplePhases(PRESS_CYCLE, (t) => pressPose(t, 0, 128, 1.6).phase);
    expect(phases.has(HazardPhase.Recover)).toBe(true);
    expect(phases.has(HazardPhase.Warn)).toBe(true);
  });

  it('смещение фазы разводит прессы во времени', () => {
    const a = pressPose(0.5, 0, 128, 1);
    const b = pressPose(0.5, PRESS_CYCLE / 2, 128, 1);
    expect(a.drop).not.toBeCloseTo(b.drop, 3);
  });
});

describe('магнит', () => {
  it('проходит все три фазы', () => {
    const phases = samplePhases(MAGNET_CYCLE, (t) => magnetPhase(t, 0, 1).phase);
    expect(phases.has(HazardPhase.Warn)).toBe(true);
    expect(phases.has(HazardPhase.Active)).toBe(true);
    expect(phases.has(HazardPhase.Recover)).toBe(true);
  });

  it('нарастает и спадает плавно, без рывка', () => {
    const strengths: number[] = [];
    for (let i = 0; i < 200; i++) {
      strengths.push(magnetPhase((i / 200) * MAGNET_CYCLE, 0, 1).strength);
    }
    const maxJump = strengths.slice(1).reduce((max, value, index) => Math.max(max, Math.abs(value - strengths[index])), 0);
    expect(maxJump).toBeLessThan(0.15);
  });

  it('в фазе предупреждения не тянет', () => {
    expect(magnetPhase(0.1, 0, 1).strength).toBe(0);
  });
});

describe('ток в воде', () => {
  it('проходит все три фазы и оставляет безопасное окно', () => {
    const phases = samplePhases(ELECTRIC_CYCLE, (t) => electricPhase(t, 0, 1));
    expect(phases.has(HazardPhase.Warn)).toBe(true);
    expect(phases.has(HazardPhase.Active)).toBe(true);
    expect(phases.has(HazardPhase.Recover)).toBe(true);
  });

  it('пауза длиннее разряда — успеть перейти можно всегда', () => {
    expect(HAZARD.electricRest).toBeGreaterThan(HAZARD.electricActive);
  });
});

describe('струи пара', () => {
  it('проходят все три фазы', () => {
    const phases = samplePhases(3.3, (t) => jetPhase(t, 0));
    expect(phases.has(HazardPhase.Warn)).toBe(true);
    expect(phases.has(HazardPhase.Active)).toBe(true);
    expect(phases.has(HazardPhase.Recover)).toBe(true);
  });
});

describe('общие гарантии телеграфирования', () => {
  it('у пресса предупреждение длиннее удара', () => {
    expect(HAZARD.pressWarn).toBeGreaterThan(HAZARD.pressSlam);
  });

  it('у магнита предупреждение заметно на глаз', () => {
    expect(HAZARD.magnetWarn).toBeGreaterThanOrEqual(0.5);
  });

  it('отбрасывание ограничено и не выкидывает игрока за карту', () => {
    expect(HAZARD.knockback).toBeLessThan(600);
  });
});
