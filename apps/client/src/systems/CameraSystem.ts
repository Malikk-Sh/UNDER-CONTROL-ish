/**
 * Камера (GDD §14.1).
 *
 * Следует за локальным игроком, плавно расширяется при расхождении команды и
 * никогда не уменьшает персонажей до нечитаемого размера — вместо этого
 * далёкие игроки обозначаются стрелками по краю экрана.
 */

import Phaser from 'phaser';
import { getSettings } from '../settings.js';

/** Ниже этого масштаба персонаж перестаёт читаться, поэтому камера не отъезжает дальше. */
const MIN_ZOOM = 0.62;
const MAX_ZOOM = 1.6;
/** Сколько мира по горизонтали хотим видеть при обычной игре, в пикселях. */
const COMFORT_WIDTH = 760;
const MAX_WIDTH = 1500;

export interface CameraTarget {
  x: number;
  y: number;
}

export class CameraSystem {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly scene: Phaser.Scene;
  private targetZoom = 1;
  private lookX = 0;
  private lookY = 0;
  private initialized = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.camera.setRoundPixels(true);
  }

  setBounds(width: number, height: number): void {
    this.camera.setBounds(0, 0, width, height);
    this.initialized = false;
  }

  /**
   * @param self позиция локального игрока
   * @param others позиции остальных активных игроков
   */
  update(self: CameraTarget, others: readonly CameraTarget[], deltaSeconds: number): void {
    const { width, height } = this.scene.scale;

    let minX = self.x;
    let maxX = self.x;
    let minY = self.y;
    let maxY = self.y;
    for (const other of others) {
      minX = Math.min(minX, other.x);
      maxX = Math.max(maxX, other.x);
      minY = Math.min(minY, other.y);
      maxY = Math.max(maxY, other.y);
    }

    const spreadX = maxX - minX;
    const spreadY = maxY - minY;
    const desiredWidth = Phaser.Math.Clamp(
      Math.max(COMFORT_WIDTH, spreadX * 1.35 + 320, (spreadY * 1.5 + 260) * (width / Math.max(1, height))),
      COMFORT_WIDTH,
      MAX_WIDTH,
    );

    this.targetZoom = Phaser.Math.Clamp(width / desiredWidth, MIN_ZOOM, MAX_ZOOM);

    // Камера тянется к локальному игроку, но смещается к центру команды —
    // так отстающие не пропадают мгновенно.
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const focusX = self.x * 0.68 + centerX * 0.32;
    const focusY = self.y * 0.72 + centerY * 0.28;

    if (!this.initialized) {
      this.lookX = focusX;
      this.lookY = focusY;
      this.camera.setZoom(this.targetZoom);
      this.initialized = true;
    }

    const follow = 1 - Math.pow(0.0016, deltaSeconds);
    this.lookX += (focusX - this.lookX) * follow;
    this.lookY += (focusY - this.lookY) * follow;

    const zoomFollow = 1 - Math.pow(0.06, deltaSeconds);
    this.camera.setZoom(this.camera.zoom + (this.targetZoom - this.camera.zoom) * zoomFollow);
    this.camera.centerOn(this.lookX, this.lookY - 24);
  }

  /** Тряска уважает настройку доступности: её можно полностью выключить. */
  shake(intensity: number, durationMs = 180): void {
    const scale = getSettings().screenShake;
    if (scale <= 0) return;
    this.camera.shake(durationMs, intensity * 0.006 * scale, true);
  }

  flash(color: number, alpha = 0.4): void {
    const scale = getSettings().flashes;
    if (scale <= 0) return;
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    this.camera.flash(160, r, g, b, false, undefined, alpha * scale);
  }

  /** Экранные координаты мировой точки — нужны для указателей и подсказок. */
  worldToScreen(x: number, y: number, out: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    const view = this.camera.worldView;
    out.set((x - view.x) * this.camera.zoom, (y - view.y) * this.camera.zoom);
    return out;
  }

  get zoom(): number {
    return this.camera.zoom;
  }

  get view(): Phaser.Geom.Rectangle {
    return this.camera.worldView;
  }
}
