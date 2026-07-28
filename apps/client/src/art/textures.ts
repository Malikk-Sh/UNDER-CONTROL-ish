/**
 * Процедурная генерация всей графики.
 *
 * В проекте нет ни одного внешнего файла спрайта: все текстуры рисуются в
 * Canvas при загрузке и кладутся в кеш Phaser. Это даёт мгновенный старт
 * (нечего скачивать), одинаковый вид на всех устройствах и возможность
 * менять палитру в одном месте.
 *
 * Силуэты нарочно крупные и различимые по форме — опасное читается ещё до
 * цвета (GDD §15.1), а значок игрока дублирует цвет для дальтоников (§14.3).
 */

import Phaser from 'phaser';
import { PLAYER_BADGES, TILE } from '@uc/shared';
import { PALETTE } from './palette.js';

type Draw = (g: Phaser.GameObjects.Graphics) => void;

function bake(scene: Phaser.Scene, key: string, width: number, height: number, draw: Draw): void {
  if (scene.textures.exists(key)) return;
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(graphics);
  graphics.generateTexture(key, width, height);
  graphics.destroy();
}

/** Заклёпки по углам — быстрый способ сделать поверхность «промышленной». */
function rivets(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number): void {
  g.fillStyle(color, 1);
  const inset = 4;
  g.fillCircle(x + inset, y + inset, 1.4);
  g.fillCircle(x + w - inset, y + inset, 1.4);
  g.fillCircle(x + inset, y + h - inset, 1.4);
  g.fillCircle(x + w - inset, y + h - inset, 1.4);
}

export function generateAllTextures(scene: Phaser.Scene): void {
  generateTileTextures(scene);
  generateWorkerTextures(scene);
  generateItemTextures(scene);
  generateDeviceTextures(scene);
  generateEffectTextures(scene);
  generateUiTextures(scene);
  generateBadgeTextures(scene);
}

// --------------------------------------------------------------------- тайлы

