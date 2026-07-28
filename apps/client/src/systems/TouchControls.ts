/**
 * Сенсорное управление (GDD §14.2).
 *
 * Плавающий левый стик, крупные кнопки прыжка и взаимодействия, бросок второй
 * кнопкой либо свайпом от неё, кнопка пинга и подкат. Всё уважает safe-area и
 * рассчитано на ландшафтную ориентацию; раскладку можно отзеркалить для левшей.
 */

import Phaser from 'phaser';
import { getSettings } from '../settings.js';
import type { TouchInputState } from './InputSystem.js';

interface TouchButton {
  image: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  radius: number;
  pointerId: number | null;
  set: (pressed: boolean) => void;
  /** Кнопка поддерживает прицеливание свайпом. */
  aimable?: boolean;
}

export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Читает safe-area из CSS через служебный элемент: Phaser env() не понимает. */
export function readSafeArea(): SafeArea {
  if (typeof document === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
    'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const area: SafeArea = {
    top: Number.parseFloat(style.paddingTop) || 0,
    right: Number.parseFloat(style.paddingRight) || 0,
    bottom: Number.parseFloat(style.paddingBottom) || 0,
    left: Number.parseFloat(style.paddingLeft) || 0,
  };
  probe.remove();
  return area;
}

const STICK_RADIUS = 62;
const STICK_DEADZONE = 7;

export class TouchControls {
  private readonly scene: Phaser.Scene;
  private readonly state: TouchInputState;
  private readonly container: Phaser.GameObjects.Container;

  private stickBase!: Phaser.GameObjects.Image;
  private stickKnob!: Phaser.GameObjects.Image;
  private stickPointerId: number | null = null;
  private stickOriginX = 0;
  private stickOriginY = 0;

  private readonly buttons = new Map<string, TouchButton>();
  private safeArea: SafeArea;
  private enabled = true;

