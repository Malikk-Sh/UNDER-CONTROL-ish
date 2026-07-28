/**
 * Настройки клиента (GDD §14.3).
 *
 * Всё хранится в localStorage и применяется сразу: доступность — это не
 * отдельный режим, а набор переключателей, которые не должны требовать
 * перезапуска игры.
 */
export interface Settings {
    name: string;
    colorIndex: number;
    badgeIndex: number;
    masterVolume: number;
    sfxVolume: number;
    musicVolume: number;
    /** Полноэкранный режим — особенно важен на мобильных. */
    fullscreen: boolean;
    /** Предлагать полноэкранный режим при первом запуске на телефоне. */
    fullscreenPrompted: boolean;
    /** Тряска камеры, 0..1. */
    screenShake: number;
    /** Вспышки и резкие засветы, 0..1. */
    flashes: number;
    /** Плотность частиц, 0..1. */
    particles: number;
    /** Масштаб интерфейса. */
    uiScale: number;
    /** Толщина контуров персонажей — помогает не потеряться в толпе. */
    outlines: boolean;
    /** Режим без удерживания: кнопка взаимодействия работает как переключатель. */
    holdFreeMode: boolean;
    /** Субтитры для звуковых событий. */
    subtitles: boolean;
    /** Помощь на краях экрана и увеличенный буфер прыжка на touch. */
    touchAssist: boolean;
    /** Левша: стик справа, кнопки слева. */
    leftHanded: boolean;
    /** Уровень качества рендера: влияет на частицы и эффекты. */
    quality: 'low' | 'medium' | 'high';
}
export declare function getSettings(): Readonly<Settings>;
type Listener = (settings: Readonly<Settings>) => void;
export declare function onSettingsChanged(listener: Listener): () => void;
export declare function updateSettings(patch: Partial<Settings>): Readonly<Settings>;
export declare function isTouchDevice(): boolean;
/** Множитель частиц с учётом качества и настройки доступности. */
export declare function particleScale(): number;
export {};
