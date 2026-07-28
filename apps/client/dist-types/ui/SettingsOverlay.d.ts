/** Настройки, доступные прямо во время смены — без выхода в меню. */
export declare class SettingsOverlay {
    private readonly root;
    private readonly body;
    onClose: () => void;
    onLeaveRoom: () => void;
    constructor();
    show(): void;
    hide(): void;
    get visible(): boolean;
    destroy(): void;
}
