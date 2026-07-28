/**
 * Сенсорное управление (GDD §14.2).
 *
 * Плавающий левый стик, крупные кнопки прыжка и взаимодействия, бросок второй
 * кнопкой либо свайпом от неё, кнопка пинга и подкат. Всё уважает safe-area и
 * рассчитано на ландшафтную ориентацию; раскладку можно отзеркалить для левшей.
 */
import Phaser from 'phaser';
import type { TouchInputState } from './InputSystem.js';
export interface SafeArea {
    top: number;
    right: number;
    bottom: number;
    left: number;
}
/** Читает safe-area из CSS через служебный элемент: Phaser env() не понимает. */
export declare function readSafeArea(): SafeArea;
export declare class TouchControls {
    private readonly scene;
    private readonly state;
    private readonly container;
    private stickBase;
    private stickKnob;
    private stickPointerId;
    private stickOriginX;
    private stickOriginY;
    private readonly buttons;
    private safeArea;
    private enabled;
    constructor(scene: Phaser.Scene, state: TouchInputState);
    destroy(): void;
    setEnabled(enabled: boolean): void;
    setVisible(visible: boolean): void;
    private createStick;
    private createButtons;
    private addButton;
    /** Раскладка пересчитывается на каждый ресайз и поворот устройства. */
    layout: () => void;
    private place;
    private onPointerDown;
    private onPointerMove;
    private onPointerUp;
    private hitButton;
    private isMovementZone;
    private releaseAll;
}
