/** Палитра проекта. Опасное читается по форме и яркости, а не только по цвету (GDD §15.1). */
export declare const PALETTE: {
    voidDark: number;
    bgFar: number;
    bgMid: number;
    bgNear: number;
    steelDark: number;
    steel: number;
    steelLight: number;
    steelEdge: number;
    metal: number;
    metalDark: number;
    accent: number;
    accentDark: number;
    warn: number;
    danger: number;
    dangerDark: number;
    acid: number;
    acidDark: number;
    water: number;
    waterLight: number;
    ice: number;
    ok: number;
    hot: number;
    cold: number;
    spark: number;
    ink: number;
    paper: number;
    shadow: number;
};
export declare function css(color: number): string;
/** Смешивание двух цветов — используется для нагрева, урона и подсветки фаз. */
export declare function mixColor(from: number, to: number, t: number): number;