function generateTileTextures(scene: Phaser.Scene): void {
  bake(scene, 'tile_solid', TILE, TILE, (g) => {
    g.fillStyle(PALETTE.steel, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(PALETTE.steelDark, 1);
    g.fillRect(0, TILE - 5, TILE, 5);
    g.fillRect(TILE - 4, 0, 4, TILE);
    g.lineStyle(1, PALETTE.steelLight, 0.35);
    g.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
    rivets(g, 0, 0, TILE, TILE, PALETTE.steelLight);
  });

  // Верхний тайл получает светлую кромку — так пол читается одним взглядом.
  bake(scene, 'tile_solid_top', TILE, TILE, (g) => {
    g.fillStyle(PALETTE.steel, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(PALETTE.steelLight, 1);
    g.fillRect(0, 0, TILE, 4);
    g.fillStyle(PALETTE.steelEdge, 1);
    g.fillRect(0, 0, TILE, 2);
    g.fillStyle(PALETTE.steelDark, 1);
    g.fillRect(0, TILE - 5, TILE, 5);
    rivets(g, 0, 0, TILE, TILE, PALETTE.steelLight);
  });

  bake(scene, 'tile_ice', TILE, TILE, (g) => {
    g.fillStyle(PALETTE.ice, 0.85);
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(0xffffff, 0.45);
    g.fillRect(0, 0, TILE, 5);
    g.lineStyle(1, 0xffffff, 0.3);
    g.lineBetween(4, TILE, 14, 6);
    g.lineBetween(18, TILE, 27, 10);
  });

  bake(scene, 'tile_oneway', TILE, 10, (g) => {
    g.fillStyle(PALETTE.metalDark, 1);
    g.fillRect(0, 4, TILE, 6);
    g.fillStyle(PALETTE.metal, 1);
    g.fillRect(0, 0, TILE, 5);
    g.fillStyle(PALETTE.steelDark, 1);
    for (let x = 2; x < TILE; x += 8) g.fillRect(x, 5, 4, 4);
  });

  bake(scene, 'tile_water', TILE, TILE, (g) => {
    g.fillStyle(PALETTE.water, 0.5);
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(PALETTE.waterLight, 0.22);
    g.fillRect(0, 6, TILE, 3);
    g.fillRect(0, 20, TILE, 2);
  });

  bake(scene, 'tile_lethal', TILE, TILE, (g) => {
    g.fillStyle(PALETTE.acidDark, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(PALETTE.acid, 0.75);
    g.fillRect(0, 0, TILE, 8);
    g.fillStyle(PALETTE.acid, 0.4);
    g.fillCircle(8, 16, 4);
    g.fillCircle(22, 22, 3);
  });

  // Косая жёлто-чёрная разметка — универсальный знак «здесь опасно».
  bake(scene, 'hazard_stripe', TILE, TILE, (g) => {
    g.fillStyle(PALETTE.ink, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(PALETTE.accent, 1);
    for (let i = -TILE; i < TILE * 2; i += 16) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 8, 0);
      g.lineTo(i + 8 - TILE, TILE);
      g.lineTo(i - TILE, TILE);
      g.closePath();
      g.fillPath();
    }
  });
}

// ------------------------------------------------------------------ персонаж

const WORKER_W = 34;
const WORKER_H = 46;

function generateWorkerTextures(scene: Phaser.Scene): void {
  // Белая основа: тонируется цветом игрока во время рендера.
  bake(scene, 'worker_base', WORKER_W, WORKER_H, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(4, 16, 26, 22, 7);
    g.fillRoundedRect(2, 2, 30, 17, 8);
    g.fillStyle(0xd8d8d8, 1);
    g.fillRoundedRect(4, 30, 26, 8, 5);
    g.fillRect(2, 16, 30, 3);
  });

  // Тёмные детали поверх: визор, ремень, ботинки. Не тонируются.
  bake(scene, 'worker_detail', WORKER_W, WORKER_H, (g) => {
    g.fillStyle(0x1a2130, 1);
    g.fillRoundedRect(6, 7, 22, 9, 4);
    g.fillStyle(0x4fd2ff, 0.85);
    g.fillRoundedRect(8, 8.5, 18, 5, 2.5);
    g.fillStyle(0x1a2130, 0.9);
    g.fillRect(4, 26, 26, 4);
    g.fillStyle(PALETTE.accent, 1);
    g.fillRect(14, 26, 6, 4);
    g.fillStyle(0x141a26, 1);
    g.fillRoundedRect(4, 38, 11, 7, 3);
    g.fillRoundedRect(19, 38, 11, 7, 3);
  });

  bake(scene, 'worker_arm', 9, 18, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, 0, 9, 18, 4);
  });

  // Лежащий персонаж: отдельный силуэт читается лучше повёрнутого спрайта.
  bake(scene, 'worker_downed', WORKER_H, WORKER_W, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(10, 12, 30, 20, 8);
    g.fillRoundedRect(0, 10, 18, 18, 8);
    g.fillStyle(0x1a2130, 1);
    g.fillRoundedRect(3, 15, 12, 8, 4);
  });

  bake(scene, 'shadow', 40, 14, (g) => {
    g.fillStyle(0x000000, 0.32);
    g.fillEllipse(20, 7, 38, 12);
  });
}

// ------------------------------------------------------------------ предметы

