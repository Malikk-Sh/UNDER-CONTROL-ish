/** Типы, общие для симуляции, протокола и контента. */

import type { AABB } from './geometry.js';

export const enum PlayerState {
  /** Полное управление. */
  Active = 0,
  /** Короткая потеря контроля, 0,5–1,2 с (GDD §12). */
  Stunned = 1,
  /** Лежит и может быть спасён товарищем. */
  Downed = 2,
  /** Наблюдение после редкого полного провала. */
  Spectating = 3,
}

export const enum RoomPhase {
  /** Безопасная зона перед стартом: подключение и осмотр. */
  Briefing = 0,
  /** Основная работа. */
  Active = 1,
  /** Финальная авария: шкала растёт, включены сирены. */
  Catastrophe = 2,
  /** Комната пройдена, идёт переход. */
  Cleared = 3,
  /** Провал, идёт перезапуск с чекпоинта. */
  Failed = 4,
}

/** Кнопки, упакованные в битовую маску: клиент шлёт удержание, не нажатие. */
export const enum Button {
  Jump = 1 << 0,
  Interact = 1 << 1,
  Throw = 1 << 2,
  Crouch = 1 << 3,
  Ping = 1 << 4,
}

/** Один кадр ввода. Сервер проверяет и применяет его, клиент — предсказывает. */
export interface InputFrame {
  /** Монотонный номер, по нему идёт сверка предсказания (GDD §0.5). */
  seq: number;
  /** Горизонтальная ось, −1..1. */
  axis: number;
  /** Битовая маска удерживаемых кнопок. */
  buttons: number;
  /** Направление броска, квантованное в байт. */
  aim: number;
}

export function makeInput(seq = 0): InputFrame {
  return { seq, axis: 0, buttons: 0, aim: 0 };
}

export function isDown(frame: InputFrame, button: Button): boolean {
  return (frame.buttons & button) !== 0;
}

export function wasPressed(current: InputFrame, previous: InputFrame, button: Button): boolean {
  return (current.buttons & button) !== 0 && (previous.buttons & button) === 0;
}

export function wasReleased(current: InputFrame, previous: InputFrame, button: Button): boolean {
  return (current.buttons & button) === 0 && (previous.buttons & button) !== 0;
}

/** Типы пингов — «позвать помощь» или «указать объект» (GDD §5.1). */
export const PING_TYPES = ['help', 'here', 'danger', 'ready'] as const;
export type PingType = (typeof PING_TYPES)[number];

export interface PingMarker {
  id: number;
  playerId: string;
  type: PingType;
  x: number;
  y: number;
  /** Тик, на котором пинг исчезнет. */
  expiresAtTick: number;
}

/** Свойства предметов из GDD §7.1. */
export interface ItemKindDef {
  kind: string;
  label: string;
  width: number;
  height: number;
  mass: number;
  /** Сколько рук нужно для полной скорости переноски. Соло-путь всегда есть. */
  requiredStrength: number;
  fragile: boolean;
  conductive: boolean;
  flammable: boolean;
  /** Греется в руках и требует станций охлаждения. */
  heats: boolean;
  /** Металл — притягивается магнитом. */
  magnetic: boolean;
  /** Инструмент, у которого есть активное применение. */
  tool: boolean;
  /** Ключевой предмет цели: гарантированно восстанавливается (GDD §0.1). */
  keyItem: boolean;
}

export const ITEM_KINDS: Record<string, ItemKindDef> = {
  crate: {
    kind: 'crate', label: 'Ящик', width: 30, height: 30, mass: 1, requiredStrength: 1,
    fragile: false, conductive: false, flammable: true, heats: false, magnetic: false,
    tool: false, keyItem: false,
  },
  battery: {
    kind: 'battery', label: 'Батарея', width: 34, height: 40, mass: 3, requiredStrength: 2,
    fragile: false, conductive: true, flammable: false, heats: false, magnetic: true,
    tool: false, keyItem: true,
  },
  cell: {
    kind: 'cell', label: 'Реакторный элемент', width: 32, height: 44, mass: 4, requiredStrength: 2,
    fragile: false, conductive: true, flammable: false, heats: true, magnetic: true,
    tool: false, keyItem: true,
  },
  parcel: {
    kind: 'parcel', label: 'Посылка «не трясти»', width: 38, height: 34, mass: 2, requiredStrength: 1,
    fragile: true, conductive: false, flammable: true, heats: false, magnetic: false,
    tool: false, keyItem: true,
  },
  fuse: {
    kind: 'fuse', label: 'Предохранитель', width: 20, height: 26, mass: 0.6, requiredStrength: 1,
    fragile: false, conductive: true, flammable: false, heats: false, magnetic: true,
    tool: false, keyItem: true,
  },
  extinguisher: {
    kind: 'extinguisher', label: 'Огнетушитель', width: 22, height: 34, mass: 1.2, requiredStrength: 1,
    fragile: false, conductive: false, flammable: false, heats: false, magnetic: true,
    tool: true, keyItem: false,
  },
  wrench: {
    kind: 'wrench', label: 'Гаечный ключ', width: 30, height: 14, mass: 0.8, requiredStrength: 1,
    fragile: false, conductive: true, flammable: false, heats: false, magnetic: true,
    tool: true, keyItem: false,
  },
  gloves: {
    kind: 'gloves', label: 'Изолирующие перчатки', width: 24, height: 20, mass: 0.3, requiredStrength: 1,
    fragile: false, conductive: false, flammable: false, heats: false, magnetic: false,
    tool: true, keyItem: false,
  },
  flare: {
    kind: 'flare', label: 'Сигнальная ракета', width: 16, height: 26, mass: 0.4, requiredStrength: 1,
    fragile: false, conductive: false, flammable: true, heats: false, magnetic: false,
    tool: true, keyItem: false,
  },
};

