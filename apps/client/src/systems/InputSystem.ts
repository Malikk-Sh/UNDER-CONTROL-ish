/**
 * Сбор ввода с клавиатуры, геймпада и сенсорного экрана в один кадр.
 *
 * Все важные действия помещаются на любое из трёх устройств (GDD §5.1).
 * Глубина создаётся контекстом и физикой, а не числом кнопок, поэтому здесь
 * ровно пять действий и одна ось.
 */

import Phaser from 'phaser';
import { Button, packAngle } from '@uc/shared';
import { getSettings } from '../settings.js';

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

export function createTouchState(): TouchInputState {
  return { axis: 0, jump: false, interact: false, throwing: false, crouch: false, ping: false, aim: null };
}

export interface InputFrameData {
  axis: number;
  buttons: number;
  aim: number;
}

export class InputSystem {
  readonly touch: TouchInputState = createTouchState();

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private readonly scene: Phaser.Scene;
  private pointerAim: number | null = null;
  private aimOriginX = 0;
  private aimOriginY = 0;
  private facing = 1;

  /** Залипающее взаимодействие для режима без удерживания (GDD §14.3). */
  private stickyInteract = false;
  private previousInteractEdge = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.installKeyboard();
    this.installPointer();
  }

  private installKeyboard(): void {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) {
      this.keys = {} as Record<string, Phaser.Input.Keyboard.Key>;
      return;
    }
    // Стрелки продублированы намеренно: переназначение кнопок — требование
    // доступности, а базовая раскладка должна подойти большинству сразу.
    this.keys = keyboard.addKeys(
      {
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        leftArrow: Phaser.Input.Keyboard.KeyCodes.LEFT,
        rightArrow: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        jump: Phaser.Input.Keyboard.KeyCodes.SPACE,
        jumpUp: Phaser.Input.Keyboard.KeyCodes.W,
        interact: Phaser.Input.Keyboard.KeyCodes.E,
        throwing: Phaser.Input.Keyboard.KeyCodes.F,
        crouch: Phaser.Input.Keyboard.KeyCodes.S,
        crouchDown: Phaser.Input.Keyboard.KeyCodes.DOWN,
        crouchCtrl: Phaser.Input.Keyboard.KeyCodes.CTRL,
        ping: Phaser.Input.Keyboard.KeyCodes.Q,
      },
      false,
      false,
    ) as Record<string, Phaser.Input.Keyboard.Key>;

    // Пробел и стрелки не должны прокручивать страницу.
    keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
    ]);
  }

  private installPointer(): void {
    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) return;
      this.pointerAim = Math.atan2(pointer.y - this.aimOriginY, pointer.x - this.aimOriginX);
    });
  }

  /** Экранная позиция персонажа — от неё считается прицел мышью. */
  setAimOrigin(screenX: number, screenY: number, facing: number): void {
    this.aimOriginX = screenX;
    this.aimOriginY = screenY;
    this.facing = facing;
  }

  private down(name: string): boolean {
    return this.keys[name]?.isDown === true;
  }

  /** Собирает кадр ввода. Вызывается один раз на фиксированный шаг симуляции. */
  sample(): InputFrameData {
    const pad = this.scene.input.gamepad?.getPad(0);
    const settings = getSettings();

    let axis = 0;
    if (this.down('left') || this.down('leftArrow')) axis -= 1;
    if (this.down('right') || this.down('rightArrow')) axis += 1;
    if (pad) {
      const stick = pad.leftStick.x;
      if (Math.abs(stick) > 0.22) axis += stick;
      if (pad.left) axis -= 1;
      if (pad.right) axis += 1;
    }
    axis += this.touch.axis;
    axis = Math.max(-1, Math.min(1, axis));

    const jump = this.down('jump') || this.down('jumpUp') || this.touch.jump || padButton(pad, 0);
    const rawInteract = this.down('interact') || this.touch.interact || padButton(pad, 2);
    const throwing = this.down('throwing') || this.touch.throwing || padButton(pad, 1);
    const crouch =
      this.down('crouch') || this.down('crouchDown') || this.down('crouchCtrl') || this.touch.crouch || padButton(pad, 6);
    const ping = this.down('ping') || this.touch.ping || padButton(pad, 3);

    const interact = this.resolveInteract(rawInteract, throwing, settings.holdFreeMode);

    let buttons = 0;
    if (jump) buttons |= Button.Jump;
    if (interact) buttons |= Button.Interact;
    if (throwing) buttons |= Button.Throw;
    if (crouch) buttons |= Button.Crouch;
    if (ping) buttons |= Button.Ping;

    return { axis, buttons, aim: packAngle(this.resolveAim(pad)) };
  }

  /**
   * В режиме без удерживания кнопка взаимодействия работает как переключатель:
   * это критично для сенсорного экрана, где палец нужен и для стика.
   */
  private resolveInteract(rawInteract: boolean, throwing: boolean, holdFree: boolean): boolean {
    if (!holdFree) {
      this.stickyInteract = false;
      this.previousInteractEdge = rawInteract;
      return rawInteract;
    }

    const pressed = rawInteract && !this.previousInteractEdge;
    this.previousInteractEdge = rawInteract;
    if (pressed) this.stickyInteract = !this.stickyInteract;
    // Бросок всегда снимает залипание: иначе персонаж «прилипает» к пустоте.
    if (throwing) this.stickyInteract = false;
    return this.stickyInteract || rawInteract;
  }

  private resolveAim(pad: Phaser.Input.Gamepad.Gamepad | undefined): number {
    if (this.touch.aim !== null) return this.touch.aim;
    if (pad) {
      const { x, y } = pad.rightStick;
      if (Math.hypot(x, y) > 0.3) return Math.atan2(y, x);
    }
    if (this.pointerAim !== null && !this.scene.input.activePointer.wasTouch) return this.pointerAim;
    return this.facing > 0 ? 0 : Math.PI;
  }

  /** Сбрасывает залипания — например, при открытии меню. */
  reset(): void {
    this.stickyInteract = false;
    this.previousInteractEdge = false;
    this.touch.axis = 0;
    this.touch.jump = false;
    this.touch.interact = false;
    this.touch.throwing = false;
    this.touch.crouch = false;
    this.touch.ping = false;
    this.touch.aim = null;
  }
}

function padButton(pad: Phaser.Input.Gamepad.Gamepad | undefined, index: number): boolean {
  if (!pad) return false;
  return pad.buttons[index]?.pressed === true;
}
