/**
 * Схема описания комнаты.
 *
 * Контент комнаты описывается данными и проходит автоматический валидатор
 * (GDD §0.5, §18). Геометрия задаётся ASCII-сеткой, всё остальное — списком
 * сущностей с координатами в тайлах.
 */

import type { ItemKind, PingType } from '../sim/types.js';

export type Biome = 'factory' | 'flooded_lab' | 'air_terminal' | 'thermal_plant';

export interface TileRect {
  /** Координаты в тайлах, левый верхний угол. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpawnDef {
  type: 'spawn';
  x: number;
  y: number;
}

export interface CheckpointDef {
  type: 'checkpoint';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Точка появления после гибели. */
  respawnX: number;
  respawnY: number;
}

export interface ExitDef {
  type: 'exit';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ItemDef {
  type: 'item';
  id: string;
  kind: ItemKind;
  x: number;
  y: number;
  /** Точка гарантированного восстановления (GDD §0.1). По умолчанию — точка спавна. */
  recoveryX?: number;
  recoveryY?: number;
}

/** Нажимная плита: активна, пока на ней стоит игрок или лежит тяжёлый груз. */
export interface PlateDef {
  type: 'plate';
  id: string;
  x: number;
  y: number;
  w?: number;
  signal: string;
  /** Плита из группы: цель считает, сколько плит группы активно одновременно. */
  group?: string;
  /** Плита остаётся нажатой после отпускания (фиксатор — резерв для соло). */
  latching?: boolean;
}

export interface LeverDef {
  type: 'lever';
  id: string;
  x: number;
  y: number;
  signal: string;
  /** Рычаг возвращается сам через N секунд (иначе — переключатель). */
  autoResetSeconds?: number;
  startsOn?: boolean;
}

export interface ValveDef {
  type: 'valve';
  id: string;
  x: number;
  y: number;
  signal: string;
  /** Секунды удержания для полного открытия. */
  seconds?: number;
  /** Вентиль закрывается сам, если его бросить. */
  decays?: boolean;
}

/** Ремонтный узел: чинится инструментом, даёт сигнал (GDD §8 «Ремонт»). */
export interface RepairNodeDef {
  type: 'node';
  id: string;
  x: number;
  y: number;
  signal: string;
  seconds?: number;
  /** Требует конкретный предмет в руках (предохранитель, ключ). */
  requiresItem?: ItemKind;
  /**
   * Узел под напряжением, пока сигнал истинен: без изолирующих перчаток бьёт
   * током. Всегда есть второй путь — обесточить линию.
   */
  liveWhen?: string;
}

export interface DoorDef {
  type: 'door';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Дверь открыта, пока сигнал истинен. */
  openWhen: string;
  invert?: boolean;
  /** Дверь-шлюз, которая двигается вверх, а не исчезает. */
  slide?: 'up' | 'down' | 'side';
}

export interface ConveyorDef {
  type: 'conveyor';
  id: string;
  x: number;
  y: number;
  w: number;
  dir: 1 | -1;
  speed?: number;
  /** Лента работает только при истинном сигнале. */
  poweredBy?: string;
  /** Сигнал разворачивает ленту. */
  reverseWhen?: string;
}

/** Пресс: предупреждение → удар → удержание → подъём → окно (GDD §9.1). */
export interface PressDef {
  type: 'press';
  id: string;
  x: number;
  y: number;
  w: number;
  /** Ход в тайлах вниз. */
  travel: number;
  /** Смещение фазы, чтобы прессы работали вразнобой. */
  offset?: number;
  poweredBy?: string;
}

export interface MagnetDef {
  type: 'magnet';
  id: string;
  x: number;
  y: number;
  radius?: number;
  offset?: number;
  poweredBy?: string;
}

/** Станция охлаждения: снимает нагрев с горячего груза. */
export interface CoolerDef {
  type: 'cooler';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  poweredBy?: string;
}

/** Зона, которая становится смертельной при подаче питания (вода + ток). */
export interface LiveZoneDef {
  type: 'live';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Зона под напряжением, пока сигнал истинен. */
  energizedWhen: string;
  invert?: boolean;
  /** Импульсный режим: предупреждение → разряд → пауза. */
  pulsed?: boolean;
}

/** Тележка — резервный механизм для соло и малого состава (GDD §6.2). */
export interface CartDef {
  type: 'cart';
  id: string;
  x: number;
  y: number;
}

/** Эвакуационный лифт финала. */
export interface LiftDef {
  type: 'lift';
  id: string;
  x: number;
  y: number;
  w: number;
  /** Ход в тайлах вверх. */
  travel: number;
  startWhen: string;
}

/** Подсказка обучения — появляется, когда игрок входит в зону. */
export interface HintDef {
  type: 'hint';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  /** Скрыть подсказку после выполнения условия. */
  hideWhen?: string;
}

/** Опасность-помеха: пар, огонь, струя — оглушает, но не убивает. */
export interface JetDef {
  type: 'jet';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  dir: 'up' | 'down' | 'left' | 'right';
  offset?: number;
  poweredBy?: string;
}

export type EntityDef =
  | SpawnDef
  | CheckpointDef
  | ExitDef
  | ItemDef
  | PlateDef
  | LeverDef
  | ValveDef
  | RepairNodeDef
  | DoorDef
  | ConveyorDef
  | PressDef
  | MagnetDef
  | CoolerDef
  | LiveZoneDef
  | CartDef
  | LiftDef
  | HintDef
  | JetDef;

export type EntityType = EntityDef['type'];

/** Донести ключевой предмет в зону. */
export interface DeliverObjective {
  type: 'deliver';
  id: string;
  label: string;
  /** id предмета из описания комнаты. */
  item: string;
  zone: TileRect;
  /** Предмет должен приехать неповреждённым. */
  maxDamage?: number;
  /** Предмет должен приехать холодным. */
  maxHeat?: number;
}

/** Включить сеть сигналов: любой порядок допустим (GDD §8.1 «Не тот рубильник»). */
export interface SignalsObjective {
  type: 'signals';
  id: string;
  label: string;
  require: string[];
  /** Сигналы должны быть истинны одновременно. */
  simultaneous?: boolean;
}

/** Удерживать сигнал заданное время (проверка давления). */
export interface HoldObjective {
  type: 'hold';
  id: string;
  label: string;
  signal: string;
  seconds: number;
  /** Прогресс откатывается, если сигнал пропал. */
  decays?: boolean;
}

/** Собрать N предметов вида в зону. */
export interface CollectObjective {
  type: 'collect';
  id: string;
  label: string;
  kind: ItemKind;
  count: number;
  zone: TileRect;
}

/** Довести живых игроков до зоны эвакуации. */
export interface EvacuateObjective {
  type: 'evacuate';
  id: string;
  label: string;
  zone: TileRect;
  /** Достаточно доли живых игроков; по умолчанию — все. */
  fraction?: number;
}

export type ObjectiveDef =
  | DeliverObjective
  | SignalsObjective
  | HoldObjective
  | CollectObjective
  | EvacuateObjective;

export interface RoomScaling {
  /**
   * Сигналы-активаторы, число которых масштабируется под состав
   * (GDD §6.3). Из этого списка берутся первые `requiredActivators(N)`.
   */
  activatorGroup?: string;
  /** Максимум узлов ремонта у большого состава. */
  repairNodes?: number;
  /** Базовое время цели до применения `objectiveTimeScale`. */
  baseSeconds?: number;
}

export interface RoomDef {
  id: string;
  biome: Biome;
  title: string;
  /** Одна строка цели для верхнего центра экрана (GDD §14.1). */
  brief: string;
  /** Обучающая комната не считается в счёте и не может провалиться. */
  tutorial?: boolean;
  /** Финальная авария: включается шкала катастрофы и таймер. */
  catastrophe?: boolean;
  /** Секунды на комнату после запуска активной фазы. 0 — без таймера. */
  timeLimit?: number;
  tiles: string[];
  entities: EntityDef[];
  objectives: ObjectiveDef[];
  scaling: RoomScaling;
  /** Резервные механизмы для соло и малого состава (GDD §10.2). */
  fallbacks: string[];
  /** Разрешённые вариации директора хаоса (GDD §9.3, §10.3). */
  modifiers: string[];
  music: 'work' | 'alarm' | 'evac';
}

export interface ShiftDef {
  id: string;
  title: string;
  /** Порядок комнат в смене. */
  rooms: string[];
  /** Ожидаемая длительность, минуты — для описания в лобби. */
  minutes: [number, number];
}

export interface PingDef {
  type: PingType;
  label: string;
}

export const PING_LABELS: Record<PingType, string> = {
  help: 'Нужна помощь!',
  here: 'Сюда',
  danger: 'Опасно',
  ready: 'Готов',
};
