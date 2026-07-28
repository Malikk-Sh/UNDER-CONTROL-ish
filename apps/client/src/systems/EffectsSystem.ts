/**
 * Визуальные эффекты: искры, пыль, брызги, всплывающий текст.
 *
 * Всё уважает настройки доступности (плотность частиц, вспышки) и лимит
 * качества — на слабом телефоне эффекты просто становятся реже, а не исчезают
 * совсем, чтобы обратная связь оставалась читаемой (GDD §14.3, §21).
 */

import Phaser from 'phaser';
import { particleScale } from '../settings.js';
import { PALETTE } from '../art/palette.js';

export class EffectsSystem {
  private readonly scene: Phaser.Scene;
  private readonly layer: Phaser.GameObjects.Container;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene;
    this.layer = scene.add.container(0, 0).setDepth(depth);
    this.createEmitters();
  }

  private createEmitters(): void {
    this.sparks = this.scene.add.particles(0, 0, 'fx_spark', {
      lifespan: { min: 220, max: 520 },
      speed: { min: 60, max: 230 },
      scale: { start: 1, end: 0 },
      gravityY: 620,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });

    this.smoke = this.scene.add.particles(0, 0, 'fx_smoke', {
      lifespan: { min: 420, max: 900 },
      speed: { min: 10, max: 60 },
      scale: { start: 0.5, end: 1.4 },
      alpha: { start: 0.5, end: 0 },
      gravityY: -40,
      emitting: false,
    });

    this.dust = this.scene.add.particles(0, 0, 'fx_smoke', {
      lifespan: { min: 200, max: 420 },
      speedX: { min: -70, max: 70 },
      speedY: { min: -50, max: -5 },
      scale: { start: 0.35, end: 0.9 },
      alpha: { start: 0.4, end: 0 },
      emitting: false,
    });

    this.layer.add([this.sparks, this.smoke, this.dust]);
  }

  setDepth(depth: number): void {
    this.layer.setDepth(depth);
  }

  private budget(count: number): number {
    return Math.max(1, Math.round(count * particleScale()));
  }

  burstSparks(x: number, y: number, count = 8, color = PALETTE.spark): void {
    this.sparks.setParticleTint(color);
    this.sparks.emitParticleAt(x, y, this.budget(count));
  }

  burstSmoke(x: number, y: number, count = 5, color = 0xffffff): void {
    this.smoke.setParticleTint(color);
    this.smoke.emitParticleAt(x, y, this.budget(count));
  }

  landingDust(x: number, y: number, speed: number): void {
    const count = Phaser.Math.Clamp(Math.round(speed / 140), 1, 7);
    this.dust.setParticleTint(0xc8d6ee);
    this.dust.emitParticleAt(x, y, this.budget(count));
  }

  splash(x: number, y: number): void {
    this.sparks.setParticleTint(PALETTE.waterLight);
    this.sparks.emitParticleAt(x, y, this.budget(10));
  }

  /** Всплывающая подпись — используется для урона, спасений и целей. */
  floatingText(x: number, y: number, text: string, color = PALETTE.paper): void {
    const label = this.scene.add
      .text(x, y, text, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: `#${color.toString(16).padStart(6, '0')}`,
        stroke: '#0d1017',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(this.layer.depth + 1);

    this.scene.tweens.add({
      targets: label,
      y: y - 42,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  /** Кольцо расходящейся волны — предупреждение о срабатывании опасности. */
  shockRing(x: number, y: number, color: number, radius = 90): void {
    if (particleScale() <= 0.2) return;
    const ring = this.scene.add
      .image(x, y, 'fx_ring')
      .setTint(color)
      .setAlpha(0.75)
      .setScale(0.2)
      .setDepth(this.layer.depth);
    this.scene.tweens.add({
      targets: ring,
      scale: radius / 32,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  destroy(): void {
    this.layer.destroy(true);
  }
}
