import type { RoomDefinition } from '@under-control/shared';
import type { CharacterController } from './CharacterController';

export class RecoverySystem {
  private activeCheckpoint = 'checkpoint-start';

  constructor(
    private readonly room: RoomDefinition,
    private readonly player: CharacterController,
  ) {}

  update(): void {
    const mid = this.room.checkpoints.find(({ id }) => id === 'checkpoint-mid');
    if (mid && this.activeCheckpoint !== mid.id && this.player.position.x > mid.position.x - 100) {
      this.activeCheckpoint = mid.id;
      this.player.setCheckpoint(mid.id, mid.position);
    }
    if (this.player.position.y > this.room.bounds.height + 80) this.player.scheduleRespawn();
  }
}
