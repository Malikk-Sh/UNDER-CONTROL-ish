/**
 * Валидатор уровней (GDD §18.1).
 *
 * Проверяет вход, выход, чекпоинт и резервное решение; прогоняет составы
 * 1, 2, 4, 8 и лимит; сверяет число активаторов; проверяет восстановление
 * ключевых предметов; находит опасности без телеграфирования и сообщает о
 * заблокированных маршрутах.
 *
 * Валидатор не пытается «пройти» комнату ботом — вместо этого он проверяет
 * структурные инварианты, нарушение которых гарантированно ломает комнату, и
 * прогоняет реальную симуляцию, чтобы поймать падения и нестабильность.
 */

import {
  FIXED_DT,
  ITEM_KINDS,
  PLAYER,
  ROOM,
  Tile,
  TileMap,
  VALIDATION_PARTY_SIZES,
  World,
  activatorsAreSatisfiable,
  isSolidTile,
  makeInput,
  measureTiles,
  requiredActivators,
  type EntityDef,
  type InputFrame,
  type PlateDef,
  type RoomDef,
} from '@uc/shared';

export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  severity: Severity;
  roomId: string;
  /** Код правила — удобно грепать в CI. */
  rule: string;
  message: string;
}

export interface RoomReport {
  roomId: string;
  title: string;
  size: { cols: number; rows: number };
  issues: ValidationIssue[];
  /** Составы, на которых симуляция отработала без падений. */
  simulatedPartySizes: number[];
}

const TILE_SIZE = 32;

export function validateRoom(room: RoomDef): RoomReport {
  const issues: ValidationIssue[] = [];
  const error = (rule: string, message: string): void => {
    issues.push({ severity: 'error', roomId: room.id, rule, message });
  };
  const warn = (rule: string, message: string): void => {
    issues.push({ severity: 'warning', roomId: room.id, rule, message });
  };

  const geometry = measureTiles(room.tiles);
  if (geometry.raggedRows.length > 0) {
    error('tiles.ragged', `Строки карты разной длины: ${geometry.raggedRows.join(', ')}`);
  }

  const map = new TileMap(room.tiles);

  checkStructure(room, map, error, warn);
  checkEntityBounds(room, map, error);
  checkKeyItemRecovery(room, map, error, warn);
  checkActivatorScaling(room, error, warn);
  checkHazardTelegraphing(room, error);
  checkObjectives(room, map, error, warn);
  checkFallbacks(room, warn);

  const simulated = simulatePartySizes(room, error);

  return {
    roomId: room.id,
    title: room.title,
    size: { cols: map.cols, rows: map.rows },
    issues,
    simulatedPartySizes: simulated,
  };
}

// ------------------------------------------------------------------ проверки

function checkStructure(
  room: RoomDef,
  map: TileMap,
  error: (rule: string, message: string) => void,
  warn: (rule: string, message: string) => void,
): void {
  const spawns = room.entities.filter((entity) => entity.type === 'spawn');
  const exits = room.entities.filter((entity) => entity.type === 'exit');
  const checkpoints = room.entities.filter((entity) => entity.type === 'checkpoint');

  if (spawns.length === 0) error('structure.spawn', 'Нет ни одной точки входа');
  if (exits.length === 0) error('structure.exit', 'Нет обозначенного выхода');
  if (checkpoints.length === 0) error('structure.checkpoint', 'Нет точки восстановления');

  for (const spawn of spawns) {
    if (tileIsBlocked(map, spawn.x, spawn.y)) {
      error('structure.spawn_blocked', `Точка входа (${spawn.x}, ${spawn.y}) внутри стены`);
    }
    if (map.groundBelow(spawn.x * TILE_SIZE + TILE_SIZE / 2, spawn.y * TILE_SIZE) === null) {
      error('structure.spawn_void', `Под точкой входа (${spawn.x}, ${spawn.y}) нет пола`);
    }
  }

  for (const checkpoint of checkpoints) {
    if (checkpoint.type !== 'checkpoint') continue;
    if (tileIsBlocked(map, checkpoint.respawnX, checkpoint.respawnY)) {
      error(
        'structure.respawn_blocked',
        `Точка возврата чекпоинта ${checkpoint.id} внутри стены`,
      );
    }
  }

  // Комната должна помещаться в разумные пределы: иначе камера теряет игроков.
  if (map.cols < 20 || map.rows < 10) warn('structure.tiny', 'Комната подозрительно маленькая');
  if (map.cols > 200) warn('structure.huge', 'Комната шире 200 тайлов — камера будет неудобной');
}

