/**
 * Итоги смены (GDD §13.1).
 *
 * Оценка по четырём осям — безопасность, скорость, сохранность, спасения — и
 * шуточные титулы. Прогрессия ничего не усиливает: это признание вклада, а не
 * преимущество (GDD §13.2).
 */
import type { ResultsPayload } from '@uc/shared';
export declare class ResultsOverlay {
    private readonly root;
    private readonly card;
    onRestart: () => void;
    onExit: () => void;
    constructor();
    show(results: ResultsPayload): void;
    hide(): void;
    destroy(): void;
}
