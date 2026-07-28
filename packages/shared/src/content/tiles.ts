/**
 * Нормализация ASCII-карт.
 *
 * Карты пишутся руками, поэтому строка легко получается на символ короче.
 * Здесь строки выравниваются по самой длинной и принудительно обводятся
 * сплошной рамкой: комната физически не может «протечь» из-за опечатки, а
 * валидатор всё равно сообщит о неровных строках.
 */

export interface NormalizeReport {
  width: number;
  height: number;
  /** Индексы строк, длина которых отличалась от максимальной. */
  raggedRows: number[];
}

export function measureTiles(rows: readonly string[]): NormalizeReport {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const ragged: number[] = [];
  rows.forEach((row, index) => {
    if (row.length !== width) ragged.push(index);
  });
  return { width, height: rows.length, raggedRows: ragged };
}

/** Выравнивает строки и обводит карту сплошной рамкой. */
export function normalizeTiles(rows: readonly string[]): string[] {
  if (rows.length === 0) return ['##', '##'];
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const padded = rows.map((row) => row.padEnd(width, '.'));

  const solidRow = '#'.repeat(width);
  const result = padded.map((row, index) => {
    if (index === 0 || index === padded.length - 1) return solidRow;
    return `#${row.slice(1, width - 1)}#`;
  });
  return result;
}
