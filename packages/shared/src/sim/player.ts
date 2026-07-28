/**
 * Контроллер персонажа.
 *
 * Этот файл — единственный источник правды о движении: сервер прогоняет его
 * авторитетно, клиент — для предсказания локального игрока. Поэтому функция
 * `stepPlayerMotion` строго детерминирована: фиксированный `dt`, никакого
 * обращения к текущему времени и никакого рендера.
 */

import { PLAYER } from '../config/tuning.js';
import type { AABB, DynamicSolid, TileMap } from './geometry.js';
import { Tile, aabbToRect, clampToBounds, emptyMoveResult, isGrounded, moveBody } from './geometry.js';
import { clamp, sign } from './math.js';
import { Button, PlayerState, isDown, makeInput, wasReleased, type InputFrame } from './types.js';

export interface PlayerSim {
  id: string;
  body: AABB;
  vx: number;
  vy: number;
  facing: 1 | -1;
  state: PlayerState;

  grounded: boolean;
  wasGrounded: boolean;
  sliding: boolean;
  inWater: boolean;

  coyote: number;
  jumpBuffer: number;
  slideTime: number;
  jumpHeld: boolean;

  /** Остаток оглушения, секунды. */
  stunTimer: number;
  /** Остаток состояния «выведен», секунды. */
  downTimer: number;
  /** Прогресс подъёма товарищами, 0..1. */
  reviveProgress: number;
  /** Неуязвимость после подъёма/респауна. */
  invulnerable: number;

  /** Предмет, который несёт игрок (несколько игроков могут нести один предмет). */
  carrying: number | null;
  /** Как долго удерживается кнопка взаимодействия — нужно для спасения и вентилей. */
  interactHold: number;
  /** Кулдаун захвата. */
  grabCooldown: number;

  /** Множитель скорости от переносимого груза, 0..1. */
  carrySpeedFactor: number;

  /** Точка возврата — последний чекпоинт. */
  respawnX: number;
  respawnY: number;

  /** Последний применённый ввод — по нему клиент сверяет предсказание. */
  lastInput: InputFrame;
  lastAppliedSeq: number;
  /**
   * Кнопки предыдущего тика для определения фронта нажатия.
   *
   * Отдельное поле, а не `lastInput.buttons`: движение обрабатывается раньше
   * взаимодействий и уже успевает записать в `lastInput` текущий кадр, так что
   * сравнение с ним всегда давало бы «кнопка была нажата и раньше».
   */
  previousButtons: number;

  /** Скорость поверхности под ногами (конвейер, платформа). */
  groundSurfaceVx: number;
  /** Стоит на скользком. */
  onSlippery: boolean;
  /** Идентификатор солида под ногами — для наследования движения платформы. */
  groundSolidId: string | null;

  /** Статистика для итогового экрана. */
  stats: PlayerStats;
}

export interface PlayerStats {
  revives: number;
  falls: number;
  itemsCarried: number;
  throws: number;
  hazardHits: number;
  timeCarryingSeconds: number;
}

export function createPlayerSim(id: string, x: number, y: number): PlayerSim {
  return {
    id,
    body: { x, y, hw: PLAYER.width / 2, hh: PLAYER.height / 2 },
    vx: 0,
    vy: 0,
    facing: 1,
    state: PlayerState.Active,
    grounded: false,
    wasGrounded: false,
    sliding: false,
    inWater: false,
    coyote: 0,
    jumpBuffer: 0,
    slideTime: 0,
    jumpHeld: false,
    stunTimer: 0,
    downTimer: 0,
    reviveProgress: 0,
    invulnerable: PLAYER.invulnerableTime,
    carrying: null,
    interactHold: 0,
    grabCooldown: 0,
    carrySpeedFactor: 1,
    respawnX: x,
    respawnY: y,
    lastInput: makeInput(0),
    lastAppliedSeq: 0,
    previousButtons: 0,
    groundSurfaceVx: 0,
    onSlippery: false,
    groundSolidId: null,
    stats: { revives: 0, falls: 0, itemsCarried: 0, throws: 0, hazardHits: 0, timeCarryingSeconds: 0 },
  };
}

