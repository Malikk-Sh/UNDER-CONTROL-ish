/**
 * Полная авторитетная симуляция комнаты.
 *
 * Сервер прогоняет `World.step()` фиксированным тиком и рассылает результат;
 * клиент этот класс не использует — он предсказывает только собственного
 * персонажа через `stepPlayerMotion`. Валидатор уровней прогоняет `World`
 * без сети, чтобы проверять проходимость при разных составах (GDD §18.1).
 */

import {
  CART,
  CATASTROPHE,
  FIXED_DT,
  HAZARD,
  ITEM as ITEM_TUNING,
  NET,
  OBJECTIVE,
  PLAYER,
  TILE,
} from '../config/tuning.js';
import {
  hazardIntensity,
  holdDuration,
  objectiveTimeScale,
  repairNodeCount,
  requiredActivators,
  reviveDuration,
} from '../config/scaling.js';
import type {
  CheckpointDef,
  ConveyorDef,
  CoolerDef,
  DoorDef,
  EntityDef,
  HintDef,
  ItemDef,
  JetDef,
  LeverDef,
  LiftDef,
  LiveZoneDef,
  MagnetDef,
  ObjectiveDef,
  PlateDef,
  PressDef,
  RepairNodeDef,
  RoomDef,
  TileRect,
  ValveDef,
} from '../content/types.js';
import {
  HazardPhase,
  SignalBus,
  createDevice,
  electricPhase,
  jetPhase,
  magnetPhase,
  pressPose,
  type DeviceSim,
} from './devices.js';
import {
  Tile,
  TileMap,
  aabbToRect,
  emptyMoveResult,
  isGrounded,
  makeSolid,
  moveBody,
  rectOverlaps,
  type AABB,
  type DynamicSolid,
  type RectPx,
} from './geometry.js';
import { clamp, distance, sign, unpackAngle } from './math.js';
import { Rng } from './rng.js';
import {
  carrierJumpFactor,
  carrierSpeedFactor,
  createItemSim,
  dropItem,
  itemKindOf,
  recoverItem,
  stepItem,
  throwItem,
  type ItemEnv,
} from './items.js';
import { applySoftPush, createPlayerSim, stepPlayerMotion, type MotionEnv, type PlayerSim } from './player.js';
import {
  Button,
  ITEM_KINDS,
  PING_TYPES,
  PlayerState,
  RoomPhase,
  isDown,
  makeInput,
  type InputFrame,
  type ItemSim,
  type PingMarker,
  type PingType,
  type SimEvent,
} from './types.js';

export interface CartSim {
  id: string;
  body: AABB;
  vx: number;
  vy: number;
  grounded: boolean;
}

export interface ObjectiveRuntime {
  def: ObjectiveDef;
  progress: number;
  done: boolean;
  /** Накопленное время для целей типа «удержать». */
  timer: number;
  label: string;
}

export interface AddPlayerOptions {
  name: string;
  colorIndex: number;
  badgeIndex: number;
}

export type InteractionTarget =
  | { kind: 'revive'; playerId: string }
  | { kind: 'device'; deviceId: string; verb: string }
  | { kind: 'item'; itemId: number }
  | { kind: 'cart'; cartId: string }
  | null;

const HINT_MARGIN = 4;

export class World {
  readonly room: RoomDef;
  readonly map: TileMap;
  readonly signals = new SignalBus();
  readonly players = new Map<string, PlayerSim>();
  readonly items = new Map<number, ItemSim>();
  readonly devices = new Map<string, DeviceSim>();
  readonly carts: CartSim[] = [];
  readonly pings: PingMarker[] = [];
  readonly objectives: ObjectiveRuntime[] = [];
  readonly hints: HintDef[] = [];
  /** Активная подсказка на игрока — заполняется каждый тик. */
  readonly activeHints = new Map<string, string>();
  /** Цель контекстного взаимодействия на игрока — для подсказки в UI. */
  readonly interactionTargets = new Map<string, InteractionTarget>();

  events: SimEvent[] = [];
  tick = 0;
  elapsed = 0;
  phase: RoomPhase = RoomPhase.Briefing;
  catastropheGauge = 0;
  /** Оставшееся время комнаты; 0 — таймера нет. */
  timeLeft = 0;
  failReason = '';
  clearedAtSeconds = 0;
  intensity = 1;
  activeCount = 1;
  requiredActivatorCount = 1;
  /** Вариации, включённые директором хаоса. */
  readonly activeModifiers = new Set<string>();

  private readonly rng: Rng;
  private readonly spawnPoints: { x: number; y: number }[] = [];
  private readonly checkpoints: CheckpointDef[] = [];
  private readonly solids: DynamicSolid[] = [];
  private readonly cartSolids = new Map<string, DynamicSolid>();
  private readonly plateGroups = new Map<string, number>();
  private readonly motionEnv: MotionEnv;
  private readonly itemEnv: ItemEnv;
  private nextPingId = 1;
  private started = false;
  private readonly moveScratch = emptyMoveResult();

  constructor(room: RoomDef, seed: number) {
    this.room = room;
    this.map = new TileMap(room.tiles);
    this.rng = new Rng(seed);

    for (const def of room.entities) this.spawnEntity(def);

    for (const objective of room.objectives) {
      this.objectives.push({ def: objective, progress: 0, done: false, timer: 0, label: objective.label });
    }

    this.timeLeft = room.timeLimit ?? 0;
    this.motionEnv = { map: this.map, solids: this.solids, jumpFactor: 1 };
    this.itemEnv = {
      map: this.map,
      solids: this.solids,
      players: this.players,
      coolers: [],
      carts: [],
      tick: 0,
    };
    this.rebuildSolids();
  }

  // ---------------------------------------------------------------- сущности

  private spawnEntity(def: EntityDef): void {
    switch (def.type) {
      case 'spawn':
        this.spawnPoints.push({ x: def.x * TILE + TILE / 2, y: def.y * TILE + TILE / 2 });
        break;
      case 'checkpoint':
        this.checkpoints.push(def);
        break;
      case 'item': {
        const item = createItemSim(def as ItemDef);
        this.items.set(item.id, item);
        break;
      }
      case 'cart': {
        this.carts.push({
          id: def.id,
          body: {
            x: def.x * TILE + CART.width / 2,
            y: def.y * TILE + CART.height / 2,
            hw: CART.width / 2,
            hh: CART.height / 2,
          },
          vx: 0,
          vy: 0,
          grounded: false,
        });
        this.cartSolids.set(def.id, makeSolid(def.id, { x: 0, y: 0, w: CART.width, h: CART.height }));
        break;
      }
      case 'hint':
        this.hints.push(def as HintDef);
        break;
      case 'exit':
        break;
      default: {
        const device = createDevice(def);
        this.devices.set(device.id, device);
        break;
      }
    }
    if (def.type === 'exit') {
      const device = createDevice(def);
      this.devices.set(device.id, device);
    }
  }

