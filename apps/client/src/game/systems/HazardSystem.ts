import { GAME_BALANCE, getHazardPhase } from '@under-control/shared';
import type { HazardPhase, PressHazardDefinition, RoomDefinition } from '@under-control/shared';
import Phaser from 'phaser';
import type { CarrySystem } from './CarrySystem';
import type { CharacterController } from './CharacterController';
import type { EffectsSystem } from './EffectsSystem';
import type { SimulationBus } from './SimulationBus';

export class HazardSystem {
  private readonly press: Phaser.GameObjects.Image;
  private readonly warningLamp: Phaser.GameObjects.Arc;
  private readonly dangerZone: Phaser.GameObjects.Rectangle;
  private readonly definition: PressHazardDefinition;
  private phase: HazardPhase = 'recovery';
  private cycleIndex = -1;
  private batteryHitCycle = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    room: RoomDefinition,
    private readonly player: CharacterController,
    private readonly carry: CarrySystem,
    private readonly bus: SimulationBus,
    private readonly effects: EffectsSystem,
  ) {
    const definition = room.hazards[0];
    if (!definition) throw new Error('Factory room requires a press hazard.');
    this.definition = definition;
    this.press = scene.add.image(definition.x, 215, 'press-head').setDisplaySize(174, 145).setDepth(16);
    this.warningLamp = scene.add.circle(definition.x, 110, 14, 0x33e6d1, 0.8)
      .setStrokeStyle(5, 0x0b141a)
      .setDepth(17);
    this.dangerZone = scene.add.rectangle(definition.x, 642, definition.width, 18, 0xff3d71, 0.18)
      .setStrokeStyle(3, 0xff668a, 0.42)
      .setDepth(9);
    scene.add.text(definition.x, 135, 'ПРЕСС 07', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '18px',
      color: '#9eb0b8',
    }).setOrigin(0.5).setDepth(9);
  }

  get currentPhase(): HazardPhase {
    return this.phase;
  }

  update(elapsedMs: number): void {
    const timings = this.definition.timings;
    const cycleDuration = timings.warningMs + timings.activeMs + timings.recoveryMs;
    const nextCycleIndex = Math.floor(elapsedMs / cycleDuration);
    const state = getHazardPhase(elapsedMs, timings);
    if (state.phase !== this.phase || nextCycleIndex !== this.cycleIndex) {
      this.phase = state.phase;
      this.cycleIndex = nextCycleIndex;
      this.bus.emit({ type: 'hazard_phase', hazardId: this.definition.id, phase: state.phase });
    }

    if (state.phase === 'warning') {
      this.press.y = 215 + Math.sin(elapsedMs * 0.02) * 7;
      this.warningLamp.setFillStyle(state.progress > 0.55 ? 0xff3d71 : 0xffb000, 0.95);
      this.warningLamp.setScale(1 + Math.sin(elapsedMs * 0.025) * 0.22);
      this.dangerZone.setAlpha(0.2 + state.progress * 0.55);
    } else if (state.phase === 'active') {
      this.press.y = Phaser.Math.Linear(215, 550, Math.min(1, state.progress * 3.8));
      this.warningLamp.setFillStyle(0xff3d71, 1).setScale(1.35);
      this.dangerZone.setAlpha(0.95);
      this.applyHit();
    } else {
      this.press.y = Phaser.Math.Linear(550, 215, Phaser.Math.Easing.Cubic.Out(state.progress));
      this.warningLamp.setFillStyle(0x33e6d1, 0.75).setScale(1);
      this.dangerZone.setAlpha(0.16);
    }

    for (const conveyor of this.findConveyors()) {
      const direction = conveyor.direction ?? 0;
      if (this.insideConveyor(this.player.position.x, this.player.position.y, conveyor)) {
        this.player.addHorizontalVelocity(direction * GAME_BALANCE.conveyorVelocity * 0.08);
      }
      if (this.insideConveyor(this.carry.position.x, this.carry.position.y, conveyor)) {
        this.carry.applyConveyor(direction);
      }
    }
  }

  private applyHit(): void {
    const horizontal = Math.abs(this.player.position.x - this.definition.x) <= this.definition.width * 0.54;
    if (horizontal && this.player.position.y > 415) {
      const direction = this.player.position.x < this.definition.x ? -1 : 1;
      this.player.stun(this.definition.id, direction);
      this.effects.burst(this.player.position.x, this.player.position.y, 0xff3d71, 16);
    }

    const batteryHorizontal = Math.abs(this.carry.position.x - this.definition.x) <= this.definition.width * 0.56;
    if (batteryHorizontal && this.carry.position.y > 415 && this.batteryHitCycle !== this.cycleIndex) {
      this.batteryHitCycle = this.cycleIndex;
      this.carry.knockFromHazard(this.carry.position.x < this.definition.x ? -1 : 1);
    }
  }

  private findConveyors(): RoomDefinition['platforms'] {
    return (this.scene.registry.get('room') as RoomDefinition).platforms.filter(({ kind }) => kind === 'conveyor');
  }

  private insideConveyor(
    x: number,
    y: number,
    conveyor: RoomDefinition['platforms'][number],
  ): boolean {
    return Math.abs(x - conveyor.x) < conveyor.width / 2 && y > conveyor.y - 100 && y < conveyor.y + 20;
  }
}
