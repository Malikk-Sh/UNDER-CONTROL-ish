/**
 * Сетевой клиент.
 *
 * Тонкая обёртка над colyseus.js: соединение, отправка ввода с sequence ID,
 * замер задержки и типизированные обработчики сообщений. Никакой игровой
 * логики здесь нет — она вся на сервере и в общем пакете.
 */

import { Client, Room } from 'colyseus.js';
import {
  MESSAGE,
  encodeInput,
  type EventsPayload,
  type GameStateView,
  type HintPayload,
  type ResultsPayload,
  type RoomChangedPayload,
  type WelcomePayload,
} from '@uc/shared';

export interface ConnectOptions {
  name: string;
  colorIndex: number;
  badgeIndex: number;
  /** Пустой код — публичная комната, иначе приватная по коду. */
  code: string;
  shiftId: string;
  maxPlayers?: number;
}

export interface NetHandlers {
  onWelcome?: (payload: WelcomePayload) => void;
  onEvents?: (payload: EventsPayload) => void;
  onHint?: (payload: HintPayload) => void;
  onRoomChanged?: (payload: RoomChangedPayload) => void;
  onResults?: (payload: ResultsPayload) => void;
  onStateChange?: (state: GameStateView) => void;
  onLeave?: (code: number) => void;
  onError?: (message: string) => void;
}

/** Ошибка подключения, пригодная для показа в интерфейсе. */
export class ConnectionError extends Error {}

export function resolveEndpoint(): string {
  const configured = import.meta.env.VITE_SERVER_URL;
  if (typeof configured === 'string' && configured.length > 0) return configured;
  if (import.meta.env.DEV) return 'ws://localhost:2567';
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}`;
}

export class NetClient {
  private client: Client;
  private handlers: NetHandlers = {};
  room: Room | null = null;
  sessionId = '';
  latency = 0;
  /** Оценка серверного тика на текущий момент — нужна для фаз опасностей. */
  serverTick = 0;

  private pingTimer: number | null = null;

  constructor(endpoint = resolveEndpoint()) {
    this.client = new Client(endpoint);
  }

  setHandlers(handlers: NetHandlers): void {
    this.handlers = handlers;
  }

  async connect(options: ConnectOptions): Promise<void> {
    try {
      this.room = await this.client.joinOrCreate('game', {
        name: options.name,
        colorIndex: options.colorIndex,
        badgeIndex: options.badgeIndex,
        code: options.code,
        shiftId: options.shiftId,
        maxPlayers: options.maxPlayers,
      });
    } catch (cause) {
      throw new ConnectionError(describeError(cause));
    }

    this.sessionId = this.room.sessionId;
    this.attach(this.room);
  }

  private attach(room: Room): void {
    room.onMessage(MESSAGE.Welcome, (payload: WelcomePayload) => {
      this.serverTick = payload.tick;
      this.handlers.onWelcome?.(payload);
    });
    room.onMessage(MESSAGE.Events, (payload: EventsPayload) => this.handlers.onEvents?.(payload));
    room.onMessage(MESSAGE.Hint, (payload: HintPayload) => this.handlers.onHint?.(payload));
    room.onMessage(MESSAGE.RoomChanged, (payload: RoomChangedPayload) => this.handlers.onRoomChanged?.(payload));
    room.onMessage(MESSAGE.Results, (payload: ResultsPayload) => this.handlers.onResults?.(payload));
    room.onMessage(MESSAGE.Pong, (payload: { clientTimeMs: number; tick: number }) => {
      this.latency = Math.max(0, Date.now() - payload.clientTimeMs);
      this.serverTick = payload.tick;
    });

    room.onStateChange((state) => {
      this.handlers.onStateChange?.(state as unknown as GameStateView);
    });
    room.onLeave((code) => {
      this.stopPing();
      this.handlers.onLeave?.(code);
    });
    room.onError((code, message) => this.handlers.onError?.(message ?? `Ошибка ${code}`));

    this.startPing();
  }

  private startPing(): void {
    this.stopPing();
    const send = (): void => this.room?.send(MESSAGE.Ping, { clientTimeMs: Date.now() });
    send();
    this.pingTimer = window.setInterval(send, 2000);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  sendInput(seq: number, axis: number, buttons: number, aim: number): void {
    this.room?.send(MESSAGE.Input, encodeInput(seq, axis, buttons, aim));
  }

  sendReady(ready: boolean): void {
    this.room?.send(MESSAGE.Ready, ready);
  }

  sendRestartVote(): void {
    this.room?.send(MESSAGE.VoteRestart, true);
  }

  sendAppearance(patch: { name?: string; colorIndex?: number; badgeIndex?: number }): void {
    this.room?.send(MESSAGE.Appearance, patch);
  }

  sendRoomSettings(patch: { friendlyInterference?: boolean; assist?: boolean; maxPlayers?: number }): void {
    this.room?.send(MESSAGE.RoomSettings, patch);
  }

  get state(): GameStateView | null {
    return (this.room?.state as unknown as GameStateView) ?? null;
  }

  async leave(): Promise<void> {
    this.stopPing();
    await this.room?.leave(true);
    this.room = null;
  }
}

function describeError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/ECONNREFUSED|Failed to fetch|NetworkError/i.test(message)) {
    return 'Сервер недоступен. Проверьте, что он запущен.';
  }
  if (/locked|full/i.test(message)) return 'Комната заполнена.';
  return message || 'Не удалось подключиться';
}