  constructor(scene: Phaser.Scene, state: TouchInputState) {
    this.scene = scene;
    this.state = state;
    this.safeArea = readSafeArea();
    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(900);

    // Больше одного касания: стик и кнопки должны работать одновременно.
    scene.input.addPointer(3);

    this.createStick();
    this.createButtons();
    this.layout();

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.container.destroy(true);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.container.setVisible(enabled);
    if (!enabled) this.releaseAll();
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible && this.enabled);
  }

  private createStick(): void {
    this.stickBase = this.scene.add.image(0, 0, 'ui_stick_base').setAlpha(0.5);
    this.stickKnob = this.scene.add.image(0, 0, 'ui_stick_knob').setAlpha(0.75);
    this.container.add([this.stickBase, this.stickKnob]);
    this.stickBase.setVisible(false);
    this.stickKnob.setVisible(false);
  }

  private createButtons(): void {
    this.addButton('jump', 'ui_button', 'ПРЫЖОК', (pressed) => {
      this.state.jump = pressed;
    });
    this.addButton('interact', 'ui_button', 'ВЗЯТЬ', (pressed) => {
      this.state.interact = pressed;
    });
    this.addButton(
      'throw',
      'ui_button_small',
      'БРОСОК',
      (pressed) => {
        this.state.throwing = pressed;
        if (!pressed) this.state.aim = null;
      },
      true,
    );
    this.addButton('ping', 'ui_button_small', 'МЕТКА', (pressed) => {
      this.state.ping = pressed;
    });
    this.addButton('crouch', 'ui_button_small', 'ПОДКАТ', (pressed) => {
      this.state.crouch = pressed;
    });
  }

  private addButton(
    key: string,
    texture: string,
    label: string,
    set: (pressed: boolean) => void,
    aimable = false,
  ): void {
    const image = this.scene.add.image(0, 0, texture).setAlpha(0.55);
    const text = this.scene.add
      .text(0, 0, label, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: '#e8eef7',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0.85);
    this.container.add([image, text]);
    this.buttons.set(key, {
      image,
      label: text,
      radius: image.width / 2,
      pointerId: null,
      set,
      aimable,
    });
  }

  /** Раскладка пересчитывается на каждый ресайз и поворот устройства. */
  layout = (): void => {
    this.safeArea = readSafeArea();
    const { width, height } = this.scene.scale;
    const settings = getSettings();
    const scale = settings.uiScale;
    const margin = 26 * scale;

    const left = this.safeArea.left + margin;
    const right = width - this.safeArea.right - margin;
    const bottom = height - this.safeArea.bottom - margin;

    // Левша меняет местами стик и кнопки.
    const actionSide = settings.leftHanded ? left : right;
    const direction = settings.leftHanded ? 1 : -1;

    for (const button of this.buttons.values()) {
      button.image.setScale(scale);
      button.radius = (button.image.width / 2) * scale;
      button.label.setScale(scale);
    }

    this.place('jump', actionSide, bottom - 58 * scale, scale);
    this.place('interact', actionSide + direction * 118 * scale, bottom - 24 * scale, scale);
    this.place('throw', actionSide + direction * 14 * scale, bottom - 168 * scale, scale);
    this.place('ping', actionSide + direction * 210 * scale, bottom - 116 * scale, scale);
    this.place('crouch', actionSide + direction * 214 * scale, bottom - 18 * scale, scale);

    this.stickBase.setScale(scale);
    this.stickKnob.setScale(scale);
  };

  private place(key: string, x: number, y: number, scale: number): void {
    const button = this.buttons.get(key);
    if (!button) return;
    button.image.setPosition(x, y);
    button.label.setPosition(x, y + 1 * scale);
  }

  private onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!this.enabled) return;

    const button = this.hitButton(pointer.x, pointer.y);
    if (button) {
      button.pointerId = pointer.id;
      button.set(true);
      button.image.setAlpha(0.85);
      return;
    }

    // Стик плавающий: он появляется там, где палец коснулся зоны движения.
    if (this.isMovementZone(pointer.x) && this.stickPointerId === null) {
      this.stickPointerId = pointer.id;
      this.stickOriginX = pointer.x;
      this.stickOriginY = pointer.y;
      this.stickBase.setPosition(pointer.x, pointer.y).setVisible(true);
      this.stickKnob.setPosition(pointer.x, pointer.y).setVisible(true);
    }
  };

  private onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.enabled) return;

    if (pointer.id === this.stickPointerId) {
      const dx = pointer.x - this.stickOriginX;
      const dy = pointer.y - this.stickOriginY;
      const clamped = Phaser.Math.Clamp(dx, -STICK_RADIUS, STICK_RADIUS);
      this.stickKnob.setPosition(
        this.stickOriginX + clamped,
        this.stickOriginY + Phaser.Math.Clamp(dy, -STICK_RADIUS, STICK_RADIUS),
      );
      this.state.axis = Math.abs(clamped) < STICK_DEADZONE ? 0 : clamped / STICK_RADIUS;
      // Свайп вниз по стику — подкат (GDD §5.1).
      this.state.crouch = dy > STICK_RADIUS * 0.7;
      return;
    }

    // Свайп от кнопки броска задаёт направление полёта.
    for (const button of this.buttons.values()) {
      if (button.pointerId !== pointer.id || !button.aimable) continue;
      const dx = pointer.x - button.image.x;
      const dy = pointer.y - button.image.y;
      this.state.aim = Math.hypot(dx, dy) > 26 ? Math.atan2(dy, dx) : null;
    }
  };

  private onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === this.stickPointerId) {
      this.stickPointerId = null;
      this.state.axis = 0;
      this.state.crouch = false;
      this.stickBase.setVisible(false);
      this.stickKnob.setVisible(false);
    }
    for (const button of this.buttons.values()) {
      if (button.pointerId !== pointer.id) continue;
      button.pointerId = null;
      button.set(false);
      button.image.setAlpha(0.55);
    }
  };

  private hitButton(x: number, y: number): TouchButton | null {
    let best: TouchButton | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const button of this.buttons.values()) {
      if (button.pointerId !== null) continue;
      const distance = Phaser.Math.Distance.Between(x, y, button.image.x, button.image.y);
      // Небольшой запас вокруг кнопки: помощь на краях из GDD §14.2.
      const reach = button.radius + (getSettings().touchAssist ? 16 : 4);
      if (distance <= reach && distance < bestDistance) {
        best = button;
        bestDistance = distance;
      }
    }
    return best;
  }

  private isMovementZone(x: number): boolean {
    const { width } = this.scene.scale;
    return getSettings().leftHanded ? x > width * 0.5 : x < width * 0.5;
  }

  private releaseAll(): void {
    this.stickPointerId = null;
    this.state.axis = 0;
    this.stickBase.setVisible(false);
    this.stickKnob.setVisible(false);
    for (const button of this.buttons.values()) {
      button.pointerId = null;
      button.set(false);
      button.image.setAlpha(0.55);
    }
  }
}
