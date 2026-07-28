/**
 * Зеркало синхронизируемого состояния.
 *
 * Классы @colyseus/schema объявлены на сервере, а клиент получает описание по
 * рефлексии. Эти интерфейсы нужны только для типизации клиента: они описывают
 * то, что реально приходит в `room.state`.
 */

import type { RoomPhase } from '../sim/types.js';

export interface PlayerStateView {
  sessionId: string;
  name: string;
  colorIndex: number;
  badgeIndex: number;

  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  /** PlayerState в виде числа. */
  state: number;
  grounded: boolean;
  sliding: boolean;
  inWater: boolean;
  /** Половина высоты хитбокса: в подкате персонаж ниже. */
  halfHeight: number;

  /** id переносимого предмета либо 0. */
  carrying: number;
  /** Прогресс подъёма товарищами, 0..1. */
  reviveProgress: number;
  /** Остаток «выведен», секунды — для индикатора над головой. */
  downTimer: number;
  invulnerable: number;

  /** Последний обработанный сервером номер ввода — основа для reconciliation. */
  lastSeq: number;

  connected: boolean;
  ready: boolean;
  /** Задержка в миллисекундах для индикатора качества связи. */
  latency: number;

  revives: number;
  itemsCarried: number;
  throws: number;
  hazardHits: number;
  falls: number;
}

export interface ItemStateView {
  id: number;
  defId: string;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  /** Идентификаторы носильщиков через запятую (обычно один). */
  holders: string;
  heat: number;
  damage: number;
  charge: number;
  onCart: boolean;
}

export interface DeviceStateView {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  progress: number;
  active: boolean;
  /** HazardPhase числом: 0 idle, 1 warn, 2 active, 3 recover. */
  phase: number;
  actors: number;
}

export interface CartStateView {
  id: string;
  x: number;
  y: number;
  vx: number;
}

export interface PingStateView {
  id: number;
  playerId: string;
  type: string;
  x: number;
  y: number;
}

export interface ObjectiveStateView {
  id: string;
  label: string;
  progress: number;
  done: boolean;
  kind: string;
}

export interface GameStateView {
  tick: number;
  /** Серверное время комнаты в секундах — база для фаз опасностей. */
  elapsed: number;
  roomId: string;
  roomIndex: number;
  roomTotal: number;
  roomTitle: string;
  roomBrief: string;
  phase: RoomPhase;
  catastropheGauge: number;
  timeLeft: number;
  failReason: string;

  /** Активный состав и производные от него значения (GDD §6.3). */
  activePlayers: number;
  requiredActivators: number;
  activeActivators: number;
  intensity: number;

  seed: number;
  maxPlayers: number;
  friendlyInterference: boolean;
  assist: boolean;
  roomCode: string;
  /** Список включённых директором хаоса вариаций через запятую. */
  modifiers: string;

  players: Map<string, PlayerStateView>;
  items: Map<string, ItemStateView>;
  devices: Map<string, DeviceStateView>;
  carts: Map<string, CartStateView>;
  objectives: ObjectiveStateView[];
  pings: PingStateView[];
}
