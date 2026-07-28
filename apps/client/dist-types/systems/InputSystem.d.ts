/**
 * Сбор ввода с клавиатуры, геймпада и сенсорного экрана в один кадр.
 *
 * Все важные действия помещаются на любое из трёх устройств (GDD §5.1).
 * Глубина создаётся контекстом и физикой, а не числом кнопок, поэтому здесь
 * ровно пять действий и одна ось.
 */
import Phaser from 'phaser';
export interface TouchInputState {
    /** Ось стика, −1..1. */
    axis: number;
    jump: boolean;
    interact: boolean;
    throwing: boolean;
    crouch: boolean;
    ping: boolean;
    /** Направление прицеливания в радианах либо null (тогда берётся взгляд). */
    aim: number | null;
}
export declare function createTouchState(): TouchInputState;
export interface InputFrameData {
    axis: number;
    buttons: number;
    aim: number;
}
export declare class InputSystem {
    readonly touch: TouchInputState;
    private keys;
    private readonly scene;
    private pointerAim;
    private aimOriginX;
    private aimOriginY;
    private facing;
    /** Залипающее взаимодействие для режима без удерживания (GDD §14.3). */
    private stickyInteract;
    private previousInteractEdge;
    constructor(scene: Phaser.Scene);
    private installKeyboard;
    private installPointer;
    /** Экранная позиция персонажа — от неё считается прицел мышью. */
    setAimOrigin(screenX: number, screenY: number, facing: number): void;
    private down;
    /** Собирает кадр ввода. Вызывается один раз на фиксированный шаг симуляции. */
    sample(): InputFrameData;
    /**
     * В режиме без удерживания кнопка взаимодействия работает как переключатель:
     * это критично для сенсорного экрана, где палец нужен и для стика.
     */
    private resolveInteract;
    private resolveAim;
    /** Сбрасывает залипания — например, при открытии меню. */
    reset(): void;
}
