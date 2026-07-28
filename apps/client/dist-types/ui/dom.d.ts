/**
 * Мелкие помощники для DOM-интерфейса.
 *
 * Меню, настройки, верхняя панель и итоги сделаны на DOM, а не внутри Phaser:
 * так работают нативные поля ввода, экранные читалки и `env(safe-area-inset-*)`,
 * а адаптивная вёрстка не требует ручного пересчёта на каждый ресайз.
 * Игровой мир и сенсорные кнопки при этом остаются в Phaser.
 */
export type Attrs = Record<string, string | number | boolean | undefined>;
export declare function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs, children?: (Node | string | null | undefined)[]): HTMLElementTagNameMap[K];
export declare function clear(node: HTMLElement): void;
export declare function installStyles(): void;
