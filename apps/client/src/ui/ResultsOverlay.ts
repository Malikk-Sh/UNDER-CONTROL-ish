/**
 * Итоги смены (GDD §13.1).
 *
 * Оценка по четырём осям — безопасность, скорость, сохранность, спасения — и
 * шуточные титулы. Прогрессия ничего не усиливает: это признание вклада, а не
 * преимущество (GDD §13.2).
 */

import type { ResultsPayload } from '@uc/shared';
import { el, installStyles } from './dom.js';

export class ResultsOverlay {
  private readonly root: HTMLElement;
  private readonly card: HTMLElement;

  onRestart: () => void = () => {};
  onExit: () => void = () => {};

  constructor() {
    installStyles();
    this.card = el('div', { class: 'uc-card' });
    this.root = el('div', { class: 'uc-overlay', hidden: true }, [this.card]);
    document.body.appendChild(this.root);
  }

  show(results: ResultsPayload): void {
    this.card.replaceChildren(
      el('h1', { class: 'uc-title', text: results.cleared ? 'Смена закрыта' : 'Смена сорвана' }),
      el('p', {
        class: 'uc-sub',
        text: results.cleared
          ? `Комплекс почти цел. Общее время: ${formatDuration(results.seconds)}.`
          : `Не в этот раз. Продержались: ${formatDuration(results.seconds)}.`,
      }),
      el('div', { class: 'uc-grades' }, [
        grade('Безопасность', results.grades.safety),
        grade('Скорость', results.grades.speed),
        grade('Сохранность', results.grades.care),
        grade('Спасения', results.grades.rescue),
      ]),
      el('table', { class: 'uc-results-table' }, [
        el('thead', {}, [
          el('tr', {}, [
            el('th', { text: 'Работник' }),
            el('th', { text: 'Титул' }),
            el('th', { text: 'Спасений' }),
            el('th', { text: 'Переносок' }),
            el('th', { text: 'Бросков' }),
          ]),
        ]),
        el(
          'tbody',
          {},
          results.players.map((player) =>
            el('tr', {}, [
              el('td', { text: player.name }),
              el('td', { text: player.title }),
              el('td', { text: String(player.revives) }),
              el('td', { text: String(player.itemsCarried) }),
              el('td', { text: String(player.throws) }),
            ]),
          ),
        ),
      ]),
      el('div', { class: 'uc-row' }, [
        button('Ещё смену', 'primary', () => this.onRestart()),
        button('В меню', 'ghost', () => this.onExit()),
      ]),
    );
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  destroy(): void {
    this.root.remove();
  }
}

function grade(label: string, value: number): HTMLElement {
  return el('div', { class: 'uc-grade' }, [
    el('b', { text: '★'.repeat(Math.max(1, Math.min(5, value))) }),
    el('span', { text: label }),
  ]);
}

function button(label: string, variant: string, onClick: () => void): HTMLElement {
  const node = el('button', { class: `uc-btn ${variant}`, type: 'button', text: label });
  node.addEventListener('click', onClick);
  return node;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes} мин ${rest.toString().padStart(2, '0')} с`;
}