function generateItemTextures(scene: Phaser.Scene): void {
  bake(scene, 'item_crate', 32, 32, (g) => {
    g.fillStyle(0x9a6b3a, 1);
    g.fillRoundedRect(0, 0, 32, 32, 3);
    g.fillStyle(0xb98249, 1);
    g.fillRect(2, 2, 28, 28);
    g.lineStyle(3, 0x7d5327, 1);
    g.lineBetween(2, 2, 30, 30);
    g.lineBetween(30, 2, 2, 30);
    g.strokeRect(2, 2, 28, 28);
  });

  bake(scene, 'item_battery', 36, 42, (g) => {
    g.fillStyle(PALETTE.steelDark, 1);
    g.fillRoundedRect(1, 6, 34, 34, 4);
    g.fillStyle(PALETTE.steelLight, 1);
    g.fillRect(3, 8, 30, 8);
    g.fillStyle(PALETTE.accent, 1);
    g.fillRect(6, 0, 7, 8);
    g.fillRect(23, 0, 7, 8);
    g.fillStyle(PALETTE.ok, 1);
    g.fillRect(6, 24, 24, 5);
    g.fillStyle(PALETTE.ink, 1);
    g.fillRect(6, 32, 24, 4);
  });

  // Реакторный элемент: ядро отдельной текстурой, чтобы менять его яркость.
  bake(scene, 'item_cell', 34, 46, (g) => {
    g.fillStyle(PALETTE.steelDark, 1);
    g.fillRoundedRect(2, 2, 30, 42, 8);
    g.fillStyle(PALETTE.metalDark, 1);
    g.fillRect(0, 8, 34, 5);
    g.fillRect(0, 33, 34, 5);
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(9, 15, 16, 16, 5);
  });
  bake(scene, 'item_cell_core', 22, 22, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(11, 11, 7);
    g.fillStyle(0xffffff, 0.4);
    g.fillCircle(11, 11, 11);
  });

  bake(scene, 'item_parcel', 40, 36, (g) => {
    g.fillStyle(0xc9a06a, 1);
    g.fillRoundedRect(0, 0, 40, 36, 3);
    g.fillStyle(0xb08a56, 1);
    g.fillRect(16, 0, 8, 36);
    g.fillStyle(PALETTE.danger, 1);
    g.fillRect(3, 24, 34, 6);
    g.fillStyle(PALETTE.paper, 1);
    for (let x = 4; x < 36; x += 8) {
      g.fillTriangle(x, 29, x + 4, 25, x + 8, 29);
    }
  });

  bake(scene, 'item_fuse', 22, 28, (g) => {
    g.fillStyle(PALETTE.metal, 1);
    g.fillRect(4, 0, 14, 6);
    g.fillRect(4, 22, 14, 6);
    g.fillStyle(0x9fd8ff, 0.85);
    g.fillRoundedRect(3, 5, 16, 18, 4);
    g.fillStyle(PALETTE.accent, 1);
    g.fillRect(10, 7, 2, 14);
  });

  bake(scene, 'item_extinguisher', 24, 36, (g) => {
    g.fillStyle(PALETTE.danger, 1);
    g.fillRoundedRect(2, 6, 20, 30, 7);
    g.fillStyle(PALETTE.dangerDark, 1);
    g.fillRect(2, 20, 20, 4);
    g.fillStyle(PALETTE.metal, 1);
    g.fillRect(9, 0, 6, 8);
    g.fillRect(14, 2, 8, 4);
  });

  bake(scene, 'item_wrench', 34, 16, (g) => {
    g.fillStyle(PALETTE.metal, 1);
    g.fillRoundedRect(6, 5, 24, 6, 3);
    g.fillCircle(6, 8, 7);
    g.fillCircle(30, 8, 6);
    g.fillStyle(PALETTE.steelDark, 1);
    g.fillCircle(6, 8, 3.4);
    g.fillCircle(30, 8, 2.8);
  });

  bake(scene, 'item_gloves', 26, 22, (g) => {
    g.fillStyle(PALETTE.accent, 1);
    g.fillRoundedRect(0, 6, 26, 14, 5);
    g.fillRoundedRect(3, 0, 8, 10, 4);
    g.fillRoundedRect(13, 1, 7, 9, 3.5);
    g.fillStyle(PALETTE.accentDark, 1);
    g.fillRect(0, 16, 26, 4);
  });

  bake(scene, 'item_flare', 18, 28, (g) => {
    g.fillStyle(PALETTE.danger, 1);
    g.fillRoundedRect(4, 4, 10, 24, 3);
    g.fillStyle(PALETTE.paper, 1);
    g.fillRect(4, 10, 10, 3);
    g.fillStyle(PALETTE.accent, 1);
    g.fillTriangle(9, 0, 3, 6, 15, 6);
  });
}

// ---------------------------------------------------------------- устройства

