/**
 * Отрисовка комнаты.
 *
 * Статическая геометрия запекается в одну текстуру при загрузке комнаты,
 * динамика (игроки, предметы, устройства) обновляется каждый кадр из
 * серверного состояния. Опасности рисуются по фазам: предупреждение видно и
 * слышно заранее, активная фаза читается по цвету и форме (GDD §9.1, §15.1).
 */

import Phaser from 'phaser';
import {
  ITEM_KINDS,
  PLAYER_COLORS,
  PlayerState,
  TILE,
  Tile,
  TileMap,
  type DeviceStateView,
  type GameStateView,
  type ItemStateView,
  type PlayerStateView,
  type RoomDef,
} from '@uc/shared';
import { PALETTE, mixColor } from '../art/palette.js';
import { badgeTexture, itemTexture } from '../art/textures.js';
import { getSettings } from '../settings.js';

export const DEPTH = {
  background: -100,
  parallax: -80,
  tiles: -10,
  devicesBack: 0,
  items: 10,
  players: 20,
  devicesFront: 30,
  effects: 40,
  markers: 60,
} as const;

const enum Phase {
  Idle = 0,
  Warn = 1,
  Active = 2,
  Recover = 3,
}

interface PlayerView {
  container: Phaser.GameObjects.Container;
  base: Phaser.GameObjects.Image;
  detail: Phaser.GameObjects.Image;
  badge: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  ring: Phaser.GameObjects.Graphics;
  lastX: number;
  lastY: number;
}

interface ItemView {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image | null;
  crack: Phaser.GameObjects.Graphics | null;
}

interface DeviceView {
  container: Phaser.GameObjects.Container;
  main: Phaser.GameObjects.GameObject | null;
  overlay: Phaser.GameObjects.Graphics;
  kind: string;
}

export class WorldRenderer {
  private readonly scene: Phaser.Scene;
  private map: TileMap | null = null;
  private room: RoomDef | null = null;

  private staticTexture: Phaser.GameObjects.RenderTexture | null = null;
  private readonly backgroundLayer: Phaser.GameObjects.Container;
  private readonly waterLayer: Phaser.GameObjects.Container;

  private readonly players = new Map<string, PlayerView>();
  private readonly items = new Map<number, ItemView>();
  private readonly devices = new Map<string, DeviceView>();
  private readonly carts = new Map<string, Phaser.GameObjects.Image>();
  private readonly pings = new Map<number, Phaser.GameObjects.Container>();

