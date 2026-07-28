/**
 * Предметы: перенос, совместный перенос, бросок, нагрев, повреждения и
 * гарантированное восстановление.
 *
 * Ключевое ограничение GDD §0.1: ключевой предмет нельзя безвозвратно
 * потерять, уничтожить или заблокировать. Поэтому любой предмет, выпавший за
 * пределы комнаты или попавший в смертельную зону, возвращается на точку
 * восстановления, а не исчезает.
 */

import { CARRY_SPEED_BY_DEFICIT, ITEM as ITEM_TUNING, PLAYER, TILE } from '../config/tuning.js';
import { carrySpeedFactor } from '../config/scaling.js';
import type { ItemDef } from '../content/types.js';
import type { DynamicSolid, TileMap } from './geometry.js';
import { Tile, aabbToRect, emptyMoveResult, isGrounded, moveBody } from './geometry.js';
import { clamp, sign } from './math.js';
import { carryAnchor, type PlayerSim } from './player.js';
import { ITEM_KINDS, type ItemSim, type SimEvent } from './types.js';

let nextItemId = 1;

export function resetItemIds(): void {
  nextItemId = 1;
}

export function createItemSim(def: ItemDef): ItemSim {
  const kind = ITEM_KINDS[def.kind];
  if (!kind) throw new Error(`Неизвестный вид предмета: ${def.kind}`);
  const x = def.x * TILE + TILE / 2;
  const y = def.y * TILE + TILE / 2;
  return {
    id: nextItemId++,
    defId: def.id,
    kind: def.kind,
    body: { x, y, hw: kind.width / 2, hh: kind.height / 2 },
    vx: 0,
    vy: 0,
    angle: 0,
    spin: 0,
    grounded: false,
    holders: [],
    heat: 0,
    damage: 0,
    burning: 0,
    recoveryX: (def.recoveryX ?? def.x) * TILE + TILE / 2,
    recoveryY: (def.recoveryY ?? def.y) * TILE + TILE / 2,
    recoveryTimer: 0,
    grabCooldown: 0,
    cartId: null,
    charge: 1,
    lastOwnerChangeTick: 0,
  };
}

export function itemKindOf(item: ItemSim) {
  return ITEM_KINDS[item.kind];
}

/** Множитель скорости носильщика: соло тяжёлый груз несёт медленно, но несёт. */
export function carrierSpeedFactor(item: ItemSim): number {
  const kind = itemKindOf(item);
  return carrySpeedFactor(kind.requiredStrength, item.holders.length, CARRY_SPEED_BY_DEFICIT);
}

/** Тяжёлый груз снижает высоту прыжка. */
export function carrierJumpFactor(item: ItemSim | null): number {
  if (!item) return 1;
  const kind = itemKindOf(item);
  const deficit = Math.max(0, kind.requiredStrength - item.holders.length);
  return clamp(1 - deficit * 0.16 - (kind.mass - 1) * 0.03, 0.62, 1);
}

export interface ItemEnv {
  map: TileMap;
  solids: readonly DynamicSolid[];
  players: ReadonlyMap<string, PlayerSim>;
  /** Прямоугольники активных станций охлаждения. */
  coolers: readonly { x: number; y: number; w: number; h: number }[];
  /** Тележки: предмет, лежащий сверху, едет вместе с ними. */
  carts: readonly { id: string; x: number; y: number; w: number; h: number; vx: number }[];
  tick: number;
}

const itemMoveResult = emptyMoveResult();

/** Полный шаг предмета. */
export function stepItem(item: ItemSim, env: ItemEnv, dt: number, emit: (event: SimEvent) => void): void {
  item.grabCooldown = Math.max(0, item.grabCooldown - dt);
  const kind = itemKindOf(item);

  pruneHolders(item, env, emit);

  if (item.holders.length > 0) {
    followHolders(item, env, dt);
  } else {
    simulateFree(item, env, dt, emit);
  }

  updateHeat(item, env, dt, emit);
  updateRecovery(item, env, dt, emit);

  if (kind.tool && item.charge < 1 && item.holders.length === 0) {
    item.charge = Math.min(1, item.charge + dt * 0.12);
  }
}

/** Носильщик, отошедший слишком далеко, автоматически отпускает груз. */
function pruneHolders(item: ItemSim, env: ItemEnv, emit: (event: SimEvent) => void): void {
  for (let i = item.holders.length - 1; i >= 0; i--) {
    const holder = env.players.get(item.holders[i]);
    const tooFar =
      holder !== undefined &&
      Math.hypot(holder.body.x - item.body.x, holder.body.y - item.body.y) > PLAYER.carryLeash;
    if (holder === undefined || holder.carrying !== item.id || tooFar) {
      const id = item.holders[i];
      item.holders.splice(i, 1);
      if (holder && holder.carrying === item.id) holder.carrying = null;
      emit({ type: 'item_released', itemId: item.id, playerId: id, kind: item.kind });
    }
  }
}

/**
 * Предмет следует за руками носильщиков. Если рук несколько — за их средней
 * точкой; это и есть совместный перенос из GDD §7, без постоянной сцепки.
 */
