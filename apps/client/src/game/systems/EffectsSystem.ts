import Phaser from 'phaser';

export class EffectsSystem {
  constructor(private readonly scene: Phaser.Scene) {}

  burst(x: number, y: number, color: number, count = 10): void {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fps = this.scene.game.loop.actualFps;
    const performanceScale = fps > 0 && fps < 50 ? 0.5 : 1;
    const particleCount = reducedMotion ? Math.min(4, count) : Math.max(3, Math.round(count * performanceScale));
    for (let index = 0; index < particleCount; index += 1) {
      const dot = this.scene.add.circle(x, y, Phaser.Math.Between(2, 6), color, 0.9).setDepth(70);
      const angle = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
      const distance = Phaser.Math.Between(28, 85);
      this.scene.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(260, 560),
        ease: 'Cubic.Out',
        onComplete: () => dot.destroy(),
      });
    }
  }

  pulse(target: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform, color = 0x33e6d1): void {
    const ring = this.scene.add.circle(target.x, target.y, 34).setStrokeStyle(4, color, 0.85).setDepth(65);
    this.scene.tweens.add({
      targets: ring,
      scale: 2.2,
      alpha: 0,
      duration: 480,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy(),
    });
  }
}
