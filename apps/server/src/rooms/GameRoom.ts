/**
 * Авторитетная игровая комната.
 *
 * Сервер владеет ключевыми предметами, целями, опасностями, выведением игроков
 * и итогами (GDD §16.1). Клиент присылает только ввод; всё остальное считается
 * здесь фиксированным тиком 30 Гц.
 */

import { Client, Room } from 'colyseus';
import {
  FIXED_DT,
  NET,
  PATCH_INTERVAL_MS,
  PLAYER_BADGES,
  PLAYER_COLORS,
  ROOM,
  RoomPhase,
  TICK_RATE,
  clampPartyLimit,
  decodeInput,
  getRoom,
  getShift,
  isWireInput,
  makeInput,
  World,
  type InputFrame,
  type PlayerResult,
  type ResultsPayload,
  type RoomChangedPayload,
  type ShiftDef,
  type SimEvent,
  type WelcomePayload,
} from '@uc/shared';
import { MESSAGE } from '@uc/shared';
import { ChaosDirector } from '../directors/ChaosDirector.js';
import { PlayerValidator } from '../net/PlayerValidator.js';
import { CartState, DeviceState, GameState, ItemState, ObjectiveState, PingState, PlayerState } from './schema.js';

interface JoinOptions {
  name?: string;
  colorIndex?: number;
  badgeIndex?: number;
  code?: string;
  shiftId?: string;
  maxPlayers?: number;
}

interface Connection {
  validator: PlayerValidator;
  queue: InputFrame[];
  lastFrame: InputFrame;
  latency: number;
  lastHint: string;
}

/** Пауза перед переходом в следующую комнату, секунды. */
const CLEAR_DELAY = 4;
/** Пауза перед мягким перезапуском после провала, секунды. */
const FAIL_DELAY = 3;

export class GameRoom extends Room<GameState> {
  override maxClients = ROOM.defaultMaxPlayers;

  private world!: World;
  private shift!: ShiftDef;
  private roomIndex = 0;
  private readonly connections = new Map<string, Connection>();
  private readonly chaos = new ChaosDirector();
  private transitionTimer = 0;
  private shiftStartedAt = 0;
  private shiftFinished = false;
  private seed = 0;

  override onCreate(options: JoinOptions): void {
    this.shift = getShift(options.shiftId ?? 'shift_factory');
    this.seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    this.maxClients = clampPartyLimit(options.maxPlayers ?? ROOM.defaultMaxPlayers);

    const state = new GameState();
    state.seed = this.seed;
    state.maxPlayers = this.maxClients;
    state.roomCode = options.code ?? '';
    state.shiftId = this.shift.id;
    state.roomTotal = this.shift.rooms.length;
    this.setState(state);

    this.setMetadata({ code: options.code ?? '', shiftId: this.shift.id, title: this.shift.title });
    this.setPatchRate(PATCH_INTERVAL_MS);

    this.loadRoom(0);
    this.registerMessageHandlers();

    this.setSimulationInterval(() => this.tick(), 1000 / TICK_RATE);
    this.shiftStartedAt = Date.now();
  }

  // ------------------------------------------------------------ подключения

