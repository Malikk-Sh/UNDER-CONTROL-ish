import type {
  PhysicsAdapter,
  PhysicsBodyHandle,
  PhysicsBodySnapshot,
  Vector2,
} from '@under-control/shared';
import type Phaser from 'phaser';

export class PhaserMatterAdapter implements PhysicsAdapter {
  private readonly bodies = new Map<number, MatterJS.BodyType>();

  constructor(private readonly scene: Phaser.Scene) {}

  createDynamicBody(id: string, position: Vector2, size: Vector2): PhysicsBodyHandle {
    const body = this.scene.matter.add.rectangle(position.x, position.y, size.x, size.y, { label: id });
    this.bodies.set(body.id, body);
    return { id: body.id };
  }

  createStaticBody(id: string, position: Vector2, size: Vector2): PhysicsBodyHandle {
    const body = this.scene.matter.add.rectangle(position.x, position.y, size.x, size.y, {
      isStatic: true,
      label: id,
      friction: 0.8,
    });
    this.bodies.set(body.id, body);
    return { id: body.id };
  }

  setPosition(handle: PhysicsBodyHandle, position: Vector2): void {
    const body = this.requireBody(handle);
    this.scene.matter.body.setPosition(body, position);
  }

  applyImpulse(handle: PhysicsBodyHandle, impulse: Vector2): void {
    const body = this.requireBody(handle);
    this.scene.matter.body.setVelocity(body, {
      x: body.velocity.x + impulse.x,
      y: body.velocity.y + impulse.y,
    });
  }

  queryArea(center: Vector2, size: Vector2): readonly PhysicsBodyHandle[] {
    const bounds = {
      min: { x: center.x - size.x / 2, y: center.y - size.y / 2 },
      max: { x: center.x + size.x / 2, y: center.y + size.y / 2 },
    };
    return this.scene.matter.query.region([...this.bodies.values()], bounds).map((body) => ({ id: body.id }));
  }

  step(): void {
    // Phaser owns the Matter world step. This adapter keeps the simulation API
    // compatible with the future headless authoritative implementation.
  }

  snapshot(): readonly PhysicsBodySnapshot[] {
    return [...this.bodies.values()].map((body) => ({
      id: body.id,
      position: { x: body.position.x, y: body.position.y },
      velocity: { x: body.velocity.x, y: body.velocity.y },
      angle: body.angle,
    }));
  }

  private requireBody(handle: PhysicsBodyHandle): MatterJS.BodyType {
    const body = this.bodies.get(handle.id);
    if (!body) throw new Error(`Unknown physics body ${handle.id}`);
    return body;
  }
}
