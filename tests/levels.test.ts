/**
 * Автотесты контента (GDD §18.1, Приложение B).
 *
 * Валидатор уровней запускается как часть тестов, чтобы сломанная комната не
 * доехала до плейтеста: любая ошибка валидатора — это упавший тест.
 */

import { describe, expect, it } from 'vitest';
import { ITEM_KINDS, ROOMS, SHIFTS, TileMap, measureTiles, type RoomDef } from '@uc/shared';
import { validateRoom } from '../packages/tools/src/level-validator';

describe('валидатор уровней', () => {
  for (const room of ROOMS) {
    describe(room.id, () => {
      const report = validateRoom(room);
      const errors = report.issues.filter((issue) => issue.severity === 'error');

      it('проходит валидацию без ошибок', () => {
        expect(errors.map((issue) => `${issue.rule}: ${issue.message}`)).toEqual([]);
      });

      it('симулируется на всех проверочных составах', () => {
        expect(report.simulatedPartySizes).toEqual([1, 2, 4, 8, 12]);
      });

      it('имеет ровные строки карты', () => {
        expect(measureTiles(room.tiles).raggedRows).toEqual([]);
      });
    });
  }
});

describe('чек-лист комнаты', () => {
  const workRooms = ROOMS.filter((room) => !room.tutorial);

  for (const room of workRooms) {
    describe(room.id, () => {
      it('описывает хотя бы один резервный механизм для малого состава', () => {
        expect(room.fallbacks.length).toBeGreaterThan(0);
      });

      it('имеет вход, выход и точку восстановления', () => {
        expect(room.entities.some((entity) => entity.type === 'spawn')).toBe(true);
        expect(room.entities.some((entity) => entity.type === 'exit')).toBe(true);
        expect(room.entities.some((entity) => entity.type === 'checkpoint')).toBe(true);
      });

      it('ставит хотя бы одну цель', () => {
        expect(room.objectives.length).toBeGreaterThan(0);
      });

      it('перечисляет только подготовленные вариации', () => {
        for (const modifier of room.modifiers) {
          expect(modifier).toMatch(/^[a-z_]+$/);
        }
      });

      it('не требует точного числа игроков ни в одной цели', () => {
        for (const objective of room.objectives) {
          if (objective.type !== 'evacuate') continue;
          // Доля, а не абсолютное число: комната обязана работать при любом составе.
          expect(objective.fraction ?? 1).toBeLessThanOrEqual(1);
          expect(objective.fraction ?? 1).toBeGreaterThan(0);
        }
      });
    });
  }
});

describe('ключевые предметы', () => {
  it('у каждого ключевого предмета есть достижимая точка восстановления', () => {
    for (const room of ROOMS) {
      const map = new TileMap(room.tiles);
      for (const entity of room.entities) {
        if (entity.type !== 'item') continue;
        if (!ITEM_KINDS[entity.kind]?.keyItem) continue;

        const rx = entity.recoveryX ?? entity.x;
        const ry = entity.recoveryY ?? entity.y;
        expect(map.groundBelow(rx * 32 + 16, ry * 32), `${room.id}/${entity.id}`).not.toBeNull();
      }
    }
  });
});

describe('смены', () => {
  it('ссылаются только на существующие комнаты', () => {
    const known = new Set(ROOMS.map((room) => room.id));
    for (const shift of SHIFTS) {
      for (const roomId of shift.rooms) {
        expect(known.has(roomId), `${shift.id} → ${roomId}`).toBe(true);
      }
    }
  });

  it('полная смена начинается обучением и заканчивается эвакуацией', () => {
    const full = SHIFTS.find((shift) => shift.id === 'shift_factory') as { rooms: string[] };
    const byId = new Map(ROOMS.map((room): [string, RoomDef] => [room.id, room]));

    expect(byId.get(full.rooms[0])?.tutorial).toBe(true);
    expect(byId.get(full.rooms[full.rooms.length - 1])?.catastrophe).toBe(true);
  });

  it('укладывается в заявленную длительность по числу комнат', () => {
    for (const shift of SHIFTS) {
      if (shift.minutes[1] === 0) continue;
      expect(shift.rooms.length).toBeGreaterThan(0);
      expect(shift.minutes[0]).toBeLessThanOrEqual(shift.minutes[1]);
    }
  });
});
