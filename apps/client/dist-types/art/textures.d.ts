/**
 * Процедурная генерация всей графики.
 *
 * В проекте нет ни одного внешнего файла спрайта: все текстуры рисуются в
 * Canvas при загрузке и кладутся в кеш Phaser. Это даёт мгновенный старт
 * (нечего скачивать), одинаковый вид на всех устройствах и возможность
 * менять палитру в одном месте.
 *
 * Силуэты нарочно крупные и различимые по форме — опасное читается ещё до
 * цвета (GDD §15.1), а значок игрока дублирует цвет для дальтоников (§14.3).
 */
import Phaser from 'phaser';
export declare function generateAllTextures(scene: Phaser.Scene): void;
/** Ключ текстуры значка по индексу. */
export declare function badgeTexture(index: number): string;
/** Ключ текстуры предмета по виду. */
export declare function itemTexture(kind: string): string;