function checkEntityBounds(
  room: RoomDef,
  map: TileMap,
  error: (rule: string, message: string) => void,
): void {
  const seen = new Set<string>();
  for (const entity of room.entities) {
    const box = entityBox(entity);
    if (box.x < 0 || box.y < 0 || box.x + box.w > map.cols || box.y + box.h > map.rows) {
      error(
        'entity.out_of_bounds',
        `${entity.type} ${entityId(entity)} выходит за карту: x=${box.x} y=${box.y} w=${box.w} h=${box.h}`,
      );
    }
    const id = entityId(entity);
    if (id) {
      if (seen.has(id)) error('entity.duplicate_id', `Идентификатор ${id} используется дважды`);
      seen.add(id);
    }
  }
}

function checkKeyItemRecovery(
  room: RoomDef,
  map: TileMap,
  error: (rule: string, message: string) => void,
  warn: (rule: string, message: string) => void,
): void {
  for (const entity of room.entities) {
    if (entity.type !== 'item') continue;
    const kind = ITEM_KINDS[entity.kind];
    if (!kind) {
      error('item.unknown_kind', `Неизвестный вид предмета: ${entity.kind}`);
      continue;
    }
    const rx = entity.recoveryX ?? entity.x;
    const ry = entity.recoveryY ?? entity.y;

    // GDD §0.1: ключевой предмет нельзя потерять безвозвратно.
    if (map.at(rx, ry) === Tile.Lethal) {
      error('item.recovery_lethal', `Точка восстановления ${entity.id} в смертельной зоне`);
    }
    if (isSolidTile(map.at(rx, ry))) {
      error('item.recovery_solid', `Точка восстановления ${entity.id} внутри стены`);
    }
    if (map.groundBelow(rx * TILE_SIZE + TILE_SIZE / 2, ry * TILE_SIZE) === null) {
      error('item.recovery_void', `Под точкой восстановления ${entity.id} нет пола`);
    }
    if (kind.keyItem && entity.recoveryX === undefined && entity.recoveryY === undefined) {
      warn(
        'item.recovery_implicit',
        `У ключевого предмета ${entity.id} не задана явная точка восстановления`,
      );
    }
  }
}

function checkActivatorScaling(
  room: RoomDef,
  error: (rule: string, message: string) => void,
  warn: (rule: string, message: string) => void,
): void {
  const groups = new Map<string, PlateDef[]>();
  for (const entity of room.entities) {
    if (entity.type !== 'plate') continue;
    const plate = entity as PlateDef;
    if (!plate.group) continue;
    const list = groups.get(plate.group) ?? [];
    list.push(plate);
    groups.set(plate.group, list);
  }

  for (const [group, plates] of groups) {
    const maxRequired = Math.max(...VALIDATION_PARTY_SIZES.map((size) => requiredActivators(size)));
    if (plates.length < maxRequired) {
      error(
        'scaling.not_enough_plates',
        `Группа "${group}": плит ${plates.length}, а максимум требуется ${maxRequired}`,
      );
    }
    // GDD §6.3: соло-путь обязателен, поэтому в группе нужен фиксатор
    // либо какое-то другое резервное решение.
    if (requiredActivators(1) > 0 && !plates.some((plate) => plate.latching)) {
      warn(
        'scaling.no_latch',
        `В группе "${group}" нет плиты-фиксатора — проверьте, что соло-путь существует`,
      );
    }
  }

  // Жёсткое ограничение: обязательных точек не больше числа игроков.
  for (const size of VALIDATION_PARTY_SIZES) {
    if (!activatorsAreSatisfiable(size)) {
      error(
        'scaling.impossible',
        `При составе ${size} требуется ${requiredActivators(size)} активаторов — больше, чем игроков`,
      );
    }
  }

  if (room.scaling.activatorGroup && !groups.has(room.scaling.activatorGroup)) {
    error(
      'scaling.missing_group',
      `scaling.activatorGroup="${room.scaling.activatorGroup}" не соответствует ни одной группе плит`,
    );
  }
}

