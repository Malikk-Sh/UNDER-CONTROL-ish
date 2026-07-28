#!/usr/bin/env node
/**
 * Генератор иконок PWA.
 *
 * В проекте нет бинарных ассетов и графических зависимостей, поэтому PNG
 * собирается вручную: сырые пиксели → zlib → чанки PNG с CRC32. Запускается
 * редко (`npm run icons`), результат коммитится в `public/`.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = join(here, '..', 'public');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/** @param {(x: number, y: number) => [number, number, number, number]} shade */
function encodePng(size, shade) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // фильтр строки: None
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = shade(x, y);
      const offset = y * (stride + 1) + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // бит на канал
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Каска на тёмном фоне: узнаваемо даже в размере 32×32. */
function icon(size, maskable) {
  const scale = size / 192;
  const cx = size / 2;
  // У maskable-иконки содержимое сжимается в безопасную зону 80%.
  const inset = maskable ? 0.8 : 1;

  return encodePng(size, (x, y) => {
    const nx = (x - cx) / (scale * inset);
    const ny = (y - cx) / (scale * inset);

    // Фон со скруглением.
    const radius = 40 * scale;
    const dx = Math.max(Math.abs(x - cx) - (size / 2 - radius), 0);
    const dy = Math.max(Math.abs(y - cx) - (size / 2 - radius), 0);
    if (!maskable && Math.hypot(dx, dy) > radius) return [0, 0, 0, 0];

    let color = [24, 30, 43, 255];

    // Купол каски.
    const domeY = ny + 12;
    if (domeY <= 0 && Math.hypot(nx, domeY * 1.15) < 54) color = [255, 201, 60, 255];
    // Козырёк.
    if (domeY > 0 && domeY < 16 && Math.abs(nx) < 74) color = [255, 201, 60, 255];
    // Полоса-гребень.
    if (domeY <= 0 && Math.hypot(nx, domeY * 1.15) < 54 && Math.abs(nx) < 9) color = [217, 164, 35, 255];
    // Тень под козырьком.
    if (domeY >= 16 && domeY < 24 && Math.abs(nx) < 74) color = [180, 132, 26, 255];

    return color;
  });
}

mkdirSync(outputDir, { recursive: true });

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
];

for (const [name, size, maskable] of targets) {
  const buffer = icon(size, maskable);
  writeFileSync(join(outputDir, name), buffer);
  console.log(`${name}: ${size}×${size}, ${(buffer.length / 1024).toFixed(1)} КиБ`);
}