  addPlayer(id: string, options: AddPlayerOptions): PlayerSim {
    const spawn = this.spawnPoints.length
      ? this.spawnPoints[this.players.size % this.spawnPoints.length]
      : { x: TILE * 2, y: TILE * 2 };
    const player = createPlayerSim(id, spawn.x, spawn.y);
    // Разводим появляющихся игроков по горизонтали, чтобы не слипались.
    player.body.x += (this.players.size % 5) * 14 - 28;
    player.respawnX = spawn.x;
    player.respawnY = spawn.y;
    void options;
    this.players.set(id, player);
    this.recountParty();
    return player;
  }

  removePlayer(id: string): void {
    const player = this.players.get(id);
    if (!player) return;
    // Игрок роняет переносимые предметы в безопасном состоянии (GDD §6.4).
    if (player.carrying !== null) {
      const item = this.items.get(player.carrying);
      if (item) dropItem(item, player, (event) => this.events.push(event));
    }
    this.players.delete(id);
    this.interactionTargets.delete(id);
    this.activeHints.delete(id);
    this.recountParty();
  }

  /** Пересчёт активаторов и интенсивности после изменения состава (GDD §6.4). */
  recountParty(): void {
    let active = 0;
    for (const player of this.players.values()) {
      if (player.state !== PlayerState.Spectating) active++;
    }
    this.activeCount = Math.max(1, active);
    this.requiredActivatorCount = requiredActivators(this.activeCount);
    this.intensity = hazardIntensity(this.activeCount);
  }

  /**
   * Малый состав чинит меньше узлов, но с более длинными окнами (GDD §6.2).
   *
   * Вызывается ровно один раз — в момент старта комнаты, когда состав уже
   * собрался. Делать это на каждом подключении нельзя: первый вошедший
   * зафиксировал бы соло-масштаб для всей будущей бригады.
   */
  private applyRepairScaling(): void {
    const nodes = [...this.devices.values()].filter((device) => device.kind === 'node');
    if (nodes.length === 0) return;
    const active = repairNodeCount(this.activeCount, this.room.scaling.repairNodes ?? nodes.length);
    for (let i = active; i < nodes.length; i++) {
      nodes[i].progress = 1;
      nodes[i].actors = 0;
      nodes[i].active = true;
    }
  }

  // -------------------------------------------------------------------- тик

  step(inputs: ReadonlyMap<string, InputFrame>): SimEvent[] {
    this.events = [];
    this.tick++;
    this.elapsed += FIXED_DT;
    this.itemEnv.tick = this.tick;

    this.updateTimedDevices();
    this.rebuildSolids();

    this.stepPlayers(inputs);
    applySoftPush([...this.players.values()], FIXED_DT);
    this.stepCarts();
    this.stepItems();

    this.evaluateSensors();
    this.applyHazards();
    this.resolveInteractions(inputs);
    this.updateObjectives();
    this.updatePhase();
    this.updatePings();
    this.updateHints();

    for (const signal of this.signals.drainChanges()) {
      this.events.push({ type: 'signal_changed', signal, value: this.signals.get(signal) });
    }
    return this.events;
  }

  private emit = (event: SimEvent): void => {
    this.events.push(event);
  };

  // ------------------------------------------------------------- устройства