function checkHazardTelegraphing(
  room: RoomDef,
  error: (rule: string, message: string) => void,
): void {
  for (const entity of room.entities) {
    // Пресс, магнит, струя и зона под напряжением проходят фазу предупреждения
    // в коде. Опасность без фазы предупреждения — ошибка дизайна (GDD §9.1).
    if (entity.type === 'live' && entity.pulsed !== true) {
      // Постоянно включённая зона допустима только если сигнал управляемый:
      // игрок должен иметь способ её выключить.
      const controllable = room.entities.some(
        (other) =>
          (other.type === 'lever' || other.type === 'valve' || other.type === 'plate') &&
          other.signal === entity.energizedWhen,
      );
      if (!controllable) {
        error(
          'hazard.no_telegraph',
          `Зона под напряжением ${entity.id} всегда активна и не управляется игроками`,
        );
      }
    }
    if (entity.type === 'press' && entity.travel <= 0) {
      error('hazard.press_travel', `У пресса ${entity.id} нулевой ход`);
    }
  }
}

function checkObjectives(
  room: RoomDef,
  map: TileMap,
  error: (rule: string, message: string) => void,
  warn: (rule: string, message: string) => void,
): void {
  if (room.objectives.length === 0) error('objective.empty', 'В комнате нет ни одной цели');

  const itemIds = new Set(
    room.entities.filter((entity) => entity.type === 'item').map((entity) => entity.id),
  );
  const signalSources = new Set<string>();
  for (const entity of room.entities) {
    if ('signal' in entity && typeof entity.signal === 'string') signalSources.add(entity.signal);
    if (entity.type === 'plate' && entity.group) signalSources.add(`${entity.group}.ready`);
  }
  for (const objective of room.objectives) signalSources.add(`${objective.id}.done`);

  for (const objective of room.objectives) {
    if ('zone' in objective) {
      const zone = objective.zone;
      if (zone.x < 0 || zone.y < 0 || zone.x + zone.w > map.cols || zone.y + zone.h > map.rows) {
        error('objective.zone_bounds', `Зона цели ${objective.id} выходит за карту`);
      }
    }
    if (objective.type === 'deliver' && !itemIds.has(objective.item)) {
      error('objective.missing_item', `Цель ${objective.id} ссылается на несуществующий предмет ${objective.item}`);
    }
    if (objective.type === 'signals') {
      for (const signal of objective.require) {
        if (!signalSources.has(signal)) {
          error('objective.missing_signal', `Цель ${objective.id} ждёт сигнал ${signal}, который никто не выставляет`);
        }
      }
      if (objective.require.length === 0) {
        error('objective.empty_signals', `Цель ${objective.id} не перечисляет ни одного сигнала`);
      }
    }
    if (objective.type === 'evacuate' && (objective.fraction ?? 1) > 1) {
      error('objective.fraction', `Доля игроков в цели ${objective.id} больше единицы`);
    }
  }

  // Сигналы, которые слушают двери, тоже должны кем-то выставляться.
  for (const entity of room.entities) {
    if (entity.type === 'door' && !signalSources.has(entity.openWhen)) {
      error('door.dangling_signal', `Дверь ${entity.id} слушает сигнал ${entity.openWhen}, который никто не выставляет`);
    }
    if (entity.type === 'lift' && !signalSources.has(entity.startWhen)) {
      error('lift.dangling_signal', `Лифт ${entity.id} слушает сигнал ${entity.startWhen}, который никто не выставляет`);
    }
    if (entity.type === 'hint' && entity.hideWhen && !signalSources.has(entity.hideWhen)) {
      warn('hint.dangling_signal', `Подсказка ${entity.id} скрывается по сигналу ${entity.hideWhen}, которого нет`);
    }
  }
}