export interface MotionEnv {
  map: TileMap;
  solids: readonly DynamicSolid[];
  /** Множитель высоты прыжка от груза (тяжёлое — прыгаешь ниже). */
  jumpFactor: number;
}

export interface MotionEvents {
  jumped: boolean;
  landed: boolean;
  landingSpeed: number;
  crushed: boolean;
  startedSliding: boolean;
}

const moveResult = emptyMoveResult();

/**
 * Один шаг движения персонажа. `dt` всегда фиксированный (GDD §17.5).
 * Возвращает флаги, по которым вызывающий код порождает события и звук.
 */
export function stepPlayerMotion(
  player: PlayerSim,
  input: InputFrame,
  env: MotionEnv,
  dt: number,
): MotionEvents {
  const events: MotionEvents = {
    jumped: false,
    landed: false,
    landingSpeed: 0,
    crushed: false,
    startedSliding: false,
  };
  const previous = player.lastInput;

  player.wasGrounded = player.grounded;
  player.coyote = Math.max(0, player.coyote - dt);
  player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
  player.grabCooldown = Math.max(0, player.grabCooldown - dt);
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  if (player.stunTimer > 0) player.stunTimer = Math.max(0, player.stunTimer - dt);

  const controllable = player.state === PlayerState.Active && player.stunTimer <= 0;
  const axis = controllable ? clamp(input.axis, -1, 1) : 0;

  // Вода замедляет и выталкивает: это помеха, а не смерть (GDD §9).
  const submerged = env.map.submergedFraction(aabbToRect(player.body));
  player.inWater = submerged > 0.3;

  updateSlideState(player, input, controllable, env, events);

  applyHorizontal(player, axis, controllable, dt);
  applyJump(player, input, previous, controllable, env, events, dt);
  applyGravity(player, submerged, dt);

  const dx = player.vx * dt;
  const dy = player.vy * dt;
  moveBody(player.body, dx, dy, env.map, env.solids, moveResult, {
    // Подкат вниз проваливает игрока сквозь решётчатый настил (GDD §5.1).
    ignoreOneWay: controllable && isDown(input, Button.Crouch) && player.vy >= 0 && !player.grounded,
  });

  if (moveResult.hitLeft || moveResult.hitRight) player.vx = 0;
  if (moveResult.hitTop && player.vy < 0) player.vy = 0;

  const landingSpeed = player.vy;
  if (moveResult.hitBottom) {
    if (!player.wasGrounded && landingSpeed > 120) {
      events.landed = true;
      events.landingSpeed = landingSpeed;
    }
    player.vy = 0;
  }
  events.crushed = moveResult.crushed;

  const ground = isGrounded(player.body, env.map, env.solids);
  player.grounded = ground.grounded;
  player.groundSurfaceVx = ground.surfaceVx;
  player.onSlippery = ground.slippery || moveResult.groundSlippery;
  player.groundSolidId = ground.solid ? ground.solid.id : null;
  if (player.grounded) {
    player.coyote = PLAYER.coyoteTime;
    // Наследуем движение платформы/ленты, на которой стоим.
    if (ground.solid) {
      player.body.x += ground.solid.vx * dt;
      player.body.y += ground.solid.vy * dt;
    }
    if (ground.surfaceVx !== 0) {
      player.body.x += ground.surfaceVx * PLAYER.conveyorTransfer * dt;
    }
  }

  if (axis !== 0) player.facing = axis > 0 ? 1 : -1;

  clampToBounds(player.body, env.map);
  player.lastInput = input;
  player.lastAppliedSeq = input.seq;
  player.jumpHeld = isDown(input, Button.Jump);
  return events;
}

