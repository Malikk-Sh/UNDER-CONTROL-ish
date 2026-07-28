import type Phaser from 'phaser';
import { RU } from '../i18n/ru';
import type { CarrySystem } from '../systems/CarrySystem';
import type { HazardSystem } from '../systems/HazardSystem';
import type { ObjectiveSystem } from '../systems/ObjectiveSystem';

export class Hud {
  private readonly heatFill: Phaser.GameObjects.Rectangle;
  private readonly heatLabel: Phaser.GameObjects.Text;
  private readonly objective: Phaser.GameObjects.Text;
  private readonly timer: Phaser.GameObjects.Text;
  private readonly status: Phaser.GameObjects.Text;
  private readonly stabilization: Phaser.GameObjects.Rectangle;

  constructor(private readonly scene: Phaser.Scene) {
    scene.add.rectangle(640, 48, 680, 68, 0x071017, 0.82)
      .setStrokeStyle(2, 0x3e5965, 0.72)
      .setScrollFactor(0)
      .setDepth(900);
    this.objective = scene.add.text(640, 33, RU.objectiveShort, {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '20px',
      color: '#f4f7fb',
      letterSpacing: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(901);

    scene.add.rectangle(640, 66, 340, 8, 0x263b45, 1).setScrollFactor(0).setDepth(901);
    this.stabilization = scene.add.rectangle(470, 66, 0, 8, 0x33e6d1, 1)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(902);

    scene.add.rectangle(185, 48, 265, 60, 0x071017, 0.78)
      .setStrokeStyle(2, 0x3e5965, 0.65)
      .setScrollFactor(0)
      .setDepth(900);
    scene.add.rectangle(100, 59, 145, 12, 0x293f49, 1).setOrigin(0, 0.5).setScrollFactor(0).setDepth(901);
    this.heatFill = scene.add.rectangle(100, 59, 0, 12, 0x33e6d1, 1)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(902);
    this.heatLabel = scene.add.text(100, 31, RU.batteryHeat, {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '15px',
      color: '#9fb4bd',
    }).setScrollFactor(0).setDepth(902);

    this.timer = scene.add.text(1_160, 48, '00:00', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '27px',
      color: '#ffcf54',
      stroke: '#071017',
      strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(902);

    this.status = scene.add.text(640, 116, '', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '21px',
      color: '#ff6b8a',
      backgroundColor: '#071017dd',
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(920).setAlpha(0);
  }

  update(elapsedMs: number, carry: CarrySystem, hazard: HazardSystem, objective: ObjectiveSystem): void {
    const seconds = Math.floor(elapsedMs / 1_000);
    this.timer.setText(`${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
    this.heatFill.width = 145 * carry.heat;
    const heatColor = carry.heat > 0.82 ? 0xff3d71 : carry.heat > 0.58 ? 0xffb000 : 0x33e6d1;
    this.heatFill.setFillStyle(heatColor);
    this.heatLabel.setText(carry.heat < 0.08 ? RU.cooling : RU.batteryHeat);

    this.stabilization.width = 340 * objective.progress;
    this.objective.setText(objective.isStabilizing ? RU.stabilization : RU.objectiveShort);

    const message = carry.currentStatus || (hazard.currentPhase === 'active' ? RU.danger : '');
    if (message) this.status.setText(message).setAlpha(1);
    else this.status.setAlpha(Math.max(0, this.status.alpha - 0.08));
  }
}
