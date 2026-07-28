/**
 * Устройства комнаты и шина сигналов.
 *
 * Все опасности рассчитываются от номера тика и seed, а не от локального
 * времени (GDD §16.1, §17.5) — благодаря этому клиент показывает ту же фазу
 * пресса, что и сервер, без передачи позиции в каждом снимке.
 *
 * Каждая опасность обязана проходить три фазы (GDD §9.1):
 * предупреждение → активная фаза → восстановление.
 */

import { HAZARD, TILE } from '../config/tuning.js';
import type {
  ConveyorDef,
  DoorDef,
  EntityDef,
  EntityType,
  JetDef,
  LiftDef,
  LiveZoneDef,
  MagnetDef,
  PressDef,
} from '../content/types.js';
import type { DynamicSolid, RectPx } from './geometry.js';
import { makeSolid } from './geometry.js';
import { clamp } from './math.js';

export const enum HazardPhase {
  /** Опасность выключена. */
  Idle = 0,
  /** Предупреждение: лампа, звук, замах. */
  Warn = 1,
  /** Активная фаза: удар или блокировка. */
  Active = 2,
  /** Гарантированное окно для прохода или спасения. */
  Recover = 3,
}

export interface DeviceSim {
  id: string;
  kind: EntityType;
  def: EntityDef;
  /** Текущий прямоугольник в пикселях (у пресса и лифта он двигается). */
  rect: RectPx;
  /** Прогресс 0..1: вентиль, ремонт, лифт, ход пресса. */
  progress: number;
  /** Устройство включено/открыто/под напряжением. */
  active: boolean;
  phase: HazardPhase;
  /** Сколько игроков сейчас взаимодействует (плита, вентиль, узел). */
  actors: number;
  /** Служебный таймер устройства. */
  timer: number;
  /** Твёрдое тело устройства, если оно есть. */
  solid: DynamicSolid | null;
  /** Смещение фазы в секундах. */
  offset: number;
  /** Предыдущая фаза — чтобы порождать событие только на смене. */
  lastPhase: HazardPhase;
  /** Зафиксированное состояние плиты-фиксатора. */
  latched: boolean;
}

/**
 * Шина сигналов. Устройства публикуют состояние, двери и цели читают.
 * Изменения накапливаются, чтобы порождать события один раз за тик.
 */
export class SignalBus {
  private readonly values = new Map<string, boolean>();
  private readonly changed = new Set<string>();

  get(name: string | undefined, fallback = false): boolean {
    if (!name) return fallback;
    const value = this.values.get(name);
    return value === undefined ? fallback : value;
  }

  set(name: string, value: boolean): void {
    if (this.values.get(name) === value) return;
    this.values.set(name, value);
    this.changed.add(name);
  }

  /** Логическое ИЛИ: одна плита из группы уже даёт сигнал. */
  or(name: string, value: boolean): void {
    this.set(name, this.get(name) || value);
  }

  has(name: string): boolean {
    return this.values.has(name);
  }

  countTrue(names: readonly string[]): number {
    let total = 0;
    for (const name of names) if (this.get(name)) total++;
    return total;
  }

  drainChanges(): string[] {
    const list = [...this.changed];
    this.changed.clear();
    return list;
  }

  snapshot(): Record<string, boolean> {
    return Object.fromEntries(this.values);
  }

  /** Сброс перед пересчётом сигналов, которые агрегируются каждый тик. */
  clearTransient(names: readonly string[]): void {
    for (const name of names) this.set(name, false);
  }
}

function rectFromDef(def: EntityDef): RectPx {
  const anyDef = def as unknown as { x: number; y: number; w?: number; h?: number };
  const w = anyDef.w ?? 1;
  const h = anyDef.h ?? 1;
  return { x: anyDef.x * TILE, y: anyDef.y * TILE, w: w * TILE, h: h * TILE };
}

export function createDevice(def: EntityDef): DeviceSim {
  const rect = rectFromDef(def);
  const device: DeviceSim = {
    id: (def as { id?: string }).id ?? `${def.type}_${Math.round(rect.x)}_${Math.round(rect.y)}`,
    kind: def.type,
    def,
    rect,
    progress: 0,
    active: false,
    phase: HazardPhase.Idle,
    actors: 0,
    timer: 0,
    solid: null,
    offset: (def as { offset?: number }).offset ?? 0,
    lastPhase: HazardPhase.Idle,
    latched: false,
  };

  switch (def.type) {
    case 'conveyor': {
      const conveyor = def as ConveyorDef;
      device.rect = { x: conveyor.x * TILE, y: conveyor.y * TILE, w: conveyor.w * TILE, h: TILE };
      device.solid = makeSolid(device.id, { ...device.rect }, {
        surfaceVx: conveyor.dir * (conveyor.speed ?? HAZARD.conveyorSpeed),
      });
      device.active = true;
      break;
    }
    case 'press': {
      const press = def as PressDef;
      device.rect = { x: press.x * TILE, y: press.y * TILE, w: press.w * TILE, h: TILE };
      device.solid = makeSolid(device.id, { ...device.rect });
      break;
    }
    case 'door': {
      const door = def as DoorDef;
      device.solid = makeSolid(device.id, { ...device.rect });
      device.active = door.invert === true;
      break;
    }
    case 'lift': {
      const lift = def as LiftDef;
      device.rect = { x: lift.x * TILE, y: lift.y * TILE, w: lift.w * TILE, h: TILE * 0.5 };
      device.solid = makeSolid(device.id, { ...device.rect }, { oneWay: false });
      break;
    }
    case 'plate': {
      const w = (def as { w?: number }).w ?? 1;
      device.rect = { x: (def as { x: number }).x * TILE, y: (def as { y: number }).y * TILE, w: w * TILE, h: TILE * 0.4 };
      break;
    }
    case 'lever':
      device.active = (def as { startsOn?: boolean }).startsOn === true;
      device.rect = { x: rect.x, y: rect.y, w: TILE, h: TILE };
      break;
    case 'valve':
    case 'node':
      device.rect = { x: rect.x, y: rect.y, w: TILE, h: TILE };
      break;
    default:
      break;
  }
  return device;
}

