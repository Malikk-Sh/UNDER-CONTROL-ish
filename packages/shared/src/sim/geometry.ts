/**
 * Геометрия комнаты и разрешение столкновений.
 *
 * Комната описывается ASCII-сеткой (данные, GDD §0.5), поверх которой лежат
 * динамические твёрдые тела: двери, прессы, платформы, лифты и тележки.
 * Один и тот же код исполняется на сервере (авторитетно) и на клиенте
 * (предсказание локального игрока), поэтому здесь не должно быть ни ссылок на
 * рендер, ни обращений к Math.random, ни зависимости от реального времени.
 */

import { TILE } from '../config/tuning.js';
import { clamp } from './math.js';

export const enum Tile {
  Empty = 0,
  Solid = 1,
  /** Платформа, проходимая снизу и при подкате вниз. */
  OneWay = 2,
  Water = 3,
  /** Смертельная зона: кислота, лава, открытый пресс-колодец. */
  Lethal = 4,
  /** Скользкая твёрдая поверхность. */
  Ice = 5,
}

const TILE_LEGEND: Record<string, Tile> = {
  '.': Tile.Empty,
  ' ': Tile.Empty,
  '#': Tile.Solid,
  '=': Tile.OneWay,
  '~': Tile.Water,
  '!': Tile.Lethal,
  '*': Tile.Ice,
};

export const TILE_CHARS = Object.keys(TILE_LEGEND);

export function isSolidTile(tile: Tile): boolean {
  return tile === Tile.Solid || tile === Tile.Ice;
}

export interface AABB {
  /** Центр по горизонтали. */
  x: number;
  /** Центр по вертикали. */
  y: number;
  /** Половина ширины. */
  hw: number;
  /** Половина высоты. */
  hh: number;
}

export interface RectPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectOverlaps(a: RectPx, b: RectPx): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function aabbToRect(body: AABB): RectPx {
  return { x: body.x - body.hw, y: body.y - body.hh, w: body.hw * 2, h: body.hh * 2 };
}

export function pointInRect(px: number, py: number, rect: RectPx): boolean {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

/** Прямоугольник, заданный в тайлах, переведённый в пиксели. */
export function tilesToRect(x: number, y: number, w: number, h: number): RectPx {
  return { x: x * TILE, y: y * TILE, w: w * TILE, h: h * TILE };
}

/**
 * Подвижное твёрдое тело: дверь, платформа пресса, лифт, тележка.
 * `vx`/`vy` — скорость за секунду, её наследует всё, что стоит сверху.
 */
export interface DynamicSolid {
  id: string;
  rect: RectPx;
  vx: number;
  vy: number;
  /** Проходима снизу, как одностороння платформа. */
  oneWay: boolean;
  /** Скорость ленты, передаваемая телам сверху. */
  surfaceVx: number;
  slippery: boolean;
  /** Отключённое тело не участвует в столкновениях (открытая дверь). */
  enabled: boolean;
}

export function makeSolid(id: string, rect: RectPx, options: Partial<DynamicSolid> = {}): DynamicSolid {
  return {
    id,
    rect,
    vx: 0,
    vy: 0,
    oneWay: false,
    surfaceVx: 0,
    slippery: false,
    enabled: true,
    ...options,
  };
}

export class TileMap {
  readonly cols: number;
  readonly rows: number;
  readonly widthPx: number;
  readonly heightPx: number;
  private readonly cells: Uint8Array;

  constructor(rows: readonly string[]) {
    this.rows = rows.length;
    this.cols = rows.reduce((max, row) => Math.max(max, row.length), 0);
    this.cells = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      const row = rows[r];
      for (let c = 0; c < this.cols; c++) {
        const char = c < row.length ? row[c] : '.';
        const tile = TILE_LEGEND[char];
        if (tile === undefined) {
          throw new Error(`Неизвестный символ тайла "${char}" в строке ${r + 1}, колонке ${c + 1}`);
        }
        this.cells[r * this.cols + c] = tile;
      }
    }
    this.widthPx = this.cols * TILE;
    this.heightPx = this.rows * TILE;
  }

  at(col: number, row: number): Tile {
    if (col < 0 || col >= this.cols || row < 0) return Tile.Solid;
    // Ниже карты — пустота: тела улетают вниз и восстанавливаются на точке
    // возврата, а не застревают в невидимом полу.
    if (row >= this.rows) return Tile.Empty;
    return this.cells[row * this.cols + col] as Tile;
  }

  atPixel(px: number, py: number): Tile {
    return this.at(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  isSolidAt(col: number, row: number): boolean {
    return isSolidTile(this.at(col, row));
  }

  /** Есть ли в прямоугольнике хотя бы один тайл нужного типа. */
  containsTile(rect: RectPx, tile: Tile): boolean {
    const c0 = Math.floor(rect.x / TILE);
    const c1 = Math.floor((rect.x + rect.w - 0.001) / TILE);
    const r0 = Math.floor(rect.y / TILE);
    const r1 = Math.floor((rect.y + rect.h - 0.001) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.at(c, r) === tile) return true;
      }
    }
    return false;
  }

  /** Доля прямоугольника, погружённая в воду — нужна для выталкивания. */
  submergedFraction(rect: RectPx): number {
    const c0 = Math.floor(rect.x / TILE);
    const c1 = Math.floor((rect.x + rect.w - 0.001) / TILE);
    const r0 = Math.floor(rect.y / TILE);
    const r1 = Math.floor((rect.y + rect.h - 0.001) / TILE);
    let water = 0;
    let total = 0;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        total++;
        if (this.at(c, r) === Tile.Water) water++;
      }
    }
    return total === 0 ? 0 : water / total;
  }

  /** Ближайшая свободная позиция сверху — используется при восстановлении. */
  groundBelow(px: number, py: number, maxTiles = 40): number | null {
    let row = Math.floor(py / TILE);
    for (let i = 0; i < maxTiles; i++, row++) {
      if (this.isSolidAt(Math.floor(px / TILE), row)) return row * TILE;
    }
    return null;
  }
}