export type ItemKind = keyof typeof ITEM_KINDS;

/** Состояние одного предмета в симуляции. */
export interface ItemSim {
  id: number;
  /** Стабильный идентификатор из описания комнаты, для целей и восстановления. */
  defId: string;
  kind: string;
  body: AABB;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  grounded: boolean;
  /** Кто держит предмет. Пустой массив — предмет лежит свободно. */
  holders: string[];
  /** Нагрев 0..1: на единице предмет срабатывает аварийно. */
  heat: number;
  /** Накопленные повреждения 0..1 у хрупких предметов. */
  damage: number;
  /** Горит ли предмет. */
  burning: number;
  /** Точка гарантированного восстановления (GDD §0.1). */
  recoveryX: number;
  recoveryY: number;
  /** Отсчёт до восстановления, если предмет вне комнаты или в смертельной зоне. */
  recoveryTimer: number;
  /** Кулдаун повторного захвата, чтобы grab/throw не дребезжал. */
  grabCooldown: number;
  /** Предмет лежит на тележке и едет вместе с ней. */
  cartId: string | null;
  /** Заряд инструмента 0..1. */
  charge: number;
  /** Тик, когда предмет в последний раз менял владельца — для анти-дребезга. */
  lastOwnerChangeTick: number;
}

/** Событие симуляции для звука, VFX, обучения и аналитики (GDD §18.2). */
export type SimEvent =
  | { type: 'player_jumped'; playerId: string; x: number; y: number }
  | { type: 'player_landed'; playerId: string; x: number; y: number; speed: number }
  | { type: 'player_stunned'; playerId: string; x: number; y: number; cause: string }
  | { type: 'player_downed'; playerId: string; x: number; y: number; cause: string }
  | { type: 'player_revived'; playerId: string; byId: string; x: number; y: number }
  | { type: 'player_respawned'; playerId: string; x: number; y: number }
  | { type: 'item_grabbed'; itemId: number; playerId: string; kind: string; carriers: number }
  | { type: 'item_released'; itemId: number; playerId: string; kind: string }
  | { type: 'item_thrown'; itemId: number; playerId: string; kind: string; speed: number }
  | { type: 'item_impact'; itemId: number; kind: string; x: number; y: number; speed: number }
  | { type: 'item_damaged'; itemId: number; kind: string; damage: number; x: number; y: number }
  | { type: 'item_recovered'; itemId: number; kind: string; x: number; y: number }
  | { type: 'hazard_hit'; playerId: string; hazard: string; x: number; y: number }
  | { type: 'hazard_phase'; deviceId: string; hazard: string; phase: string; x: number; y: number }
  | { type: 'device_activated'; deviceId: string; kind: string; x: number; y: number }
  | { type: 'device_deactivated'; deviceId: string; kind: string; x: number; y: number }
  | { type: 'signal_changed'; signal: string; value: boolean }
  | { type: 'objective_step'; objectiveId: string; progress: number; done: boolean; label: string }
  | { type: 'objective_complete'; objectiveId: string; label: string }
  | { type: 'catastrophe_started'; roomId: string; seconds: number }
  | { type: 'room_cleared'; roomId: string; seconds: number }
  | { type: 'room_failed'; roomId: string; reason: string }
  | { type: 'ping_placed'; playerId: string; pingType: PingType; x: number; y: number }
  | { type: 'chaos_variation'; variation: string; reason: string };

export type SimEventType = SimEvent['type'];
