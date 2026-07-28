/**
 * Числовые параметры симуляции.
 *
 * GDD §0.4 разрешает менять эти значения после плейтестов — они собраны здесь,
 * чтобы правки не расползались по коду. Все длины в мировых пикселях, время в
 * секундах, скорости в пикселях в секунду.
 */

export const TILE = 32;

/** Сервер симулирует фиксированным тиком (GDD §17.5). */
export const TICK_RATE = 30;
export const FIXED_DT = 1 / TICK_RATE;

/** Клиент отправляет ввод с той же частотой, что и серверный тик. */
export const INPUT_SEND_RATE = TICK_RATE;

/** Сколько снимков состояния сервер рассылает в секунду (GDD §16.1). */
export const SNAPSHOT_RATE = 20;
export const PATCH_INTERVAL_MS = Math.round(1000 / SNAPSHOT_RATE);

export const PLAYER = {
  width: 26,
  height: 42,
  /** Высота хитбокса в подкате — позволяет проезжать в щель в один тайл. */
  slideHeight: 22,

  gravity: 2300,
  /** Замедленное падение на восходящей ветви прыжка делает дугу «мультяшной». */
  gravityRising: 1750,
  maxFallSpeed: 1250,

  runSpeed: 262,
  accelGround: 2700,
  accelAir: 1650,
  frictionGround: 2600,
  frictionAir: 260,

  jumpVelocity: 690,
  /** Множитель скорости при отпускании прыжка — переменная высота прыжка. */
  jumpCutMultiplier: 0.42,
  coyoteTime: 0.12,
  jumpBufferTime: 0.14,

  slideSpeedBoost: 132,
  slideMinSpeed: 90,
  slideFriction: 620,
  slideMaxTime: 0.85,

  /** Мягкие столкновения игроков: толкнуть можно, заблокировать — нет (GDD §5.2). */
  pushRadius: 24,
  pushForce: 520,
  pushMaxSpeed: 200,

  /** Радиус и полуугол конуса контекстного взаимодействия (GDD §5.3). */
  interactRange: 62,
  interactConeCos: -0.25,

  /** Оглушение: 0,5–1,2 с по GDD §12. */
  stunMin: 0.5,
  stunMax: 1.2,
  /** Порог импульса, после которого удар оглушает. */
  stunImpactSpeed: 620,

  /**
   * Выведен из строя: лежит и ждёт помощи. По истечении срока игрок сам
   * возвращается на чекпоинт — GDD §0.2 требует возврата в игру за 0,5–5 с,
   * поэтому лежать дольше пяти секунд нельзя ни при каких условиях.
   */
  downedDuration: 5,
  /** Базовое время подъёма одним спасателем (GDD §12.1). */
  reviveBaseTime: 2.4,
  /** Пауза перед появлением на чекпоинте. */
  respawnDelay: 0.5,
  /** Неуязвимость после респауна/подъёма. */
  invulnerableTime: 1.6,

  /** Ограничения переноски. */
  carryOffsetY: -30,
  carryOffsetX: 16,
  /** Дальше этого расстояния носильщик автоматически отпускает груз. */
  carryLeash: 74,

  throwSpeed: 560,
  throwUpBias: 0.42,
  /** Минимальная пауза между захватами одного предмета. */
  grabCooldown: 0.18,

  /** Скорость на скользкой поверхности (лёд, пена огнетушителя). */
  slipperyFrictionScale: 0.12,
  /** Скорость на конвейере складывается со скоростью ленты. */
  conveyorTransfer: 1,
};

export const ITEM = {
  gravity: 2100,
  maxFallSpeed: 1100,
  frictionGround: 1400,
  frictionAir: 40,
  bounce: 0.22,
  /** Скорость удара, после которой хрупкий предмет получает урон. */
  fragileImpactSpeed: 330,
  /** Урон за единицу превышения порога. */
  fragileDamagePerSpeed: 0.0038,
  /** Скорость удара, после которой предмет оглушает игрока. */
  impactStunSpeed: 420,
  /** Скорость нагрева/остывания «горячих» грузов, единиц в секунду (0..1). */
  heatRate: 0.055,
  coolRate: 0.34,
  /** Скорость, с которой активная станция охлаждения снимает нагрев. */
  stationCoolRate: 0.55,
  /**
   * Ключевой предмет, упавший за пределы комнаты или в смертельную зону,
   * возвращается на точку восстановления (GDD §0.1: потерять его нельзя).
   */
  recoveryDelay: 1.4,
};