export interface MoveResult {
  hitLeft: boolean;
  hitRight: boolean;
  hitTop: boolean;
  hitBottom: boolean;
  /** Тело, на котором мы стоим, если это динамический солид. */
  groundSolid: DynamicSolid | null;
  /** Скорость ленты/платформы под ногами. */
  groundSurfaceVx: number;
  groundSlippery: boolean;
  /** Тело раздавлено между статикой и движущимся солидом. */
  crushed: boolean;
}

export function emptyMoveResult(): MoveResult {
  return {
    hitLeft: false,
    hitRight: false,
    hitTop: false,
    hitBottom: false,
    groundSolid: null,
    groundSurfaceVx: 0,
    groundSlippery: false,
    crushed: false,
  };
}

const EPSILON = 0.01;
/** Ограничение шага, чтобы тело не «протыкало» тайл на большой скорости. */
const MAX_SUBSTEP = TILE * 0.4;

/**
 * Перемещает AABB на (dx, dy) с раздельным разрешением по осям.
 * Возвращает флаги касаний — по ним контроллер решает, приземлился ли игрок.
 */
export function moveBody(
  body: AABB,
  dx: number,
  dy: number,
  map: TileMap,
  solids: readonly DynamicSolid[],
  out: MoveResult,
  options: { ignoreOneWay?: boolean } = {},
): MoveResult {
  out.hitLeft = false;
  out.hitRight = false;
  out.hitTop = false;
  out.hitBottom = false;
  out.groundSolid = null;
  out.groundSurfaceVx = 0;
  out.groundSlippery = false;
  out.crushed = false;

  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / MAX_SUBSTEP));
  const stepX = dx / steps;
  const stepY = dy / steps;

  for (let i = 0; i < steps; i++) {
    if (stepX !== 0) moveAxisX(body, stepX, map, solids, out);
    if (stepY !== 0) moveAxisY(body, stepY, map, solids, out, options.ignoreOneWay === true);
  }
  return out;
}

function moveAxisX(
  body: AABB,
  dx: number,
  map: TileMap,
  solids: readonly DynamicSolid[],
  out: MoveResult,
): void {
  body.x += dx;
  const top = Math.floor((body.y - body.hh + EPSILON) / TILE);
  const bottom = Math.floor((body.y + body.hh - EPSILON) / TILE);

  if (dx > 0) {
    const col = Math.floor((body.x + body.hw) / TILE);
    for (let row = top; row <= bottom; row++) {
      if (map.isSolidAt(col, row)) {
        body.x = col * TILE - body.hw - EPSILON;
        out.hitRight = true;
        break;
      }
    }
  } else {
    const col = Math.floor((body.x - body.hw) / TILE);
    for (let row = top; row <= bottom; row++) {
      if (map.isSolidAt(col, row)) {
        body.x = (col + 1) * TILE + body.hw + EPSILON;
        out.hitLeft = true;
        break;
      }
    }
  }

  for (const solid of solids) {
    if (!solid.enabled || solid.oneWay) continue;
    const rect = aabbToRect(body);
    if (!rectOverlaps(rect, solid.rect)) continue;
    if (dx > 0) {
      body.x = solid.rect.x - body.hw - EPSILON;
      out.hitRight = true;
    } else {
      body.x = solid.rect.x + solid.rect.w + body.hw + EPSILON;
      out.hitLeft = true;
    }
    // Если после выталкивания тело всё ещё в статике — его зажало.
    if (overlapsStatic(body, map)) out.crushed = true;
  }
}