function checkFallbacks(room: RoomDef, warn: (rule: string, message: string) => void): void {
  // Любая кооперативная механика должна иметь резервное решение (GDD §0.1).
  if (!room.tutorial && room.fallbacks.length === 0) {
    warn('fallback.missing', 'Не описан ни один резервный механизм для малого состава');
  }
}

/**
 * Прогон реальной симуляции на разных составах. Боты не решают задачу — они
 * бегают и жмут кнопки, чтобы поймать падения, зависания и «просачивание»
 * сквозь геометрию.
 */
function simulatePartySizes(room: RoomDef, error: (rule: string, message: string) => void): number[] {
  const sizes = [...VALIDATION_PARTY_SIZES];
  const passed: number[] = [];

  for (const size of sizes) {
    if (size > ROOM.hardMaxPlayers) continue;
    try {
      const world = new World(room, 12345 + size);
      const inputs = new Map<string, InputFrame>();
      for (let i = 0; i < size; i++) {
        const id = `bot_${i}`;
        world.addPlayer(id, { name: id, colorIndex: i, badgeIndex: i });
        inputs.set(id, makeInput(0));
      }

      const seconds = 20;
      for (let tick = 0; tick < seconds / FIXED_DT; tick++) {
        let index = 0;
        for (const [id, frame] of inputs) {
          // Простейший бот: ходит туда-сюда, периодически прыгает и жмёт E.
          const phase = (tick + index * 37) % 240;
          frame.seq = tick + 1;
          frame.axis = phase < 120 ? 1 : -1;
          frame.buttons = (phase % 45 === 0 ? 1 : 0) | (phase % 70 === 0 ? 2 : 0);
          inputs.set(id, frame);
          index++;
        }
        world.step(inputs);

        for (const player of world.players.values()) {
          if (!Number.isFinite(player.body.x) || !Number.isFinite(player.body.y)) {
            throw new Error(`Позиция игрока ${player.id} стала NaN на тике ${tick}`);
          }
          if (player.body.y > world.map.heightPx + 600) {
            throw new Error(`Игрок ${player.id} провалился сквозь карту на тике ${tick}`);
          }
        }
        for (const item of world.items.values()) {
          if (!Number.isFinite(item.body.x) || !Number.isFinite(item.body.y)) {
            throw new Error(`Предмет ${item.defId} получил NaN на тике ${tick}`);
          }
        }
      }

      // Ни один игрок не должен зависнуть без управления дольше пяти секунд.
      for (const player of world.players.values()) {
        if (player.downTimer > PLAYER.downedDuration + 0.1) {
          throw new Error(`Игрок ${player.id} лежит дольше допустимого`);
        }
      }
      passed.push(size);
    } catch (cause) {
      error('simulation.failed', `Состав ${size}: ${(cause as Error).message}`);
    }
  }
  return passed;
}

// ----------------------------------------------------------------- утилиты

function entityBox(entity: EntityDef): { x: number; y: number; w: number; h: number } {
  const anyEntity = entity as unknown as { x: number; y: number; w?: number; h?: number; travel?: number };
  return {
    x: anyEntity.x,
    y: anyEntity.y,
    w: anyEntity.w ?? 1,
    h: anyEntity.h ?? 1,
  };
}

function entityId(entity: EntityDef): string {
  return (entity as { id?: string }).id ?? '';
}

function tileIsBlocked(map: TileMap, col: number, row: number): boolean {
  return isSolidTile(map.at(col, row));
}

export function validateRooms(rooms: readonly RoomDef[]): RoomReport[] {
  return rooms.map((room) => validateRoom(room));
}

export function countBySeverity(reports: readonly RoomReport[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const report of reports) {
    for (const issue of report.issues) {
      if (issue.severity === 'error') errors++;
      else warnings++;
    }
  }
  return { errors, warnings };
}