  override onJoin(client: Client, options: JoinOptions = {}): void {
    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.name = sanitizeName(options.name) || `Работник ${this.state.players.size + 1}`;
    player.colorIndex = pickFree(
      options.colorIndex,
      PLAYER_COLORS.length,
      [...this.state.players.values()].map((other) => other.colorIndex),
    );
    player.badgeIndex = pickFree(
      options.badgeIndex,
      PLAYER_BADGES.length,
      [...this.state.players.values()].map((other) => other.badgeIndex),
    );
    this.state.players.set(client.sessionId, player);

    this.connections.set(client.sessionId, {
      validator: new PlayerValidator(),
      queue: [],
      lastFrame: makeInput(0),
      latency: 0,
      lastHint: '',
    });

    const sim = this.world.addPlayer(client.sessionId, {
      name: player.name,
      colorIndex: player.colorIndex,
      badgeIndex: player.badgeIndex,
    });
    player.x = sim.body.x;
    player.y = sim.body.y;

    const welcome: WelcomePayload = {
      sessionId: client.sessionId,
      roomCode: this.state.roomCode,
      tick: this.world.tick,
      tickRate: TICK_RATE,
      maxPlayers: this.maxClients,
      host: this.state.players.size === 1,
      // Подключение разрешено в безопасной комнате или на чекпоинте (GDD §6.4).
      joinedInProgress: this.world.phase !== RoomPhase.Briefing,
      serverTimeMs: Date.now(),
    };
    client.send(MESSAGE.Welcome, welcome);
    client.send(MESSAGE.RoomChanged, this.roomChangedPayload());
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;

    if (consented) {
      this.removePlayer(client.sessionId);
      return;
    }

    try {
      // Вернувшийся игрок появляется на последнем общем чекпоинте (GDD §6.4).
      await this.allowReconnection(client, NET.reconnectSeconds);
      const restored = this.state.players.get(client.sessionId);
      if (restored) restored.connected = true;
      const sim = this.world.players.get(client.sessionId);
      if (sim) this.world.respawnPlayer(sim);
    } catch {
      this.removePlayer(client.sessionId);
    }
  }

  private removePlayer(sessionId: string): void {
    this.world.removePlayer(sessionId);
    this.state.players.delete(sessionId);
    this.connections.delete(sessionId);
  }

  override onDispose(): void {
    this.connections.clear();
  }

  // ------------------------------------------------------------- сообщения

  private registerMessageHandlers(): void {
    this.onMessage<unknown>(MESSAGE.Input, (client, payload) => {
      const connection = this.connections.get(client.sessionId);
      if (!connection || !isWireInput(payload)) return;
      const decoded = decodeInput(payload);
      const frame = connection.validator.accept(decoded, Date.now());
      if (!frame) return;

      connection.queue.push(frame);
      // Клиент, убежавший вперёд, теряет самые старые кадры: они всё равно
      // устарели, а reconciliation переиграет остаток.
      while (connection.queue.length > NET.maxInputsPerTick * 2) connection.queue.shift();
    });

    this.onMessage<unknown>(MESSAGE.Ready, (client, payload) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.ready = payload === true;
    });

