/**
 * Полноэкранный режим.
 *
 * На мобильных это не косметика: без него адресная строка съедает нижние
 * кнопки, а свайп от края браузера конфликтует с виртуальным стиком. iOS
 * Safari не поддерживает Fullscreen API для произвольных элементов, поэтому
 * для него предусмотрен отдельный путь — подсказка «на экран Домой».
 */

import { getSettings, updateSettings } from '../settings.js';

export type FullscreenSupport = 'native' | 'standalone-only' | 'none';

export function detectFullscreenSupport(): FullscreenSupport {
  if (typeof document === 'undefined') return 'none';
  const element = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  if (document.fullscreenEnabled || typeof element.webkitRequestFullscreen === 'function') {
    return 'native';
  }
  // iOS Safari: полноэкранным можно быть только как установленное приложение.
  if (isIos()) return 'standalone-only';
  return 'none';
}

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement) || isStandalone();
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    (typeof matchMedia === 'function' && matchMedia('(display-mode: fullscreen)').matches) ||
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) ||
    nav.standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Включает или выключает полноэкранный режим. Вызывать только из обработчика
 * пользовательского жеста — браузеры отклоняют вызов из таймера.
 */
export async function setFullscreen(enabled: boolean): Promise<boolean> {
  const element = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> };

  try {
    if (enabled) {
      if (typeof element.requestFullscreen === 'function') await element.requestFullscreen({ navigationUI: 'hide' });
      else if (typeof element.webkitRequestFullscreen === 'function') await element.webkitRequestFullscreen();
      else return false;
      await lockLandscape();
    } else {
      if (typeof document.exitFullscreen === 'function' && document.fullscreenElement) await document.exitFullscreen();
      else if (typeof doc.webkitExitFullscreen === 'function') await doc.webkitExitFullscreen();
      unlockOrientation();
    }
    return true;
  } catch {
    // Пользователь отменил запрос или браузер запретил — не считаем ошибкой.
    return false;
  }
}

export async function toggleFullscreen(): Promise<boolean> {
  const next = !isFullscreen();
  const applied = await setFullscreen(next);
  updateSettings({ fullscreen: applied ? next : false });
  return applied;
}

/** Ландшафтная блокировка поддерживается не везде и падать из-за неё нельзя. */
async function lockLandscape(): Promise<void> {
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (orientation: string) => Promise<void>;
  };
  if (typeof orientation?.lock !== 'function') return;
  try {
    await orientation.lock('landscape');
  } catch {
    // Настольные браузеры отклоняют блокировку — это нормально.
  }
}

function unlockOrientation(): void {
  try {
    screen.orientation?.unlock?.();
  } catch {
    // Игнорируем: не все платформы это умеют.
  }
}

/**
 * Восстанавливает сохранённое предпочтение при первом же касании или клике:
 * браузеры не дают включить полный экран без жеста пользователя.
 */
export function installFullscreenRestorer(): void {
  if (!getSettings().fullscreen) return;
  const restore = (): void => {
    if (!isFullscreen()) void setFullscreen(true);
    window.removeEventListener('pointerdown', restore);
    window.removeEventListener('keydown', restore);
  };
  window.addEventListener('pointerdown', restore, { once: false });
  window.addEventListener('keydown', restore, { once: false });
}

/** Синхронизирует настройку, когда пользователь вышел из полноэкранного режима клавишей Esc. */
export function watchFullscreenChanges(): void {
  const sync = (): void => {
    const active = isFullscreen();
    if (getSettings().fullscreen !== active) updateSettings({ fullscreen: active });
  };
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync as EventListener);
}