function generateDeviceTextures(scene: Phaser.Scene): void {
  bake(scene, 'dev_plate', TILE, 14, (g) => {
    g.fillStyle(PALETTE.steelDark, 1);
    g.fillRect(0, 8, TILE, 6);
    g.fillStyle(PALETTE.metalDark, 1);
    g.fillRoundedRect(1, 1, TILE - 2, 8, 3);
    g.fillStyle(PALETTE.accent, 0.5);
    g.fillRect(4, 2, TILE - 8, 2);
  });
  bake(scene, 'dev_plate_on', TILE, 14, (g) => {
    g.fillStyle(PALETTE.steelDark, 1);
    g.fillRect(0, 8, TILE, 6);
    g.fillStyle(PALETTE.ok, 1);
    g.fillRoundedRect(1, 5, TILE - 2, 6, 3);
  });

  bake(scene, 'dev_lever', TILE, TILE, (g) => {
    g.fillStyle(PALETTE.steelDark, 1);
    g.fillRoundedRect(6, 20, 20, 12, 4);
    g.fillStyle(PALETTE.metalDark, 1);
    g.fillRect(14, 6, 4, 16);
    g.fillStyle(PALETTE.danger, 1);
    g.fillCircle(16, 6, 6);
  });

  bake(scene, 'dev_valve', TILE, TILE, (g) => {
    g.fillStyle(PALETTE.steelDark, 1);
    g.fillCircle(16, 16, 13);
    g.lineStyle(4, PALETTE.metal, 1);
    g.strokeCircle(16, 16, 10);
    g.lineBetween(16, 5, 16, 27);
    g.lineBetween(5, 16, 27, 16);
    g.fillStyle(PALETTE.accent, 1);
    g.fillCircle(16, 16, 4);
  });

  bake(scene, 'dev_node', TILE, TILE, (g) => {
    g.fillStyle(PALETTE.steelDark, 1);
    g.fillRoundedRect(2, 4, 28, 24, 4);
    g.fillStyle(PALETTE.ink, 1);
    g.fillRect(6, 8, 20, 12);
    g.fillStyle(PALETTE.metal, 1);
    g.fillRect(8, 10, 5, 8);
    g.fillRect(15, 10, 5, 8);
    g.fillRect(22, 12, 2, 6);
    rivets(g, 2, 4, 28, 24, PALETTE.steelLight);
  });

  // Лента бесшовно повторяется по горизонтали.
  bake(scene, 'dev_belt', TILE, TILE, (g) => {
    g.fillStyle(PALETTE.steelDark, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(PALETTE.ink, 1);
    g.fillRect(0, 2, TILE, 12);
    g.fillStyle(PALETTE.metalDark, 1);
    for (let x = 0; x < TILE; x += 8) g.fillRect(x + 2, 4, 4, 8);
    g.fillStyle(PALETTE.steelLight, 1);
    g.fillRect(0, 14, TILE, 3);
    g.fillStyle(PALETTE.steelDark, 1);
    g.fillRect(0, 17, TILE, TILE - 17);
  });

  bake(scene, 'dev_press_head', TILE, TILE, (g) => {
    g.fillStyle(PALETTE.metalDark, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(PALETTE.metal, 1);
    g.fillRect(0, 0, TILE, 6);
    g.fillStyle(PALETTE.ink, 1);
    for (let x = 0; x < TILE; x += 16) g.fillTriangle(x, TILE, x + 8, TILE - 8, x + 16, TILE);
  });

  bake(scene, 'dev_press_column', 16, TILE, (g) => {
    g.fillStyle(PALETTE.steelDark, 1);
    g.fillRect(0, 0, 16, TILE);
    g.fillStyle(PALETTE.metalDark, 1);
    g.fillRect(3, 0, 10, TILE);
    g.fillStyle(PALETTE.steelLight, 0.5);
    g.fillRect(5, 0, 2, TILE);
  });

  bake(scene, 'dev_door', TILE, TILE, (g) => {
    g.fillStyle(PALETTE.steel, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(PALETTE.steelDark, 1);
    g.fillRect(2, 2, TILE - 4, TILE - 4);
    g.fillStyle(PALETTE.accent, 0.55);
    g.fillRect(4, TILE / 2 - 2, TILE - 8, 4);
    rivets(g, 0, 0, TILE, TILE, PALETTE.steelLight);
  });

  bake(scene, 'dev_cooler', TILE, TILE, (g) => {
    g.fillStyle(PALETTE.steelDark, 0.85);
    g.fillRoundedRect(0, 0, TILE, TILE, 4);
    g.fillStyle(PALETTE.cold, 0.5);
    g.fillRect(4, 4, TILE - 8, TILE - 8);
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(10, 12, 3);
    g.fillCircle(22, 20, 2.5);
  });

  bake(scene, 'dev_cart', 78, 44, (g) => {
    g.fillStyle(PALETTE.metalDark, 1);
    g.fillRoundedRect(0, 4, 78, 16, 4);
    g.fillStyle(PALETTE.metal, 1);
    g.fillRect(2, 6, 74, 5);
    g.fillStyle(PALETTE.steelDark, 1);
    g.fillRect(6, 20, 66, 8);
    g.fillStyle(PALETTE.ink, 1);
    g.fillCircle(16, 34, 9);
    g.fillCircle(62, 34, 9);
    g.fillStyle(PALETTE.metal, 1);
    g.fillCircle(16, 34, 3.5);
    g.fillCircle(62, 34, 3.5);
  });

  bake(scene, 'dev_lift', TILE, 18, (g) => {
    g.fillStyle(PALETTE.metalDark, 1);
    g.fillRect(0, 4, TILE, 10);
    g.fillStyle(PALETTE.accent, 1);
    g.fillRect(0, 0, TILE, 4);
    g.fillStyle(PALETTE.ink, 1);
    for (let x = 2; x < TILE; x += 10) g.fillRect(x, 6, 5, 6);
  });

  bake(scene, 'dev_magnet', 56, 56, (g) => {
    g.fillStyle(PALETTE.steelDark, 1);
    g.fillRoundedRect(6, 2, 44, 22, 6);
    g.fillStyle(PALETTE.danger, 1);
    g.fillRoundedRect(8, 22, 14, 18, 4);
    g.fillStyle(0x4f8cff, 1);
    g.fillRoundedRect(34, 22, 14, 18, 4);
    g.fillStyle(PALETTE.metal, 1);
    g.fillRect(22, 0, 12, 6);
  });

  bake(scene, 'dev_exit', TILE, TILE, (g) => {
    g.fillStyle(PALETTE.ok, 0.22);
    g.fillRect(0, 0, TILE, TILE);
    g.lineStyle(2, PALETTE.ok, 0.8);
    g.strokeRect(1, 1, TILE - 2, TILE - 2);
  });

  bake(scene, 'dev_jet', TILE, TILE, (g) => {
    g.fillStyle(0xffffff, 0.55);
    g.fillEllipse(16, 22, 22, 18);
    g.fillStyle(0xffffff, 0.3);
    g.fillEllipse(16, 10, 26, 16);
  });
}

// ------------------------------------------------------------------ эффекты

function generateEffectTextures(scene: Phaser.Scene): void {
  bake(scene, 'fx_spark', 10, 10, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(5, 5, 2.6);
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(5, 5, 5);
  });

  bake(scene, 'fx_smoke', 24, 24, (g) => {
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(12, 12, 9);
    g.fillStyle(0xffffff, 0.18);
    g.fillCircle(12, 12, 12);
  });

  bake(scene, 'fx_glow', 96, 96, (g) => {
    for (let r = 48; r > 0; r -= 4) {
      g.fillStyle(0xffffff, 0.035);
      g.fillCircle(48, 48, r);
    }
  });

  bake(scene, 'fx_ring', 64, 64, (g) => {
    g.lineStyle(3, 0xffffff, 1);
    g.strokeCircle(32, 32, 28);
  });

  bake(scene, 'fx_arrow', 26, 26, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(13, 1, 25, 21, 1, 21);
  });

  bake(scene, 'fx_bubble', 10, 10, (g) => {
    g.lineStyle(1.5, 0xffffff, 0.75);
    g.strokeCircle(5, 5, 3.2);
  });

  bake(scene, 'ping_help', 30, 30, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(12, 4, 6, 14, 3);
    g.fillCircle(15, 23, 3.4);
  });
  bake(scene, 'ping_here', 30, 30, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(15, 26, 5, 8, 25, 8);
    g.fillCircle(15, 8, 5);
  });
  bake(scene, 'ping_danger', 30, 30, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(15, 3, 28, 26, 2, 26);
    g.fillStyle(PALETTE.ink, 1);
    g.fillRect(13, 11, 4, 8);
    g.fillRect(13, 21, 4, 3);
  });
  bake(scene, 'ping_ready', 30, 30, (g) => {
    g.lineStyle(5, 0xffffff, 1);
    g.lineBetween(6, 15, 13, 22);
    g.lineBetween(13, 22, 25, 7);
  });
}