  private updateTimedDevices(): void {
    const time = this.elapsed;
    for (const device of this.devices.values()) {
      switch (device.kind) {
        case 'press': {
          const def = device.def as PressDef;
          if (def.poweredBy && !this.signals.get(def.poweredBy)) {
            device.phase = HazardPhase.Idle;
            device.progress = 0;
            if (device.solid) {
              device.solid.rect.y = def.y * TILE;
              device.solid.vy = 0;
            }
            break;
          }
          const travelPx = def.travel * TILE;
          const pose = pressPose(time, device.offset, travelPx, this.intensity);
          device.phase = pose.phase;
          device.progress = travelPx > 0 ? pose.drop / travelPx : 0;
          device.rect = { x: def.x * TILE, y: def.y * TILE + pose.drop, w: def.w * TILE, h: TILE };
          if (device.solid) {
            device.solid.rect.x = device.rect.x;
            device.solid.rect.y = device.rect.y;
            device.solid.rect.w = device.rect.w;
            device.solid.rect.h = device.rect.h;
            device.solid.vy = pose.vy;
          }
          break;
        }
        case 'magnet': {
          const def = device.def as MagnetDef;
          if (def.poweredBy && !this.signals.get(def.poweredBy)) {
            device.phase = HazardPhase.Idle;
            device.progress = 0;
            break;
          }
          const state = magnetPhase(time, device.offset, this.intensity);
          device.phase = state.phase;
          device.progress = state.strength;
          break;
        }
        case 'live': {
          const def = device.def as LiveZoneDef;
          const energized = def.invert
            ? !this.signals.get(def.energizedWhen)
            : this.signals.get(def.energizedWhen);
          device.active = energized;
          if (!energized) {
            device.phase = HazardPhase.Idle;
            break;
          }
          device.phase = def.pulsed ? electricPhase(time, device.offset, this.intensity) : HazardPhase.Active;
          break;
        }
        case 'jet': {
          const def = device.def as JetDef;
          if (def.poweredBy && !this.signals.get(def.poweredBy)) {
            device.phase = HazardPhase.Idle;
            break;
          }
          device.phase = jetPhase(time, device.offset);
          break;
        }
        case 'conveyor': {
          const def = device.def as ConveyorDef;
          const powered = def.poweredBy ? this.signals.get(def.poweredBy) : true;
          const reversed = def.reverseWhen ? this.signals.get(def.reverseWhen) : false;
          device.active = powered;
          if (device.solid) {
            const speed = def.speed ?? HAZARD.conveyorSpeed;
            device.solid.surfaceVx = powered ? def.dir * speed * (reversed ? -1 : 1) : 0;
          }
          device.progress = device.solid ? device.solid.surfaceVx / HAZARD.conveyorSpeed : 0;
          break;
        }
        case 'door': {
          const def = device.def as DoorDef;
          const signal = this.signals.get(def.openWhen);
          const open = def.invert ? !signal : signal;
          device.active = open;
          device.progress = clamp(device.progress + (open ? 4 : -4) * FIXED_DT, 0, 1);
          if (device.solid) {
            device.solid.enabled = device.progress < 0.92;
            // Створка уезжает вверх, поэтому её видно и слышно (телеграфирование).
            const shift = def.slide === 'side' ? 0 : -device.progress * def.h * TILE;
            device.solid.rect.x = def.x * TILE + (def.slide === 'side' ? device.progress * def.w * TILE : 0);
            device.solid.rect.y = def.y * TILE + shift;
            // Клиент рисует и предсказывает столкновения по `rect`, поэтому он
            // обязан повторять положение створки, а не её исходную рамку.
            device.rect.x = device.solid.rect.x;
            device.rect.y = device.solid.rect.y;
          }
          break;
        }
        case 'lift': {
          const def = device.def as LiftDef;
          const running = this.signals.get(def.startWhen);
          const travelPx = def.travel * TILE;
          const speed = running ? 92 : 0;
          const previousY = device.rect.y;
          const targetY = def.y * TILE - (running ? travelPx : 0);
          device.rect.y = running
            ? Math.max(targetY, device.rect.y - speed * FIXED_DT)
            : Math.min(def.y * TILE, device.rect.y + speed * FIXED_DT);
          device.progress = travelPx > 0 ? clamp((def.y * TILE - device.rect.y) / travelPx, 0, 1) : 0;
          device.active = running;
          if (device.solid) {
            device.solid.rect.x = device.rect.x;
            device.solid.rect.y = device.rect.y;
            device.solid.rect.w = device.rect.w;
            device.solid.rect.h = device.rect.h;
            device.solid.vy = (device.rect.y - previousY) / FIXED_DT;
          }
          break;
        }
        case 'cooler': {
          const def = device.def as CoolerDef;
          device.active = def.poweredBy ? this.signals.get(def.poweredBy) : true;
          break;
        }
        case 'lever': {
          const def = device.def as LeverDef;
          if (def.autoResetSeconds && device.active) {
            device.timer += FIXED_DT;
            if (device.timer >= def.autoResetSeconds) {
              device.active = false;
              device.timer = 0;
              this.emit({ type: 'device_deactivated', deviceId: device.id, kind: 'lever', x: device.rect.x, y: device.rect.y });
            }
          }
          break;
        }
        case 'valve': {
          const def = device.def as ValveDef;
          // Вентиль закрывается сам, если его отпустили (GDD §8 «Запуск»).
          if (def.decays && device.actors === 0 && device.progress > 0) {
            device.progress = Math.max(0, device.progress - FIXED_DT / ((def.seconds ?? OBJECTIVE.valveTurnTime) * 2.4));
          }
          break;
        }
        default:
          break;
      }

      if (device.phase !== device.lastPhase) {
        const hazardKind = device.kind;
        if (device.phase === HazardPhase.Warn || device.phase === HazardPhase.Active) {
          this.emit({
            type: 'hazard_phase',
            deviceId: device.id,
            hazard: hazardKind,
            phase: device.phase === HazardPhase.Warn ? 'warn' : 'active',
            x: device.rect.x + device.rect.w / 2,
            y: device.rect.y + device.rect.h / 2,
          });
        }
        device.lastPhase = device.phase;
      }
    }
  }

  private rebuildSolids(): void {
    this.solids.length = 0;
    for (const device of this.devices.values()) {
      if (device.solid && device.solid.enabled) this.solids.push(device.solid);
    }
    for (const cart of this.carts) {
      const solid = this.cartSolids.get(cart.id);
      if (!solid) continue;
      solid.rect.x = cart.body.x - cart.body.hw;
      solid.rect.y = cart.body.y - cart.body.hh;
      solid.vx = cart.vx;
      solid.vy = cart.vy;
      solid.oneWay = true;
      this.solids.push(solid);
    }

    this.itemEnv.coolers = [...this.devices.values()]
      .filter((device) => device.kind === 'cooler' && device.active)
      .map((device) => ({ ...device.rect }));
    this.itemEnv.carts = this.carts.map((cart) => ({
      id: cart.id,
      x: cart.body.x - cart.body.hw,
      y: cart.body.y - cart.body.hh,
      w: cart.body.hw * 2,
      h: cart.body.hh * 2,
      vx: cart.vx,
    }));
  }

  // ---------------------------------------------------------------- игроки

  private stepPlayers(inputs: ReadonlyMap<string, InputFrame>): void {
    for (const player of this.players.values()) {
      const carried = player.carrying !== null ? this.items.get(player.carrying) ?? null : null;
      player.carrySpeedFactor = carried ? carrierSpeedFactor(carried) : 1;
      this.motionEnv.jumpFactor = carrierJumpFactor(carried);

      const input = inputs.get(player.id) ?? { ...player.lastInput, seq: player.lastInput.seq };
      const events = stepPlayerMotion(player, input, this.motionEnv, FIXED_DT);

      if (events.jumped) this.emit({ type: 'player_jumped', playerId: player.id, x: player.body.x, y: player.body.y });
      if (events.landed) {
        this.emit({ type: 'player_landed', playerId: player.id, x: player.body.x, y: player.body.y, speed: events.landingSpeed });
      }
      if (events.crushed && player.state === PlayerState.Active) {
        this.downPlayer(player, 'crush');
      }
      if (carried) player.stats.timeCarryingSeconds += FIXED_DT;

      this.updatePlayerLifecycle(player);
    }
  }

  private updatePlayerLifecycle(player: PlayerSim): void {
    // Падение за пределы комнаты — быстрый возврат, а не долгая пауза.
    if (player.body.y > this.map.heightPx + 140 && player.state !== PlayerState.Downed) {
      player.stats.falls++;
      this.downPlayer(player, 'fall');
    }
    if (this.map.containsTile(aabbToRect(player.body), Tile.Lethal) && player.state === PlayerState.Active) {
      this.downPlayer(player, 'lethal');
    }

    if (player.state === PlayerState.Downed) {
      player.downTimer -= FIXED_DT;
      if (player.downTimer <= 0) this.respawnPlayer(player);
    }
  }

  downPlayer(player: PlayerSim, cause: string): void {
    if (player.state === PlayerState.Downed || player.invulnerable > 0) return;
    player.state = PlayerState.Downed;
    player.downTimer = PLAYER.downedDuration;
    player.reviveProgress = 0;
    player.vx *= 0.2;
    player.sliding = false;
    if (player.carrying !== null) {
      const item = this.items.get(player.carrying);
      if (item) dropItem(item, player, this.emit);
    }
    this.emit({ type: 'player_downed', playerId: player.id, x: player.body.x, y: player.body.y, cause });
  }

