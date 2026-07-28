#!/usr/bin/env tsx
/**
 * CLI валидатора уровней: `npm run validate:levels`.
 *
 * Возвращает ненулевой код при наличии ошибок, поэтому годится для CI.
 * Флаг `--map <roomId>` печатает карту с линейкой колонок — так проще
 * править ASCII-геометрию руками.
 */

import { ROOMS, ROOMS_BY_ID, TileMap } from '@uc/shared';
import { countBySeverity, validateRooms } from './level-validator.js';

const args = process.argv.slice(2);
const mapIndex = args.indexOf('--map');

if (mapIndex >= 0) {
  const roomId = args[mapIndex + 1];
  const room = roomId ? ROOMS_BY_ID.get(roomId) : undefined;
  if (!room) {
    console.error(`Комната не найдена. Доступные: ${[...ROOMS_BY_ID.keys()].join(', ')}`);
    process.exit(1);
  }
  printMap(room.id, room.tiles);
  process.exit(0);
}

const reports = validateRooms(ROOMS);
const { errors, warnings } = countBySeverity(reports);

for (const report of reports) {
  const status = report.issues.some((issue) => issue.severity === 'error') ? 'ОШИБКИ' : 'ок';
  console.log(
    `\n${report.roomId} — ${report.title}\n  ${report.size.cols}×${report.size.rows} тайлов · ` +
      `составы ${report.simulatedPartySizes.join('/')} · ${status}`,
  );
  for (const issue of report.issues) {
    const mark = issue.severity === 'error' ? '  ✗' : '  ·';
    console.log(`${mark} [${issue.rule}] ${issue.message}`);
  }
}

console.log(`\nИтого: комнат ${reports.length}, ошибок ${errors}, предупреждений ${warnings}`);
process.exit(errors > 0 ? 1 : 0);

function printMap(id: string, rows: readonly string[]): void {
  const map = new TileMap(rows);
  const width = map.cols;
  const tens = Array.from({ length: width }, (_, index) => (index % 10 === 0 ? String((index / 10) % 10) : ' ')).join('');
  const ones = Array.from({ length: width }, (_, index) => String(index % 10)).join('');
  console.log(`${id} — ${map.cols}×${map.rows}`);
  console.log(`     ${tens}`);
  console.log(`     ${ones}`);
  rows.forEach((row, index) => {
    console.log(`${String(index).padStart(3, ' ')}  ${row}`);
  });
}