/** Длительность полного цикла пресса. */
export const PRESS_CYCLE =
  HAZARD.pressWarn + HAZARD.pressSlam + HAZARD.pressHold + HAZARD.pressRetract + HAZARD.pressRecovery;

export const MAGNET_CYCLE = HAZARD.magnetWarn + HAZARD.magnetPull + HAZARD.magnetRest;
export const ELECTRIC_CYCLE = HAZARD.electricWarn + HAZARD.electricActive + HAZARD.electricRest;

export interface PressPose {
  phase: HazardPhase;
  /** Смещение плиты вниз в пикселях. */
  drop: number;
  /** Скорость плиты по вертикали, пикс/с. */
  vy: number;
}

/**
 * Поза пресса, вычисленная из времени. Чистая функция — клиент вызывает её с
 * тем же временем, что и сервер, и получает тот же результат.
 */
export function pressPose(timeSeconds: number, offset: number, travelPx: number, intensity: number): PressPose {
  const cycle = PRESS_CYCLE / clamp(intensity, 0.6, 1.6);
  const warn = HAZARD.pressWarn / clamp(intensity, 0.6, 1.6);
  const slam = HAZARD.pressSlam;
  const hold = HAZARD.pressHold;
  const retract = HAZARD.pressRetract;

  let t = (timeSeconds + offset) % cycle;
  if (t < 0) t += cycle;

  if (t < warn) {
    return { phase: HazardPhase.Warn, drop: 0, vy: 0 };
  }
  t -= warn;
  if (t < slam) {
    const k = t / slam;
    return { phase: HazardPhase.Active, drop: travelPx * k * k, vy: (travelPx / slam) * 2 * k };
  }
  t -= slam;
  if (t < hold) {
    return { phase: HazardPhase.Active, drop: travelPx, vy: 0 };
  }
  t -= hold;
  if (t < retract) {
    const k = t / retract;
    return { phase: HazardPhase.Recover, drop: travelPx * (1 - k), vy: -travelPx / retract };
  }
  return { phase: HazardPhase.Recover, drop: 0, vy: 0 };
}

export function magnetPhase(timeSeconds: number, offset: number, intensity: number): { phase: HazardPhase; strength: number } {
  const scale = clamp(intensity, 0.7, 1.5);
  const warn = HAZARD.magnetWarn / scale;
  const pull = HAZARD.magnetPull;
  const rest = HAZARD.magnetRest / scale;
  const cycle = warn + pull + rest;

  let t = (timeSeconds + offset) % cycle;
  if (t < 0) t += cycle;
  if (t < warn) return { phase: HazardPhase.Warn, strength: 0 };
  t -= warn;
  if (t < pull) {
    // Плавное нарастание и спад, чтобы предмет не дёргался рывком.
    const k = Math.sin((t / pull) * Math.PI);
    return { phase: HazardPhase.Active, strength: k };
  }
  return { phase: HazardPhase.Recover, strength: 0 };
}

export function electricPhase(timeSeconds: number, offset: number, intensity: number): HazardPhase {
  const scale = clamp(intensity, 0.7, 1.5);
  const warn = HAZARD.electricWarn / scale;
  const active = HAZARD.electricActive;
  const rest = HAZARD.electricRest / scale;
  const cycle = warn + active + rest;

  let t = (timeSeconds + offset) % cycle;
  if (t < 0) t += cycle;
  if (t < warn) return HazardPhase.Warn;
  if (t < warn + active) return HazardPhase.Active;
  return HazardPhase.Recover;
}

/** Струя пара или огня: тот же трёхфазный ритм, что и у остальных опасностей. */
export function jetPhase(timeSeconds: number, offset: number): HazardPhase {
  const warn = 0.7;
  const active = 1.1;
  const rest = 1.5;
  const cycle = warn + active + rest;
  let t = (timeSeconds + offset) % cycle;
  if (t < 0) t += cycle;
  if (t < warn) return HazardPhase.Warn;
  if (t < warn + active) return HazardPhase.Active;
  return HazardPhase.Recover;
}

/** Устройство телеграфирует опасность заранее — проверяется валидатором. */
export function isTelegraphed(kind: EntityType): boolean {
  return kind === 'press' || kind === 'magnet' || kind === 'live' || kind === 'jet';
}

export type HazardDeviceDef = PressDef | MagnetDef | LiveZoneDef | JetDef;
