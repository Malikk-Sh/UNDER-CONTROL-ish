/**
 * Масштабирование задач под активный состав (GDD §6.2, §6.3).
 *
 * Все функции здесь чистые и вызываются одинаково на клиенте и сервере, чтобы
 * подсказки в интерфейсе совпадали с тем, что реально проверяет сервер.
 */

import { OBJECTIVE, ROOM } from './tuning.js';

export const MAX_REQUIRED_ACTIVATORS = 3;

/**
 * Число одновременных обязательных активаторов.
 *
 * GDD §6.3: `max(1, min(3, ceil(N × 0,4)))`. Верхний предел в три штуки —
 * жёсткая гарантия того, что комната никогда не потребует ровно N игроков.
 */
export function requiredActivators(activePlayers: number): number {
  const n = Math.max(0, Math.floor(activePlayers));
  return Math.max(1, Math.min(MAX_REQUIRED_ACTIVATORS, Math.ceil(n * 0.4)));
}

/**
 * Проверка жёсткого ограничения GDD §6.3: обязательных точек не может быть
 * больше, чем активных игроков. Валидатор уровней опирается на неё.
 */
export function activatorsAreSatisfiable(activePlayers: number): boolean {
  const active = Math.max(1, Math.floor(activePlayers));
  return requiredActivators(active) <= active;
}

/**
 * Интенсивность опасностей растёт медленнее числа игроков и имеет верхний
 * предел (GDD §6.3), иначе большая бригада получает непроходимую комнату.
 */
export function hazardIntensity(activePlayers: number): number {
  const n = Math.max(1, Math.floor(activePlayers));
  const raw = 1 + Math.log2(n) * 0.34;
  return Math.min(2.05, Number(raw.toFixed(4)));
}

/** Дополнительные волны опасностей появляются только у крупного состава. */
export function extraHazardWaves(activePlayers: number): number {
  const n = Math.max(1, Math.floor(activePlayers));
  if (n <= 3) return 0;
  if (n <= 6) return 1;
  return 2;
}

/**
 * Время спасения уменьшается с каждым помощником, но с убывающей отдачей
 * (GDD §6.3, §12.1).
 */
export function reviveDuration(baseSeconds: number, helpers: number): number {
  const h = Math.max(1, Math.floor(helpers));
  return Number((baseSeconds / (1 + Math.log2(h) * 0.85)).toFixed(4));
}

/**
 * Длительность удержания активатора: малому составу дают длинное окно,
 * большому — короткое, но активаторов больше (GDD §6.2).
 */
export function holdDuration(activePlayers: number, activatorsOnPlate: number): number {
  const solo = OBJECTIVE.plateSoloHold;
  const group = OBJECTIVE.plateGroupHold;
  const helpers = Math.max(1, activatorsOnPlate);
  const scaled = solo - (solo - group) * (1 - 1 / helpers);
  // Малый состав дополнительно получает более щадящее окно.
  const smallPartyBonus = activePlayers <= 2 ? 0.85 : 1;
  return Number((scaled * smallPartyBonus).toFixed(4));
}

/**
 * Сколько узлов ремонта активно. У малого состава их меньше, но окна длиннее
 * (GDD §6.2), у большого — больше параллельных неисправностей.
 */
export function repairNodeCount(activePlayers: number, authored: number): number {
  const n = Math.max(1, Math.floor(activePlayers));
  if (n <= 2) return Math.max(1, Math.min(authored, 2));
  if (n <= 5) return Math.max(1, Math.min(authored, 3));
  return authored;
}

/** Множитель времени на цель: соло получает запас, группа — нет. */
export function objectiveTimeScale(activePlayers: number): number {
  const n = Math.max(1, Math.floor(activePlayers));
  if (n === 1) return 1.45;
  if (n === 2) return 1.22;
  if (n <= 4) return 1.05;
  return 1;
}

/**
 * Требуемая «сила» для быстрого переноса тяжёлого груза. Всегда достижима
 * соло — просто медленно (GDD §6.2: соло-путь существует).
 */
export function carrySpeedFactor(requiredStrength: number, carriers: number, table: number[]): number {
  const need = Math.max(1, requiredStrength);
  const have = Math.max(1, carriers);
  const deficit = Math.max(0, need - have);
  const idx = Math.min(table.length - 1, Math.max(0, table.length - 1 - deficit));
  return table[idx];
}

/**
 * Бонус за эффективность для крупного состава — чтобы большая бригада не
 * получала бесплатного преимущества (GDD §6.2).
 */
export function efficiencyTarget(activePlayers: number, baseSeconds: number): number {
  const n = Math.max(1, Math.floor(activePlayers));
  return Number((baseSeconds * (1 / (1 + Math.log2(n) * 0.22))).toFixed(2));
}

/** Приведение желаемого лимита комнаты к поддерживаемому диапазону. */
export function clampPartyLimit(requested: number): number {
  if (!Number.isFinite(requested)) return ROOM.defaultMaxPlayers;
  return Math.max(1, Math.min(ROOM.hardMaxPlayers, Math.floor(requested)));
}

/** Составы, на которых валидатор обязан прогнать каждую комнату (GDD §18.1). */
export const VALIDATION_PARTY_SIZES = [1, 2, 4, 8, ROOM.hardMaxPlayers];
