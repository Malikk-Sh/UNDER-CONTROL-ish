/**
 * Загрузочная сцена.
 *
 * Загружать нечего: вся графика рисуется процедурно, а звук синтезируется.
 * Сцена нужна только чтобы сгенерировать текстуры до первого кадра и сообщить
 * приложению, что можно показывать меню.
 */

import Phaser from 'phaser';
import { generateAllTextures } from '../art/textures.js';

export class BootScene extends Phaser.Scene {
  static readonly KEY = 'boot';
  static readonly READY = 'boot:ready';

  constructor() {
    super(BootScene.KEY);
  }

  create(): void {
    generateAllTextures(this);
    this.game.events.emit(BootScene.READY);
    // Дальше сцена не нужна: игровая стартует после подключения к комнате.
    this.scene.stop();
  }
}