  private time = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.backgroundLayer = scene.add.container(0, 0).setDepth(DEPTH.background);
    this.waterLayer = scene.add.container(0, 0).setDepth(DEPTH.items - 1);
  }

  // ------------------------------------------------------------ смена комнат

  loadRoom(room: RoomDef): void {
    this.clear();
    this.room = room;
    this.map = new TileMap(room.tiles);
    this.buildBackground();
    this.bakeTiles();
  }

  private clear(): void {
    this.staticTexture?.destroy();
    this.staticTexture = null;
    this.backgroundLayer.removeAll(true);
    this.waterLayer.removeAll(true);
    for (const view of this.players.values()) view.container.destroy(true);
    for (const view of this.items.values()) view.container.destroy(true);
    for (const view of this.devices.values()) view.container.destroy(true);
    for (const cart of this.carts.values()) cart.destroy();
    for (const ping of this.pings.values()) ping.destroy(true);
    this.players.clear();
    this.items.clear();
    this.devices.clear();
    this.carts.clear();
    this.pings.clear();
  }

  destroy(): void {
    this.clear();
    this.backgroundLayer.destroy(true);
    this.waterLayer.destroy(true);
  }

  get worldWidth(): number {
    return this.map?.widthPx ?? 0;
  }

  get worldHeight(): number {
    return this.map?.heightPx ?? 0;
  }

  /** Слои фона едут медленнее переднего плана — дешёвая глубина без ассетов. */
  private buildBackground(): void {
    if (!this.map) return;
    const width = this.map.widthPx;
    const height = this.map.heightPx;

    const sky = this.scene.add.rectangle(0, 0, width * 1.4, height * 1.4, PALETTE.bgFar).setOrigin(0).setScrollFactor(0.1);
    this.backgroundLayer.add(sky);

    const far = this.scene.add.graphics().setScrollFactor(0.28);
    far.fillStyle(PALETTE.bgMid, 1);
    for (let x = -40; x < width + 200; x += 190) {
      const h = 150 + ((x * 37) % 190);
      far.fillRect(x, height - h - 40, 96, h + 60);
      far.fillRect(x + 110, height - h * 0.7 - 40, 54, h);
    }
    this.backgroundLayer.add(far);

    const near = this.scene.add.graphics().setScrollFactor(0.55);
    near.fillStyle(PALETTE.bgNear, 1);
    for (let x = -30; x < width + 200; x += 128) {
      near.fillRect(x, height - 260, 26, 300);
      near.fillRect(x - 14, height - 268, 54, 14);
    }
    near.fillStyle(PALETTE.steelDark, 0.55);
    for (let x = 0; x < width + 200; x += 256) {
      near.fillRect(x, 0, 512, 26);
    }
    this.backgroundLayer.add(near);
  }

  private bakeTiles(): void {
    const map = this.map;
    if (!map) return;

    const texture = this.scene.add
      .renderTexture(0, 0, map.widthPx, map.heightPx)
      .setOrigin(0)
      .setDepth(DEPTH.tiles);
    texture.beginDraw();

    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.cols; col++) {
        const tile = map.at(col, row);
        const x = col * TILE;
        const y = row * TILE;
        switch (tile) {
          case Tile.Solid: {
            // Верхняя грань светлее — так пол мгновенно отличается от стены.
            const open = map.at(col, row - 1) === Tile.Empty || map.at(col, row - 1) === Tile.Water;
            texture.batchDrawFrame(open ? 'tile_solid_top' : 'tile_solid', undefined, x, y);
            break;
          }
          case Tile.Ice:
            texture.batchDrawFrame('tile_ice', undefined, x, y);
            break;
          case Tile.OneWay:
            texture.batchDrawFrame('tile_oneway', undefined, x, y);
            break;
          case Tile.Lethal:
            texture.batchDrawFrame('tile_lethal', undefined, x, y);
            // Кислота дополнительно обводится косой разметкой сверху.
            if (map.at(col, row - 1) !== Tile.Lethal) {
              texture.batchDrawFrame('hazard_stripe', undefined, x, y - TILE);
            }
            break;
          default:
            break;
        }
      }
    }
    texture.endDraw();
    this.staticTexture = texture;

    this.buildCeiling();
    this.buildWater();
  }

  /**
   * Потолочная оснастка: балки, трубы и лампы.
   *
   * Комнаты нарочно высокие — прессам нужен ход, а броскам дуга. Без деталей
   * этот запас читается как пустое небо, поэтому верх заполняется декором.
   * Он не участвует в симуляции и живёт только на клиенте (GDD §0.5).
   */
  private buildCeiling(): void {
    const map = this.map;
    if (!map) return;

    const rig = this.scene.add.graphics().setDepth(DEPTH.tiles - 1);
    const width = map.widthPx;

    rig.fillStyle(PALETTE.steelDark, 1);
    rig.fillRect(0, TILE, width, 12);
    rig.fillStyle(PALETTE.steel, 1);
    rig.fillRect(0, TILE, width, 4);

    // Трубы разной толщины идут вдоль всего цеха.
    rig.fillStyle(PALETTE.metalDark, 1);
    rig.fillRect(0, TILE * 2 + 6, width, 9);
    rig.fillStyle(PALETTE.steelLight, 0.5);
    rig.fillRect(0, TILE * 2 + 6, width, 2);

    for (let x = TILE * 2; x < width; x += TILE * 6) {
      // Подвес и балка.
      rig.fillStyle(PALETTE.steelDark, 1);
      rig.fillRect(x - 3, TILE + 12, 6, TILE * 1.5);
      rig.fillRect(x - 26, TILE * 2.5 + 6, 52, 9);

      // Лампа и мягкое световое пятно под ней.
      rig.fillStyle(PALETTE.accent, 0.9);
      rig.fillRect(x - 10, TILE * 2.5 + 15, 20, 5);
      rig.fillStyle(PALETTE.accent, 0.05);
      rig.fillTriangle(x - 10, TILE * 2.5 + 20, x + 10, TILE * 2.5 + 20, x + 88, TILE * 7);
      rig.fillTriangle(x - 10, TILE * 2.5 + 20, x + 10, TILE * 2.5 + 20, x - 88, TILE * 7);

      // Хомуты на трубе — мелкий ритм, который делает длинный прогон живым.
      rig.fillStyle(PALETTE.steelDark, 1);
      rig.fillRect(x + TILE * 3 - 4, TILE * 2 + 4, 8, 13);
    }

    this.backgroundLayer.add(rig);
  }

  /** Вода рисуется отдельным слоем: она полупрозрачная и слегка колышется. */
  private buildWater(): void {
    const map = this.map;
    if (!map) return;
    for (let row = 0; row < map.rows; row++) {
      let runStart = -1;
      for (let col = 0; col <= map.cols; col++) {
        const isWater = col < map.cols && map.at(col, row) === Tile.Water;
        if (isWater && runStart < 0) runStart = col;
        if (!isWater && runStart >= 0) {
          const width = (col - runStart) * TILE;
          const rect = this.scene.add
            .rectangle(runStart * TILE, row * TILE, width, TILE, PALETTE.water, 0.42)
            .setOrigin(0);
          this.waterLayer.add(rect);
          if (map.at(runStart, row - 1) !== Tile.Water) {
            const surface = this.scene.add
              .rectangle(runStart * TILE, row * TILE, width, 4, PALETTE.waterLight, 0.7)
              .setOrigin(0);
            this.waterLayer.add(surface);
          }
          runStart = -1;
        }
      }
    }
  }

  // ---------------------------------------------------------------- обновление

  update(state: GameStateView, localSessionId: string, deltaSeconds: number): void {
    this.time += deltaSeconds;
    this.waterLayer.setAlpha(0.9 + Math.sin(this.time * 2.2) * 0.1);
    this.syncDevices(state);
    this.syncCarts(state);
    this.syncItems(state);
    this.syncPings(state, localSessionId);
  }

  // -------------------------------------------------------------------- игроки

  /**
   * Обновляет представление игрока. Позиция приходит извне: для локального
   * игрока это предсказание, для остальных — интерполированный снимок.
   */
  syncPlayer(
    player: PlayerStateView,
    x: number,
    y: number,
    isLocal: boolean,
    deltaSeconds: number,
  ): void {
    let view = this.players.get(player.sessionId);
    if (!view) {
      view = this.createPlayerView(player);
      this.players.set(player.sessionId, view);
    }

    const color = PLAYER_COLORS[player.colorIndex % PLAYER_COLORS.length];
    view.base.setTint(color);
    view.badge.setTint(color);

    const downed = player.state === PlayerState.Downed;
    view.container.setPosition(x, y);
    view.container.setDepth(DEPTH.players + (isLocal ? 1 : 0));

    // Squash & stretch по вертикальной скорости (GDD §15.2).
    const stretch = Phaser.Math.Clamp(player.vy / 900, -0.35, 0.35);
    const targetScaleY = downed ? 1 : 1 + stretch * 0.5;
    const targetScaleX = downed ? 1 : 1 - stretch * 0.35;
    const squashed = player.sliding ? 0.6 : targetScaleY;
    view.base.setScale(player.facing < 0 ? -targetScaleX : targetScaleX, squashed);
    view.detail.setScale(player.facing < 0 ? -targetScaleX : targetScaleX, squashed);

    view.base.setTexture(downed ? 'worker_downed' : 'worker_base');
    view.detail.setVisible(!downed);
    view.base.setAngle(downed ? 0 : Phaser.Math.Clamp(player.vx * 0.012, -9, 9));
    view.detail.setAngle(view.base.angle);

    // Мигание неуязвимости и полупрозрачность отключившегося.
    const blink = player.invulnerable > 0 ? 0.45 + Math.abs(Math.sin(this.time * 18)) * 0.55 : 1;
    view.container.setAlpha(player.connected ? blink : 0.35);

    view.shadow.setPosition(0, player.halfHeight + 4);
    view.shadow.setAlpha(player.grounded ? 0.32 : 0.16);

    view.label.setText(player.name);
    view.label.setPosition(0, -player.halfHeight - 30);
    view.label.setVisible(!isLocal || getSettings().outlines);

    view.badge.setPosition(0, -player.halfHeight - 14);

    this.drawPlayerRing(view, player, deltaSeconds);
    view.lastX = x;
    view.lastY = y;
  }

  private drawPlayerRing(view: PlayerView, player: PlayerStateView, deltaSeconds: number): void {
    void deltaSeconds;
    const ring = view.ring;
    ring.clear();

    if (player.state === PlayerState.Downed) {
      // Индикатор спасения: заполняется по мере подъёма товарищами.
      const radius = 26;
      ring.lineStyle(4, PALETTE.ink, 0.5);
      ring.strokeCircle(0, -6, radius);
      ring.lineStyle(4, PALETTE.ok, 1);
      ring.beginPath();
      ring.arc(0, -6, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * player.reviveProgress);
      ring.strokePath();

      // Обратный отсчёт до автоматического возвращения в игру.
      ring.fillStyle(PALETTE.accent, 0.85);
      ring.fillRect(-20, -radius - 16, 40 * Math.max(0, player.downTimer / 5), 3);
      return;
    }

    if (getSettings().outlines) {
      const color = PLAYER_COLORS[player.colorIndex % PLAYER_COLORS.length];
      ring.lineStyle(2, color, 0.35);
      ring.strokeRoundedRect(-17, -player.halfHeight - 4, 34, player.halfHeight * 2 + 8, 8);
    }
  }

  private createPlayerView(player: PlayerStateView): PlayerView {
    const container = this.scene.add.container(0, 0).setDepth(DEPTH.players);
    const shadow = this.scene.add.image(0, 24, 'shadow').setAlpha(0.3);
    const ring = this.scene.add.graphics();
    const base = this.scene.add.image(0, 0, 'worker_base');
    const detail = this.scene.add.image(0, 0, 'worker_detail');
    const badge = this.scene.add.image(0, -36, badgeTexture(player.badgeIndex)).setScale(0.85);
    const label = this.scene.add
      .text(0, -52, player.name, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#e8eef7',
        stroke: '#0d1017',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    container.add([shadow, ring, base, detail, badge, label]);
    return { container, base, detail, badge, shadow, label, ring, lastX: 0, lastY: 0 };
  }

  removePlayer(sessionId: string): void {
    const view = this.players.get(sessionId);
    if (!view) return;
    view.container.destroy(true);
    this.players.delete(sessionId);
  }

  playerIds(): IterableIterator<string> {
    return this.players.keys();
  }

  // ----------------------------------------------------------------- предметы

  private syncItems(state: GameStateView): void {
    const seen = new Set<number>();
    state.items.forEach((item) => {
      seen.add(item.id);
      let view = this.items.get(item.id);
      if (!view) {
        view = this.createItemView(item);
        this.items.set(item.id, view);
      }
      this.updateItemView(view, item);
    });

    for (const [id, view] of this.items) {
      if (seen.has(id)) continue;
      view.container.destroy(true);
      this.items.delete(id);
    }
  }

  private createItemView(item: ItemStateView): ItemView {
    const container = this.scene.add.container(item.x, item.y).setDepth(DEPTH.items);
    const sprite = this.scene.add.image(0, 0, itemTexture(item.kind));
    container.add(sprite);

    let glow: Phaser.GameObjects.Image | null = null;
    if (item.kind === 'cell') {
      glow = this.scene.add.image(0, 0, 'item_cell_core').setBlendMode(Phaser.BlendModes.ADD);
      container.add(glow);
    }

    let crack: Phaser.GameObjects.Graphics | null = null;
    if (ITEM_KINDS[item.kind]?.fragile) {
      crack = this.scene.add.graphics();
      container.add(crack);
    }
    return { container, sprite, glow, crack };
  }

  private updateItemView(view: ItemView, item: ItemStateView): void {
    view.container.setPosition(item.x, item.y);
    view.container.setRotation(item.angle);
    // Переносимый предмет рисуется поверх персонажа, лежащий — под ним.
    view.container.setDepth(item.holders.length > 0 ? DEPTH.players + 2 : DEPTH.items);

    if (view.glow) {
      // Нагрев виден без интерфейса: ядро разгорается и пульсирует (GDD §15.3).
      const heat = Phaser.Math.Clamp(item.heat, 0, 1);
      view.glow.setTint(mixColor(PALETTE.cold, PALETTE.hot, heat));
      const pulse = heat > 0.65 ? 1 + Math.sin(this.time * (6 + heat * 14)) * 0.18 * heat : 1;
      view.glow.setScale(0.55 + heat * 0.6 * pulse);
      view.glow.setAlpha(0.4 + heat * 0.6);
      view.sprite.setTint(mixColor(0xffffff, PALETTE.hot, heat * 0.55));
    }

    if (view.crack) {
      const damage = Phaser.Math.Clamp(item.damage, 0, 1);
      view.crack.clear();
      if (damage > 0.05) {
        view.crack.lineStyle(2, PALETTE.ink, 0.55 + damage * 0.45);
        const lines = Math.ceil(damage * 6);
        for (let i = 0; i < lines; i++) {
          const angle = (i / lines) * Math.PI * 2;
          view.crack.lineBetween(0, 0, Math.cos(angle) * 16, Math.sin(angle) * 14);
        }
        view.sprite.setTint(mixColor(0xffffff, PALETTE.danger, damage * 0.5));
      } else {
        view.sprite.clearTint();
      }
    }
  }

  // ---------------------------------------------------------------- тележки

  private syncCarts(state: GameStateView): void {
    state.carts.forEach((cart) => {
      let image = this.carts.get(cart.id);
      if (!image) {
        image = this.scene.add.image(cart.x, cart.y, 'dev_cart').setDepth(DEPTH.devicesBack + 2);
        this.carts.set(cart.id, image);
      }
      image.setPosition(cart.x, cart.y);
    });
  }

  // -------------------------------------------------------------- устройства

  private syncDevices(state: GameStateView): void {
    state.devices.forEach((device) => {
      let view = this.devices.get(device.id);
      if (!view) {
        view = this.createDeviceView(device);
        this.devices.set(device.id, view);
      }
      this.updateDeviceView(view, device);
    });
  }

  private createDeviceView(device: DeviceStateView): DeviceView {
    const container = this.scene.add.container(0, 0);
    const overlay = this.scene.add.graphics();
    let main: Phaser.GameObjects.GameObject | null = null;

    switch (device.kind) {
      case 'conveyor':
        main = this.scene.add.tileSprite(0, 0, device.w, TILE, 'dev_belt').setOrigin(0);
        container.setDepth(DEPTH.devicesBack);
        break;
      case 'press':
        main = this.scene.add.tileSprite(0, 0, device.w, TILE, 'dev_press_head').setOrigin(0);
        container.setDepth(DEPTH.devicesFront);
        break;
      case 'door':
        main = this.scene.add.tileSprite(0, 0, device.w, device.h, 'dev_door').setOrigin(0);
        container.setDepth(DEPTH.devicesFront);
        break;
      case 'lift':
        main = this.scene.add.tileSprite(0, 0, device.w, 18, 'dev_lift').setOrigin(0);
        container.setDepth(DEPTH.devicesBack + 1);
        break;
      case 'plate':
        main = this.scene.add.tileSprite(0, 0, device.w, 14, 'dev_plate').setOrigin(0);
        container.setDepth(DEPTH.devicesBack + 1);
        break;
      case 'lever':
        main = this.scene.add.image(TILE / 2, TILE / 2, 'dev_lever');
        container.setDepth(DEPTH.devicesBack + 1);
        break;
      case 'valve':
        main = this.scene.add.image(TILE / 2, TILE / 2, 'dev_valve');
        container.setDepth(DEPTH.devicesBack + 1);
        break;
      case 'node':
        main = this.scene.add.image(TILE / 2, TILE / 2, 'dev_node');
        container.setDepth(DEPTH.devicesBack + 1);
        break;
      case 'cooler':
        main = this.scene.add.tileSprite(0, 0, device.w, device.h, 'dev_cooler').setOrigin(0).setAlpha(0.9);
        container.setDepth(DEPTH.devicesBack);
        break;
      case 'magnet':
        main = this.scene.add.image(TILE / 2, TILE / 2, 'dev_magnet');
        container.setDepth(DEPTH.devicesBack + 1);
        break;
      case 'exit':
        main = this.scene.add.tileSprite(0, 0, device.w, device.h, 'dev_exit').setOrigin(0);
        container.setDepth(DEPTH.devicesBack);
        break;
      default:
        container.setDepth(DEPTH.devicesBack);
        break;
    }

    if (main) container.add(main);
    container.add(overlay);
    return { container, main, overlay, kind: device.kind };
  }

  private updateDeviceView(view: DeviceView, device: DeviceStateView): void {
    view.container.setPosition(device.x, device.y);
    const overlay = view.overlay;
    overlay.clear();

    switch (device.kind) {
      case 'conveyor': {
        const belt = view.main as Phaser.GameObjects.TileSprite;
        belt.tilePositionX += device.progress * 130 * (1 / 60);
        belt.setAlpha(device.active ? 1 : 0.55);
        break;
      }
      case 'press': {
        // Колонна дорисовывается вверх до потолка: понятно, откуда упадёт плита.
        overlay.fillStyle(PALETTE.steelDark, 1);
        overlay.fillRect(device.w / 2 - 8, -device.y, 16, device.y);
        this.drawHazardTelegraph(overlay, device, 0, -18, device.w, 16);
        break;
      }
      case 'door': {
        const door = view.main as Phaser.GameObjects.TileSprite;
        door.setAlpha(1 - device.progress * 0.85);
        break;
      }
      case 'plate': {
        const plate = view.main as Phaser.GameObjects.TileSprite;
        plate.setTexture(device.active ? 'dev_plate_on' : 'dev_plate');
        plate.setY(device.active ? 3 : 0);
        if (device.actors > 1) {
          overlay.fillStyle(PALETTE.ok, 0.9);
          for (let i = 0; i < Math.min(4, device.actors); i++) {
            overlay.fillCircle(8 + i * 9, -8, 3);
          }
        }
        break;
      }
      case 'lever': {
        const lever = view.main as Phaser.GameObjects.Image;
        lever.setAngle(device.active ? 32 : -32);
        break;
      }
      case 'valve': {
        const valve = view.main as Phaser.GameObjects.Image;
        valve.setAngle(device.progress * 720);
        this.drawProgressArc(overlay, device.progress, PALETTE.accent);
        break;
      }
      case 'node': {
        this.drawProgressArc(overlay, device.progress, device.progress >= 1 ? PALETTE.ok : PALETTE.accent);
        if (device.progress >= 1) {
          overlay.fillStyle(PALETTE.ok, 0.9);
          overlay.fillCircle(TILE / 2, 6, 4);
        }
        break;
      }
      case 'cooler': {
        const cooler = view.main as Phaser.GameObjects.TileSprite;
        cooler.setAlpha(device.active ? 0.9 : 0.35);
        if (device.active) {
          overlay.fillStyle(PALETTE.cold, 0.18 + Math.sin(this.time * 3) * 0.06);
          overlay.fillRect(0, 0, device.w, device.h);
        }
        break;
      }
      case 'magnet': {
        if (device.phase === Phase.Warn) {
          overlay.lineStyle(2, PALETTE.accent, 0.4 + Math.sin(this.time * 16) * 0.3);
          overlay.strokeCircle(TILE / 2, TILE / 2, 60);
        } else if (device.phase === Phase.Active) {
          overlay.lineStyle(3, 0x6ea8ff, 0.35 + device.progress * 0.5);
          for (let r = 30; r < 200; r += 34) {
            overlay.strokeCircle(TILE / 2, TILE / 2, r * (0.6 + device.progress * 0.5));
          }
        }
        break;
      }
      case 'live': {
        // Электризованная вода: жёлтое предупреждение, затем белый разряд.
        if (device.phase === Phase.Warn) {
          overlay.fillStyle(PALETTE.accent, 0.14 + Math.sin(this.time * 14) * 0.1);
          overlay.fillRect(0, 0, device.w, device.h);
          overlay.lineStyle(2, PALETTE.accent, 0.8);
          overlay.strokeRect(1, 1, device.w - 2, device.h - 2);
        } else if (device.phase === Phase.Active) {
          overlay.fillStyle(0x9fd8ff, 0.34);
          overlay.fillRect(0, 0, device.w, device.h);
          overlay.lineStyle(2, 0xffffff, 0.9);
          for (let i = 0; i < 5; i++) {
            const x = (i / 4) * device.w;
            overlay.lineBetween(x, 0, x + Math.sin(this.time * 30 + i) * 12, device.h);
          }
        }
        break;
      }
      case 'jet': {
        if (device.phase === Phase.Warn) {
          overlay.fillStyle(PALETTE.accent, 0.16 + Math.sin(this.time * 16) * 0.1);
          overlay.fillRect(0, 0, device.w, device.h);
        } else if (device.phase === Phase.Active) {
          overlay.fillStyle(0xffffff, 0.3);
          for (let i = 0; i < 4; i++) {
            const offset = ((this.time * 220 + i * 40) % device.h) - device.h;
            overlay.fillEllipse(device.w / 2, device.h + offset, device.w * 0.9, 26);
          }
        }
        break;
      }
      case 'lift': {
        overlay.fillStyle(PALETTE.accent, device.active ? 0.5 + Math.sin(this.time * 8) * 0.3 : 0.2);
        overlay.fillRect(0, -6, device.w, 3);
        break;
      }
      case 'exit': {
        overlay.lineStyle(2, PALETTE.ok, 0.4 + Math.sin(this.time * 3) * 0.25);
        overlay.strokeRect(2, 2, device.w - 4, device.h - 4);
        break;
      }
      default:
        break;
    }
  }

  /** Общая мигалка «сейчас ударит» над опасностью. */
  private drawHazardTelegraph(
    overlay: Phaser.GameObjects.Graphics,
    device: DeviceStateView,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    if (device.phase === Phase.Warn) {
      const blink = 0.35 + Math.abs(Math.sin(this.time * 12)) * 0.65;
      overlay.fillStyle(PALETTE.accent, blink);
      overlay.fillRect(x, y, width, height);
    } else if (device.phase === Phase.Active) {
      overlay.fillStyle(PALETTE.danger, 0.9);
      overlay.fillRect(x, y, width, height);
    } else {
      overlay.fillStyle(PALETTE.steelDark, 0.8);
      overlay.fillRect(x, y, width, height);
    }
  }

  private drawProgressArc(overlay: Phaser.GameObjects.Graphics, progress: number, color: number): void {
    if (progress <= 0) return;
    overlay.lineStyle(3, PALETTE.ink, 0.5);
    overlay.strokeCircle(TILE / 2, TILE / 2, 20);
    overlay.lineStyle(3, color, 1);
    overlay.beginPath();
    overlay.arc(TILE / 2, TILE / 2, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, progress));
    overlay.strokePath();
  }

  // -------------------------------------------------------------------- пинги

  private syncPings(state: GameStateView, localSessionId: string): void {
    void localSessionId;
    const seen = new Set<number>();
    state.pings.forEach((ping) => {
      seen.add(ping.id);
      if (this.pings.has(ping.id)) return;

      const owner = state.players.get(ping.playerId);
      const color = owner ? PLAYER_COLORS[owner.colorIndex % PLAYER_COLORS.length] : PALETTE.paper;
      const container = this.scene.add.container(ping.x, ping.y).setDepth(DEPTH.markers);
      const icon = this.scene.add.image(0, 0, `ping_${ping.type}`).setTint(color);
      const ring = this.scene.add.image(0, 0, 'fx_ring').setTint(color).setAlpha(0.6).setScale(0.5);
      container.add([ring, icon]);
      this.pings.set(ping.id, container);

      this.scene.tweens.add({ targets: ring, scale: 1.6, alpha: 0, duration: 900, repeat: 2 });
      this.scene.tweens.add({ targets: icon, y: -10, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });

    for (const [id, container] of this.pings) {
      if (seen.has(id)) continue;
      container.destroy(true);
      this.pings.delete(id);
    }
  }

  /** Прямоугольник комнаты — нужен камере и мини-индикаторам. */
  get tileMap(): TileMap | null {
    return this.map;
  }

  get roomDef(): RoomDef | null {
    return this.room;
  }
}
