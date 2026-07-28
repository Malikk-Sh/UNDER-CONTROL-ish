/**
 * Автотесты авторитетной симуляции (GDD §20.1).
 *
 * Здесь проверяются инварианты, которые прямо перечислены в жёстких
 * ограничениях: невозможность безвозвратно потерять ключевой предмет,
 * отсутствие дублирования предметов при одновременном захвате, корректный
 * пересчёт состава и быстрый возврат игрока в игру.
 */

import { describe, expect, it } from 'vitest';
import {
  Button,
  FIXED_DT,
  PLAYER,
  PlayerState,
  RoomPhase,
  World,
  getRoom,
  makeInput,
  requiredActivators,
  type InputFrame,
  type RoomDef,
} from '@uc/shared';

function makeWorld(roomId = 'factory_hot_delivery', players = 1): { world: World; ids: string[] } {
  const world = new World(getRoom(roomId), 4242);
  const ids: string[] = [];
  for (let i = 0; i < players; i++) {
    const id = `p${i}`;
    world.addPlayer(id, { name: id, colorIndex: i, badgeIndex: i });
    ids.push(id);
  }
  return { world, ids };
}

function idle(ids: readonly string[]): Map<string, InputFrame> {
  const inputs = new Map<string, InputFrame>();
  for (const id of ids) inputs.set(id, makeInput(0));
  return inputs;
}

function advance(world: World, ids: readonly string[], seconds: number, patch?: (id: string, tick: number) => Partial<InputFrame>): void {
  const inputs = idle(ids);
  const steps = Math.ceil(seconds / FIXED_DT);
  for (let tick = 0; tick < steps; tick++) {
    for (const id of ids) {
      const frame = inputs.get(id)!;
      const values = patch?.(id, tick) ?? {};
      frame.seq = tick + 1;
      frame.axis = values.axis ?? 0;
      frame.buttons = values.buttons ?? 0;
      frame.aim = values.aim ?? 0;
    }
    world.step(inputs);
  }
}

describe('жизненный цикл комнаты', () => {
  it('стартует в брифинге и переходит в активную фазу от первого действия', () => {
    const { world, ids } = makeWorld();
    expect(world.phase).toBe(RoomPhase.Briefing);
    advance(world, ids, 2, () => ({ axis: 1 }));
    expect(world.phase).toBe(RoomPhase.Active);
  });

  it('обучающая комната не может провалиться', () => {
    const { world, ids } = makeWorld('factory_airlock');
    advance(world, ids, 8, () => ({ axis: 1 }));
    expect(world.phase).not.toBe(RoomPhase.Failed);
  });

  it('финальная комната сразу включает шкалу катастрофы', () => {
    const { world, ids } = makeWorld('factory_overload');
    advance(world, ids, 3, () => ({ axis: 1 }));
    expect(world.phase).toBe(RoomPhase.Catastrophe);
    expect(world.catastropheGauge).toBeGreaterThan(0);
  });

  it('даёт малому составу больше времени до катастрофы', () => {
    const solo = makeWorld('factory_overload', 1);
    const crew = makeWorld('factory_overload', 8);
    advance(solo.world, solo.ids, 6, () => ({ axis: 1 }));
    advance(crew.world, crew.ids, 6, () => ({ axis: 1 }));
    expect(solo.world.catastropheGauge).toBeLessThan(crew.world.catastropheGauge);
  });
});

