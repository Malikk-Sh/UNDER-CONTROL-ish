import type { RoomDefinition } from '@under-control/shared';
import type { CarrySystem } from './CarrySystem';
import type { EffectsSystem } from './EffectsSystem';
import type { SimulationBus } from './SimulationBus';

export class ObjectiveSystem {
  private stabilizationStartedAt?: number;
  private completed = false;

  constructor(
    private readonly room: RoomDefinition,
    private readonly carry: CarrySystem,
    private readonly bus: SimulationBus,
    private readonly effects: EffectsSystem,
    private readonly onComplete: (elapsedMs: number) => void,
  ) {}

  get progress(): number {
    if (this.completed) return 1;
    if (this.stabilizationStartedAt === undefined) return 0;
    return Math.min(1, (performance.now() - this.stabilizationStartedAt) / this.room.objective.stabilizationMs);
  }

  get isStabilizing(): boolean {
    return this.stabilizationStartedAt !== undefined && !this.completed;
  }

  update(elapsedMs: number): void {
    if (this.completed) return;
    if (this.stabilizationStartedAt === undefined && !this.carry.isHeld && this.carry.isInsideSocket()) {
      this.carry.lockIntoSocket();
      this.stabilizationStartedAt = performance.now();
      this.effects.burst(this.room.socket.x, this.room.socket.y, 0x33e6d1, 20);
    }
    if (
      this.stabilizationStartedAt !== undefined &&
      performance.now() - this.stabilizationStartedAt >= this.room.objective.stabilizationMs
    ) {
      this.completed = true;
      this.bus.emit({ type: 'objective_completed', roomId: this.room.id, elapsedMs });
      this.onComplete(elapsedMs);
    }
  }

  forceComplete(elapsedMs: number): void {
    if (this.completed) return;
    this.carry.forceSocketPosition();
    this.carry.lockIntoSocket();
    this.completed = true;
    this.bus.emit({ type: 'objective_completed', roomId: this.room.id, elapsedMs });
    this.onComplete(elapsedMs);
  }
}
