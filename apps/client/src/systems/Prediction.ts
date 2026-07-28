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

import {
  FIXED_DT,
  NET,
  PlayerState,
  TileMap,
  createPlayerSim,
  stepPlayerMotion,
  type DynamicSolid,
  type InputFrame,
  type MotionEnv,
  type PlayerSim,
} from '@uc/shared';

interface HistoryEntry {
  seq: number;
  x: number;
  y: number;
}

export interface PredictionDebug {
  pendingInputs: number;
  lastError: number;
  hardCorrections: number;
  softCorrections: number;
}

export class LocalPlayerPrediction {
  readonly sim: PlayerSim;
  private readonly env: MotionEnv;
  private readonly pending: InputFrame[] = [];
  private readonly history: HistoryEntry[] = [];
  private accumulator = 0;
  private seq = 0;

  /** Сглаживание мелкой ошибки: визуальное смещение, гасимое за пару кадров. */
  private offsetX = 0;
  private offsetY = 0;

  readonly debug: PredictionDebug = {
    pendingInputs: 0,
    lastError: 0,
    hardCorrections: 0,
    softCorrections: 0,
  };

  constructor(id: string, map: TileMap, solids: DynamicSolid[], x: number, y: number) {
    this.sim = createPlayerSim(id, x, y);
    this.env = { map, solids, jumpFactor: 1 };
  }

  /** Позиция для рендера: предсказание плюс остаток сглаживаемой ошибки. */
  get renderX(): number {
    return this.sim.body.x + this.offsetX;
  }

  get renderY(): number {
    return this.sim.body.y + this.offsetY;
  }

  setEnvironment(map: TileMap, solids: DynamicSolid[]): void {
    this.env.map = map;
    this.env.solids = solids;
  }

  setJumpFactor(factor: number): void {
    this.env.jumpFactor = factor;
  }

  setCarrySpeedFactor(factor: number): void {
    this.sim.carrySpeedFactor = factor;
  }

  /** Телепорт без сглаживания — при смене комнаты или респауне. */
  teleport(x: number, y: number): void {
    this.sim.body.x = x;
    this.sim.body.y = y;
    this.sim.vx = 0;
    this.sim.vy = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.pending.length = 0;
    this.history.length = 0;
  }

  /**
   * Прогоняет симуляцию на прошедшее время. Возвращает кадры ввода, которые
   * нужно отправить серверу: ровно по одному на каждый фиксированный шаг.
   */
  update(deltaSeconds: number, sample: () => Omit<InputFrame, 'seq'>): InputFrame[] {
    // Ограничиваем догоняющий цикл: после вкладки в фоне лучше пропустить
    // время, чем проиграть сотню шагов и уехать сквозь стены.
    this.accumulator = Math.min(this.accumulator + deltaSeconds, FIXED_DT * 6);
    const produced: InputFrame[] = [];

    while (this.accumulator >= FIXED_DT) {
      this.accumulator -= FIXED_DT;
      this.seq++;
      const raw = sample();
      const frame: InputFrame = { seq: this.seq, axis: raw.axis, buttons: raw.buttons, aim: raw.aim };

      stepPlayerMotion(this.sim, frame, this.env, FIXED_DT);

      this.pending.push(frame);
      if (this.pending.length > NET.maxPendingInputs) this.pending.shift();
      this.history.push({ seq: frame.seq, x: this.sim.body.x, y: this.sim.body.y });
      if (this.history.length > NET.maxPendingInputs) this.history.shift();

      produced.push(frame);
    }

    this.decayOffset(deltaSeconds);
    this.debug.pendingInputs = this.pending.length;
    return produced;
  }

  private decayOffset(deltaSeconds: number): void {
    const decay = Math.pow(1 - NET.reconcileSmoothing, deltaSeconds * 60);
    this.offsetX *= decay;
    this.offsetY *= decay;
    if (Math.abs(this.offsetX) < 0.05) this.offsetX = 0;
    if (Math.abs(this.offsetY) < 0.05) this.offsetY = 0;
  }

  /** Сверка с авторитетным снимком. */
  reconcile(serverX: number, serverY: number, lastSeq: number, serverState: PlayerState): void {
    // Пока сервер держит игрока лежачим или в оглушении, спорить не о чем:
    // управление всё равно не наше.
    if (serverState === PlayerState.Downed || serverState === PlayerState.Spectating) {
      this.sim.body.x = serverX;
      this.sim.body.y = serverY;
      this.sim.state = serverState;
      this.pending.length = 0;
      this.history.length = 0;
      return;
    }
    this.sim.state = serverState;

    while (this.history.length > 0 && this.history[0].seq < lastSeq) this.history.shift();
    const entry = this.history[0]?.seq === lastSeq ? this.history[0] : undefined;

    const previousX = this.sim.body.x;
    const previousY = this.sim.body.y;
    const error = entry ? Math.hypot(entry.x - serverX, entry.y - serverY) : Number.POSITIVE_INFINITY;
    this.debug.lastError = Number.isFinite(error) ? error : 999;

    if (entry && error <= NET.reconcileSoftThreshold) {
      this.dropAcknowledged(lastSeq);
      return;
    }

    // Возвращаемся на авторитетную позицию и переигрываем неподтверждённый ввод.
    this.sim.body.x = serverX;
    this.sim.body.y = serverY;
    this.dropAcknowledged(lastSeq);

    for (const frame of this.pending) {
      stepPlayerMotion(this.sim, frame, this.env, FIXED_DT);
    }
    this.rebuildHistory();

    const shiftX = previousX - this.sim.body.x;
    const shiftY = previousY - this.sim.body.y;
    const shift = Math.hypot(shiftX, shiftY);

    if (shift > NET.reconcileHardThreshold) {
      // Слишком далеко — резкая коррекция без сглаживания, иначе персонаж
      // будет несколько секунд «догонять» себя сквозь стены.
      this.offsetX = 0;
      this.offsetY = 0;
      this.debug.hardCorrections++;
    } else {
      this.offsetX = shiftX;
      this.offsetY = shiftY;
      this.debug.softCorrections++;
    }
  }

  private dropAcknowledged(lastSeq: number): void {
    while (this.pending.length > 0 && this.pending[0].seq <= lastSeq) this.pending.shift();
  }

  private rebuildHistory(): void {
    this.history.length = 0;
    // История нужна только для будущих сверок, поэтому достаточно текущей
    // позиции для последнего проигранного кадра.
    const last = this.pending[this.pending.length - 1];
    if (last) this.history.push({ seq: last.seq, x: this.sim.body.x, y: this.sim.body.y });
  }
}