describe('пересчёт состава', () => {
  it('обновляет число требуемых активаторов при входе и выходе', () => {
    const { world } = makeWorld('factory_hot_delivery', 0);
    for (let i = 0; i < 6; i++) {
      world.addPlayer(`p${i}`, { name: `p${i}`, colorIndex: i, badgeIndex: i });
      expect(world.requiredActivatorCount).toBe(requiredActivators(i + 1));
    }
    world.removePlayer('p5');
    world.removePlayer('p4');
    world.removePlayer('p3');
    expect(world.requiredActivatorCount).toBe(requiredActivators(3));
  });

  it('никогда не требует больше активаторов, чем игроков в комнате', () => {
    const { world } = makeWorld('factory_hot_delivery', 0);
    for (let i = 0; i < 12; i++) {
      world.addPlayer(`p${i}`, { name: `p${i}`, colorIndex: i, badgeIndex: i });
      expect(world.requiredActivatorCount).toBeLessThanOrEqual(world.activeCount);
    }
  });

  it('роняет переносимый предмет при отключении игрока', () => {
    const { world, ids } = makeWorld('factory_hot_delivery', 1);
    const player = world.players.get(ids[0])!;
    const item = [...world.items.values()].find((entry) => entry.defId === 'cell_1')!;

    player.body.x = item.body.x;
    player.body.y = item.body.y;
    advance(world, ids, 0.4, () => ({ buttons: Button.Interact }));
    expect(item.holders.length).toBeGreaterThan(0);
    expect(player.carrying).toBe(item.id);

    world.removePlayer(ids[0]);
    expect(item.holders.length).toBe(0);
  });
});

describe('ключевые предметы', () => {
  it('нельзя потерять: предмет за границами комнаты возвращается', () => {
    const { world, ids } = makeWorld('factory_hot_delivery', 1);
    const item = [...world.items.values()].find((entry) => entry.defId === 'cell_1')!;

    item.body.x = -600;
    item.body.y = world.map.heightPx + 900;
    advance(world, ids, 3);

    expect(item.body.x).toBeGreaterThan(0);
    expect(item.body.x).toBeLessThan(world.map.widthPx);
    expect(item.body.y).toBeLessThan(world.map.heightPx);
  });

  it('нельзя уничтожить: повреждения после восстановления частично снимаются', () => {
    const { world, ids } = makeWorld('factory_fragile_parcel', 1);
    const parcel = [...world.items.values()].find((entry) => entry.defId === 'parcel_1')!;

    parcel.damage = 1;
    parcel.body.y = world.map.heightPx + 900;
    advance(world, ids, 3);

    expect(parcel.damage).toBeLessThan(1);
  });

  it('одновременный захват не дублирует предмет', () => {
    const { world, ids } = makeWorld('factory_hot_delivery', 4);
    const item = [...world.items.values()].find((entry) => entry.defId === 'cell_1')!;

    for (const id of ids) {
      const player = world.players.get(id)!;
      player.body.x = item.body.x;
      player.body.y = item.body.y;
    }
    advance(world, ids, 0.5, () => ({ buttons: Button.Interact }));

    // Носильщиков может быть несколько — это совместный перенос, — но каждый
    // игрок держит не больше одного предмета, а предмет остаётся один.
    const carriers = ids.filter((id) => world.players.get(id)!.carrying === item.id);
    expect(item.holders.length).toBe(carriers.length);
    expect(new Set(item.holders).size).toBe(item.holders.length);
    expect([...world.items.values()].filter((entry) => entry.defId === 'cell_1')).toHaveLength(1);
  });

  it('носильщик, отошедший слишком далеко, отпускает груз сам', () => {
    const { world, ids } = makeWorld('factory_hot_delivery', 1);
    const player = world.players.get(ids[0])!;
    const item = [...world.items.values()].find((entry) => entry.defId === 'cell_1')!;

    player.body.x = item.body.x;
    player.body.y = item.body.y;
    advance(world, ids, 0.4, () => ({ buttons: Button.Interact }));
    expect(player.carrying).toBe(item.id);

    player.body.x += PLAYER.carryLeash * 3;
    advance(world, ids, 0.2, () => ({ buttons: Button.Interact }));
    expect(player.carrying).toBeNull();
  });
});

