/**
 * Визуальные эффекты: искры, пыль, брызги, всплывающий текст.
 *
 * Всё уважает настройки доступности (плотность частиц, вспышки) и лимит
 * качества — на слабом телефоне эффекты просто становятся реже, а не исчезают
 * совсем, чтобы обратная связь оставалась читаемой (GDD §14.3, §21).
 */
import Phaser from 'phaser';
export declare class EffectsSystem {
    private readonly scene;
    private readonly layer;
    private sparks;
    private smoke;
    private dust;
    constructor(scene: Phaser.Scene, depth: number);
    private createEmitters;
    setDepth(depth: number): void;
    private budget;
    burstSparks(x: number, y: number, count?: number, color?: number): void;
    burstSmoke(x: number, y: number, count?: number, color?: number): void;
    landingDust(x: number, y: number, speed: number): void;
    splash(x: number, y: number): void;
    /** Всплывающая подпись — используется для урона, спасений и целей. */
    floatingText(x: number, y: number, text: string, color?: number): void;
    /** Кольцо расходящейся волны — предупреждение о срабатывании опасности. */
    shockRing(x: number, y: number, color: number, radius?: number): void;
    destroy(): void;
}
