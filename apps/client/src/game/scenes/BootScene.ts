import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    document.body.dataset.scene = 'boot';
    this.scene.start('Preload');
  }
}