function followHolders(item: ItemSim, env: ItemEnv, dt: number): void {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const id of item.holders) {
    const holder = env.players.get(id);
    if (!holder) continue;
    const anchor = carryAnchor(holder);
    sumX += anchor.x;
    sumY += anchor.y;
    count++;
  }
  if (count === 0) return;

  const targetX = sumX / count;
  const targetY = sumY / count;
  const previousX = item.body.x;
  const previousY = item.body.y;

  // Небольшое запаздывание даёт «вес» переносимому предмету.
  const follow = clamp(dt * 26, 0, 1);
  item.body.x += (targetX - item.body.x) * follow;
  item.body.y += (targetY - item.body.y) * follow;

  item.vx = dt > 0 ? (item.body.x - previousX) / dt : 0;
  item.vy = dt > 0 ? (item.body.y - previousY) / dt : 0;
  item.spin = 0;
  item.angle *= 1 - Math.min(1, dt * 10);
  item.cartId = null;
  item.grounded = false;
}

function simulateFree(item: ItemSim, env: ItemEnv, dt: number, emit: (event: SimEvent) => void): void {
  const kind = itemKindOf(item);
  const rect = aabbToRect(item.body);
  const submerged = env.map.submergedFraction(rect);

  // Едет на тележке — резервный механизм переноски (GDD §6.2).
  const cart = env.carts.find(
    (c) =>
      item.body.x > c.x - 6 &&
      item.body.x < c.x + c.w + 6 &&
      Math.abs(item.body.y + item.body.hh - c.y) < 12,
  );
  if (cart && Math.abs(item.vy) < 60) {
    item.cartId = cart.id;
    item.body.x += cart.vx * dt;
    item.body.y = cart.y - item.body.hh - 0.5;
    item.vx = cart.vx;
    item.vy = 0;
    item.grounded = true;
    item.angle *= 1 - Math.min(1, dt * 8);
    return;
  }
  item.cartId = null;

  if (submerged > 0.4) {
    item.vy += (ITEM_TUNING.gravity * 0.2 - submerged * 820) * dt;
    item.vy = clamp(item.vy, -180, 200);
    item.vx *= 1 - Math.min(0.9, 2.4 * dt);
  } else {
    item.vy = Math.min(item.vy + ITEM_TUNING.gravity * dt, ITEM_TUNING.maxFallSpeed);
  }

  const friction = item.grounded ? ITEM_TUNING.frictionGround : ITEM_TUNING.frictionAir;
  item.vx -= sign(item.vx) * Math.min(Math.abs(item.vx), friction * dt);

  const impactSpeed = Math.hypot(item.vx, item.vy);
  moveBody(item.body, item.vx * dt, item.vy * dt, env.map, env.solids, itemMoveResult);

  if (itemMoveResult.hitBottom) {
    if (item.vy > 90) {
      emit({ type: 'item_impact', itemId: item.id, kind: item.kind, x: item.body.x, y: item.body.y, speed: item.vy });
      applyImpactDamage(item, item.vy, emit);
      item.vy = -item.vy * ITEM_TUNING.bounce;
      if (Math.abs(item.vy) < 60) item.vy = 0;
    } else {
      item.vy = 0;
    }
  }
  if (itemMoveResult.hitTop && item.vy < 0) item.vy = 0;
  if (itemMoveResult.hitLeft || itemMoveResult.hitRight) {
    if (Math.abs(item.vx) > 200) {
      emit({ type: 'item_impact', itemId: item.id, kind: item.kind, x: item.body.x, y: item.body.y, speed: Math.abs(item.vx) });
      applyImpactDamage(item, Math.abs(item.vx), emit);
    }
    item.vx = -item.vx * ITEM_TUNING.bounce;
  }
  if (itemMoveResult.crushed && kind.fragile) {
    applyImpactDamage(item, ITEM_TUNING.fragileImpactSpeed * 1.6, emit);
  }

  const ground = isGrounded(item.body, env.map, env.solids);
  item.grounded = ground.grounded;
  if (item.grounded) {
    if (ground.solid) {
      item.body.x += ground.solid.vx * dt;
      item.body.y += ground.solid.vy * dt;
    }
    // Лента несёт предметы к прессу — классическая цепная ошибка (GDD §9.2).
    if (ground.surfaceVx !== 0) item.body.x += ground.surfaceVx * dt;
  }

  // Вращение в полёте — чисто декоративное, но помогает читать состояние.
  item.spin = item.grounded ? item.spin * (1 - Math.min(1, dt * 8)) : clamp(item.vx * 0.012, -9, 9);
  item.angle += item.spin * dt;
  if (item.grounded) item.angle *= 1 - Math.min(1, dt * 6);
  void impactSpeed;
}

function applyImpactDamage(item: ItemSim, speed: number, emit: (event: SimEvent) => void): void {
  const kind = itemKindOf(item);
  if (!kind.fragile) return;
  if (speed <= ITEM_TUNING.fragileImpactSpeed) return;
  const added = (speed - ITEM_TUNING.fragileImpactSpeed) * ITEM_TUNING.fragileDamagePerSpeed;
  if (added <= 0) return;
  item.damage = clamp(item.damage + added, 0, 1);
  emit({ type: 'item_damaged', itemId: item.id, kind: item.kind, damage: item.damage, x: item.body.x, y: item.body.y });
}