// ---------------------------------------------------------------- интерфейс

function generateUiTextures(scene: Phaser.Scene): void {
  bake(scene, 'ui_stick_base', 148, 148, (g) => {
    g.fillStyle(0xffffff, 0.09);
    g.fillCircle(74, 74, 70);
    g.lineStyle(3, 0xffffff, 0.24);
    g.strokeCircle(74, 74, 70);
    g.lineStyle(2, 0xffffff, 0.12);
    g.strokeCircle(74, 74, 34);
  });

  bake(scene, 'ui_stick_knob', 78, 78, (g) => {
    g.fillStyle(0xffffff, 0.28);
    g.fillCircle(39, 39, 34);
    g.lineStyle(3, 0xffffff, 0.5);
    g.strokeCircle(39, 39, 34);
  });

  bake(scene, 'ui_button', 116, 116, (g) => {
    g.fillStyle(0xffffff, 0.16);
    g.fillCircle(58, 58, 54);
    g.lineStyle(4, 0xffffff, 0.42);
    g.strokeCircle(58, 58, 54);
  });

  bake(scene, 'ui_button_small', 88, 88, (g) => {
    g.fillStyle(0xffffff, 0.14);
    g.fillCircle(44, 44, 40);
    g.lineStyle(3, 0xffffff, 0.36);
    g.strokeCircle(44, 44, 40);
  });

  bake(scene, 'ui_panel', 24, 24, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, 0, 24, 24, 8);
  });

  bake(scene, 'ui_pixel', 4, 4, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 4, 4);
  });
}

