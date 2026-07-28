/**
 * Полноэкранный режим.
 *
 * На мобильных это не косметика: без него адресная строка съедает нижние
 * кнопки, а свайп от края браузера конфликтует с виртуальным стиком. iOS
 * Safari не поддерживает Fullscreen API для произвольных элементов, поэтому
 * для него предусмотрен отдельный путь — подсказка «на экран Домой».
 */
export type FullscreenSupport = 'native' | 'standalone-only' | 'none';
export declare function detectFullscreenSupport(): FullscreenSupport;
export declare function isFullscreen(): boolean;
export declare function isStandalone(): boolean;
export declare function isIos(): boolean;
/**
 * Включает или выключает полноэкранный режим. Вызывать только из обработчика
 * пользовательского жеста — браузеры отклоняют вызов из таймера.
 */
export declare function setFullscreen(enabled: boolean): Promise<boolean>;
export declare function toggleFullscreen(): Promise<boolean>;
/**
 * Восстанавливает сохранённое предпочтение при первом же касании или клике:
 * браузеры не дают включить полный экран без жеста пользователя.
 */
export declare function installFullscreenRestorer(): void;
/** Синхронизирует настройку, когда пользователь вышел из полноэкранного режима клавишей Esc. */
export declare function watchFullscreenChanges(): void;