/**
 * Множитель скорости носильщика в зависимости от того, сколько рук держит груз.
 * Соло-путь всегда существует, просто он медленный (GDD §6.2).
 */
export const CARRY_SPEED_BY_DEFICIT = [0.34, 0.62, 0.84, 1.0];

export const CART = {
  width: 74,
  height: 40,
  friction: 900,
  maxSpeed: 300,
  /** Насколько сильно игрок разгоняет тележку контактом. */
  pushAccel: 1500,
  gravity: 2100,
};

export const HAZARD = {
  /** Фазы по GDD §9.1: предупреждение → активная фаза → восстановление. */
  pressWarn: 0.9,
  pressSlam: 0.28,
  pressHold: 0.45,
  pressRetract: 0.7,
  pressRecovery: 1.1,

  conveyorSpeed: 130,

  magnetWarn: 0.8,
  magnetPull: 1.5,
  magnetRest: 2.2,
  magnetForce: 900,
  magnetRadius: 210,

  /** Электризованная вода: заряд идёт импульсами с предупреждением. */
  electricWarn: 0.75,
  electricActive: 0.9,
  electricRest: 2.0,

  /** Импульс, которым опасность отбрасывает игрока. */
  knockback: 430,
};

export const OBJECTIVE = {
  /** Базовое время удержания кнопки-плиты соло. */
  plateSoloHold: 3.4,
  /** Каждый дополнительный активатор ускоряет процесс. */
  plateGroupHold: 1.2,
  valveTurnTime: 2.6,
  repairNodeTime: 2.2,
};

export const CATASTROPHE = {
  /** Финальная авария: сколько секунд команда добирается до лифта. */
  evacuationSeconds: 62,
  /** Сколько секунд лифт ждёт отставших, если внутри уже есть игроки. */
  liftGraceSeconds: 6,
  /** Скорость роста шкалы катастрофы за секунду. */
  gaugeRatePerSecond: 1 / 62,
};

export const NET = {
  /** Максимум пакетов ввода, которые сервер обработает за один тик. */
  maxInputsPerTick: 4,
  /** Буфер невыполненных вводов клиента для повторного проигрывания. */
  maxPendingInputs: 180,
  /** Расхождение позиции, после которого клиент делает жёсткую коррекцию. */
  reconcileHardThreshold: 96,
  /** Расхождение, которое клиент сглаживает без перепроигрывания. */
  reconcileSoftThreshold: 2.2,
  /** Доля ошибки, снимаемая за кадр при мягком сглаживании. */
  reconcileSmoothing: 0.18,
  /** Задержка буфера интерполяции удалённых игроков, мс. */
  interpolationDelayMs: 110,
  /** Допустимая рассинхронизация тика клиента и сервера. */
  maxTickDrift: 12,
  /** Проверка сервером: максимальная дистанция для захвата предмета. */
  grabMaxDistance: 96,
  /** Проверка сервером: максимальное смещение игрока за тик. */
  maxStepDistance: 34,
  /** Задержка до удаления отключившегося игрока (drop-in/drop-out, GDD §6.4). */
  reconnectSeconds: 45,
  /** Grace-период перед пересчётом активаторов после ухода игрока. */
  partyRecountGrace: 3,
};

export const ROOM = {
  /** Технический лимит комнаты (GDD §6.1: настраивается конфигурацией). */
  defaultMaxPlayers: 8,
  hardMaxPlayers: 12,
  recommendedMin: 1,
  recommendedMax: 8,
};

/** Палитра цветов игроков — различима при дальтонизме и дублируется значком. */
export const PLAYER_COLORS = [
  0xffc93c, 0x4fc1ff, 0xff7ab6, 0x7ee081, 0xff8a5b, 0xb18cff, 0x4de4c8, 0xf05a5a,
  0xa8d8ff, 0xd6e04a, 0xff9ecb, 0x9ba9ff,
];

/** Значок игрока — вторая, не цветовая метка (GDD §14.3). */
export const PLAYER_BADGES = [
  'circle', 'square', 'triangle', 'diamond', 'cross', 'star', 'hex', 'drop',
  'ring', 'bolt', 'moon', 'leaf',
] as const;

export type PlayerBadge = (typeof PLAYER_BADGES)[number];