// -------------------------------------------------------------------- значки

/**
 * Значок игрока — вторая, не цветовая метка. Цвет всегда дублируется формой
 * (GDD §14.3), поэтому команда различима и при дальтонизме.
 */
function generateBadgeTextures(scene: Phaser.Scene): void {
  const size = 20;
  const half = size / 2;

  const shapes: Record<string, Draw> = {
    circle: (g) => g.fillCircle(half, half, 7),
    square: (g) => g.fillRect(3, 3, 14, 14),
    triangle: (g) => g.fillTriangle(half, 2, 18, 17, 2, 17),
    diamond: (g) => g.fillPoints([
      new Phaser.Geom.Point(half, 1),
      new Phaser.Geom.Point(19, half),
      new Phaser.Geom.Point(half, 19),
      new Phaser.Geom.Point(1, half),
    ], true),
    cross: (g) => {
      g.fillRect(7, 2, 6, 16);
      g.fillRect(2, 7, 16, 6);
    },
    star: (g) => {
      g.fillTriangle(half, 1, 18, 14, 2, 14);
      g.fillTriangle(half, 19, 18, 6, 2, 6);
    },
    hex: (g) => g.fillPoints([
      new Phaser.Geom.Point(6, 2),
      new Phaser.Geom.Point(14, 2),
      new Phaser.Geom.Point(18, half),
      new Phaser.Geom.Point(14, 18),
      new Phaser.Geom.Point(6, 18),
      new Phaser.Geom.Point(2, half),
    ], true),
    drop: (g) => {
      g.fillCircle(half, 13, 6);
      g.fillTriangle(half, 1, 15, 12, 5, 12);
    },
    ring: (g) => {
      g.fillCircle(half, half, 8);
      g.fillStyle(0x000000, 0);
    },
    bolt: (g) => g.fillPoints([
      new Phaser.Geom.Point(12, 1),
      new Phaser.Geom.Point(5, 11),
      new Phaser.Geom.Point(9, 11),
      new Phaser.Geom.Point(7, 19),
      new Phaser.Geom.Point(15, 8),
      new Phaser.Geom.Point(11, 8),
    ], true),
    moon: (g) => {
      g.fillCircle(half, half, 8);
      g.fillStyle(0x000000, 0);
      g.fillCircle(14, 7, 6);
    },
    leaf: (g) => {
      g.fillEllipse(half, half, 10, 16);
    },
  };

  for (const badge of PLAYER_BADGES) {
    const key = `badge_${badge}`;
    bake(scene, key, size, size, (g) => {
      g.fillStyle(0xffffff, 1);
      const shape = shapes[badge];
      if (shape) shape(g);
      else g.fillCircle(half, half, 7);
    });
  }

  // Кольцо рисуется вычитанием, которого Graphics не умеет: делаем отдельно.
  if (!scene.textures.exists('badge_ring_fix')) {
    bake(scene, 'badge_ring_fix', size, size, (g) => {
      g.lineStyle(4, 0xffffff, 1);
      g.strokeCircle(half, half, 6);
    });
  }
}

/** Ключ текстуры значка по индексу. */
export function badgeTexture(index: number): string {
  const badge = PLAYER_BADGES[Math.abs(index) % PLAYER_BADGES.length];
  return badge === 'ring' ? 'badge_ring_fix' : `badge_${badge}`;
}

/** Ключ текстуры предмета по виду. */
export function itemTexture(kind: string): string {
  const key = `item_${kind}`;
  return key;
}
