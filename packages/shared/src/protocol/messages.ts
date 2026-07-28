/**
 * Сетевой протокол.
 *
 * Каждое сетевое действие несёт sequence ID, а сервер дополнительно проверяет
 * дистанцию и допустимость состояния (GDD §0.5). Ввод передаётся компактным
 * массивом, потому что уходит 30 раз в секунду.
 */

import type { PingType, SimEvent } from '../sim/types.js';

export const MESSAGE = {
  /** Клиент → сервер: кадр ввода. */
  Input: 'i',
  /** Клиент → сервер: готовность в брифинге. */
  Ready: 'r',
  /** Клиент → сервер: голос за перезапуск комнаты. */
  VoteRestart: 'vr',
  /** Клиент → сервер: голос за модификатор следующей зоны. */
  VoteModifier: 'vm',
  /** Клиент → сервер: смена косметики в лобби. */
  Appearance: 'ap',
  /** Клиент → сервер: настройки приватной комнаты (только у хоста). */
  RoomSettings: 'rs',
  /** Клиент → сервер: замер задержки. */
  Ping: 'p',

  /** Сервер → клиент: приветствие с параметрами сессии. */
  Welcome: 'w',
  /** Сервер → клиент: пакет событий симуляции для звука и эффектов. */
  Events: 'e',
  /** Сервер → клиент: персональная подсказка обучения. */
  Hint: 'h',
  /** Сервер → клиент: смена комнаты внутри смены. */
  RoomChanged: 'rc',
  /** Сервер → клиент: итоги смены. */
  Results: 'res',
  /** Сервер → клиент: ответ на замер задержки. */
  Pong: 'po',
} as const;

/**
 * Кадр ввода в проводном формате: [seq, axis×100, buttons, aim].
 * Массив вместо объекта экономит примерно половину пакета.
 */
export type WireInput = [number, number, number, number];

export interface WelcomePayload {
  sessionId: string;
  roomCode: string;
  /** Серверный тик на момент подключения — клиент синхронизирует часы. */
  tick: number;
  tickRate: number;
  maxPlayers: number;
  /** Является ли этот клиент хостом комнаты (настройки, старт). */
  host: boolean;
  /** Игрок подключился в середине смены. */
  joinedInProgress: boolean;
  serverTimeMs: number;
}

export interface EventsPayload {
  tick: number;
  events: SimEvent[];
}

export interface HintPayload {
  text: string;
  /** Идентификатор подсказки — клиент не повторяет одну и ту же анимацию. */
  key: string;
}

export interface RoomChangedPayload {
  roomId: string;
  index: number;
  total: number;
  title: string;
  brief: string;
  /** Список резервных механизмов, показываемый малому составу. */
  fallbacks: string[];
}

export interface PlayerResult {
  sessionId: string;
  name: string;
  revives: number;
  itemsCarried: number;
  throws: number;
  hazardHits: number;
  falls: number;
  /** Забавный титул по статистике (GDD §13.1). */
  title: string;
}

export interface ResultsPayload {
  shiftId: string;
  cleared: boolean;
  seconds: number;
  /** Оценка: безопасность, скорость, сохранность, спасения (GDD §13.1). */
  grades: { safety: number; speed: number; care: number; rescue: number };
  players: PlayerResult[];
}

export interface AppearancePayload {
  name?: string;
  colorIndex?: number;
  badgeIndex?: number;
}

export interface RoomSettingsPayload {
  maxPlayers?: number;
  /** Настройка friendly interference в приватной комнате (GDD §16.3). */
  friendlyInterference?: boolean;
  /** Ассистированный режим: длиннее окна, слабее опасности (GDD §14.3). */
  assist?: boolean;
}

export interface VoteModifierPayload {
  modifier: string;
}

export interface PingPayload {
  clientTimeMs: number;
}

export interface PongPayload {
  clientTimeMs: number;
  serverTimeMs: number;
  tick: number;
}

export function encodeInput(seq: number, axis: number, buttons: number, aim: number): WireInput {
  return [seq >>> 0, Math.round(Math.max(-1, Math.min(1, axis)) * 100), buttons & 0xff, aim & 0xff];
}

export function decodeInput(wire: WireInput): { seq: number; axis: number; buttons: number; aim: number } {
  return {
    seq: wire[0] >>> 0,
    axis: Math.max(-1, Math.min(1, wire[1] / 100)),
    buttons: wire[2] & 0xff,
    aim: wire[3] & 0xff,
  };
}

export function isWireInput(value: unknown): value is WireInput {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  );
}

export interface PingRequest {
  type: PingType;
  x: number;
  y: number;
}