  stunPlayer(player: PlayerSim, seconds: number, knockbackX: number, cause: string): void {
    if (player.state !== PlayerState.Active || player.invulnerable > 0) return;
    player.stunTimer = Math.max(player.stunTimer, clamp(seconds, PLAYER.stunMin, PLAYER.stunMax));
    player.vx += knockbackX;
    player.vy = Math.min(player.vy, -HAZARD.knockback * 0.4);
    player.sliding = false;
    player.stats.hazardHits++;
    // Сильный удар выбивает переносимое из рук — обратимое последствие.
    if (player.carrying !== null) {
      const item = this.items.get(player.carrying);
      if (item) {
        dropItem(item, player, this.emit);
        item.vx = knockbackX * 0.8;
        item.vy = -180;
      }
    }
    this.emit({ type: 'player_stunned', playerId: player.id, x: player.body.x, y: player.body.y, cause });
  }

  respawnPlayer(player: PlayerSim): void {
    player.state = PlayerState.Active;
    player.stunTimer = 0;
    player.downTimer = 0;
    player.reviveProgress = 0;
    player.invulnerable = PLAYER.invulnerableTime;
    player.body.x = player.respawnX;
    player.body.y = player.respawnY;
    player.vx = 0;
    player.vy = 0;
    player.sliding = false;
    this.emit({ type: 'player_respawned', playerId: player.id, x: player.body.x, y: player.body.y });
  }

  // ---------------------------------------------------------------- тележки

  private stepCarts(): void {
    for (const cart of this.carts) {
      // Игрок разгоняет тележку контактом сбоку.
      let pushDirection = 0;
      const cartRect = aabbToRect(cart.body);
      for (const player of this.players.values()) {
        if (player.state !== PlayerState.Active) continue;
        const playerRect = aabbToRect(player.body);
        const expanded = { x: cartRect.x - 8, y: cartRect.y - 6, w: cartRect.w + 16, h: cartRect.h + 6 };
        if (!rectOverlaps(playerRect, expanded)) continue;
        // Толкаем только сбоку, не сверху.
        if (player.body.y + player.body.hh < cartRect.y + 6) continue;
        const dir = sign(player.body.x < cart.body.x ? 1 : -1);
        if (sign(player.vx) === dir && Math.abs(player.vx) > 30) pushDirection += dir;
      }

      if (pushDirection !== 0) {
        cart.vx += sign(pushDirection) * CART.pushAccel * FIXED_DT;
      } else {
        cart.vx -= sign(cart.vx) * Math.min(Math.abs(cart.vx), CART.friction * FIXED_DT);
      }
      cart.vx = clamp(cart.vx, -CART.maxSpeed, CART.maxSpeed);
      cart.vy = Math.min(cart.vy + CART.gravity * FIXED_DT, 900);

      const others = this.solids.filter((solid) => solid.id !== cart.id);
      moveBody(cart.body, cart.vx * FIXED_DT, cart.vy * FIXED_DT, this.map, others, this.moveScratch);
      if (this.moveScratch.hitLeft || this.moveScratch.hitRight) cart.vx = 0;
      if (this.moveScratch.hitBottom) cart.vy = 0;
      const ground = isGrounded(cart.body, this.map, others);
      cart.grounded = ground.grounded;

      // Тележка не может уехать за пределы комнаты — иначе соло-путь исчезнет.
      cart.body.x = clamp(cart.body.x, cart.body.hw, this.map.widthPx - cart.body.hw);
      if (cart.body.y > this.map.heightPx + 80) {
        const spawn = (this.room.entities.find(
          (entity) => entity.type === 'cart' && entity.id === cart.id,
        ) as { x: number; y: number } | undefined) ?? { x: 2, y: 2 };
        cart.body.x = spawn.x * TILE + CART.width / 2;
        cart.body.y = spawn.y * TILE + CART.height / 2;
        cart.vx = 0;
        cart.vy = 0;
      }
    }
  }

  // --------------------------------------------------------------- предметы

  private stepItems(): void {
    for (const item of this.items.values()) {
      stepItem(item, this.itemEnv, FIXED_DT, this.emit);
      this.applyMagnetsToItem(item);
      this.applyItemImpactToPlayers(item);
    }
  }

  private applyMagnetsToItem(item: ItemSim): void {
    const kind = itemKindOf(item);
    if (!kind.magnetic) return;
    for (const device of this.devices.values()) {
      if (device.kind !== 'magnet' || device.phase !== HazardPhase.Active) continue;
      const def = device.def as MagnetDef;
      const radius = (def.radius ?? HAZARD.magnetRadius / TILE) * TILE;
      const cx = device.rect.x + device.rect.w / 2;
      const cy = device.rect.y + device.rect.h / 2;
      const dist = distance(item.body.x, item.body.y, cx, cy);
      if (dist > radius || dist < 1) continue;

      const pull = (HAZARD.magnetForce * device.progress * (1 - dist / radius)) / Math.max(0.6, kind.mass);
      item.vx += ((cx - item.body.x) / dist) * pull * FIXED_DT;
      item.vy += ((cy - item.body.y) / dist) * pull * FIXED_DT;

      // Магнит вырывает металлические инструменты из рук (GDD §9.2).
      if (item.holders.length > 0 && dist < radius * 0.55 && device.progress > 0.7) {
        for (const id of [...item.holders]) {
          const holder = this.players.get(id);
          if (holder) dropItem(item, holder, this.emit);
        }
      }
    }
  }

  /** Летящий предмет оглушает игрока — это комично и полностью обратимо. */
  private applyItemImpactToPlayers(item: ItemSim): void {
    if (item.holders.length > 0) return;
    const speed = Math.hypot(item.vx, item.vy);
    if (speed < ITEM_TUNING.impactStunSpeed) return;
    const itemRect = aabbToRect(item.body);
    for (const player of this.players.values()) {
      if (player.state !== PlayerState.Active || player.invulnerable > 0) continue;
      if (!rectOverlaps(itemRect, aabbToRect(player.body))) continue;
      this.stunPlayer(player, PLAYER.stunMin + 0.2, sign(item.vx) * 190, 'item');
      item.vx *= -0.3;
      item.vy = -120;
    }
  }

  // --------------------------------------------------------------- сенсоры

