import type { RoomDefinition } from '@under-control/shared';
import Phaser from 'phaser';
import type { CharacterController } from './CharacterController';

export class CameraSystem {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;

  constructor(scene: Phaser.Scene, room: RoomDefinition, player: CharacterController) {
    this.camera = scene.cameras.main;
    this.camera.setBounds(0, 0, room.bounds.width, room.bounds.height);
    this.camera.startFollow(player.rig, true, 0.09, 0.13, -80, 35);
    this.camera.setDeadzone(310, 190);
    this.camera.setZoom(1);
  }

  update(playerX: number): void {
    const targetZoom = playerX > 900 && playerX < 1_900 ? 0.96 : 1;
    this.camera.zoom = Phaser.Math.Linear(this.camera.zoom, targetZoom, 0.025);
  }

  shake(): void {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.camera.shake(150, 0.006);
  }
}
