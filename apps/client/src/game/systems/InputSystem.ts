import type { InputFrame } from '@under-control/shared';
import Phaser from 'phaser';

type KeyMap = Record<'left' | 'right' | 'jump' | 'interact' | 'throw' | 'crouch', Phaser.Input.Keyboard.Key>;

export class InputSystem {
  private readonly keys?: KeyMap;
  private sequence = 0;
  private tick = 0;
  private moveX = 0;
  private crouchTouch = false;
  private jumpQueued = false;
  private interactQueued = false;
  private throwQueued = false;
  private joystickPointer: number | undefined;
  private readonly joystickBase: Phaser.GameObjects.Arc;
  private readonly joystickKnob: Phaser.GameObjects.Arc;
  private readonly touchObjects: Array<Phaser.GameObjects.Arc | Phaser.GameObjects.Text> = [];
  private readonly inputPlugin: Phaser.Input.InputPlugin;

  constructor(private readonly scene: Phaser.Scene) {
    this.inputPlugin = scene.input;
    if (scene.input.keyboard) {
      this.keys = scene.input.keyboard.addKeys({
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        jump: Phaser.Input.Keyboard.KeyCodes.SPACE,
        interact: Phaser.Input.Keyboard.KeyCodes.E,
        throw: Phaser.Input.Keyboard.KeyCodes.F,
        crouch: Phaser.Input.Keyboard.KeyCodes.S,
      }) as KeyMap;
    }

    const coarsePointer = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
    this.joystickBase = scene.add.circle(132, 586, 72, 0x0b1720, 0.58)
      .setStrokeStyle(3, 0x7d9aa6, 0.55)
      .setScrollFactor(0)
      .setDepth(1_000)
      .setInteractive();
    this.joystickKnob = scene.add.circle(132, 586, 31, 0x33e6d1, 0.62)
      .setStrokeStyle(2, 0xc6fff8, 0.8)
      .setScrollFactor(0)
      .setDepth(1_001);
    this.touchObjects.push(this.joystickBase, this.joystickKnob);

    this.joystickBase.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.joystickPointer = pointer.id;
      this.updateJoystick(pointer);
    });
    scene.input.on('pointermove', this.handlePointerMove);
    scene.input.on('pointerup', this.handlePointerUp);

    this.createButton(1_143, 590, 46, 0xffb000, '↥', () => { this.jumpQueued = true; });
    this.createButton(1_045, 622, 39, 0x33e6d1, 'E', () => { this.interactQueued = true; });
    this.createButton(1_220, 665, 34, 0xff567d, 'F', () => { this.throwQueued = true; });

    for (const object of this.touchObjects) object.setVisible(coarsePointer);
  }

  nextFrame(): InputFrame {
    const keys = this.keys;
    const keyboardMove = keys ? Number(keys.right.isDown) - Number(keys.left.isDown) : 0;
    const frame: InputFrame = {
      sequence: ++this.sequence,
      tick: ++this.tick,
      moveX: Phaser.Math.Clamp(Math.abs(keyboardMove) > 0 ? keyboardMove : this.moveX, -1, 1),
      jump: this.jumpQueued || Boolean(keys && Phaser.Input.Keyboard.JustDown(keys.jump)),
      interact: this.interactQueued || Boolean(keys && Phaser.Input.Keyboard.JustDown(keys.interact)),
      throw: this.throwQueued || Boolean(keys && Phaser.Input.Keyboard.JustDown(keys.throw)),
      crouch: this.crouchTouch || Boolean(keys?.crouch.isDown),
    };
    this.jumpQueued = false;
    this.interactQueued = false;
    this.throwQueued = false;
    return frame;
  }

  destroy(): void {
    this.inputPlugin.off('pointermove', this.handlePointerMove);
    this.inputPlugin.off('pointerup', this.handlePointerUp);
    for (const object of this.touchObjects) object.destroy();
  }

  private createButton(
    x: number,
    y: number,
    radius: number,
    color: number,
    label: string,
    action: () => void,
  ): void {
    const button = this.scene.add.circle(x, y, radius, color, 0.7)
      .setStrokeStyle(3, 0xffffff, 0.7)
      .setScrollFactor(0)
      .setDepth(1_000)
      .setInteractive();
    const text = this.scene.add.text(x, y, label, {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: `${Math.round(radius * 0.7)}px`,
      color: '#ffffff',
      stroke: '#101820',
      strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1_001);
    button.on('pointerdown', action);
    this.touchObjects.push(button, text);
  }

  private readonly handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === this.joystickPointer) this.updateJoystick(pointer);
  };

  private readonly handlePointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id !== this.joystickPointer) return;
    this.joystickPointer = undefined;
    this.moveX = 0;
    this.crouchTouch = false;
    this.joystickKnob.setPosition(132, 586);
  };

  private updateJoystick(pointer: Phaser.Input.Pointer): void {
    const dx = pointer.x - 132;
    const dy = pointer.y - 586;
    const length = Math.max(1, Math.hypot(dx, dy));
    const radius = Math.min(52, length);
    const nx = dx / length;
    const ny = dy / length;
    this.joystickKnob.setPosition(132 + nx * radius, 586 + ny * radius);
    this.moveX = Math.abs(dx) < 10 ? 0 : Phaser.Math.Clamp(dx / 48, -1, 1);
    this.crouchTouch = dy > 34;
  }
}
