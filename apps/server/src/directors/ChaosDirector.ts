/**
 * Директор хаоса (GDD §9.3).
 *
 * Отслеживает падения, разрыв между лидером и отстающими, длительность
 * комнаты, активный состав и качество соединения. Выбирает **только
 * подготовленные вариации** из списка `room.modifiers` — никакой процедурной
 * генерации опасностей.
 */

import { World, type SimEvent } from '@uc/shared';

export interface ChaosSignals {
  /** Секунды без заметного прогресса по целям. */
  stalledSeconds: number;
  /** Падений и выведений за последние 30 секунд. */
  recentFalls: number;
  /** Разброс команды по горизонтали в пикселях. */
  spread: number;
  /** Наибольшая задержка в комнате, мс. */
  worstLatency: number;
}

interface Variation {
  id: string;
  /** Вариация облегчает жизнь команде. */
  relief: boolean;
  test: (signals: ChaosSignals, world: World) => boolean;
}

/**
 * Список подготовленных вариаций. Каждая срабатывает не чаще одного раза за
 * комнату и только если комната объявила её в `modifiers`.
 */
const VARIATIONS: Variation[] = [
  {
    // Команда буксует — даём более длинное безопасное окно.
    id: 'slow_pulse',
    relief: true,
    test: (signals) => signals.stalledSeconds > 40,
  },
  {
    // Много падений подряд — снимаем одну угрозу.
    id: 'blackout',
    relief: true,
    test: (signals) => signals.recentFalls >= 4,
  },
  {
    // Команда идёт слишком гладко — добавляем утечку.
    id: 'extra_leak',
    relief: false,
    test: (signals, world) => signals.stalledSeconds < 6 && world.progressRatio() > 0.55 && world.activeCount >= 3,
  },
  {
    // Крупная бригада разбежалась — разворачиваем ленту, чтобы собрать их.
    id: 'belt_reverse',
    relief: false,
    test: (signals, world) => signals.spread > world.map.widthPx * 0.62 && world.activeCount >= 4,
  },
  {
    id: 'magnet_storm',
    relief: false,
    test: (signals, world) => world.progressRatio() > 0.6 && world.activeCount >= 5 && signals.stalledSeconds < 10,
  },
  {
    id: 'fire_wave',
    relief: false,
    test: (_signals, world) => world.catastropheGauge > 0.55 && world.activeCount >= 4,
  },
];

const FALL_WINDOW_SECONDS = 30;

export class ChaosDirector {
  private stalledSeconds = 0;
  private lastProgress = 0;
  private readonly fallTimestamps: number[] = [];
  private cooldown = 0;

  reset(): void {
    this.stalledSeconds = 0;
    this.lastProgress = 0;
    this.fallTimestamps.length = 0;
    this.cooldown = 0;
  }

  observe(events: readonly SimEvent[], elapsed: number): void {
    for (const event of events) {
      if (event.type === 'player_downed') this.fallTimestamps.push(elapsed);
    }
    while (this.fallTimestamps.length > 0 && elapsed - this.fallTimestamps[0] > FALL_WINDOW_SECONDS) {
      this.fallTimestamps.shift();
    }
  }

  update(world: World, dt: number, worstLatency: number): void {
    const progress = world.progressRatio();
    if (progress > this.lastProgress + 0.01) {
      this.lastProgress = progress;
      this.stalledSeconds = 0;
    } else {
      this.stalledSeconds += dt;
    }

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown > 0) return;

    const signals: ChaosSignals = {
      stalledSeconds: this.stalledSeconds,
      recentFalls: this.fallTimestamps.length,
      spread: world.partySpread(),
      worstLatency,
    };

    for (const variation of VARIATIONS) {
      if (!world.room.modifiers.includes(variation.id)) continue;
      if (world.activeModifiers.has(variation.id)) continue;
      if (!variation.test(signals, world)) continue;

      const reason = variation.relief ? 'relief' : 'pressure';
      if (world.applyModifier(variation.id, reason)) {
        // После вариации выдерживаем паузу, чтобы комната не менялась рывками.
        this.cooldown = 25;
        this.stalledSeconds = 0;
        break;
      }
    }
  }
}