function updateSlideState(
  player: PlayerSim,
  input: InputFrame,
  controllable: boolean,
  env: MotionEnv,
  events: MotionEvents,
): void {
  const wantsCrouch = controllable && isDown(input, Button.Crouch);
  const fastEnough = Math.abs(player.vx) > PLAYER.slideMinSpeed;

  if (!player.sliding && wantsCrouch && player.grounded && fastEnough && player.carrying === null) {
    player.sliding = true;
    player.slideTime = 0;
    player.vx += sign(player.vx) * PLAYER.slideSpeedBoost;
    events.startedSliding = true;
  }

  if (player.sliding) {
    player.slideTime += 1 / 60;
    const expired = player.slideTime > PLAYER.slideMaxTime;
    const tooSlow = Math.abs(player.vx) < PLAYER.slideMinSpeed * 0.5;
    if (!wantsCrouch || expired || tooSlow || !player.grounded) {
      // Встать можно, только если над головой есть место.
      if (hasHeadroom(player, env)) {
        player.sliding = false;
        player.slideTime = 0;
      }
    }
  }

  const targetHalfHeight = (player.sliding ? PLAYER.slideHeight : PLAYER.height) / 2;
  if (player.body.hh !== targetHalfHeight) {
    // Низ хитбокса остаётся на месте, меняется только верх.
    const bottom = player.body.y + player.body.hh;
    player.body.hh = targetHalfHeight;
    player.body.y = bottom - targetHalfHeight;
  }
}

function hasHeadroom(player: PlayerSim, env: MotionEnv): boolean {
  const fullHalf = PLAYER.height / 2;
  const bottom = player.body.y + player.body.hh;
  const probe: AABB = { x: player.body.x, y: bottom - fullHalf, hw: player.body.hw - 1, hh: fullHalf - 1 };
  const rect = aabbToRect(probe);
  const c0 = Math.floor(rect.x / 32);
  const c1 = Math.floor((rect.x + rect.w) / 32);
  const r0 = Math.floor(rect.y / 32);
  const r1 = Math.floor((rect.y + rect.h) / 32);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (env.map.isSolidAt(c, r)) return false;
    }
  }
  return true;
}

function applyHorizontal(player: PlayerSim, axis: number, controllable: boolean, dt: number): void {
  const speedScale = player.carrySpeedFactor * (player.inWater ? 0.66 : 1);
  const targetSpeed = axis * PLAYER.runSpeed * speedScale;

  if (player.sliding) {
    // В подкате управление слабое: инерция важнее.
    const friction = PLAYER.slideFriction * (player.onSlippery ? PLAYER.slipperyFrictionScale : 1);
    player.vx -= sign(player.vx) * friction * dt;
    if (Math.abs(player.vx) < 8) player.vx = 0;
    player.vx += axis * PLAYER.accelAir * 0.35 * dt;
    return;
  }

  if (!controllable) {
    const friction = player.grounded ? PLAYER.frictionGround * 0.6 : PLAYER.frictionAir;
    player.vx -= sign(player.vx) * Math.min(Math.abs(player.vx), friction * dt);
    return;
  }

  const accel = player.grounded ? PLAYER.accelGround : PLAYER.accelAir;
  const slipScale = player.grounded && player.onSlippery ? PLAYER.slipperyFrictionScale : 1;

  if (axis !== 0) {
    const rate = accel * (player.grounded ? slipScale : 1) * dt;
    player.vx += clamp(targetSpeed - player.vx, -rate, rate);
  } else {
    const friction = (player.grounded ? PLAYER.frictionGround * slipScale : PLAYER.frictionAir) * dt;
    player.vx -= sign(player.vx) * Math.min(Math.abs(player.vx), friction);
  }

  // Толчки от других игроков и лент могут разогнать сильнее беговой скорости,
  // но собственное ускорение выше предела не поднимает.
  const cap = PLAYER.runSpeed * speedScale;
  if (Math.abs(player.vx) > cap && sign(player.vx) === sign(axis)) {
    player.vx = sign(player.vx) * Math.max(cap, Math.abs(player.vx) - PLAYER.frictionGround * 0.35 * dt);
  }
}