    this.onMessage<unknown>(MESSAGE.Appearance, (client, payload) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || typeof payload !== 'object' || payload === null) return;
      const data = payload as { name?: string; colorIndex?: number; badgeIndex?: number };
      if (typeof data.name === 'string') player.name = sanitizeName(data.name) || player.name;
      if (typeof data.colorIndex === 'number') {
        player.colorIndex = Math.abs(Math.floor(data.colorIndex)) % PLAYER_COLORS.length;
      }
      if (typeof data.badgeIndex === 'number') {
        player.badgeIndex = Math.abs(Math.floor(data.badgeIndex)) % PLAYER_BADGES.length;
      }
    });

    this.onMessage<unknown>(MESSAGE.RoomSettings, (client, payload) => {
      // Настройки приватной комнаты меняет только первый подключившийся.
      const first = this.state.players.keys().next().value;
      if (client.sessionId !== first) return;
      const data = payload as { friendlyInterference?: boolean; assist?: boolean; maxPlayers?: number };
      if (typeof data?.friendlyInterference === 'boolean') {
        this.state.friendlyInterference = data.friendlyInterference;
      }
      if (typeof data?.assist === 'boolean') this.state.assist = data.assist;
      if (typeof data?.maxPlayers === 'number') {
        this.maxClients = clampPartyLimit(data.maxPlayers);
        this.state.maxPlayers = this.maxClients;
      }
    });

    this.onMessage(MESSAGE.VoteRestart, (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.ready = true;
      const voters = [...this.state.players.values()].filter((entry) => entry.connected);
      const yes = voters.filter((entry) => entry.ready).length;
      if (voters.length > 0 && yes > voters.length / 2) {
        this.world.restartFromCheckpoint();
        this.transitionTimer = 0;
        for (const entry of this.state.players.values()) entry.ready = false;
      }
    });

    this.onMessage<unknown>(MESSAGE.Ping, (client, payload) => {
      const connection = this.connections.get(client.sessionId);
      const data = payload as { clientTimeMs?: number } | null;
      const clientTimeMs = typeof data?.clientTimeMs === 'number' ? data.clientTimeMs : 0;
      if (connection && clientTimeMs > 0) {
        connection.latency = Math.max(0, Math.min(2000, Date.now() - clientTimeMs));
        const player = this.state.players.get(client.sessionId);
        if (player) player.latency = Math.round(connection.latency);
      }
      client.send(MESSAGE.Pong, { clientTimeMs, serverTimeMs: Date.now(), tick: this.world.tick });
    });
  }

  // ------------------------------------------------------------------- тик

  private tick(): void {
    if (this.shiftFinished) return;

    const inputs = new Map<string, InputFrame>();
    for (const [sessionId, connection] of this.connections) {
      const frame = connection.queue.shift();
      if (frame) connection.lastFrame = frame;
      inputs.set(sessionId, connection.lastFrame);
    }

    const events = this.world.step(inputs);
    this.chaos.observe(events, this.world.elapsed);
    this.chaos.update(this.world, FIXED_DT, this.worstLatency());

    this.syncState();
    this.broadcastEvents(events);
    this.sendHints();
    this.updateProgression();
  }

  private worstLatency(): number {
    let worst = 0;
    for (const connection of this.connections.values()) worst = Math.max(worst, connection.latency);
    return worst;
  }

  private broadcastEvents(events: readonly SimEvent[]): void {
    if (events.length === 0) return;
    this.broadcast(MESSAGE.Events, { tick: this.world.tick, events });
  }

  private sendHints(): void {
    for (const [sessionId, connection] of this.connections) {
      const hint = this.world.activeHints.get(sessionId) ?? '';
      if (hint === connection.lastHint) continue;
      connection.lastHint = hint;
      const client = this.clients.find((entry) => entry.sessionId === sessionId);
      client?.send(MESSAGE.Hint, { text: hint, key: hint.slice(0, 24) });
    }
  }

  // -------------------------------------------------------- синхронизация

  private syncState(): void {
    const state = this.state;
    state.tick = this.world.tick;
    state.elapsed = round(this.world.elapsed, 3);
    state.phase = this.world.phase;
    state.catastropheGauge = round(this.world.catastropheGauge, 3);
    state.timeLeft = round(this.world.timeLeft, 2);
    state.failReason = this.world.failReason;

    state.activePlayers = this.world.activeCount;
    state.requiredActivators = this.world.requiredActivatorCount;
    const activators = this.world.activatorStatus();
    state.activeActivators = activators.active;
    state.intensity = round(this.world.intensity, 3);
    const modifiers = [...this.world.activeModifiers].join(',');
    if (state.modifiers !== modifiers) state.modifiers = modifiers;

    for (const [sessionId, sim] of this.world.players) {
      const player = state.players.get(sessionId);
      if (!player) continue;
      player.x = round(sim.body.x, 2);
      player.y = round(sim.body.y, 2);
      player.vx = round(sim.vx, 1);
      player.vy = round(sim.vy, 1);
      player.facing = sim.facing;
      player.state = sim.state;
      player.grounded = sim.grounded;
      player.sliding = sim.sliding;
      player.inWater = sim.inWater;
      player.halfHeight = Math.round(sim.body.hh);
      player.carrying = sim.carrying ?? 0;
      player.reviveProgress = round(sim.reviveProgress, 3);
      player.downTimer = round(sim.downTimer, 2);
      player.invulnerable = round(sim.invulnerable, 2);
      player.lastSeq = sim.lastAppliedSeq;
      player.revives = sim.stats.revives;
      player.itemsCarried = sim.stats.itemsCarried;
      player.throws = sim.stats.throws;
      player.hazardHits = sim.stats.hazardHits;
      player.falls = sim.stats.falls;
    }

    for (const [id, sim] of this.world.items) {
      const key = String(id);
      let item = state.items.get(key);
      if (!item) {
        item = new ItemState();
        item.id = id;
        item.defId = sim.defId;
        item.kind = sim.kind;
        state.items.set(key, item);
      }
      item.x = round(sim.body.x, 2);
      item.y = round(sim.body.y, 2);
      item.vx = round(sim.vx, 1);
      item.vy = round(sim.vy, 1);
      item.angle = round(sim.angle, 3);
      const holders = sim.holders.join(',');
      if (item.holders !== holders) item.holders = holders;
      item.heat = round(sim.heat, 3);
      item.damage = round(sim.damage, 3);
      item.charge = round(sim.charge, 2);
      item.onCart = sim.cartId !== null;
    }

    for (const [id, sim] of this.world.devices) {
      let device = state.devices.get(id);
      if (!device) {
        device = new DeviceState();
        device.id = id;
        device.kind = sim.kind;
        state.devices.set(id, device);
      }
      device.x = round(sim.rect.x, 2);
      device.y = round(sim.rect.y, 2);
      device.w = sim.rect.w;
      device.h = sim.rect.h;
      device.progress = round(sim.progress, 3);
      device.active = sim.active;
      device.phase = sim.phase;
      device.actors = Math.min(255, sim.actors);
    }

    for (const cart of this.world.carts) {
      let entry = state.carts.get(cart.id);
      if (!entry) {
        entry = new CartState();
        entry.id = cart.id;
        state.carts.set(cart.id, entry);
      }
      entry.x = round(cart.body.x, 2);
      entry.y = round(cart.body.y, 2);
      entry.vx = round(cart.vx, 1);
    }

    syncObjectives(state, this.world);
    syncPings(state, this.world);
  }

  // ------------------------------------------------------------- прогрессия

  private loadRoom(index: number): void {
    this.roomIndex = index;
    const roomDef = getRoom(this.shift.rooms[index]);
    this.world = new World(roomDef, this.seed + index * 7919);
    this.chaos.reset();
    this.transitionTimer = 0;

    // Переносим уже подключённых игроков в новую комнату.
    for (const [sessionId, player] of this.state.players) {
      const sim = this.world.addPlayer(sessionId, {
        name: player.name,
        colorIndex: player.colorIndex,
        badgeIndex: player.badgeIndex,
      });
      player.x = sim.body.x;
      player.y = sim.body.y;
      player.ready = false;
    }

    this.state.roomId = roomDef.id;
    this.state.roomIndex = index;
    this.state.roomTitle = roomDef.title;
    this.state.roomBrief = roomDef.brief;
    this.state.catastropheGauge = 0;
    this.state.failReason = '';
    this.state.modifiers = '';
    this.state.items.clear();
    this.state.devices.clear();
    this.state.carts.clear();
    this.state.objectives.clear();
    this.state.pings.clear();

    this.syncState();
    this.broadcast(MESSAGE.RoomChanged, this.roomChangedPayload());
  }

  private roomChangedPayload(): RoomChangedPayload {
    const roomDef = getRoom(this.shift.rooms[this.roomIndex]);
    return {
      roomId: roomDef.id,
      index: this.roomIndex,
      total: this.shift.rooms.length,
      title: roomDef.title,
      brief: roomDef.brief,
      fallbacks: roomDef.fallbacks,
    };
  }

  private updateProgression(): void {
    if (this.world.phase === RoomPhase.Cleared) {
      this.transitionTimer += FIXED_DT;
      if (this.transitionTimer < CLEAR_DELAY) return;
      if (this.roomIndex + 1 < this.shift.rooms.length) {
        this.loadRoom(this.roomIndex + 1);
      } else {
        this.finishShift(true);
      }
      return;
    }

    if (this.world.phase === RoomPhase.Failed) {
      this.transitionTimer += FIXED_DT;
      if (this.transitionTimer < FAIL_DELAY) return;
      // Провал не отнимает больше 30–60 секунд прогресса (GDD §12.3):
      // комната перезапускается с чекпоинта, а не смена целиком.
      this.world.restartFromCheckpoint();
      this.chaos.reset();
      this.transitionTimer = 0;
    }
  }

  private finishShift(cleared: boolean): void {
    if (this.shiftFinished) return;
    this.shiftFinished = true;
    const seconds = (Date.now() - this.shiftStartedAt) / 1000;

    const players: PlayerResult[] = [];
    for (const [sessionId, player] of this.state.players) {
      players.push({
        sessionId,
        name: player.name,
        revives: player.revives,
        itemsCarried: player.itemsCarried,
        throws: player.throws,
        hazardHits: player.hazardHits,
        falls: player.falls,
        title: funnyTitle(player),
      });
    }

    const totalHits = players.reduce((sum, entry) => sum + entry.hazardHits, 0);
    const totalRevives = players.reduce((sum, entry) => sum + entry.revives, 0);
    const results: ResultsPayload = {
      shiftId: this.shift.id,
      cleared,
      seconds: Math.round(seconds),
      grades: {
        safety: gradeFromCount(totalHits, players.length * 4),
        speed: gradeFromSeconds(seconds, this.shift.minutes[0] * 60),
        care: gradeFromCount(players.reduce((sum, entry) => sum + entry.falls, 0), players.length * 3),
        rescue: Math.min(5, 1 + totalRevives),
      },
      players,
    };
    this.broadcast(MESSAGE.Results, results);
  }
}

