/**
 * Синхронизируемое состояние комнаты.
 *
 * Используется `defineTypes` вместо декораторов: так схема не зависит от того,
 * какой транспайлер и какой режим декораторов собирает сервер.
 *
 * Синхронизируется только то, за что отвечает сервер (GDD §16.1). Декоративная
 * физика, частицы и звук на сервере не существуют вовсе.
 */

import { ArraySchema, MapSchema, Schema, defineTypes } from '@colyseus/schema';

export class PlayerState extends Schema {
  sessionId = '';
  name = '';
  colorIndex = 0;
  badgeIndex = 0;

  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  facing = 1;
  /** PlayerState из общего пакета, числом. */
  state = 0;
  grounded = false;
  sliding = false;
  inWater = false;
  /** Половина высоты хитбокса: в подкате персонаж ниже. */
  halfHeight = 21;

  /** id переносимого предмета либо 0. */
  carrying = 0;
  reviveProgress = 0;
  downTimer = 0;
  invulnerable = 0;

  /** Последний обработанный сервером номер ввода — основа reconciliation. */
  lastSeq = 0;

  connected = true;
  ready = false;
  latency = 0;

  revives = 0;
  itemsCarried = 0;
  throws = 0;
  hazardHits = 0;
  falls = 0;
}

defineTypes(PlayerState, {
  sessionId: 'string',
  name: 'string',
  colorIndex: 'uint8',
  badgeIndex: 'uint8',
  x: 'float32',
  y: 'float32',
  vx: 'float32',
  vy: 'float32',
  facing: 'int8',
  state: 'uint8',
  grounded: 'boolean',
  sliding: 'boolean',
  inWater: 'boolean',
  halfHeight: 'uint8',
  carrying: 'uint16',
  reviveProgress: 'float32',
  downTimer: 'float32',
  invulnerable: 'float32',
  lastSeq: 'uint32',
  connected: 'boolean',
  ready: 'boolean',
  latency: 'uint16',
  revives: 'uint16',
  itemsCarried: 'uint16',
  throws: 'uint16',
  hazardHits: 'uint16',
  falls: 'uint16',
});

export class ItemState extends Schema {
  id = 0;
  defId = '';
  kind = '';
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  angle = 0;
  /** Идентификаторы носильщиков через запятую. */
  holders = '';
  heat = 0;
  damage = 0;
  charge = 1;
  onCart = false;
}

defineTypes(ItemState, {
  id: 'uint16',
  defId: 'string',
  kind: 'string',
  x: 'float32',
  y: 'float32',
  vx: 'float32',
  vy: 'float32',
  angle: 'float32',
  holders: 'string',
  heat: 'float32',
  damage: 'float32',
  charge: 'float32',
  onCart: 'boolean',
});

export class DeviceState extends Schema {
  id = '';
  kind = '';
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  progress = 0;
  active = false;
  /** HazardPhase числом: 0 idle, 1 warn, 2 active, 3 recover. */
  phase = 0;
  actors = 0;
}

defineTypes(DeviceState, {
  id: 'string',
  kind: 'string',
  x: 'float32',
  y: 'float32',
  w: 'float32',
  h: 'float32',
  progress: 'float32',
  active: 'boolean',
  phase: 'uint8',
  actors: 'uint8',
});

export class CartState extends Schema {
  id = '';
  x = 0;
  y = 0;
  vx = 0;
}

defineTypes(CartState, { id: 'string', x: 'float32', y: 'float32', vx: 'float32' });

export class PingState extends Schema {
  id = 0;
  playerId = '';
  type = 'here';
  x = 0;
  y = 0;
}

defineTypes(PingState, { id: 'uint16', playerId: 'string', type: 'string', x: 'float32', y: 'float32' });

export class ObjectiveState extends Schema {
  id = '';
  label = '';
  progress = 0;
  done = false;
  kind = '';
}

defineTypes(ObjectiveState, {
  id: 'string',
  label: 'string',
  progress: 'float32',
  done: 'boolean',
  kind: 'string',
});

export class GameState extends Schema {
  tick = 0;
  /** Серверное время комнаты — база для фаз опасностей у клиента. */
  elapsed = 0;

  roomId = '';
  roomIndex = 0;
  roomTotal = 0;
  roomTitle = '';
  roomBrief = '';

  phase = 0;
  catastropheGauge = 0;
  timeLeft = 0;
  failReason = '';

  activePlayers = 1;
  requiredActivators = 1;
  activeActivators = 0;
  intensity = 1;

  seed = 0;
  maxPlayers = 8;
  friendlyInterference = true;
  assist = false;
  roomCode = '';
  shiftId = '';
  modifiers = '';

  players = new MapSchema<PlayerState>();
  items = new MapSchema<ItemState>();
  devices = new MapSchema<DeviceState>();
  carts = new MapSchema<CartState>();
  objectives = new ArraySchema<ObjectiveState>();
  pings = new ArraySchema<PingState>();
}

defineTypes(GameState, {
  tick: 'uint32',
  elapsed: 'float32',
  roomId: 'string',
  roomIndex: 'uint8',
  roomTotal: 'uint8',
  roomTitle: 'string',
  roomBrief: 'string',
  phase: 'uint8',
  catastropheGauge: 'float32',
  timeLeft: 'float32',
  failReason: 'string',
  activePlayers: 'uint8',
  requiredActivators: 'uint8',
  activeActivators: 'uint8',
  intensity: 'float32',
  seed: 'uint32',
  maxPlayers: 'uint8',
  friendlyInterference: 'boolean',
  assist: 'boolean',
  roomCode: 'string',
  shiftId: 'string',
  modifiers: 'string',
  players: { map: PlayerState },
  items: { map: ItemState },
  devices: { map: DeviceState },
  carts: { map: CartState },
  objectives: [ObjectiveState],
  pings: [PingState],
});