  private evaluateSensors(): void {
    this.plateGroups.clear();

    for (const device of this.devices.values()) {
      switch (device.kind) {
        case 'plate': {
          const def = device.def as PlateDef;
          const rect = device.rect;
          let actors = 0;
          for (const player of this.players.values()) {
            if (player.state === PlayerState.Spectating) continue;
            const body = aabbToRect(player.body);
            if (rectOverlaps(body, { x: rect.x, y: rect.y - 10, w: rect.w, h: rect.h + 14 })) actors++;
          }
          // Тяжёлый груз тоже давит на плиту — это резервный механизм для соло.
          for (const item of this.items.values()) {
            if (itemKindOf(item).mass < 1.5) continue;
            if (item.holders.length > 0) continue;
            const body = aabbToRect(item.body);
            if (rectOverlaps(body, { x: rect.x, y: rect.y - 10, w: rect.w, h: rect.h + 14 })) actors++;
          }
          device.actors = actors;
          const pressed = actors > 0;
          if (pressed && def.latching) device.latched = true;
          device.active = pressed || device.latched;
          device.progress = device.active ? 1 : 0;
          this.signals.set(def.signal, device.active);
          if (def.group) {
            this.plateGroups.set(def.group, (this.plateGroups.get(def.group) ?? 0) + (device.active ? 1 : 0));
          }
          break;
        }
        case 'lever': {
          const def = device.def as LeverDef;
          this.signals.set(def.signal, device.active);
          device.progress = device.active ? 1 : 0;
          break;
        }
        case 'valve': {
          const def = device.def as ValveDef;
          this.signals.set(def.signal, device.progress >= 1);
          break;
        }
        case 'node': {
          const def = device.def as RepairNodeDef;
          this.signals.set(def.signal, device.progress >= 1);
          break;
        }
        default:
          break;
      }
    }

    // Группа активаторов: нужно ровно `requiredActivators(N)` штук, не больше
    // (GDD §6.3) — сколько бы плит в комнате ни лежало.
    for (const [group, count] of this.plateGroups) {
      const required = this.requiredActivatorCount;
      this.signals.set(`${group}.ready`, count >= required);
    }
    if (this.room.scaling.activatorGroup && !this.plateGroups.has(this.room.scaling.activatorGroup)) {
      this.signals.set(`${this.room.scaling.activatorGroup}.ready`, false);
    }
  }

  /** Сколько плит группы нажато прямо сейчас — нужно для подсказки в UI. */
  plateGroupCount(group: string): number {
    return this.plateGroups.get(group) ?? 0;
  }

  // -------------------------------------------------------------- опасности

  private applyHazards(): void {
    for (const device of this.devices.values()) {
      if (device.phase !== HazardPhase.Active) continue;

      switch (device.kind) {
        case 'press': {
          for (const player of this.players.values()) {
            if (player.state !== PlayerState.Active) continue;
            if (!rectOverlaps(aabbToRect(player.body), device.rect)) continue;
            this.emit({ type: 'hazard_hit', playerId: player.id, hazard: 'press', x: player.body.x, y: player.body.y });
            // Пресс не убивает мгновенно: сначала отбрасывает и оглушает.
            const escapeDir = player.body.x < device.rect.x + device.rect.w / 2 ? -1 : 1;
            this.stunPlayer(player, PLAYER.stunMax, escapeDir * HAZARD.knockback, 'press');
          }
          for (const item of this.items.values()) {
            if (!rectOverlaps(aabbToRect(item.body), device.rect)) continue;
            item.vy = Math.max(item.vy, 220);
            item.vx += (item.body.x < device.rect.x + device.rect.w / 2 ? -1 : 1) * 160;
          }
          break;
        }
        case 'live': {
          const rect = device.rect;
          for (const player of this.players.values()) {
            if (player.state !== PlayerState.Active) continue;
            if (!rectOverlaps(aabbToRect(player.body), rect)) continue;
            // Изолирующие перчатки в руках защищают от тока (GDD §7.2).
            if (this.playerHoldsKind(player, 'gloves')) continue;
            this.emit({ type: 'hazard_hit', playerId: player.id, hazard: 'electric', x: player.body.x, y: player.body.y });
            this.downPlayer(player, 'electric');
          }
          break;
        }
        case 'jet': {
          const def = device.def as JetDef;
          const rect = device.rect;
          const push =
            def.dir === 'left' ? -1 : def.dir === 'right' ? 1 : 0;
          for (const player of this.players.values()) {
            if (player.state !== PlayerState.Active) continue;
            if (!rectOverlaps(aabbToRect(player.body), rect)) continue;
            this.emit({ type: 'hazard_hit', playerId: player.id, hazard: 'jet', x: player.body.x, y: player.body.y });
            if (def.dir === 'up') {
              player.vy = -HAZARD.knockback * 1.25;
            } else {
              this.stunPlayer(player, PLAYER.stunMin, push * HAZARD.knockback, 'jet');
            }
          }
          for (const item of this.items.values()) {
            if (item.holders.length > 0) continue;
            if (!rectOverlaps(aabbToRect(item.body), rect)) continue;
            // Вентилятор переносит лёгкие объекты (GDD §9.2).
            const mass = Math.max(0.4, itemKindOf(item).mass);
            if (def.dir === 'up') item.vy -= (900 / mass) * FIXED_DT;
            else item.vx += (push * 700 / mass) * FIXED_DT;
          }
          break;
        }
        default:
          break;
      }
    }
  }

  private playerHoldsKind(player: PlayerSim, kind: string): boolean {
    if (player.carrying === null) return false;
    const item = this.items.get(player.carrying);
    return item?.kind === kind;
  }

  // ---------------------------------------------------------- взаимодействие

  private resolveInteractions(inputs: ReadonlyMap<string, InputFrame>): void {
    for (const player of this.players.values()) {
      const input = inputs.get(player.id) ?? player.lastInput;
      const target = this.findInteractionTarget(player);
      this.interactionTargets.set(player.id, target);

      const interactDown = isDown(input, Button.Interact);
      const throwDown = isDown(input, Button.Throw);

      // Фронт нажатия считается по отдельному снимку кнопок: `lastInput` к
      // этому моменту уже перезаписан шагом движения.
      const previousButtons = player.previousButtons;
      player.previousButtons = input.buttons;

      if (player.state !== PlayerState.Active || player.stunTimer > 0) {
        player.interactHold = 0;
        continue;
      }

      // Отпустили кнопку — аккуратно кладём предмет (GDD §5.1).
      if (!interactDown && player.carrying !== null) {
        const item = this.items.get(player.carrying);
        if (item) dropItem(item, player, this.emit);
      }

      if (throwDown && player.carrying !== null) {
        const item = this.items.get(player.carrying);
        if (item && item.grabCooldown <= 0) {
          const aim = input.aim === 0 ? (player.facing > 0 ? 0 : Math.PI) : unpackAngle(input.aim);
          throwItem(item, player, aim, this.emit);
        }
      }

      if (interactDown) {
        player.interactHold += FIXED_DT;
        this.applyHeldInteraction(player, target);
      } else {
        player.interactHold = 0;
        this.clearHeldInteraction(player);
      }

      const pressedInteract = interactDown && (previousButtons & Button.Interact) === 0;
      if (pressedInteract) this.applyInteractionPress(player, target);

      const pressedPing = isDown(input, Button.Ping) && (previousButtons & Button.Ping) === 0;
      if (pressedPing) this.placePing(player, input);
    }
  }

