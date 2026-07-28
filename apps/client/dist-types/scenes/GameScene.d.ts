/**
 * Игровая сцена: собирает вместе сеть, предсказание, рендер и звук.
 *
 * Разделение обязанностей намеренное (GDD §0.5): сцена ничего не решает про
 * правила игры, она только показывает авторитетное состояние и предсказывает
 * движение собственного персонажа между снимками.
 */
import Phaser from 'phaser';
import { type GameStateView } from '@uc/shared';
import { InputSystem } from '../systems/InputSystem.js';
import type { NetClient } from '../net/NetClient.js';
import type { HudOverlay } from '../ui/HudOverlay.js';
export interface GameSceneData {
    net: NetClient;
    hud: HudOverlay;
}
export declare class GameScene extends Phaser.Scene {
    static readonly KEY = "game";
    private net;
    private hud;
    private world;
    private cameraSystem;
    private effects;
    private inputs;
    private touch;
    private prediction;
    private readonly remotes;
    private readonly solids;
    private readonly solidsById;
    private readonly previousSolidY;
    private promptText;
    private markers;
    private readonly screenPoint;
    private currentRoomId;
    private paused;
    constructor();
    init(data: GameSceneData): void;
    create(): void;
    private teardown;
    setPaused(paused: boolean): void;
    private loadRoom;
    private onStateChange;
    update(_time: number, delta: number): void;
    /** Динамические тела из серверного состояния — основа предсказания. */
    private syncSolids;
    private updateLocalPlayer;
    private updateRemotePlayers;
    private updateCamera;
    /**
     * Локальная подсветка цели взаимодействия. Это только подсказка: решение
     * всё равно принимает сервер, поэтому расхождение безобидно.
     */
    private updatePrompt;
    /** Стрелки к игрокам за краем экрана — чтобы никто не потерялся (GDD §14.1). */
    private updateMarkers;
    private handleEvents;
    private handleHazardPhase;
    /** Переключение музыки под фазу комнаты. */
    syncMusic(state: GameStateView): void;
    get inputSystem(): InputSystem;
    /** Позиция локального игрока по предсказанию — для отладки и автотестов. */
    get localPosition(): {
        x: number;
        y: number;
    };
}
