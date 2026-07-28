/**
 * Процедурный звук.
 *
 * В проекте нет звуковых файлов: всё синтезируется через Web Audio. Это даёт
 * нулевой вес загрузки и позволяет вносить вариации (случайный pitch, разные
 * варианты) без сотни сэмплов, как того требует GDD §15.4.
 *
 * Реализовано: пулы и rate limit, случайный pitch, 2D-панорамирование,
 * отдельные шины Master/SFX/Music и разблокировка контекста после первого ввода.
 */
export type SfxName = 'jump' | 'land' | 'step' | 'grab' | 'drop' | 'throw' | 'impact' | 'crack' | 'zap' | 'press_warn' | 'press_slam' | 'magnet' | 'steam' | 'splash' | 'ping' | 'revive' | 'downed' | 'objective' | 'clear' | 'fail' | 'alarm' | 'ui_click' | 'heat';
export interface PlayOptions {
    /** Позиция источника в мире — для панорамирования и громкости. */
    x?: number;
    /** Центр экрана в мире: панорама считается относительно него. */
    listenerX?: number;
    /** Ширина слышимой зоны в пикселях. */
    range?: number;
    /** Событие собственного персонажа звучит громче (GDD §15.4). */
    own?: boolean;
    /** Множитель громкости. */
    volume?: number;
    /** Множитель высоты тона. */
    pitch?: number;
}
export type MusicLayer = 'none' | 'work' | 'alarm' | 'evac';
export declare class AudioSystem {
    private context;
    private master;
    private sfxBus;
    private musicBus;
    private compressor;
    private readonly lastPlayedAt;
    private noiseBuffer;
    private musicLayer;
    private musicTimer;
    private nextNoteTime;
    private step;
    private unsubscribe;
    /** Создаёт контекст. Вызывать из обработчика жеста пользователя. */
    unlock(): void;
    destroy(): void;
    get ready(): boolean;
    private applyVolumes;
    play(name: SfxName, options?: PlayOptions): void;
    /** Громкость и панорама источника относительно центра экрана. */
    private spatial;
    private synthesize;
    private tone;
    private noise;
    /** Слои музыки управляют напряжением: работа → авария → эвакуация (GDD §15.3). */
    setMusicLayer(layer: MusicLayer): void;
    private startMusic;
    private stopMusic;
    private scheduleMusic;
    private scheduleStep;
}
/** Единственный экземпляр на приложение — контекст создаётся один раз. */
export declare const audio: AudioSystem;
