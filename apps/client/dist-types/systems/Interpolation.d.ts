/**
 * Интерполяция удалённых объектов.
 *
 * Снимки приходят 20 раз в секунду, а рисуем мы 60. Показываем прошлое на
 * ~110 мс назад и интерполируем между двумя ближайшими снимками: это убирает
 * дёрганье и не требует экстраполяции, которая на платформере выглядит как
 * «проезд сквозь стену и рывок назад».
 */
export interface InterpolatedValue {
    x: number;
    y: number;
    extra: Float32Array;
}
export declare class InterpolationBuffer {
    private readonly tracks;
    private readonly scratch;
    /** Кладёт снимок. `extra` — произвольные числовые поля для интерполяции. */
    push(id: string, x: number, y: number, extra?: readonly number[], now?: number): void;
    /** Значение на момент «сейчас минус задержка буфера». */
    sample(id: string, now?: number): InterpolatedValue | null;
    private assign;
    /** Мгновенная позиция без задержки — для телепортов и смены комнаты. */
    reset(id: string): void;
    clear(): void;
    has(id: string): boolean;
    ids(): IterableIterator<string>;
}
