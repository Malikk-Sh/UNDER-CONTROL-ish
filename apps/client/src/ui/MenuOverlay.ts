/**
 * Главное меню и лобби.
 *
 * Быстрый вход — главный сценарий: кнопка «Найти смену» работает без ввода
 * чего бы то ни было. Приватная комната по коду, выбор смены, косметика и
 * настройки — дополнительные пути (GDD §16.4).
 */

import { PLAYER_BADGES, PLAYER_COLORS, SHIFTS } from '@uc/shared';
import { getSettings, updateSettings } from '../settings.js';
import { css } from '../art/palette.js';
import { clear, el, installStyles } from './dom.js';
import { buildFullscreenPrompt, buildSettingsPanel } from './SettingsPanel.js';

export interface JoinRequest {
  name: string;
  colorIndex: number;
  badgeIndex: number;
  code: string;
  shiftId: string;
}

type Tab = 'play' | 'settings' | 'controls';

export class MenuOverlay {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly tabs = new Map<Tab, HTMLButtonElement>();
  private readonly errorNode: HTMLElement;
  private activeTab: Tab = 'play';
  private busy = false;

  onJoin: (request: JoinRequest) => Promise<void> = async () => {};

  constructor() {
    installStyles();
    this.errorNode = el('p', { class: 'uc-error' });
    this.body = el('div', { class: 'uc-grid' });

    const card = el('div', { class: 'uc-card' }, [
      el('h1', { class: 'uc-title', text: 'Всё под контролем!' }),
      el('p', {
        class: 'uc-sub',
        text: 'Кооперативная смена на сортировочном заводе. От одного до восьми работников — задачи подстроятся под состав.',
      }),
      this.buildTabs(),
      this.body,
      this.errorNode,
    ]);

    this.root = el('div', { class: 'uc-overlay' }, [card]);
    document.body.appendChild(this.root);
    this.renderTab('play');
  }

  private buildTabs(): HTMLElement {
    const row = el('div', { class: 'uc-tabs', role: 'tablist' });
    const definitions: [Tab, string][] = [
      ['play', 'Играть'],
      ['controls', 'Управление'],
      ['settings', 'Настройки'],
    ];
    for (const [id, label] of definitions) {
      const button = el('button', { class: 'uc-tab', type: 'button', role: 'tab', text: label }) as HTMLButtonElement;
      button.addEventListener('click', () => this.renderTab(id));
      this.tabs.set(id, button);
      row.append(button);
    }
    return row;
  }

  private renderTab(tab: Tab): void {
    this.activeTab = tab;
    for (const [id, button] of this.tabs) {
      button.setAttribute('aria-selected', String(id === tab));
    }
    clear(this.body);
    if (tab === 'play') this.body.append(this.buildPlayTab());
    else if (tab === 'settings') this.body.append(buildSettingsPanel());
    else this.body.append(buildControlsTab());
  }

  private buildPlayTab(): HTMLElement {
    const settings = getSettings();
    const grid = el('div', { class: 'uc-grid' });

    const prompt = buildFullscreenPrompt(() => {});
    if (prompt) grid.append(prompt);

    const nameInput = el('input', {
      class: 'uc-input',
      type: 'text',
      maxlength: '18',
      placeholder: 'Имя работника',
      value: settings.name,
    }) as HTMLInputElement;
    nameInput.addEventListener('change', () => updateSettings({ name: nameInput.value.trim() }));

    const codeInput = el('input', {
      class: 'uc-input',
      type: 'text',
      maxlength: '6',
      placeholder: 'КОД',
      autocapitalize: 'characters',
      style: 'text-transform:uppercase',
    }) as HTMLInputElement;

    const shiftSelect = el('select', { class: 'uc-select' }) as HTMLSelectElement;
    for (const shift of SHIFTS) {
      const minutes = shift.minutes[1] > 0 ? ` · ${shift.minutes[0]}–${shift.minutes[1]} мин` : '';
      shiftSelect.append(el('option', { value: shift.id, text: `${shift.title}${minutes}` }));
    }

    const quick = el('button', { class: 'uc-btn primary', type: 'button', text: 'Найти смену' }) as HTMLButtonElement;
    const create = el('button', { class: 'uc-btn', type: 'button', text: 'Создать приватную' }) as HTMLButtonElement;
    const join = el('button', { class: 'uc-btn', type: 'button', text: 'Войти по коду' }) as HTMLButtonElement;

    const request = (code: string): JoinRequest => ({
      name: nameInput.value.trim(),
      colorIndex: getSettings().colorIndex,
      badgeIndex: getSettings().badgeIndex,
      code,
      shiftId: shiftSelect.value,
    });

    quick.addEventListener('click', () => void this.submit(request(''), [quick, create, join]));
    create.addEventListener('click', () => {
      const code = randomCode();
      codeInput.value = code;
      void this.submit(request(code), [quick, create, join]);
    });
    join.addEventListener('click', () => {
      const code = codeInput.value.trim().toUpperCase();
      if (code.length < 3) {
        this.showError('Введите код комнаты (минимум 3 символа)');
        return;
      }
      void this.submit(request(code), [quick, create, join]);
    });

    grid.append(
      el('div', { class: 'uc-grid cols2' }, [
        el('label', { class: 'uc-label' }, ['Имя', nameInput]),
        el('label', { class: 'uc-label' }, ['Смена', shiftSelect]),
      ]),
      this.buildAppearance(),
      el('div', { class: 'uc-row' }, [quick, create]),
      el('div', { class: 'uc-row' }, [
        el('div', { style: 'flex:1;min-width:140px' }, [codeInput]),
        join,
      ]),
      el('p', {
        class: 'uc-sub',
        text: 'Приватная комната делится кодом. Подключиться можно и посреди смены — на ближайшем чекпоинте.',
      }),
    );
    return grid;
  }

