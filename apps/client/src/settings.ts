/**
 * Настройки клиента (GDD §14.3).
 *
 * Всё хранится в localStorage и применяется сразу: доступность — это не
 * отдельный режим, а набор переключателей, которые не должны требовать
 * перезапуска игры.
 */

const STORAGE_KEY = 'uc.settings.v1';

export interface Settings {
  name: string;
  colorIndex: number;
  badgeIndex: number;

  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;

  /** Полноэкранный режим — особенно важен на мобильных. */
  fullscreen: boolean;
  /** Предлагать полноэкранный режим при первом запуске на телефоне. */
  fullscreenPrompted: boolean;

  /** Тряска камеры, 0..1. */
  screenShake: number;
  /** Вспышки и резкие засветы, 0..1. */
  flashes: number;
  /** Плотность частиц, 0..1. */
  particles: number;
  /** Масштаб интерфейса. */
  uiScale: number;
  /** Толщина контуров персонажей — помогает не потеряться в толпе. */
  outlines: boolean;

  /** Режим без удерживания: кнопка взаимодействия работает как переключатель. */
  holdFreeMode: boolean;
  /** Субтитры для звуковых событий. */
  subtitles: boolean;
  /** Помощь на краях экрана и увеличенный буфер прыжка на touch. */
  touchAssist: boolean;
  /** Левша: стик справа, кнопки слева. */
  leftHanded: boolean;

  /** Уровень качества рендера: влияет на частицы и эффекты. */
  quality: 'low' | 'medium' | 'high';
}

const DEFAULTS: Settings = {
  name: '',
  colorIndex: 0,
  badgeIndex: 0,

  masterVolume: 0.8,
  sfxVolume: 0.9,
  musicVolume: 0.5,

  fullscreen: false,
  fullscreenPrompted: false,

  screenShake: 1,
  flashes: 1,
  particles: 1,
  uiScale: 1,
  outlines: true,

  holdFreeMode: false,
  subtitles: false,
  touchAssist: true,
  leftHanded: false,

  quality: 'high',
};

let current: Settings = load();

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS, ...detectDefaults() };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...detectDefaults(), ...parsed };
  } catch {
    return { ...DEFAULTS, ...detectDefaults() };
  }
}

/** Разумные значения по умолчанию для слабых и мобильных устройств. */
function detectDefaults(): Partial<Settings> {
  if (typeof navigator === 'undefined') return {};
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const patch: Partial<Settings> = {};
  if (coarse) {
    patch.uiScale = 1.15;
    patch.holdFreeMode = true;
  }
  if (cores <= 4) {
    patch.quality = 'medium';
    patch.particles = 0.6;
  }
  if (reduceMotion) {
    patch.screenShake = 0;
    patch.flashes = 0.25;
  }
  return patch;
}

export function getSettings(): Readonly<Settings> {
  return current;
}

type Listener = (settings: Readonly<Settings>) => void;
const listeners = new Set<Listener>();

export function onSettingsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateSettings(patch: Partial<Settings>): Readonly<Settings> {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Приватный режим браузера — играть всё равно можно.
  }
  for (const listener of listeners) listener(current);
  return current;
}

export function isTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ||
    navigator.maxTouchPoints > 0
  );
}

/** Множитель частиц с учётом качества и настройки доступности. */
export function particleScale(): number {
  const settings = getSettings();
  const byQuality = settings.quality === 'low' ? 0.35 : settings.quality === 'medium' ? 0.7 : 1;
  return byQuality * settings.particles;
}
