/**
 * Отрисовка комнаты.
 *
 * Статическая геометрия запекается в одну текстуру при загрузке комнаты,
 * динамика (игроки, предметы, устройства) обновляется каждый кадр из
 * серверного состояния. Опасности рисуются по фазам: предупреждение видно и
 * слышно заранее, активная фаза читается по цвету и форме (GDD §9.1, §15.1).
 */
import Phaser from 'phaser';
import { TileMap, type GameStateView, type PlayerStateView, type RoomDef } from '@uc/shared';
export declare const DEPTH: {
    readonly background: -100;
    readonly parallax: -80;
    readonly tiles: -10;
    readonly devicesBack: 0;
    readonly items: 10;
    readonly players: 20;
    readonly devicesFront: 30;
    readonly effects: 40;
    readonly markers: 60;
};
export declare class WorldRenderer {
    private readonly scene;
    private map;
    private room;
    private staticTexture;
    private readonly backgroundLayer;
    private readonly waterLayer;
    private readonly players;
    private readonly items;
    private readonly devices;
    private readonly carts;
    private readonly pings;
    private time;
    constructor(scene: Phaser.Scene);
    loadRoom(room: RoomDef): void;
    private clear;
    destroy(): void;
    get worldWidth(): number;
    get worldHeight(): number;
    /** Слои фона едут медленнее переднего плана — дешёвая глубина без ассетов. */
    private buildBackground;
    private bakeTiles;
    /**
     * Потолочная оснастка: балки, трубы и лампы.
     *
     * Комнаты нарочно высокие — прессам нужен ход, а броскам дуга. Без деталей
     * этот запас читается как пустое небо, поэтому верх заполняется декором.
     * Он не участвует в симуляции и живёт только на клиенте (GDD §0.5).
     */
    private buildCeiling;
    /** Вода рисуется отдельным слоем: она полупрозрачная и слегка колышется. */
    private buildWater;
    update(state: GameStateView, localSessionId: string, deltaSeconds: number): void;
    /**
     * Обновляет представление игрока. Позиция приходит извне: для локального
     * игрока это предсказание, для остальных — интерполированный снимок.
     */
    syncPlayer(player: PlayerStateView, x: number, y: number, isLocal: boolean, deltaSeconds: number): void;
    private drawPlayerRing;
    private createPlayerView;
    removePlayer(sessionId: string): void;
    playerIds(): IterableIterator<string>;
    private syncItems;
    private createItemView;
    private updateItemView;
    private syncCarts;
    private syncDevices;
    private createDeviceView;
    private updateDeviceView;
    /** Общая мигалка «сейчас ударит» над опасностью. */
    private drawHazardTelegraph;
    private drawProgressArc;
    private syncPings;
    /** Прямоугольник комнаты — нужен камере и мини-индикаторам. */
    get tileMap(): TileMap | null;
    get roomDef(): RoomDef | null;
}
