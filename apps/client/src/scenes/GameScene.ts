/**
 * Игровая сцена: собирает вместе сеть, предсказание, рендер и звук.
 *
 * Разделение обязанностей намеренное (GDD §0.5): сцена ничего не решает про
 * правила игры, она только показывает авторитетное состояние и предсказывает
 * движение собственного персонажа между снимками.
 */

import Phaser from 'phaser';
import {
  HAZARD,
  ITEM_KINDS,
  PLAYER,
  PLAYER_COLORS,
  PlayerState,
  RoomPhase,
  TILE,
  getRoom,
  makeSolid,
  type DynamicSolid,
  type GameStateView,
  type ItemStateView,
  type PlayerStateView,
  type SimEvent,
} from '@uc/shared';
import { audio } from '../audio/AudioSystem.js';
import { PALETTE } from '../art/palette.js';
import { DEPTH, WorldRenderer } from '../render/WorldRenderer.js';
import { CameraSystem } from '../systems/CameraSystem.js';
import { EffectsSystem } from '../systems/EffectsSystem.js';
import { InputSystem } from '../systems/InputSystem.js';
import { LocalPlayerPrediction } from '../systems/Prediction.js';
import { InterpolationBuffer } from '../systems/Interpolation.js';
import { TouchControls } from '../systems/TouchControls.js';
import type { NetClient } from '../net/NetClient.js';
import type { HudOverlay } from '../ui/HudOverlay.js';
import { isTouchDevice } from '../settings.js';

export interface GameSceneData {
  net: NetClient;
  hud: HudOverlay;
}

/** Порядок полей в буфере интерполяции удалённых игроков. */
const enum RemoteField {
  Vx = 0,
  Vy = 1,
}

export class GameScene extends Phaser.Scene {
  static readonly KEY = 'game';

  private net!: NetClient;
  private hud!: HudOverlay;

  private world!: WorldRenderer;
  private cameraSystem!: CameraSystem;
  private effects!: EffectsSystem;
  private inputs!: InputSystem;
  private touch: TouchControls | null = null;
  private prediction: LocalPlayerPrediction | null = null;
  private readonly remotes = new InterpolationBuffer();

  private readonly solids: DynamicSolid[] = [];
  private readonly solidsById = new Map<string, DynamicSolid>();
  private readonly previousSolidY = new Map<string, number>();

  private promptText!: Phaser.GameObjects.Text;
  private markers!: Phaser.GameObjects.Graphics;
  private readonly screenPoint = new Phaser.Math.Vector2();

  private currentRoomId = '';
  private paused = false;

  constructor() {
    super(GameScene.KEY);
  }

  init(data: GameSceneData): void {
    this.net = data.net;
    this.hud = data.hud;
  }

