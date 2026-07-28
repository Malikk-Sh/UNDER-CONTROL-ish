/** Палитра проекта. Опасное читается по форме и яркости, а не только по цвету (GDD §15.1). */

export const PALETTE = {
  voidDark: 0x0d1017,
  bgFar: 0x161d2b,
  bgMid: 0x1d2636,
  bgNear: 0x252f43,

  steelDark: 0x2b3446,
  steel: 0x3d4a63,
  steelLight: 0x55688a,
  steelEdge: 0x768cb4,

  metal: 0x8fa2c2,
  metalDark: 0x5c6c8c,

  accent: 0xffc93c,
  accentDark: 0xd9a423,
  warn: 0xff8a3c,
  danger: 0xff4d5a,
  dangerDark: 0xb32b38,

  acid: 0x8bff6a,
  acidDark: 0x3fae2d,
  water: 0x2f7fd4,
  waterLight: 0x63b4f0,
  ice: 0xa8e4ff,

  ok: 0x7ee081,
  hot: 0xff6a3c,
  cold: 0x6ad7ff,
  spark: 0xfff3b0,

  ink: 0x11151d,
  paper: 0xe8eef7,
  // Без `as const`: значения должны выводиться как number, иначе литеральные
  // типы «залипают» в сигнатурах функций, принимающих цвет.
  shadow: 0x000000,
};

export function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Смешивание двух цветов — используется для нагрева, урона и подсветки фаз. */
export function mixColor(from: number, to: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const fr = (from >> 16) & 0xff;
  const fg = (from >> 8) & 0xff;
  const fb = from & 0xff;
  const tr = (to >> 16) & 0xff;
  const tg = (to >> 8) & 0xff;
  const tb = to & 0xff;
  const r = Math.round(fr + (tr - fr) * k);
  const g = Math.round(fg + (tg - fg) * k);
  const b = Math.round(fb + (tb - fb) * k);
  return (r << 16) | (g << 8) | b;
}
