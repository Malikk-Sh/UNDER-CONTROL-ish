/**
 * Панель настроек (GDD §14.3).
 *
 * Здесь же живёт переключатель полноэкранного режима: на телефоне он важнее
 * любой другой настройки, потому что без него адресная строка перекрывает
 * нижний ряд кнопок.
 */
import { type Settings } from '../settings.js';
type OnChange = (settings: Readonly<Settings>) => void;
export declare function buildSettingsPanel(onChange?: OnChange): HTMLElement;
/**
 * Однократное предложение включить полный экран на телефоне. Возвращает
 * элемент-подсказку либо null, если предлагать не нужно.
 */
export declare function buildFullscreenPrompt(onDone: () => void): HTMLElement | null;
export {};