function moveAxisY(
  body: AABB,
  dy: number,
  map: TileMap,
  solids: readonly DynamicSolid[],
  out: MoveResult,
  ignoreOneWay: boolean,
): void {
  const previousBottom = body.y + body.hh;
  body.y += dy;
  const left = Math.floor((body.x - body.hw + EPSILON) / TILE);
  const right = Math.floor((body.x + body.hw - EPSILON) / TILE);

  if (dy > 0) {
    const row = Math.floor((body.y + body.hh) / TILE);
    for (let col = left; col <= right; col++) {
      const tile = map.at(col, row);
      const blocking =
        isSolidTile(tile) ||
        (!ignoreOneWay && tile === Tile.OneWay && previousBottom <= row * TILE + EPSILON);
      if (blocking) {
        body.y = row * TILE - body.hh - EPSILON;
        out.hitBottom = true;
        out.groundSlippery = tile === Tile.Ice;
        break;
      }
    }
  } else {
    const row = Math.floor((body.y - body.hh) / TILE);
    for (let col = left; col <= right; col++) {
      if (map.isSolidAt(col, row)) {
        body.y = (row + 1) * TILE + body.hh + EPSILON;
        out.hitTop = true;
        break;
      }
    }
  }

  for (const solid of solids) {
    if (!solid.enabled) continue;
    const rect = aabbToRect(body);
    if (!rectOverlaps(rect, solid.rect)) continue;
    if (solid.oneWay) {
      if (ignoreOneWay || dy <= 0 || previousBottom > solid.rect.y + EPSILON) continue;
    }
    if (dy > 0) {
      body.y = solid.rect.y - body.hh - EPSILON;
      out.hitBottom = true;
      out.groundSolid = solid;
      out.groundSurfaceVx = solid.surfaceVx;
      out.groundSlippery = solid.slippery;
    } else {
      body.y = solid.rect.y + solid.rect.h + body.hh + EPSILON;
      out.hitTop = true;
    }
    if (overlapsStatic(body, map)) out.crushed = true;
  }
}

function overlapsStatic(body: AABB, map: TileMap): boolean {
  const c0 = Math.floor((body.x - body.hw + EPSILON) / TILE);
  const c1 = Math.floor((body.x + body.hw - EPSILON) / TILE);
  const r0 = Math.floor((body.y - body.hh + EPSILON) / TILE);
  const r1 = Math.floor((body.y + body.hh - EPSILON) / TILE);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (map.isSolidAt(c, r)) return true;
    }
  }
  return false;
}

/** Стоит ли тело на твёрдой поверхности (проверка на один пиксель вниз). */
export function isGrounded(
  body: AABB,
  map: TileMap,
  solids: readonly DynamicSolid[],
): { grounded: boolean; solid: DynamicSolid | null; surfaceVx: number; slippery: boolean } {
  const probe: AABB = { x: body.x, y: body.y + 1.5, hw: body.hw, hh: body.hh };
  const left = Math.floor((probe.x - probe.hw + EPSILON) / TILE);
  const right = Math.floor((probe.x + probe.hw - EPSILON) / TILE);
  const row = Math.floor((probe.y + probe.hh) / TILE);
  const bodyBottom = body.y + body.hh;

  for (let col = left; col <= right; col++) {
    const tile = map.at(col, row);
    if (isSolidTile(tile)) {
      return { grounded: true, solid: null, surfaceVx: 0, slippery: tile === Tile.Ice };
    }
    if (tile === Tile.OneWay && bodyBottom <= row * TILE + 2) {
      return { grounded: true, solid: null, surfaceVx: 0, slippery: false };
    }
  }

  const rect = aabbToRect(probe);
  for (const solid of solids) {
    if (!solid.enabled) continue;
    if (!rectOverlaps(rect, solid.rect)) continue;
    if (solid.oneWay && bodyBottom > solid.rect.y + 2) continue;
    if (bodyBottom > solid.rect.y + solid.rect.h) continue;
    return { grounded: true, solid, surfaceVx: solid.surfaceVx, slippery: solid.slippery };
  }

  return { grounded: false, solid: null, surfaceVx: 0, slippery: false };
}

/** Держит тело в границах комнаты по горизонтали. */
export function clampToBounds(body: AABB, map: TileMap): void {
  body.x = clamp(body.x, body.hw, map.widthPx - body.hw);
}