  private applyInteractionPress(player: PlayerSim, target: InteractionTarget): void {
    if (!target) return;
    if (target.kind === 'item' && player.carrying === null) {
      const item = this.items.get(target.itemId);
      if (item) this.tryGrab(player, item);
      return;
    }
    if (target.kind === 'device') {
      const device = this.devices.get(target.deviceId);
      if (device && device.kind === 'lever') {
        device.active = !device.active;
        device.timer = 0;
        this.emit({
          type: device.active ? 'device_activated' : 'device_deactivated',
          deviceId: device.id,
          kind: 'lever',
          x: device.rect.x,
          y: device.rect.y,
        });
      }
    }
  }

  private applyHeldInteraction(player: PlayerSim, target: InteractionTarget): void {
    if (!target) return;

    if (target.kind === 'revive') {
      const downed = this.players.get(target.playerId);
      if (!downed || downed.state !== PlayerState.Downed) return;
      const helpers = this.countRescuers(downed);
      const duration = reviveDuration(PLAYER.reviveBaseTime, helpers);
      downed.reviveProgress = clamp(downed.reviveProgress + FIXED_DT / duration, 0, 1);
      if (downed.reviveProgress >= 1) {
        downed.state = PlayerState.Active;
        downed.downTimer = 0;
        downed.reviveProgress = 0;
        downed.invulnerable = PLAYER.invulnerableTime;
        downed.vy = -180;
        player.stats.revives++;
        this.emit({ type: 'player_revived', playerId: downed.id, byId: player.id, x: downed.body.x, y: downed.body.y });
      }
      return;
    }

    if (target.kind === 'device') {
      const device = this.devices.get(target.deviceId);
      if (!device) return;
      if (device.kind === 'valve') {
        const def = device.def as ValveDef;
        const seconds = (def.seconds ?? OBJECTIVE.valveTurnTime) * objectiveTimeScale(this.activeCount);
        device.actors++;
        device.progress = clamp(device.progress + FIXED_DT / seconds, 0, 1);
        if (device.progress >= 1 && device.lastPhase !== HazardPhase.Active) {
          device.lastPhase = HazardPhase.Active;
          this.emit({ type: 'device_activated', deviceId: device.id, kind: 'valve', x: device.rect.x, y: device.rect.y });
        }
      } else if (device.kind === 'node') {
        const def = device.def as RepairNodeDef;
        // Узел под напряжением бьёт током без перчаток — читаемая опасность.
        // Второй путь всегда есть: обесточить линию рубильником.
        if (def.liveWhen && this.signals.get(def.liveWhen) && !this.playerHoldsKind(player, 'gloves')) {
          this.emit({ type: 'hazard_hit', playerId: player.id, hazard: 'node', x: player.body.x, y: player.body.y });
          this.stunPlayer(player, PLAYER.stunMax, -player.facing * 240, 'node');
          return;
        }
        if (def.requiresItem && !this.playerHoldsKind(player, def.requiresItem)) return;
        const seconds = (def.seconds ?? OBJECTIVE.repairNodeTime) * objectiveTimeScale(this.activeCount);
        device.actors++;
        device.progress = clamp(device.progress + FIXED_DT / seconds, 0, 1);
        if (device.progress >= 1 && device.lastPhase !== HazardPhase.Active) {
          device.lastPhase = HazardPhase.Active;
          this.emit({ type: 'device_activated', deviceId: device.id, kind: 'node', x: device.rect.x, y: device.rect.y });
        }
      }
    }
  }

  private clearHeldInteraction(player: PlayerSim): void {
    void player;
  }

  /** Сколько игроков сейчас поднимают лежащего. */
  private countRescuers(downed: PlayerSim): number {
    let count = 0;
    for (const other of this.players.values()) {
      if (other.id === downed.id || other.state !== PlayerState.Active) continue;
      if (other.interactHold <= 0) continue;
      if (distance(other.body.x, other.body.y, downed.body.x, downed.body.y) <= PLAYER.interactRange) count++;
    }
    return Math.max(1, count);
  }

  private tryGrab(player: PlayerSim, item: ItemSim): void {
    if (item.grabCooldown > 0 || player.grabCooldown > 0) return;
    // Проверка дистанции на сервере (GDD §16.2).
    if (distance(player.body.x, player.body.y, item.body.x, item.body.y) > NET.grabMaxDistance) return;

    const kind = itemKindOf(item);
    const maxHolders = clamp(kind.requiredStrength + 1, 1, 4);
    if (item.holders.includes(player.id)) return;

    if (item.holders.length >= maxHolders) {
      // Лёгкий предмет можно вырвать из рук — обратимая помеха (GDD §7.3).
      if (kind.requiredStrength > 1) return;
      const victimId = item.holders[0];
      const victim = this.players.get(victimId);
      if (victim) {
        victim.carrying = null;
        item.holders.shift();
        this.emit({ type: 'item_released', itemId: item.id, playerId: victimId, kind: item.kind });
      }
    }

    item.holders.push(player.id);
    item.lastOwnerChangeTick = this.tick;
    player.carrying = item.id;
    player.grabCooldown = PLAYER.grabCooldown;
    player.sliding = false;
    player.stats.itemsCarried++;
    this.emit({ type: 'item_grabbed', itemId: item.id, playerId: player.id, kind: item.kind, carriers: item.holders.length });
  }

