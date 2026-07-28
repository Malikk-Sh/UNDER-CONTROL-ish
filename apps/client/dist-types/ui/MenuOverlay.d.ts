/**
 * Главное меню и лобби.
 *
 * Быстрый вход — главный сценарий: кнопка «Найти смену» работает без ввода
 * чего бы то ни было. Приватная комната по коду, выбор смены, косметика и
 * настройки — дополнительные пути (GDD §16.4).
 */
export interface JoinRequest {
    name: string;
    colorIndex: number;
    badgeIndex: number;
    code: string;
    shiftId: string;
}
export declare class MenuOverlay {
    private readonly root;
    private readonly body;
    private readonly tabs;
    private readonly errorNode;
    private activeTab;
    private busy;
    onJoin: (request: JoinRequest) => Promise<void>;
    constructor();
    private buildTabs;
    private renderTab;
    private buildPlayTab;
    private buildAppearance;
    private submit;
    showError(message: string): void;
    show(): void;
    hide(): void;
    destroy(): void;
}
