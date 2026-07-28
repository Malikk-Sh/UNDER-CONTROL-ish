/**
 * Камера (GDD §14.1).
 *
 * Следует за локальным игроком, плавно расширяется при расхождении команды и
 * никогда не уменьшает персонажей до нечитаемого размера — вместо этого
 * далёкие игроки обозначаются стрелками по краю экрана.
 */
import Phaser from 'phaser';
export interface CameraTarget {
    x: number;
    y: number;
}
export declare class CameraSystem {
    private readonly camera;
    private readonly scene;
    private targetZoom;
    private lookX;
    private lookY;
    private initialized;
    constructor(scene: Phaser.Scene);
    setBounds(width: number, height: number): void;
    /**
     * @param self позиция локального игрока
     * @param others позиции остальных активных игроков
     */
    update(self: CameraTarget, others: readonly CameraTarget[], deltaSeconds: number): void;
    /** Тряска уважает настройку доступности: её можно полностью выключить. */
    shake(intensity: number, durationMs?: number): void;
    flash(color: number, alpha?: number): void;
    /** Экранные координаты мировой точки — нужны для указателей и подсказок. */
    worldToScreen(x: number, y: number, out: Phaser.Math.Vector2): Phaser.Math.Vector2;
    get zoom(): number;
    get view(): Phaser.Geom.Rectangle;
}
