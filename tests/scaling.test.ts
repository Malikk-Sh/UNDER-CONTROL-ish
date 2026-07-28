/**
 * Проверка формул масштабирования (GDD §6.3).
 *
 * Это самая опасная часть дизайна: одна ошибка здесь делает комнату
 * непроходимой для конкретного состава, а обнаружится это только на плейтесте.
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_REQUIRED_ACTIVATORS,
  ROOM,
  VALIDATION_PARTY_SIZES,
  activatorsAreSatisfiable,
  carrySpeedFactor,
  extraHazardWaves,
  hazardIntensity,
  holdDuration,
  objectiveTimeScale,
  repairNodeCount,
  requiredActivators,
  reviveDuration,
} from '@uc/shared';

describe('requiredActivators', () => {
  it('соответствует формуле max(1, min(3, ceil(N × 0,4)))', () => {
    expect(requiredActivators(1)).toBe(1);
    expect(requiredActivators(2)).toBe(1);
    expect(requiredActivators(3)).toBe(2);
    expect(requiredActivators(4)).toBe(2);
    expect(requiredActivators(5)).toBe(2);
    expect(requiredActivators(6)).toBe(3);
    expect(requiredActivators(8)).toBe(3);
  });

  it('никогда не требует больше активаторов, чем есть игроков', () => {
    for (let n = 1; n <= ROOM.hardMaxPlayers; n++) {
      expect(requiredActivators(n)).toBeLessThanOrEqual(n);
      expect(activatorsAreSatisfiable(n)).toBe(true);
    }
  });

  it('имеет жёсткий потолок в три активатора при любом составе', () => {
    for (let n = 1; n <= 64; n++) {
      expect(requiredActivators(n)).toBeLessThanOrEqual(MAX_REQUIRED_ACTIVATORS);
    }
  });

  it('соло всегда обходится одним активатором', () => {
    expect(requiredActivators(1)).toBe(1);
  });
});

describe('интенсивность опасностей', () => {
  it('растёт медленнее числа игроков и имеет верхний предел', () => {
    const solo = hazardIntensity(1);
    const eight = hazardIntensity(8);
    expect(solo).toBe(1);
    // Игроков в восемь раз больше, а давление выросло примерно вдвое:
    // интенсивность обязана отставать от роста состава в разы.
    expect(eight / solo).toBeLessThan(8 / 1 / 3);
    expect(hazardIntensity(64)).toBeLessThanOrEqual(2.05);
  });

  it('монотонна по составу', () => {
    for (let n = 1; n < 32; n++) {
      expect(hazardIntensity(n + 1)).toBeGreaterThanOrEqual(hazardIntensity(n));
    }
  });

  it('добавляет волны только крупному составу', () => {
    expect(extraHazardWaves(1)).toBe(0);
    expect(extraHazardWaves(3)).toBe(0);
    expect(extraHazardWaves(5)).toBe(1);
    expect(extraHazardWaves(8)).toBe(2);
  });
});

describe('спасение', () => {
  it('ускоряется с каждым помощником, но с убывающей отдачей', () => {
    const one = reviveDuration(2.4, 1);
    const two = reviveDuration(2.4, 2);
    const four = reviveDuration(2.4, 4);

    expect(one).toBe(2.4);
    expect(two).toBeLessThan(one);
    expect(four).toBeLessThan(two);
    // Убывающая отдача: четверо не быстрее двоих вдвое.
    expect(one - two).toBeGreaterThan(two - four);
  });

  it('никогда не становится мгновенным', () => {
    expect(reviveDuration(2.4, 12)).toBeGreaterThan(0.4);
  });
});

describe('окна и объёмы задач', () => {
  it('даёт малому составу более длинное окно удержания', () => {
    expect(holdDuration(1, 1)).toBeGreaterThan(holdDuration(6, 3));
  });

  it('уменьшает число узлов ремонта для малого состава', () => {
    expect(repairNodeCount(1, 3)).toBeLessThanOrEqual(2);
    expect(repairNodeCount(2, 3)).toBeLessThanOrEqual(2);
    expect(repairNodeCount(8, 3)).toBe(3);
  });

  it('никогда не оставляет ноль узлов', () => {
    for (let n = 1; n <= ROOM.hardMaxPlayers; n++) {
      expect(repairNodeCount(n, 3)).toBeGreaterThanOrEqual(1);
    }
  });

  it('даёт соло запас по времени и убирает его у группы', () => {
    expect(objectiveTimeScale(1)).toBeGreaterThan(1);
    expect(objectiveTimeScale(8)).toBe(1);
  });
});

describe('совместный перенос', () => {
  const table = [0.34, 0.62, 0.84, 1];

  it('оставляет соло-путь для тяжёлого груза', () => {
    const solo = carrySpeedFactor(2, 1, table);
    expect(solo).toBeGreaterThan(0);
    expect(solo).toBeLessThan(1);
  });

  it('делает совместный перенос ощутимо быстрее', () => {
    expect(carrySpeedFactor(2, 2, table)).toBeGreaterThan(carrySpeedFactor(2, 1, table));
  });

  it('не даёт бонуса сверх полной скорости', () => {
    expect(carrySpeedFactor(1, 4, table)).toBe(1);
  });
});

describe('набор составов для валидации', () => {
  it('покрывает соло, малую группу, среднюю, восьмёрку и лимит', () => {
    expect(VALIDATION_PARTY_SIZES).toContain(1);
    expect(VALIDATION_PARTY_SIZES).toContain(2);
    expect(VALIDATION_PARTY_SIZES).toContain(8);
    expect(VALIDATION_PARTY_SIZES).toContain(ROOM.hardMaxPlayers);
  });
});
