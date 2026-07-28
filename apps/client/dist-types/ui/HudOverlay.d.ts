/**
 * Верхний интерфейс (GDD §14.1).
 *
 * Общая цель — вверху по центру одной строкой, шкала катастрофы — только когда
 * угроза активна, статусы игроков — по краю экрана, подсказки — снизу.
 * Ничего лишнего: экран и так занят цехом.
 */
import { type GameStateView } from '@uc/shared';
export declare class HudOverlay {
    private readonly root;
    private readonly objectiveTitle;
    private readonly objectiveSteps;
    private readonly gauge;
    private readonly gaugeFill;
    private readonly roster;
    private readonly status;
    private readonly hint;
    private readonly banner;
    private readonly subtitles;
    private readonly fullscreenButton;
    private hintTimer;
    private bannerTimer;
    private lastHintKey;
    private readonly subtitleQueue;
    onOpenSettings: () => void;
    constructor();
    show(): void;
    hide(): void;
    destroy(): void;
    private refreshFullscreenButton;
    update(state: GameStateView, localSessionId: string, latency: number): void;
    private updateObjective;
    private hasActivatorObjective;
    private updateGauge;
    private updateRoster;
    private updateStatus;
    showHint(text: string, key: string): void;
    showBanner(text: string, color?: string, durationMs?: number): void;
    /** Субтитры звуковых событий — требование доступности (GDD §14.3). */
    pushSubtitle(text: string): void;
    private updateSubtitles;
}
