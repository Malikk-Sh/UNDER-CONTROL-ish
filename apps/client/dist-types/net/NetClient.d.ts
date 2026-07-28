/**
 * Сетевой клиент.
 *
 * Тонкая обёртка над colyseus.js: соединение, отправка ввода с sequence ID,
 * замер задержки и типизированные обработчики сообщений. Никакой игровой
 * логики здесь нет — она вся на сервере и в общем пакете.
 */
import { Room } from 'colyseus.js';
import { type EventsPayload, type GameStateView, type HintPayload, type ResultsPayload, type RoomChangedPayload, type WelcomePayload } from '@uc/shared';
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
export declare class ConnectionError extends Error {
}
export declare function resolveEndpoint(): string;
export declare class NetClient {
    private client;
    private handlers;
    room: Room | null;
    sessionId: string;
    latency: number;
    /** Оценка серверного тика на текущий момент — нужна для фаз опасностей. */
    serverTick: number;
    private pingTimer;
    constructor(endpoint?: string);
    setHandlers(handlers: NetHandlers): void;
    connect(options: ConnectOptions): Promise<void>;
    private attach;
    private startPing;
    private stopPing;
    sendInput(seq: number, axis: number, buttons: number, aim: number): void;
    sendReady(ready: boolean): void;
    sendRestartVote(): void;
    sendAppearance(patch: {
        name?: string;
        colorIndex?: number;
        badgeIndex?: number;
    }): void;
    sendRoomSettings(patch: {
        friendlyInterference?: boolean;
        assist?: boolean;
        maxPlayers?: number;
    }): void;
    get state(): GameStateView | null;
    leave(): Promise<void>;
}
