import { GAME_BALANCE, selectInteractionTarget } from '@under-control/shared';
import type { InputFrame } from '@under-control/shared';
import type { CarrySystem } from './CarrySystem';
import type { CharacterController } from './CharacterController';

export class InteractionSystem {
  constructor(
    private readonly player: CharacterController,
    private readonly carry: CarrySystem,
  ) {}

  update(frame: InputFrame): void {
    if (this.player.isStunned) return;
    if (frame.throw) {
      this.carry.throw();
      return;
    }
    if (!frame.interact) return;
    const distance = Math.hypot(
      this.player.position.x - this.carry.position.x,
      this.player.position.y - this.carry.position.y,
    );
    const target = selectInteractionTarget(
      [{ id: 'battery-main', distance, kind: 'objective' }],
      GAME_BALANCE.player.interactionDistance,
    );
    if (this.carry.isHeld || target) this.carry.toggleGrab();
  }
}