  create(): void {
    this.world = new WorldRenderer(this);
    this.cameraSystem = new CameraSystem(this);
    this.effects = new EffectsSystem(this, DEPTH.effects);
    this.inputs = new InputSystem(this);

    if (isTouchDevice()) this.touch = new TouchControls(this, this.inputs.touch);

    this.markers = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.markers + 10);
    this.promptText = this.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: '#0d1017',
        backgroundColor: '#ffc93c',
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.markers)
      .setVisible(false);

    this.cameras.main.setBackgroundColor(PALETTE.voidDark);

    this.net.setHandlers({
      onEvents: (payload) => this.handleEvents(payload.events),
      onHint: (payload) => this.hud.showHint(payload.text, payload.key),
      onRoomChanged: (payload) => this.loadRoom(payload.roomId, payload.title),
      onStateChange: (state) => this.onStateChange(state),
    });

    const state = this.net.state;
    if (state?.roomId) this.loadRoom(state.roomId, state.roomTitle);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  private teardown(): void {
    this.touch?.destroy();
    this.world.destroy();
    this.effects.destroy();
    this.remotes.clear();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.touch?.setVisible(!paused);
    if (paused) this.inputs.reset();
  }

  // -------------------------------------------------------------- комнаты

  private loadRoom(roomId: string, title: string): void {
    if (roomId === this.currentRoomId) return;
    this.currentRoomId = roomId;

    const room = getRoom(roomId);
    this.world.loadRoom(room);
    this.cameraSystem.setBounds(this.world.worldWidth, this.world.worldHeight);

    this.solids.length = 0;
    this.solidsById.clear();
    this.previousSolidY.clear();
    this.remotes.clear();
    this.prediction = null;

    audio.setMusicLayer(room.music === 'evac' ? 'evac' : room.music === 'alarm' ? 'alarm' : 'work');
    this.hud.showBanner(title, '#ffc93c', 2800);
  }

  private onStateChange(state: GameStateView): void {
    // Снимок пришёл: кладём удалённых игроков в буфер интерполяции.
    const now = performance.now();
    state.players.forEach((player) => {
      if (player.sessionId === this.net.sessionId) return;
      this.remotes.push(player.sessionId, player.x, player.y, [player.vx, player.vy], now);
    });
  }

  // ----------------------------------------------------------------- цикл

  override update(_time: number, delta: number): void {
    const state = this.net.state;
    if (!state || !this.currentRoomId) return;

    const deltaSeconds = Math.min(delta / 1000, 0.1);
    this.syncSolids(state, deltaSeconds);

    const localState = state.players.get(this.net.sessionId);
    if (localState) this.updateLocalPlayer(localState, state, deltaSeconds);

    this.updateRemotePlayers(state, deltaSeconds);
    this.world.update(state, this.net.sessionId, deltaSeconds);
    this.updateCamera(state);
    this.updatePrompt(state, localState);
    this.updateMarkers(state);
    this.hud.update(state, this.net.sessionId, this.net.latency);
  }

  /** Динамические тела из серверного состояния — основа предсказания. */
  private syncSolids(state: GameStateView, deltaSeconds: number): void {
    this.solids.length = 0;

    state.devices.forEach((device) => {
      let solid = this.solidsById.get(device.id);
      if (!solid) {
        solid = makeSolid(device.id, { x: 0, y: 0, w: 0, h: 0 });
        this.solidsById.set(device.id, solid);
      }

      switch (device.kind) {
        case 'conveyor':
          solid.rect.x = device.x;
          solid.rect.y = device.y;
          solid.rect.w = device.w;
          solid.rect.h = TILE;
          solid.surfaceVx = device.progress * HAZARD.conveyorSpeed;
          solid.enabled = true;
          solid.oneWay = false;
          break;
        case 'press':
        case 'lift':
          solid.rect.x = device.x;
          solid.rect.y = device.y;
          solid.rect.w = device.w;
          solid.rect.h = device.kind === 'lift' ? device.h : TILE;
          solid.enabled = true;
          solid.oneWay = false;
          break;
        case 'door':
          solid.rect.x = device.x;
          solid.rect.y = device.y;
          solid.rect.w = device.w;
          solid.rect.h = device.h;
          // Створка перестаёт быть препятствием, только когда почти открыта.
          solid.enabled = device.progress < 0.92;
          solid.oneWay = false;
          break;
        default:
          return;
      }

      // Вертикальная скорость платформы: без неё игрок «отлипает» от лифта.
      const previousY = this.previousSolidY.get(device.id);
      solid.vy = previousY === undefined || deltaSeconds <= 0 ? 0 : (solid.rect.y - previousY) / deltaSeconds;
      this.previousSolidY.set(device.id, solid.rect.y);
      solid.vx = 0;
      this.solids.push(solid);
    });

    state.carts.forEach((cart) => {
      const id = `cart_${cart.id}`;
      let solid = this.solidsById.get(id);
      if (!solid) {
        solid = makeSolid(id, { x: 0, y: 0, w: 74, h: 40 }, { oneWay: true });
        this.solidsById.set(id, solid);
      }
      solid.rect.x = cart.x - 37;
      solid.rect.y = cart.y - 20;
      solid.vx = cart.vx;
      solid.vy = 0;
      solid.enabled = true;
      this.solids.push(solid);
    });
  }

  private updateLocalPlayer(local: PlayerStateView, state: GameStateView, deltaSeconds: number): void {
    const map = this.world.tileMap;
    if (!map) return;

    if (!this.prediction) {
      this.prediction = new LocalPlayerPrediction(this.net.sessionId, map, this.solids, local.x, local.y);
    }
    this.prediction.setEnvironment(map, this.solids);

    // Груз в руках замедляет и снижает прыжок — это часть модели движения,
    // поэтому предсказание обязано знать о нём (иначе постоянные коррекции).
    const carried = local.carrying > 0 ? state.items.get(String(local.carrying)) : undefined;
    this.prediction.setCarrySpeedFactor(carrySpeedOf(carried));
    this.prediction.setJumpFactor(jumpFactorOf(carried));

    const frames = this.paused
      ? []
      : this.prediction.update(deltaSeconds, () => this.inputs.sample());
    for (const frame of frames) {
      this.net.sendInput(frame.seq, frame.axis, frame.buttons, frame.aim);
    }

    this.prediction.reconcile(local.x, local.y, local.lastSeq, local.state as PlayerState);

    const sim = this.prediction.sim;
    const view: PlayerStateView = {
      ...local,
      // Для собственного персонажа показываем предсказание, а не снимок:
      // иначе управление ощущается «резиновым» при любой задержке.
      vx: sim.vx,
      vy: sim.vy,
      facing: sim.facing,
      grounded: sim.grounded,
      sliding: sim.sliding,
      halfHeight: Math.round(sim.body.hh),
    };
    this.world.syncPlayer(view, this.prediction.renderX, this.prediction.renderY, true, deltaSeconds);
  }

  private updateRemotePlayers(state: GameStateView, deltaSeconds: number): void {
    const alive = new Set<string>();
    state.players.forEach((player) => {
      if (player.sessionId === this.net.sessionId) return;
      alive.add(player.sessionId);

      const sample = this.remotes.sample(player.sessionId);
      const x = sample?.x ?? player.x;
      const y = sample?.y ?? player.y;
      const view: PlayerStateView = sample
        ? { ...player, vx: sample.extra[RemoteField.Vx] ?? player.vx, vy: sample.extra[RemoteField.Vy] ?? player.vy }
        : player;
      this.world.syncPlayer(view, x, y, false, deltaSeconds);
    });

    for (const id of [...this.world.playerIds()]) {
      if (id === this.net.sessionId || alive.has(id)) continue;
      this.world.removePlayer(id);
      this.remotes.reset(id);
    }
  }

  private updateCamera(state: GameStateView): void {
    const self = this.prediction
      ? { x: this.prediction.renderX, y: this.prediction.renderY }
      : { x: this.world.worldWidth / 2, y: this.world.worldHeight / 2 };

    const others: { x: number; y: number }[] = [];
    state.players.forEach((player) => {
      if (player.sessionId === this.net.sessionId) return;
      if (player.state === PlayerState.Spectating || !player.connected) return;
      others.push({ x: player.x, y: player.y });
    });

    this.cameraSystem.update(self, others, this.game.loop.delta / 1000);
    const screen = this.cameraSystem.worldToScreen(self.x, self.y, this.screenPoint);
    this.inputs.setAimOrigin(screen.x, screen.y, this.prediction?.sim.facing ?? 1);
  }

  // ------------------------------------------------------------- подсказки

  /**
   * Локальная подсветка цели взаимодействия. Это только подсказка: решение
   * всё равно принимает сервер, поэтому расхождение безобидно.
   */
  private updatePrompt(state: GameStateView, local: PlayerStateView | undefined): void {
    if (!local || !this.prediction || local.state !== PlayerState.Active) {
      this.promptText.setVisible(false);
      return;
    }

    const px = this.prediction.renderX;
    const py = this.prediction.renderY;
    const facing = this.prediction.sim.facing;

    let bestLabel = '';
    let bestX = 0;
    let bestY = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    const consider = (x: number, y: number, priority: number, label: string): void => {
      const distance = Math.hypot(x - px, y - py);
      if (distance > PLAYER.interactRange) return;
      const dot = distance < 1 ? 1 : ((x - px) / distance) * facing;
      if (dot < PLAYER.interactConeCos) return;
      const score = priority * 1000 + distance;
      if (score >= bestScore) return;
      bestScore = score;
      bestLabel = label;
      bestX = x;
      bestY = y;
    };

    state.players.forEach((other) => {
      if (other.sessionId === local.sessionId || other.state !== PlayerState.Downed) return;
      consider(other.x, other.y, 0, `Поднять ${other.name} · E`);
    });

    state.devices.forEach((device) => {
      const cx = device.x + device.w / 2;
      const cy = device.y + device.h / 2;
      if (device.kind === 'valve' && device.progress < 1) consider(cx, cy, 1, 'Крутить вентиль · E');
      else if (device.kind === 'node' && device.progress < 1) consider(cx, cy, 1, 'Чинить узел · E');
      else if (device.kind === 'lever') consider(cx, cy, 3, device.active ? 'Выключить · E' : 'Включить · E');
    });

    if (local.carrying === 0) {
      state.items.forEach((item) => {
        const kind = ITEM_KINDS[item.kind];
        if (!kind) return;
        consider(item.x, item.y, kind.keyItem ? 2 : 3, `Взять: ${kind.label} · E`);
      });
    } else {
      this.promptText.setVisible(false);
      return;
    }

    if (!bestLabel) {
      this.promptText.setVisible(false);
      return;
    }
    this.promptText.setText(bestLabel).setPosition(bestX, bestY - 30).setVisible(true);
  }

  /** Стрелки к игрокам за краем экрана — чтобы никто не потерялся (GDD §14.1). */
  private updateMarkers(state: GameStateView): void {
    this.markers.clear();
    const view = this.cameraSystem.view;
    const { width, height } = this.scale;
    const margin = 34;

    state.players.forEach((player) => {
      if (player.sessionId === this.net.sessionId) return;
      if (view.contains(player.x, player.y)) return;

      this.cameraSystem.worldToScreen(player.x, player.y, this.screenPoint);
      const x = Phaser.Math.Clamp(this.screenPoint.x, margin, width - margin);
      const y = Phaser.Math.Clamp(this.screenPoint.y, margin, height - margin);
      const color = PLAYER_COLORS[player.colorIndex % PLAYER_COLORS.length];
      const angle = Math.atan2(this.screenPoint.y - height / 2, this.screenPoint.x - width / 2);

      this.markers.fillStyle(color, player.state === PlayerState.Downed ? 1 : 0.75);
      const size = player.state === PlayerState.Downed ? 13 : 9;
      this.markers.fillTriangle(
        x + Math.cos(angle) * size,
        y + Math.sin(angle) * size,
        x + Math.cos(angle + 2.5) * size,
        y + Math.sin(angle + 2.5) * size,
        x + Math.cos(angle - 2.5) * size,
        y + Math.sin(angle - 2.5) * size,
      );
    });
  }

  // -------------------------------------------------------------- события

  private handleEvents(events: readonly SimEvent[]): void {
    const listenerX = this.cameraSystem.view.centerX;
    const own = (id: string): boolean => id === this.net.sessionId;

    for (const event of events) {
      switch (event.type) {
        case 'player_jumped':
          audio.play('jump', { x: event.x, listenerX, own: own(event.playerId) });
          break;
        case 'player_landed':
          audio.play('land', { x: event.x, listenerX, own: own(event.playerId) });
          this.effects.landingDust(event.x, event.y + 20, event.speed);
          if (own(event.playerId) && event.speed > 700) this.cameraSystem.shake(event.speed / 900);
          break;
        case 'player_stunned':
          audio.play('impact', { x: event.x, listenerX, own: own(event.playerId) });
          this.effects.burstSparks(event.x, event.y, 8, PALETTE.accent);
          this.hud.pushSubtitle('удар');
          if (own(event.playerId)) this.cameraSystem.shake(1);
          break;
        case 'player_downed':
          audio.play('downed', { x: event.x, listenerX, own: own(event.playerId) });
          this.effects.floatingText(event.x, event.y - 20, 'нужна помощь!', PALETTE.danger);
          this.hud.pushSubtitle('работник выведен из строя');
          if (own(event.playerId)) this.cameraSystem.flash(PALETTE.danger, 0.35);
          break;
        case 'player_revived':
          audio.play('revive', { x: event.x, listenerX, own: own(event.playerId) });
          this.effects.shockRing(event.x, event.y, PALETTE.ok, 70);
          this.effects.floatingText(event.x, event.y - 24, 'спасён!', PALETTE.ok);
          break;
        case 'player_respawned':
          this.effects.shockRing(event.x, event.y, PALETTE.accent, 60);
          if (own(event.playerId)) this.prediction?.teleport(event.x, event.y);
          break;
        case 'item_grabbed':
          audio.play('grab', { x: 0, listenerX: 0, own: own(event.playerId) });
          break;
        case 'item_released':
          audio.play('drop', { own: own(event.playerId) });
          break;
        case 'item_thrown':
          audio.play('throw', { own: own(event.playerId) });
          break;
        case 'item_impact':
          audio.play('impact', { x: event.x, listenerX, volume: Math.min(1, event.speed / 700) });
          this.effects.burstSparks(event.x, event.y, 4);
          break;
        case 'item_damaged':
          audio.play('crack', { x: event.x, listenerX });
          this.effects.floatingText(event.x, event.y - 18, 'хрусть', PALETTE.danger);
          this.hud.pushSubtitle('груз повреждён');
          break;
        case 'item_recovered':
          this.effects.shockRing(event.x, event.y, PALETTE.accent, 80);
          this.hud.pushSubtitle('груз восстановлен');
          break;
        case 'hazard_hit':
          if (event.hazard === 'electric') {
            audio.play('zap', { x: event.x, listenerX, own: own(event.playerId) });
            this.effects.burstSparks(event.x, event.y, 14, 0x9fd8ff);
          } else {
            audio.play('impact', { x: event.x, listenerX, own: own(event.playerId) });
          }
          break;
        case 'hazard_phase':
          this.handleHazardPhase(event, listenerX);
          break;
        case 'device_activated':
          audio.play('objective', { x: event.x, listenerX });
          break;
        case 'objective_complete':
          audio.play('objective');
          this.hud.showBanner(`✓ ${event.label}`, '#7ee081', 2200);
          break;
        case 'room_cleared':
          audio.play('clear');
          this.hud.showBanner('Зона пройдена', '#7ee081', 3000);
          break;
        case 'room_failed':
          audio.play('fail');
          this.hud.showBanner('Авария. Перезапуск с чекпоинта', '#ff4d5a', 3000);
          this.cameraSystem.flash(PALETTE.danger, 0.5);
          break;
        case 'catastrophe_started':
          audio.setMusicLayer('evac');
          this.hud.showBanner('ЭВАКУАЦИЯ', '#ff8a3c', 3200);
          break;
        case 'ping_placed':
          audio.play('ping', { x: event.x, listenerX, own: own(event.playerId) });
          break;
        case 'chaos_variation':
          this.hud.pushSubtitle(`изменение обстановки: ${event.variation}`);
          break;
        default:
          break;
      }
    }
  }

  private handleHazardPhase(
    event: Extract<SimEvent, { type: 'hazard_phase' }>,
    listenerX: number,
  ): void {
    if (event.hazard === 'press') {
      if (event.phase === 'warn') audio.play('press_warn', { x: event.x, listenerX });
      else {
        audio.play('press_slam', { x: event.x, listenerX });
        this.effects.burstSmoke(event.x, event.y + 20, 6, 0xc8d6ee);
        this.cameraSystem.shake(0.8, 140);
      }
    } else if (event.hazard === 'magnet' && event.phase === 'active') {
      audio.play('magnet', { x: event.x, listenerX });
    } else if (event.hazard === 'jet' && event.phase === 'active') {
      audio.play('steam', { x: event.x, listenerX });
    } else if (event.hazard === 'live' && event.phase === 'active') {
      audio.play('zap', { x: event.x, listenerX });
    } else if (event.hazard === 'overheat') {
      audio.play('heat', { x: event.x, listenerX });
      this.effects.burstSmoke(event.x, event.y, 8, PALETTE.hot);
      this.hud.pushSubtitle('перегрев груза');
    }
  }

  /** Переключение музыки под фазу комнаты. */
  syncMusic(state: GameStateView): void {
    if (state.phase === RoomPhase.Catastrophe) audio.setMusicLayer('evac');
    else if (state.catastropheGauge > 0.5) audio.setMusicLayer('alarm');
  }

  get inputSystem(): InputSystem {
    return this.inputs;
  }

  /** Позиция локального игрока по предсказанию — для отладки и автотестов. */
  get localPosition(): { x: number; y: number } {
    return this.prediction
      ? { x: this.prediction.renderX, y: this.prediction.renderY }
      : { x: 0, y: 0 };
  }
}

function carrySpeedOf(item: ItemStateView | undefined): number {
  if (!item) return 1;
  const kind = ITEM_KINDS[item.kind];
  if (!kind) return 1;
  const carriers = item.holders.length === 0 ? 1 : item.holders.split(',').length;
  const deficit = Math.max(0, kind.requiredStrength - carriers);
  const table = [0.34, 0.62, 0.84, 1];
  return table[Math.max(0, table.length - 1 - deficit)];
}

function jumpFactorOf(item: ItemStateView | undefined): number {
  if (!item) return 1;
  const kind = ITEM_KINDS[item.kind];
  if (!kind) return 1;
  const carriers = item.holders.length === 0 ? 1 : item.holders.split(',').length;
  const deficit = Math.max(0, kind.requiredStrength - carriers);
  return Math.max(0.62, Math.min(1, 1 - deficit * 0.16 - (kind.mass - 1) * 0.03));
}
