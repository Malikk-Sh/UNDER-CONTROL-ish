import { GAME_BALANCE, isBufferedJumpReady } from '@under-control/shared';
import type { InputFrame, Vector2 } from '@under-control/shared';
import Phaser from 'phaser';
import type { SimulationBus } from './SimulationBus';

interface CollisionPair {
  id: string;
  bodyA: MatterJS.BodyType;
  bodyB: MatterJS.BodyType;
}

interface CollisionEvent {
  pairs: CollisionPair[];
}

export class CharacterController {
  readonly physicsSprite: Phaser.Physics.Matter.Sprite;
  readonly rig: Phaser.GameObjects.Container;
  private readonly footSensor: MatterJS.BodyType;
  private readonly groundContacts = new Set<string>();
  private readonly bodyImage: Phaser.GameObjects.Image;
  private readonly helmet: Phaser.GameObjects.Image;
  private readonly leftArm: Phaser.GameObjects.Image;
  private readonly rightArm: Phaser.GameObjects.Image;
  private readonly matterWorld: Phaser.Physics.Matter.World;
  private checkpoint: Vector2;
  private checkpointId = 'checkpoint-start';
  private lastGroundedAt = 0;
  private jumpQueuedAt = Number.NEGATIVE_INFINITY;
  private stunnedUntil = 0;
  private respawning = false;
  private carrying = false;
  private elapsed = 0;
  facing = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    spawn: Vector2,
    private readonly bus: SimulationBus,
  ) {
    this.checkpoint = { ...spawn };
    this.matterWorld = scene.matter.world;
    const core = scene.matter.bodies.rectangle(spawn.x, spawn.y, 40, 62, {
      label: 'player-core',
      chamfer: { radius: 11 },
      friction: 0.02,
      frictionStatic: 0,
      frictionAir: 0.035,
      restitution: 0,
    });
    this.footSensor = scene.matter.bodies.rectangle(spawn.x, spawn.y + 35, 27, 8, {
      label: 'player-foot',
      isSensor: true,
    });
    const compound = scene.matter.body.create({
      parts: [core, this.footSensor],
      friction: 0.02,
      frictionStatic: 0,
      frictionAir: 0.035,
      restitution: 0,
    });

    this.physicsSprite = scene.matter.add.sprite(spawn.x, spawn.y, 'worker-body')
      .setExistingBody(compound)
      .setFixedRotation()
      .setAlpha(0)
      .setDepth(20);

    this.bodyImage = scene.add.image(0, 7, 'worker-body').setDisplaySize(62, 83);
    this.helmet = scene.add.image(0, -42, 'worker-helmet').setDisplaySize(73, 60);
    this.leftArm = scene.add.image(-30, 3, 'worker-arm').setDisplaySize(24, 58).setOrigin(0.5, 0.15);
    this.rightArm = scene.add.image(30, 3, 'worker-arm').setDisplaySize(24, 58).setOrigin(0.5, 0.15);
    this.rig = scene.add.container(spawn.x, spawn.y, [this.leftArm, this.rightArm, this.bodyImage, this.helmet])
      .setDepth(24);

    this.matterWorld.on('collisionstart', this.onCollisionStart);
    this.matterWorld.on('collisionend', this.onCollisionEnd);
  }

  get position(): Vector2 {
    return { x: this.physicsSprite.x, y: this.physicsSprite.y };
  }

  get velocity(): Vector2 {
    const body = this.physicsSprite.body as MatterJS.BodyType;
    return { x: body.velocity.x, y: body.velocity.y };
  }

  get isStunned(): boolean {
    return this.scene.time.now < this.stunnedUntil || this.respawning;
  }

  get isGrounded(): boolean {
    return this.groundContacts.size > 0;
  }

  setCarrying(carrying: boolean): void {
    this.carrying = carrying;
  }

  setCheckpoint(id: string, position: Vector2): void {
    this.checkpointId = id;
    this.checkpoint = { ...position };
  }

  update(frame: InputFrame, deltaMs: number): void {
    const now = this.scene.time.now;
    this.elapsed += deltaMs;
    if (this.isGrounded) this.lastGroundedAt = now;
    if (frame.jump) this.jumpQueuedAt = now;

    const body = this.physicsSprite.body as MatterJS.BodyType;
    if (!this.isStunned) {
      const maxVelocity = this.carrying
        ? GAME_BALANCE.player.heavyMoveVelocity
        : GAME_BALANCE.player.moveVelocity;
      const targetX = frame.moveX * maxVelocity;
      const nextX = Phaser.Math.Linear(body.velocity.x, targetX, this.isGrounded ? 0.32 : 0.16);
      this.physicsSprite.setVelocityX(nextX);
      if (Math.abs(frame.moveX) > 0.08) this.facing = Math.sign(frame.moveX);

      if (isBufferedJumpReady(
        now,
        this.lastGroundedAt,
        this.jumpQueuedAt,
        GAME_BALANCE.player.coyoteMs,
        GAME_BALANCE.player.jumpBufferMs,
      )) {
        this.physicsSprite.setVelocityY(GAME_BALANCE.player.jumpVelocity);
        this.groundContacts.clear();
        this.lastGroundedAt = Number.NEGATIVE_INFINITY;
        this.jumpQueuedAt = Number.NEGATIVE_INFINITY;
        this.bus.emit({ type: 'player_jumped', sequence: frame.sequence });
      }

      if (frame.crouch && this.isGrounded && Math.abs(body.velocity.x) > 1.5) {
        this.physicsSprite.setVelocityX(Phaser.Math.Clamp(body.velocity.x * 1.035, -7.4, 7.4));
      }
    } else {
      this.physicsSprite.setVelocityX(body.velocity.x * 0.92);
    }

    this.updateRig(frame.crouch);
  }

  addHorizontalVelocity(amount: number): void {
    if (this.isStunned) return;
    const body = this.physicsSprite.body as MatterJS.BodyType;
    this.physicsSprite.setVelocityX(Phaser.Math.Clamp(body.velocity.x + amount, -8.5, 8.5));
  }

  stun(sourceId: string, direction: number): void {
    if (this.isStunned) return;
    this.stunnedUntil = this.scene.time.now + GAME_BALANCE.player.stunMs;
    this.physicsSprite.setVelocity(direction * 8.5, -7.5);
    this.bus.emit({
      type: 'player_stunned',
      durationMs: GAME_BALANCE.player.stunMs,
      sourceId,
    });
  }

  scheduleRespawn(): void {
    if (this.respawning) return;
    this.respawning = true;
    this.rig.setAlpha(0.25);
    this.physicsSprite.setStatic(true);
    this.scene.time.delayedCall(GAME_BALANCE.player.respawnMs, () => {
      this.physicsSprite.setStatic(false);
      this.physicsSprite.setPosition(this.checkpoint.x, this.checkpoint.y);
      this.physicsSprite.setVelocity(0, 0);
      this.rig.setAlpha(1);
      this.respawning = false;
      this.stunnedUntil = 0;
      this.bus.emit({ type: 'player_recovered', checkpointId: this.checkpointId });
    });
  }

  destroy(): void {
    this.matterWorld.off('collisionstart', this.onCollisionStart);
    this.matterWorld.off('collisionend', this.onCollisionEnd);
    this.rig.destroy(true);
    this.physicsSprite.destroy();
  }

  private updateRig(crouching: boolean): void {
    const body = this.physicsSprite.body as MatterJS.BodyType;
    this.rig.setPosition(this.physicsSprite.x, this.physicsSprite.y + (crouching ? 8 : 0));
    this.rig.scaleX = this.facing;
    this.rig.scaleY = crouching ? 0.78 : 1;
    const speedLean = Phaser.Math.Clamp(body.velocity.x * 1.7, -10, 10) * this.facing;
    this.rig.setAngle(speedLean);
    const stride = Math.sin(this.elapsed * 0.02) * Math.min(20, Math.abs(body.velocity.x) * 4);
    const carryAngle = this.carrying ? -72 : stride;
    this.leftArm.setAngle(carryAngle);
    this.rightArm.setAngle(this.carrying ? -72 : -stride);
    this.helmet.y = -42 + Math.sin(this.elapsed * 0.012) * (this.isGrounded ? 1.5 : 0.5);
    this.rig.setAlpha(this.isStunned ? 0.74 + Math.sin(this.elapsed * 0.05) * 0.2 : 1);
  }

  private readonly onCollisionStart = (event: CollisionEvent): void => {
    for (const pair of event.pairs) this.updateGroundContact(pair, true);
  };

  private readonly onCollisionEnd = (event: CollisionEvent): void => {
    for (const pair of event.pairs) this.updateGroundContact(pair, false);
  };

  private updateGroundContact(pair: CollisionPair, entering: boolean): void {
    const footIsA = pair.bodyA === this.footSensor;
    const footIsB = pair.bodyB === this.footSensor;
    if (!footIsA && !footIsB) return;
    const other = footIsA ? pair.bodyB : pair.bodyA;
    if (other.isSensor) return;
    const key = `${pair.id}:${other.id}`;
    if (entering) this.groundContacts.add(key);
    else this.groundContacts.delete(key);
  }
}