function updateHeat(item: ItemSim, env: ItemEnv, dt: number, emit: (event: SimEvent) => void): void {
  const kind = itemKindOf(item);
  if (!kind.heats) return;

  const rect = aabbToRect(item.body);
  const inCooler = env.coolers.some(
    (c) => rect.x < c.x + c.w && rect.x + rect.w > c.x && rect.y < c.y + c.h && rect.y + rect.h > c.y,
  );
  const inWater = env.map.submergedFraction(rect) > 0.3;

  if (inCooler) {
    item.heat = Math.max(0, item.heat - ITEM_TUNING.stationCoolRate * dt);
  } else if (inWater) {
    // Разбитая труба охлаждает груз (GDD §9.2).
    item.heat = Math.max(0, item.heat - ITEM_TUNING.stationCoolRate * 0.7 * dt);
  } else if (item.holders.length > 0) {
    item.heat = Math.min(1, item.heat + ITEM_TUNING.heatRate * dt * (1 + item.holders.length * 0.15));
  } else {
    item.heat = Math.max(0, item.heat - ITEM_TUNING.coolRate * 0.35 * dt);
  }

  if (item.heat >= 1) {
    // Перегрев — обратимое последствие: груз вырывается из рук и остывает.
    emit({ type: 'hazard_phase', deviceId: `item_${item.id}`, hazard: 'overheat', phase: 'active', x: item.body.x, y: item.body.y });
    item.heat = 0.55;
  }
}

function updateRecovery(item: ItemSim, env: ItemEnv, dt: number, emit: (event: SimEvent) => void): void {
  const rect = aabbToRect(item.body);
  const outOfBounds =
    item.body.y > env.map.heightPx + 160 ||
    item.body.x < -160 ||
    item.body.x > env.map.widthPx + 160;
  const inLethal = env.map.containsTile(rect, Tile.Lethal);

  if (!outOfBounds && !inLethal) {
    item.recoveryTimer = 0;
    return;
  }

  item.recoveryTimer += dt;
  if (item.recoveryTimer < ITEM_TUNING.recoveryDelay && !outOfBounds) return;

  recoverItem(item, env);
  emit({ type: 'item_recovered', itemId: item.id, kind: item.kind, x: item.body.x, y: item.body.y });
}

/** Возврат предмета на точку восстановления. */
export function recoverItem(item: ItemSim, env: ItemEnv): void {
  for (const id of item.holders) {
    const holder = env.players.get(id);
    if (holder && holder.carrying === item.id) holder.carrying = null;
  }
  item.holders.length = 0;
  item.body.x = item.recoveryX;
  item.body.y = item.recoveryY;
  item.vx = 0;
  item.vy = 0;
  item.spin = 0;
  item.angle = 0;
  item.recoveryTimer = 0;
  item.cartId = null;
  item.grabCooldown = ITEM_TUNING.recoveryDelay * 0.5;
  // Повреждения частично откатываются: провал не должен быть необратимым.
  item.damage = Math.max(0, item.damage - 0.25);
  item.heat = Math.min(item.heat, 0.4);
}

/** Бросок предмета: импульс проверяется сервером (GDD §16.2). */
export function throwItem(item: ItemSim, thrower: PlayerSim, aimAngle: number, emit: (event: SimEvent) => void): void {
  const kind = itemKindOf(item);
  // Тяжёлый предмет летит слабее — масса влияет на импульс (GDD §7.1).
  const power = PLAYER.throwSpeed / Math.max(1, kind.mass * 0.55);
  const dirX = Math.cos(aimAngle);
  const dirY = Math.sin(aimAngle);

  item.vx = dirX * power + thrower.vx * 0.45;
  item.vy = dirY * power - PLAYER.throwSpeed * PLAYER.throwUpBias * 0.35;
  item.spin = dirX * 8;
  item.grabCooldown = PLAYER.grabCooldown * 2;
  item.grounded = false;

  for (const id of item.holders) {
    const holder = thrower.id === id ? thrower : null;
    if (holder) holder.carrying = null;
  }
  item.holders.length = 0;
  thrower.carrying = null;
  thrower.stats.throws++;

  emit({ type: 'item_thrown', itemId: item.id, playerId: thrower.id, kind: item.kind, speed: Math.hypot(item.vx, item.vy) });
}

/** Аккуратно положить предмет, не бросая. */
export function dropItem(item: ItemSim, holder: PlayerSim, emit: (event: SimEvent) => void): void {
  const index = item.holders.indexOf(holder.id);
  if (index >= 0) item.holders.splice(index, 1);
  holder.carrying = null;
  if (item.holders.length === 0) {
    item.vx = holder.vx * 0.35;
    item.vy = Math.min(0, holder.vy);
    item.grabCooldown = PLAYER.grabCooldown;
  }
  emit({ type: 'item_released', itemId: item.id, playerId: holder.id, kind: item.kind });
}