  private buildAppearance(): HTMLElement {
    const colors = el('div', { class: 'uc-swatches' });
    PLAYER_COLORS.forEach((color, index) => {
      const swatch = el('button', {
        class: 'uc-swatch',
        type: 'button',
        style: `background:${css(color)}`,
        'aria-label': `Цвет ${index + 1}`,
      }) as HTMLButtonElement;
      swatch.setAttribute('aria-pressed', String(getSettings().colorIndex === index));
      swatch.addEventListener('click', () => {
        updateSettings({ colorIndex: index });
        for (const node of colors.children) node.setAttribute('aria-pressed', 'false');
        swatch.setAttribute('aria-pressed', 'true');
      });
      colors.append(swatch);
    });

    // Значок дублирует цвет — команда различима и при дальтонизме (GDD §14.3).
    const badges = el('select', { class: 'uc-select' }) as HTMLSelectElement;
    const labels: Record<string, string> = {
      circle: 'Круг', square: 'Квадрат', triangle: 'Треугольник', diamond: 'Ромб',
      cross: 'Крест', star: 'Звезда', hex: 'Шестиугольник', drop: 'Капля',
      ring: 'Кольцо', bolt: 'Молния', moon: 'Месяц', leaf: 'Лист',
    };
    PLAYER_BADGES.forEach((badge, index) => {
      badges.append(el('option', { value: String(index), text: labels[badge] ?? badge }));
    });
    badges.value = String(getSettings().badgeIndex);
    badges.addEventListener('change', () => updateSettings({ badgeIndex: Number(badges.value) }));

    return el('div', { class: 'uc-grid cols2' }, [
      el('label', { class: 'uc-label' }, ['Цвет каски', colors]),
      el('label', { class: 'uc-label' }, ['Значок', badges]),
    ]);
  }

  private async submit(request: JoinRequest, buttons: HTMLButtonElement[]): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    for (const button of buttons) button.disabled = true;
    this.showError('');
    try {
      await this.onJoin(request);
    } catch (cause) {
      this.showError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      this.busy = false;
      for (const button of buttons) button.disabled = false;
    }
  }

  showError(message: string): void {
    this.errorNode.textContent = message;
  }

  show(): void {
    this.root.hidden = false;
    this.renderTab(this.activeTab);
  }

  hide(): void {
    this.root.hidden = true;
  }

  destroy(): void {
    this.root.remove();
  }
}

function buildControlsTab(): HTMLElement {
  const rows: [string, string, string][] = [
    ['Движение', 'A / D или ←→', 'Стик слева'],
    ['Прыжок', 'Space', 'Кнопка «Прыжок»'],
    ['Взять / использовать', 'E (удерживать)', 'Кнопка «Взять»'],
    ['Бросить', 'F', 'Кнопка «Бросок», свайп задаёт направление'],
    ['Подкат', 'S / Ctrl / ↓', 'Свайп вниз по стику'],
    ['Метка', 'Q', 'Кнопка «Метка»'],
  ];

  const table = el('table', { class: 'uc-results-table' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', { text: 'Действие' }),
        el('th', { text: 'Клавиатура' }),
        el('th', { text: 'Сенсор' }),
      ]),
    ]),
    el(
      'tbody',
      {},
      rows.map(([action, keyboard, touch]) =>
        el('tr', {}, [el('td', { text: action }), el('td', { text: keyboard }), el('td', { text: touch })]),
      ),
    ),
  ]);

  return el('div', { class: 'uc-grid' }, [
    table,
    el('p', {
      class: 'uc-sub',
      text:
        'Отпускание кнопки взаимодействия аккуратно кладёт предмет, бросок — швыряет. ' +
        'Геймпад тоже поддерживается: левый стик, A — прыжок, X — взять, B — бросок.',
    }),
    el('p', {
      class: 'uc-sub',
      text:
        'Товарища, который лёг, можно поднять: подойдите и удерживайте взаимодействие. ' +
        'Вдвоём получится быстрее, но и в одиночку он встанет сам за пять секунд.',
    }),
  ]);
}

function randomCode(): string {
  // Без похожих символов: код диктуют голосом.
  const alphabet = 'ACDEFHJKLMNPRTUVWXY349';
  let code = '';
  for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}
