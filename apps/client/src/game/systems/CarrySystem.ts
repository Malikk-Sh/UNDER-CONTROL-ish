import {
  advanceBatteryHeat,
  GAME_BALANCE,
  isOutsideRoom,
} from '@under-control/shared';
import type { BatteryThermalState, RoomDefinition, Vector2 } from '@under-control/shared';
import Phaser from 'phaser';
import { RU } from '../i18n/ru';
import type { CharacterController } from './CharacterController';
import type { EffectsSystem } from './EffectsSystem';
import type { SimulationBus } from './SimulationBus';

export class CarrySystem {
  readonly battery: Phaser.Physics.Matter.Sprite;
  readonly cart: Phaser.Physics.Matter.Sprite;
  private thermal: BatteryThermalState = { heat: 0.12, overheated: false };
  private held = false;
  private recovering = false;
  private delivered = false;
  private lastRecoveryPoint: Vector2;
  private activeCoolingZone: string | undefined;
  private status = '';
  private statusUntil = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly room: RoomDefinition,
    private readonly player: CharacterController,
    private readonly bus: SimulationBus,
    private readonly effects: EffectsSystem,
  ) {
    const item = room.items[0];
    if (!item) throw new Error('Factory room requires a battery item.');
    this.lastRecoveryPoint = { ...item.position };
    this.battery = scene.matter.add.sprite(item.position.x, item.position.y, 'battery')
      .setDisplaySize(94, 58)
      .setRectangle(82, 45, { chamfer: { radius: 8 } })
      .setFriction(0.08, 0.01, 0.02)
      .setBounce(0.08)
      .setDepth(19);
    this.battery.setData('entityId', item.id);

    this.cart = scene.matter.add.sprite(760, 590, 'cart')
      .setDisplaySize(150, 94)
      .setRectangle(140, 76, { chamfer: { radius: 10 } })
      .setFriction(0.08, 0.02, 0.035)
      .setFixedRotation()
      .setDepth(18);
    this.cart.setData('entityId', 'solo-cart-route');

    for (const zone of room.coolingZones) {
      scene.add.image(zone.x, zone.y + 3, 'cooling-station').setDisplaySize(zone.width, zone.height).setDepth(8);
      scene.add.ellipse(zone.x, 645, zone.width * 0.82, 18, 0x33e6d1, 0.18).setDepth(7);
    }
  }

  get heat(): number {
    return this.thermal.heat;
  }

  get isHeld(): boolean {
    return this.held;
  }

  get isRecovering(): boolean {
    return this.recovering;
  }

  get isDelivered(): boolean {
    return this.delivered;
  }

  get currentStatus(): string {
    return this.scene.time.now < this.statusUntil ? this.status : '';
  }

  get position(): Vector2 {
    return { x: this.battery.x, y: this.battery.y };
  }

  update(deltaMs: number): void {
    if (this.delivered || this.recovering) return;
    if (this.held) {
      const offsetX = this.player.facing * 58;
      this.battery.setPosition(this.player.position.x + offsetX, this.player.position.y - 23);
      this.battery.setAngle(this.player.facing * 7);
      this.battery.setVelocity(0, 0);
    }

    const zone = this.room.coolingZones.find((candidate) => (
      Math.abs(this.battery.x - candidate.x) <= candidate.width / 2 &&
      Math.abs(this.battery.y - candidate.y) <= candidate.height / 2
    ));
    const previousZone = this.activeCoolingZone;
    this.activeCoolingZone = zone?.id;
    if (zone) this.lastRecoveryPoint = { ...zone.recoveryPoint };
    if (zone && zone.id !== previousZone) {
      this.bus.emit({ type: 'item_cooled', itemId: 'battery-main', zoneId: zone.id });
      this.effects.burst(this.battery.x, this.battery.y, 0x65fff0, 8);
    }

    this.thermal = advanceBatteryHeat(
      this.thermal,
      deltaMs / 1_000,
      GAME_BALANCE.battery.heatPerSecond,
      GAME_BALANCE.battery.coolPerSecond,
      Boolean(zone),
    );
    this.applyHeatTint();

    if (this.thermal.overheated) this.beginRecovery('overheat');
    else if (isOutsideRoom(this.position, this.room.bounds.width, this.room.bounds.height)) {
      this.beginRecovery('out_of_bounds');
    }
  }

  canInteract(): boolean {
    if (this.recovering || this.delivered) return false;
    return Phaser.Math.Distance.Between(
      this.player.position.x,
      this.player.position.y,
      this.battery.x,
      this.battery.y,
    ) <= GAME_BALANCE.player.interactionDistance;
  }

  toggleGrab(): boolean {
    if (this.held) {
      this.release(false);
      return true;
    }
    if (!this.canInteract()) return false;
    this.held = true;
    this.player.setCarrying(true);
    this.battery.setSensor(true).setIgnoreGravity(true);
    this.battery.setVelocity(0, 0);
    this.bus.emit({ type: 'item_grabbed', itemId: 'battery-main' });
    this.effects.pulse(this.battery);
    return true;
  }

  throw(): boolean {
    if (!this.held) return false;
    this.release(true);
    return true;
  }

  applyConveyor(direction: number): void {
    if (this.held || this.recovering || this.delivered) return;
    const body = this.battery.body as MatterJS.BodyType;
    this.battery.setVelocityX(Phaser.Math.Clamp(body.velocity.x + direction * 0.12, -4.5, 4.5));
  }

  knockFromHazard(direction: number): void {
    if (this.delivered || this.recovering) return;
    if (this.held) this.release(false);
    this.battery.setVelocity(direction * 7, -5);
    this.effects.burst(this.battery.x, this.battery.y, 0xff567d, 12);
  }

  isInsideSocket(): boolean {
    const socket = this.room.socket;
    return (
      Math.abs(this.battery.x - socket.x) <= socket.width / 2 &&
      Math.abs(this.battery.y - socket.y) <= socket.height / 2
    );
  }

  lockIntoSocket(): void {
    if (this.delivered) return;
    if (this.held) this.release(false);
    this.delivered = true;
    this.battery.setPosition(this.room.socket.x, this.room.socket.y - 12);
    this.battery.setVelocity(0, 0).setStatic(true).setAngle(0).clearTint();
    this.effects.pulse(this.battery, 0x33e6d1);
  }

  forceSocketPosition(): void {
    if (this.held) this.release(false);
    this.battery.setPosition(this.room.socket.x, this.room.socket.y - 12);
    this.battery.setVelocity(0, 0);
  }

  private release(throwing: boolean): void {
    this.held = false;
    this.player.setCarrying(false);
    this.battery.setSensor(false).setIgnoreGravity(false);
    const impulse = throwing
      ? { x: this.player.facing * GAME_BALANCE.battery.throwVelocityX, y: GAME_BALANCE.battery.throwVelocityY }
      : { x: this.player.facing * 1.5, y: -0.5 };
    this.battery.setVelocity(impulse.x, impulse.y);
    if (throwing) this.bus.emit({ type: 'item_thrown', itemId: 'battery-main', impulse });
  }

  private beginRecovery(reason: 'overheat' | 'out_of_bounds'): void {
    if (this.recovering) return;
    if (this.held) this.release(false);
    this.recovering = true;
    this.status = reason === 'overheat' ? RU.overheated : RU.recovered;
    this.statusUntil = this.scene.time.now + GAME_BALANCE.battery.recoveryMs + 1_100;
    this.bus.emit({ type: 'item_recovered', itemId: 'battery-main', reason });
    this.effects.burst(this.battery.x, this.battery.y, 0xff3d71, 18);
    this.battery.setVisible(false).setStatic(true).setSensor(true);
    this.scene.time.delayedCall(GAME_BALANCE.battery.recoveryMs, () => {
      this.battery.setStatic(false).setSensor(false).setIgnoreGravity(false).setVisible(true);
      this.battery.setPosition(this.lastRecoveryPoint.x, this.lastRecoveryPoint.y);
      this.battery.setVelocity(0, 0).setAngle(0).clearTint();
      this.thermal = { heat: 0.18, overheated: false };
      this.recovering = false;
      this.effects.pulse(this.battery);
    });
  }

  private applyHeatTint(): void {
    if (this.thermal.heat > 0.82) this.battery.setTint(0xff4f63);
    else if (this.thermal.heat > 0.58) this.battery.setTint(0xffb000);
    else this.battery.clearTint();
  }
}