describe('возврат в игру', () => {
  it('выведенный игрок сам возвращается не дольше чем за пять секунд', () => {
    const { world, ids } = makeWorld('factory_hot_delivery', 1);
    const player = world.players.get(ids[0])!;

    // Появление даёт короткую неуязвимость — снимаем её, иначе не «уроним».
    player.invulnerable = 0;
    world.downPlayer(player, 'test');
    expect(player.state).toBe(PlayerState.Downed);

    advance(world, ids, PLAYER.downedDuration + 0.5);
    expect(player.state).toBe(PlayerState.Active);
  });

  it('товарищ поднимает быстрее, чем истекает таймер', () => {
    const { world, ids } = makeWorld('factory_hot_delivery', 2);
    const victim = world.players.get(ids[0])!;
    const rescuer = world.players.get(ids[1])!;

    victim.invulnerable = 0;
    world.downPlayer(victim, 'test');
    // Спасатель встаёт слева: цель обязана попасть в конус перед персонажем,
    // а по умолчанию персонаж смотрит вправо (GDD §5.3).
    rescuer.body.x = victim.body.x - 20;
    rescuer.body.y = victim.body.y;

    advance(world, ids, PLAYER.reviveBaseTime + 0.4, (id) =>
      id === ids[1] ? { buttons: Button.Interact } : {},
    );

    expect(victim.state).toBe(PlayerState.Active);
  });

  it('игрок в кислоте выводится, но не исчезает навсегда', () => {
    const { world, ids } = makeWorld('factory_hot_delivery', 1);
    const player = world.players.get(ids[0])!;

    player.invulnerable = 0;
    // Кислотный провал в этой комнате начинается с 25-й колонки. Первую
    // секунду его ещё перекрывает убирающийся мост, поэтому ждём дольше.
    player.body.x = 26 * 32;
    player.body.y = 15 * 32;
    advance(world, ids, 1.5, () => ({}));
    expect(player.state).toBe(PlayerState.Downed);

    advance(world, ids, PLAYER.downedDuration + 0.5);
    expect(player.state).toBe(PlayerState.Active);
  });
});

describe('масштабирование узлов ремонта', () => {
  it('малому составу достаётся меньше узлов', () => {
    const solo = new World(getRoom('factory_wrong_switch'), 1);
    solo.addPlayer('p0', { name: 'p0', colorIndex: 0, badgeIndex: 0 });
    advance(solo, ['p0'], 1, () => ({ axis: 1 }));

    const nodesSolo = [...solo.devices.values()].filter((device) => device.kind === 'node');
    const preRepaired = nodesSolo.filter((device) => device.progress >= 1).length;
    expect(preRepaired).toBeGreaterThanOrEqual(1);
  });

  it('крупному составу достаются все узлы', () => {
    const crew = new World(getRoom('factory_wrong_switch'), 1);
    for (let i = 0; i < 8; i++) crew.addPlayer(`p${i}`, { name: `p${i}`, colorIndex: i, badgeIndex: i });
    const ids = [...crew.players.keys()];
    advance(crew, ids, 1, () => ({ axis: 1 }));

    const nodes = [...crew.devices.values()].filter((device) => device.kind === 'node');
    expect(nodes.filter((device) => device.progress >= 1).length).toBe(0);
  });
});

describe('устойчивость симуляции', () => {
  const rooms: RoomDef['id'][] = [
    'factory_airlock',
    'factory_hot_delivery',
    'factory_wrong_switch',
    'factory_fragile_parcel',
    'factory_overload',
  ];

  for (const roomId of rooms) {
    it(`${roomId}: 30 секунд хаотичного ввода не ломают состояние`, () => {
      const { world, ids } = makeWorld(roomId, 6);
      advance(world, ids, 30, (id, tick) => ({
        axis: ((tick + id.charCodeAt(1) * 13) % 120) < 60 ? 1 : -1,
        buttons: (tick % 21 === 0 ? Button.Jump : 0) | (tick % 33 === 0 ? Button.Interact : 0) | (tick % 47 === 0 ? Button.Throw : 0),
      }));

      for (const player of world.players.values()) {
        expect(Number.isFinite(player.body.x)).toBe(true);
        expect(Number.isFinite(player.body.y)).toBe(true);
        expect(player.body.y).toBeLessThan(world.map.heightPx + 400);
      }
      for (const item of world.items.values()) {
        expect(Number.isFinite(item.body.x)).toBe(true);
        expect(Number.isFinite(item.body.y)).toBe(true);
      }
    });
  }
});