// ---------------------------------------------------------------- утилиты

function syncObjectives(state: GameState, world: World): void {
  while (state.objectives.length > world.objectives.length) state.objectives.pop();
  world.objectives.forEach((objective, index) => {
    let entry = state.objectives.at(index);
    if (!entry) {
      entry = new ObjectiveState();
      entry.id = objective.def.id;
      entry.kind = objective.def.type;
      entry.label = objective.label;
      state.objectives.push(entry);
    }
    if (entry.id !== objective.def.id) {
      entry.id = objective.def.id;
      entry.kind = objective.def.type;
      entry.label = objective.label;
    }
    entry.progress = round(objective.progress, 3);
    entry.done = objective.done;
  });
}

function syncPings(state: GameState, world: World): void {
  while (state.pings.length > world.pings.length) state.pings.pop();
  world.pings.forEach((ping, index) => {
    let entry = state.pings.at(index);
    if (!entry) {
      entry = new PingState();
      state.pings.push(entry);
    }
    if (entry.id !== ping.id) {
      entry.id = ping.id;
      entry.playerId = ping.playerId;
      entry.type = ping.type;
      entry.x = round(ping.x, 1);
      entry.y = round(ping.y, 1);
    }
  });
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sanitizeName(name: string | undefined): string {
  if (typeof name !== 'string') return '';
  return name.replace(/[\p{C}]/gu, '').trim().slice(0, 18);
}

function pickFree(requested: number | undefined, total: number, taken: readonly number[]): number {
  const used = new Set(taken);
  if (typeof requested === 'number' && Number.isFinite(requested)) {
    const wanted = Math.abs(Math.floor(requested)) % total;
    if (!used.has(wanted)) return wanted;
  }
  for (let i = 0; i < total; i++) if (!used.has(i)) return i;
  return 0;
}

/** Смешные титулы по статистике (GDD §13.1). */
function funnyTitle(player: PlayerState): string {
  if (player.revives >= 3) return 'Главный спасатель';
  if (player.throws >= 8) return 'Мастер случайных бросков';
  if (player.hazardHits >= 6) return 'Испытатель техники безопасности';
  if (player.falls >= 4) return 'Знаток нижних этажей';
  if (player.itemsCarried >= 8) return 'Незаменимый носильщик';
  return 'Ценный сотрудник';
}

function gradeFromCount(actual: number, budget: number): number {
  if (budget <= 0) return 5;
  return Math.max(1, Math.min(5, Math.round(5 - (actual / budget) * 4)));
}

function gradeFromSeconds(actual: number, target: number): number {
  if (target <= 0) return 5;
  return Math.max(1, Math.min(5, Math.round(5 - ((actual - target) / target) * 3)));
}
