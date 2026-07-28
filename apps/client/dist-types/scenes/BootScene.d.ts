/**
 * Загрузочная сцена.
 *
 * Загружать нечего: вся графика рисуется процедурно, а звук синтезируется.
 * Сцена нужна только чтобы сгенерировать текстуры до первого кадра и сообщить
 * приложению, что можно показывать меню.
 */
import Phaser from 'phaser';
export declare class BootScene extends Phaser.Scene {
    static readonly KEY = "boot";
    static readonly READY = "boot:ready";
    constructor();
    create(): void;
}
