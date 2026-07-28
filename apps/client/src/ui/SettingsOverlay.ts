/** Настройки, доступные прямо во время смены — без выхода в меню. */

import { el, installStyles } from './dom.js';
import { buildSettingsPanel } from './SettingsPanel.js';

export class SettingsOverlay {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;

  onClose: () => void = () => {};
  onLeaveRoom: () => void = () => {};

  constructor() {
    installStyles();
    this.body = el('div', { class: 'uc-grid' });

    const close = el('button', { class: 'uc-btn primary', type: 'button', text: 'Продолжить' });
    close.addEventListener('click', () => this.hide());

    const leave = el('button', { class: 'uc-btn ghost', type: 'button', text: 'Покинуть смену' });
    leave.addEventListener('click', () => {
      this.hide();
      this.onLeaveRoom();
    });

    const card = el('div', { class: 'uc-card' }, [
      el('h1', { class: 'uc-title', text: 'Настройки' }),
      this.body,
      el('div', { class: 'uc-row' }, [close, leave]),
    ]);

    this.root = el('div', { class: 'uc-overlay', hidden: true }, [card]);
    document.body.appendChild(this.root);
  }

  show(): void {
    // Панель пересобирается при каждом открытии: значения всегда свежие.
    this.body.replaceChildren(buildSettingsPanel());
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
    this.onClose();
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  destroy(): void {
    this.root.remove();
  }
}