  /**
   * Выбор цели взаимодействия внутри конуса перед персонажем.
   * Приоритет по GDD §5.3: товарищ в опасности → активная задача →
   * переносимый предмет → обычный объект.
   */
  findInteractionTarget(player: PlayerSim): InteractionTarget {
    if (player.state !== PlayerState.Active) return null;

    let best: InteractionTarget = null;
    let bestScore = Number.POSITIVE_INFINITY;

    const consider = (x: number, y: number, priority: number, candidate: InteractionTarget): void => {
      const dist = distance(player.body.x, player.body.y, x, y);
      if (dist > PLAYER.interactRange) return;
      const dirX = x - player.body.x;
      const facingDot = dist < 1 ? 1 : (dirX / dist) * player.facing;
      if (facingDot < PLAYER.interactConeCos) return;
      const score = priority * 1000 + dist;
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    };

    for (const other of this.players.values()) {
      if (other.id === player.id || other.state !== PlayerState.Downed) continue;
      consider(other.body.x, other.body.y, 0, { kind: 'revive', playerId: other.id });
    }

    for (const device of this.devices.values()) {
      if (device.kind === 'valve' && device.progress < 1) {
        consider(device.rect.x + device.rect.w / 2, device.rect.y + device.rect.h / 2, 1, {
          kind: 'device', deviceId: device.id, verb: 'Крутить',
        });
      } else if (device.kind === 'node' && device.progress < 1) {
        consider(device.rect.x + device.rect.w / 2, device.rect.y + device.rect.h / 2, 1, {
          kind: 'device', deviceId: device.id, verb: 'Чинить',
        });
      } else if (device.kind === 'lever') {
        consider(device.rect.x + device.rect.w / 2, device.rect.y + device.rect.h / 2, 3, {
          kind: 'device', deviceId: device.id, verb: device.active ? 'Выключить' : 'Включить',
        });
      }
    }

    if (player.carrying === null) {
      for (const item of this.items.values()) {
        if (item.grabCooldown > 0) continue;
        const priority = itemKindOf(item).keyItem ? 2 : 3;
        consider(item.body.x, item.body.y, priority, { kind: 'item', itemId: item.id });
      }
    }

    return best;
  }

  private placePing(player: PlayerSim, input: InputFrame): void {
    const angle = unpackAngle(input.aim);
    const reach = 96;
    const x = player.body.x + Math.cos(angle) * reach;
    const y = player.body.y + Math.sin(angle) * reach;
    // Пинг «нужна помощь» выбирается автоматически, когда рядом лежит товарищ.
    let type: PingType = 'here';
    for (const other of this.players.values()) {
      if (other.id !== player.id && other.state === PlayerState.Downed) {
        type = 'help';
        break;
      }
    }
    if (this.map.containsTile({ x: x - 16, y: y - 16, w: 32, h: 32 }, Tile.Lethal)) type = 'danger';

    this.pings.push({
      id: this.nextPingId++,
      playerId: player.id,
      type,
      x: clamp(x, 0, this.map.widthPx),
      y: clamp(y, 0, this.map.heightPx),
      expiresAtTick: this.tick + 90,
    });
    if (this.pings.length > 24) this.pings.shift();
    this.emit({ type: 'ping_placed', playerId: player.id, pingType: type, x, y });
    void PING_TYPES;
  }

  private updatePings(): void {
    for (let i = this.pings.length - 1; i >= 0; i--) {
      if (this.pings[i].expiresAtTick <= this.tick) this.pings.splice(i, 1);
    }
  }

  private updateHints(): void {
    this.activeHints.clear();
    for (const player of this.players.values()) {
      const body = aabbToRect(player.body);
      for (const hint of this.hints) {
        if (hint.hideWhen && this.signals.get(hint.hideWhen)) continue;
        const rect: RectPx = {
          x: hint.x * TILE - HINT_MARGIN,
          y: hint.y * TILE - HINT_MARGIN,
          w: hint.w * TILE + HINT_MARGIN * 2,
          h: hint.h * TILE + HINT_MARGIN * 2,
        };
        if (rectOverlaps(body, rect)) {
          this.activeHints.set(player.id, hint.text);
          break;
        }
      }
    }

    // Чекпоинты обновляют точку возврата всей команде.
    for (const checkpoint of this.checkpoints) {
      const rect = { x: checkpoint.x * TILE, y: checkpoint.y * TILE, w: checkpoint.w * TILE, h: checkpoint.h * TILE };
      for (const player of this.players.values()) {
        if (!rectOverlaps(aabbToRect(player.body), rect)) continue;
        for (const other of this.players.values()) {
          other.respawnX = checkpoint.respawnX * TILE + TILE / 2;
          other.respawnY = checkpoint.respawnY * TILE + TILE / 2;
        }
      }
    }
  }

  // ------------------------------------------------------------------- цели

  private updateObjectives(): void {
    for (const objective of this.objectives) {
      if (objective.done) continue;
      const before = objective.progress;

      switch (objective.def.type) {
        case 'deliver': {
          const item = this.findItemByDefId(objective.def.item);
          if (!item) break;
          const zone = tileRectToPx(objective.def.zone);
          const inside = rectOverlaps(aabbToRect(item.body), zone);
          const damageOk = objective.def.maxDamage === undefined || item.damage <= objective.def.maxDamage;
          const heatOk = objective.def.maxHeat === undefined || item.heat <= objective.def.maxHeat;
          objective.progress = inside ? (damageOk && heatOk ? 1 : 0.75) : clamp(1 - distanceToRect(item.body.x, item.body.y, zone) / this.map.widthPx, 0, 0.7);
          if (inside && damageOk && heatOk) objective.done = true;
          break;
        }
        case 'signals': {
          const required = objective.def.require;
          const count = this.signals.countTrue(required);
          objective.progress = required.length === 0 ? 1 : count / required.length;
          if (count === required.length) objective.done = true;
          break;
        }
        case 'hold': {
          const seconds = objective.def.seconds * objectiveTimeScale(this.activeCount);
          const active = this.signals.get(objective.def.signal);
          if (active) {
            objective.timer += FIXED_DT;
          } else if (objective.def.decays) {
            objective.timer = Math.max(0, objective.timer - FIXED_DT * 0.6);
          }
          objective.progress = clamp(objective.timer / seconds, 0, 1);
          if (objective.progress >= 1) objective.done = true;
          break;
        }
        case 'collect': {
          const zone = tileRectToPx(objective.def.zone);
          let count = 0;
          for (const item of this.items.values()) {
            if (item.kind !== objective.def.kind) continue;
            if (item.holders.length > 0) continue;
            if (rectOverlaps(aabbToRect(item.body), zone)) count++;
          }
          objective.progress = clamp(count / objective.def.count, 0, 1);
          if (count >= objective.def.count) objective.done = true;
          break;
        }
        case 'evacuate': {
          const zone = tileRectToPx(objective.def.zone);
          let inside = 0;
          let alive = 0;
          for (const player of this.players.values()) {
            if (player.state === PlayerState.Spectating) continue;
            alive++;
            if (rectOverlaps(aabbToRect(player.body), zone)) inside++;
          }
          const needed = Math.max(1, Math.ceil(alive * (objective.def.fraction ?? 1)));
          objective.progress = alive === 0 ? 0 : clamp(inside / needed, 0, 1);
          this.signals.set(`${objective.def.id}.boarding`, inside > 0);
          if (inside >= needed) objective.done = true;
          break;
        }
        default:
          break;
      }

      if (objective.done) {
        this.emit({ type: 'objective_complete', objectiveId: objective.def.id, label: objective.label });
        this.signals.set(`${objective.def.id}.done`, true);
      } else if (Math.abs(objective.progress - before) > 0.02) {
        this.emit({
          type: 'objective_step',
          objectiveId: objective.def.id,
          progress: objective.progress,
          done: false,
          label: objective.label,
        });
      }
    }
  }

