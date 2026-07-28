/**
 * Панель настроек (GDD §14.3).
 *
 * Здесь же живёт переключатель полноэкранного режима: на телефоне он важнее
 * любой другой настройки, потому что без него адресная строка перекрывает
 * нижний ряд кнопок.
 */

import { getSettings, isTouchDevice, updateSettings, type Settings } from '../settings.js';
import { detectFullscreenSupport, isFullscreen, isStandalone, setFullscreen } from './fullscreen.js';
import { el } from './dom.js';

type OnChange = (settings: Readonly<Settings>) => void;

export function buildSettingsPanel(onChange: OnChange = () => {}): HTMLElement {
  const container = el('div', { class: 'uc-grid' });

  const apply = (patch: Partial<Settings>): void => {
    onChange(updateSettings(patch));
  };

  container.append(
    section('Экран'),
    buildFullscreenControl(apply),
    toggle(
      'Контуры персонажей',
      'Помогает не потерять себя в толпе',
      () => getSettings().outlines,
      (value) => apply({ outlines: value }),
    ),
    slider('Масштаб интерфейса', 0.8, 1.6, 0.05, () => getSettings().uiScale, (value) => apply({ uiScale: value })),
    select(
      'Качество',
      [
        ['high', 'Высокое'],
        ['medium', 'Среднее'],
        ['low', 'Низкое'],
      ],
      () => getSettings().quality,
      (value) => apply({ quality: value as Settings['quality'] }),
    ),

    section('Комфорт'),
    slider('Тряска камеры', 0, 1, 0.1, () => getSettings().screenShake, (value) => apply({ screenShake: value })),
    slider('Вспышки', 0, 1, 0.1, () => getSettings().flashes, (value) => apply({ flashes: value })),
    slider('Частицы', 0, 1, 0.1, () => getSettings().particles, (value) => apply({ particles: value })),

    section('Управление'),
    toggle(
      'Режим без удерживания',
      'Кнопка взаимодействия работает как переключатель',
      () => getSettings().holdFreeMode,
      (value) => apply({ holdFreeMode: value }),
    ),
    toggle(
      'Помощь на краях',
      'Увеличенная зона нажатия сенсорных кнопок',
      () => getSettings().touchAssist,
      (value) => apply({ touchAssist: value }),
    ),
    toggle(
      'Раскладка для левшей',
      'Стик справа, кнопки слева',
      () => getSettings().leftHanded,
      (value) => apply({ leftHanded: value }),
    ),

    section('Звук'),
    slider('Общая громкость', 0, 1, 0.05, () => getSettings().masterVolume, (value) => apply({ masterVolume: value })),
    slider('Эффекты', 0, 1, 0.05, () => getSettings().sfxVolume, (value) => apply({ sfxVolume: value })),
    slider('Музыка', 0, 1, 0.05, () => getSettings().musicVolume, (value) => apply({ musicVolume: value })),
    toggle(
      'Субтитры звуков',
      'Текстовое дублирование важных звуковых событий',
      () => getSettings().subtitles,
      (value) => apply({ subtitles: value }),
    ),
  );

  return container;
}

function buildFullscreenControl(apply: (patch: Partial<Settings>) => void): HTMLElement {
  const support = detectFullscreenSupport();

  if (support === 'native') {
    const row = toggle(
      'Полноэкранный режим',
      'Скрывает панели браузера и блокирует ландшафтную ориентацию',
      () => isFullscreen(),
      () => {},
    );
    const input = row.querySelector('input') as HTMLInputElement;
    // Полный экран запрашивается синхронно из жеста пользователя, иначе
    // браузер отклонит запрос.
    input.addEventListener('change', () => {
      const wanted = input.checked;
      void setFullscreen(wanted).then((ok) => {
        input.checked = ok ? wanted : false;
        apply({ fullscreen: ok ? wanted : false, fullscreenPrompted: true });
      });
    });
    return row;
  }

  if (support === 'standalone-only') {
    const installed = isStandalone();
    return el('div', { class: 'uc-toggle' }, [
      el('span', {}, [
        'Полноэкранный режим',
        el('small', {
          text: installed
            ? 'Активен: игра запущена как приложение'
            : 'В Safari доступен только через «Поделиться» → «На экран “Домой”»',
        }),
      ]),
    ]);
  }

  return el('div', { class: 'uc-toggle' }, [
    el('span', {}, ['Полноэкранный режим', el('small', { text: 'Не поддерживается этим браузером' })]),
  ]);
}

/**
 * Однократное предложение включить полный экран на телефоне. Возвращает
 * элемент-подсказку либо null, если предлагать не нужно.
 */
export function buildFullscreenPrompt(onDone: () => void): HTMLElement | null {
  const settings = getSettings();
  if (settings.fullscreenPrompted || !isTouchDevice()) return null;
  if (detectFullscreenSupport() !== 'native' || isFullscreen()) return null;

  const button = el('button', { class: 'uc-btn primary', type: 'button', text: 'Во весь экран' });
  const skip = el('button', { class: 'uc-btn ghost', type: 'button', text: 'Не сейчас' });

  const wrapper = el('div', { class: 'uc-grid' }, [
    el('p', { class: 'uc-sub', text: 'На телефоне удобнее играть в полноэкранном режиме — панели браузера не перекроют кнопки.' }),
    el('div', { class: 'uc-row' }, [button, skip]),
  ]);

  button.addEventListener('click', () => {
    void setFullscreen(true).then((ok) => {
      updateSettings({ fullscreen: ok, fullscreenPrompted: true });
      wrapper.remove();
      onDone();
    });
  });
  skip.addEventListener('click', () => {
    updateSettings({ fullscreenPrompted: true });
    wrapper.remove();
    onDone();
  });

  return wrapper;
}

// ------------------------------------------------------------------ элементы

function section(title: string): HTMLElement {
  return el('h3', { class: 'uc-sub', style: 'margin-top:8px;font-weight:700;opacity:0.85' }, [title]);
}

function toggle(
  title: string,
  description: string,
  read: () => boolean,
  write: (value: boolean) => void,
): HTMLElement {
  const input = el('input', { class: 'uc-switch', type: 'checkbox' }) as HTMLInputElement;
  input.checked = read();
  input.addEventListener('change', () => write(input.checked));
  return el('label', { class: 'uc-toggle' }, [
    el('span', {}, [title, el('small', { text: description })]),
    input,
  ]);
}

function slider(
  title: string,
  min: number,
  max: number,
  step: number,
  read: () => number,
  write: (value: number) => void,
): HTMLElement {
  const input = el('input', {
    class: 'uc-range',
    type: 'range',
    min: String(min),
    max: String(max),
    step: String(step),
  }) as HTMLInputElement;
  input.value = String(read());
  const value = el('small', { text: formatPercent(read(), min, max) });
  input.addEventListener('input', () => {
    const parsed = Number(input.value);
    value.textContent = formatPercent(parsed, min, max);
    write(parsed);
  });
  return el('label', { class: 'uc-label' }, [el('span', {}, [title, ' ', value]), input]);
}

function select(
  title: string,
  options: [string, string][],
  read: () => string,
  write: (value: string) => void,
): HTMLElement {
  const node = el('select', { class: 'uc-select' }) as HTMLSelectElement;
  for (const [value, label] of options) {
    node.append(el('option', { value, text: label }));
  }
  node.value = read();
  node.addEventListener('change', () => write(node.value));
  return el('label', { class: 'uc-label' }, [title, node]);
}

function formatPercent(value: number, min: number, max: number): string {
  if (min === 0 && max === 1) return `${Math.round(value * 100)}%`;
  return value.toFixed(2);
}