function applyJump(
  player: PlayerSim,
  input: InputFrame,
  previous: InputFrame,
  controllable: boolean,
  env: MotionEnv,
  events: MotionEvents,
  dt: number,
): void {
  void dt;
  if (!controllable) return;

  const jumpDown = isDown(input, Button.Jump);
  const jumpPressed = jumpDown && !isDown(previous, Button.Jump);
  if (jumpPressed) player.jumpBuffer = PLAYER.jumpBufferTime;

  const canJump = player.grounded || player.coyote > 0 || player.inWater;
  if (player.jumpBuffer > 0 && canJump) {
    const power = PLAYER.jumpVelocity * env.jumpFactor * (player.inWater ? 0.72 : 1);
    player.vy = -power;
    player.jumpBuffer = 0;
    player.coyote = 0;
    player.grounded = false;
    player.sliding = false;
    events.jumped = true;
  }

  // Переменная высота прыжка: отпустил раньше — прыгнул ниже.
  if (wasReleased(input, previous, Button.Jump) && player.vy < 0) {
    player.vy *= PLAYER.jumpCutMultiplier;
  }
}

function applyGravity(player: PlayerSim, submerged: number, dt: number): void {
  if (submerged > 0.3) {
    // Выталкивание: в воде падаешь медленно и всплываешь.
    player.vy += (PLAYER.gravity * 0.28 - submerged * 900) * dt;
    player.vy = clamp(player.vy, -260, 240);
    player.vx *= 1 - Math.min(0.9, 2.2 * dt);
    return;
  }
  const gravity = player.vy < 0 ? PLAYER.gravityRising : PLAYER.gravity;
  player.vy = Math.min(player.vy + gravity * dt, PLAYER.maxFallSpeed);
}

/** Мягкое расталкивание игроков: толкнуть можно, перекрыть проход — нет (GDD §5.2). */
export function applySoftPush(players: readonly PlayerSim[], dt: number): void {
  for (let i = 0; i < players.length; i++) {
    const a = players[i];
    if (a.state === PlayerState.Spectating) continue;
    for (let j = i + 1; j < players.length; j++) {
      const b = players[j];
      if (b.state === PlayerState.Spectating) continue;

      const dx = b.body.x - a.body.x;
      const dy = b.body.y - a.body.y;
      const distance = Math.hypot(dx, dy);
      if (distance > PLAYER.pushRadius || distance < 0.0001) continue;

      const overlap = (PLAYER.pushRadius - distance) / PLAYER.pushRadius;
      const nx = dx / distance;
      const push = PLAYER.pushForce * overlap * dt;
      // Лежащего не расталкиваем — иначе его невозможно поднять.
      const aMovable = a.state !== PlayerState.Downed;
      const bMovable = b.state !== PlayerState.Downed;
      if (aMovable) a.vx = clamp(a.vx - nx * push, -PLAYER.pushMaxSpeed * 2, PLAYER.pushMaxSpeed * 2);
      if (bMovable) b.vx = clamp(b.vx + nx * push, -PLAYER.pushMaxSpeed * 2, PLAYER.pushMaxSpeed * 2);
    }
  }
}

/** Точка, в которой персонаж держит предмет. */
export function carryAnchor(player: PlayerSim): { x: number; y: number } {
  return {
    x: player.body.x + player.facing * PLAYER.carryOffsetX * 0.35,
    y: player.body.y + PLAYER.carryOffsetY,
  };
}

/** Игрок стоит в смертельном тайле. */
export function inLethalTile(player: PlayerSim, map: TileMap): boolean {
  return map.containsTile(aabbToRect(player.body), Tile.Lethal);
}

export function isControllable(player: PlayerSim): boolean {
  return player.state === PlayerState.Active && player.stunTimer <= 0;
}