  private findItemByDefId(defId: string): ItemSim | undefined {
    for (const item of this.items.values()) if (item.defId === defId) return item;
    return undefined;
  }

  // ------------------------------------------------------------------ фазы

  private updatePhase(): void {
    if (this.phase === RoomPhase.Cleared || this.phase === RoomPhase.Failed) return;

    // Активная фаза запускается первым действием команды (GDD §4.1).
    if (!this.started && this.phase === RoomPhase.Briefing) {
      const moved = [...this.players.values()].some(
        (player) => Math.abs(player.vx) > 12 || player.carrying !== null,
      );
      if (moved) {
        this.started = true;
        this.applyRepairScaling();
        this.phase = this.room.catastrophe ? RoomPhase.Catastrophe : RoomPhase.Active;
        if (this.room.catastrophe) {
          this.emit({ type: 'catastrophe_started', roomId: this.room.id, seconds: CATASTROPHE.evacuationSeconds });
        }
      }
      return;
    }

    if (this.timeLeft > 0) {
      this.timeLeft = Math.max(0, this.timeLeft - FIXED_DT);
    }

    if (this.phase === RoomPhase.Catastrophe) {
      const seconds = CATASTROPHE.evacuationSeconds * objectiveTimeScale(this.activeCount);
      this.catastropheGauge = clamp(this.catastropheGauge + FIXED_DT / seconds, 0, 1);
    }

    const allDone = this.objectives.every((objective) => objective.done);
    if (allDone) {
      this.phase = RoomPhase.Cleared;
      this.clearedAtSeconds = this.elapsed;
      this.emit({ type: 'room_cleared', roomId: this.room.id, seconds: this.elapsed });
      return;
    }

    if (this.room.tutorial) return;

    // Условия общего поражения (GDD §12.2).
    if (this.room.timeLimit && this.timeLeft <= 0) {
      this.fail('timer');
      return;
    }
    if (this.phase === RoomPhase.Catastrophe && this.catastropheGauge >= 1) {
      this.fail('catastrophe');
      return;
    }
    const anyoneUp = [...this.players.values()].some((player) => player.state === PlayerState.Active);
    if (this.players.size > 0 && !anyoneUp) {
      // Автоспасение: если легли все, комната не проваливается мгновенно —
      // сначала срабатывает автоматический респаун (GDD §12.2).
      const everyoneStuck = [...this.players.values()].every(
        (player) => player.state === PlayerState.Downed && player.downTimer > PLAYER.downedDuration * 0.9,
      );
      if (everyoneStuck) this.emit({ type: 'chaos_variation', variation: 'auto_rescue', reason: 'wipe' });
    }
  }

  fail(reason: string): void {
    if (this.phase === RoomPhase.Failed) return;
    this.phase = RoomPhase.Failed;
    this.failReason = reason;
    this.emit({ type: 'room_failed', roomId: this.room.id, reason });
  }

  /** Мягкий перезапуск с чекпоинта: провал стоит 30–60 секунд, не больше. */
  restartFromCheckpoint(): void {
    this.phase = this.room.catastrophe ? RoomPhase.Catastrophe : RoomPhase.Active;
    this.failReason = '';
    this.catastropheGauge = 0;
    this.timeLeft = this.room.timeLimit ?? 0;
    for (const objective of this.objectives) {
      objective.done = false;
      objective.progress = 0;
      objective.timer = 0;
    }
    for (const item of this.items.values()) recoverItem(item, this.itemEnv);
    for (const device of this.devices.values()) {
      if (device.kind === 'valve' || device.kind === 'node') device.progress = 0;
      device.latched = false;
    }
    for (const player of this.players.values()) this.respawnPlayer(player);
  }

  // ------------------------------------------------------- директор хаоса

  /** Директор хаоса включает только подготовленные вариации (GDD §9.3). */
  applyModifier(modifier: string, reason: string): boolean {
    if (!this.room.modifiers.includes(modifier)) return false;
    if (this.activeModifiers.has(modifier)) return false;
    this.activeModifiers.add(modifier);
    this.signals.set(`mod.${modifier}`, true);
    this.emit({ type: 'chaos_variation', variation: modifier, reason });
    return true;
  }

  /** Сколько секунд у команды нет никакого прогресса — вход для директора. */
  progressRatio(): number {
    if (this.objectives.length === 0) return 1;
    const total = this.objectives.reduce((sum, objective) => sum + (objective.done ? 1 : objective.progress), 0);
    return total / this.objectives.length;
  }

  /** Разброс команды по горизонтали — вход для камеры и директора хаоса. */
  partySpread(): number {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const player of this.players.values()) {
      if (player.state === PlayerState.Spectating) continue;
      min = Math.min(min, player.body.x);
      max = Math.max(max, player.body.x);
    }
    return Number.isFinite(min) && Number.isFinite(max) ? max - min : 0;
  }

  /** Подсказка «нужно N активаторов» для интерфейса. */
  activatorStatus(): { required: number; active: number; group: string | null } {
    const group = this.room.scaling.activatorGroup ?? null;
    return {
      required: this.requiredActivatorCount,
      active: group ? this.plateGroupCount(group) : 0,
      group,
    };
  }

  /** Полное текущее время удержания плиты для конкретного состава. */
  currentHoldDuration(actorsOnPlate: number): number {
    return holdDuration(this.activeCount, actorsOnPlate);
  }

  /** Активное число ремонтных узлов после масштабирования. */
  activeRepairNodes(): number {
    return repairNodeCount(this.activeCount, this.room.scaling.repairNodes ?? 3);
  }
}

function tileRectToPx(rect: TileRect): RectPx {
  return { x: rect.x * TILE, y: rect.y * TILE, w: rect.w * TILE, h: rect.h * TILE };
}

function distanceToRect(px: number, py: number, rect: RectPx): number {
  const dx = Math.max(rect.x - px, 0, px - (rect.x + rect.w));
  const dy = Math.max(rect.y - py, 0, py - (rect.y + rect.h));
  return Math.hypot(dx, dy);
}
