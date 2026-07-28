/**
 * Предсказание движения локального игрока и сверка с сервером.
 *
 * Клиент прогоняет ровно тот же `stepPlayerMotion`, что и сервер, с тем же
 * фиксированным шагом. Когда приходит снимок, позиция сравнивается с той, что
 * была у клиента на соответствующем sequence ID; при расхождении клиент
 * возвращается на серверную позицию и переигрывает ещё не подтверждённый ввод.
 *
 * Клиент намеренно НЕ предсказывает захват предметов и срабатывание устройств:
 * владение назначает только сервер, иначе ключевые предметы начнут двоиться
 * (GDD §16.2, §20.3).
 */
import { PlayerState, TileMap, type DynamicSolid, type InputFrame, type PlayerSim } from '@uc/shared';
export interface PredictionDebug {
    pendingInputs: number;
    lastError: number;
    hardCorrections: number;
    softCorrections: number;
}
export declare class LocalPlayerPrediction {
    readonly sim: PlayerSim;
    private readonly env;
    private readonly pending;
    private readonly history;
    private accumulator;
    private seq;
    /** Сглаживание мелкой ошибки: визуальное смещение, гасимое за пару кадров. */
    private offsetX;
    private offsetY;
    readonly debug: PredictionDebug;
    constructor(id: string, map: TileMap, solids: DynamicSolid[], x: number, y: number);
    /** Позиция для рендера: предсказание плюс остаток сглаживаемой ошибки. */
    get renderX(): number;
    get renderY(): number;
    setEnvironment(map: TileMap, solids: DynamicSolid[]): void;
    setJumpFactor(factor: number): void;
    setCarrySpeedFactor(factor: number): void;
    /** Телепорт без сглаживания — при смене комнаты или респауне. */
    teleport(x: number, y: number): void;
    /**
     * Прогоняет симуляцию на прошедшее время. Возвращает кадры ввода, которые
     * нужно отправить серверу: ровно по одному на каждый фиксированный шаг.
     */
    update(deltaSeconds: number, sample: () => Omit<InputFrame, 'seq'>): InputFrame[];
    private decayOffset;
    /** Сверка с авторитетным снимком. */
    reconcile(serverX: number, serverY: number, lastSeq: number, serverState: PlayerState): void;
    private dropAcknowledged;
    private rebuildHistory;
}
