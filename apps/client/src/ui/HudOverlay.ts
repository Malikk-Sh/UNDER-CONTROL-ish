/**
 * Верхний интерфейс (GDD §14.1).
 *
 * Общая цель — вверху по центру одной строкой, шкала катастрофы — только когда
 * угроза активна, статусы игроков — по краю экрана, подсказки — снизу.
 * Ничего лишнего: экран и так занят цехом.
 */

import {
  PLAYER_COLORS,
  PlayerState,
  RoomPhase,
  type GameStateView,
  type ObjectiveStateView,
} from '@uc/shared';
import { css } from '../art/palette.js';
import { getSettings } from '../settings.js';
import { clear, el, installStyles } from './dom.js';
import { isFullscreen, toggleFullscreen } from './fullscreen.js';

export class HudOverlay {
  private readonly root: HTMLElement;
  private readonly objectiveTitle: HTMLElement;
  private readonly objectiveSteps: HTMLElement;
  private readonly gauge: HTMLElement;
  private readonly gaugeFill: HTMLElement;
  private readonly roster: HTMLElement;
  private readonly status: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly subtitles: HTMLElement;
  private readonly fullscreenButton: HTMLButtonElement;

  private hintTimer: number | null = null;
  private bannerTimer: number | null = null;
  private lastHintKey = '';
  private readonly subtitleQueue: { text: string; until: number }[] = [];

  onOpenSettings: () => void = () => {};

  constructor() {
    installStyles();

    this.objectiveTitle = el('div', {}, [el('b', { text: '—' })]);
    this.objectiveSteps = el('div', { class: 'steps' });
    this.gaugeFill = el('i', { style: 'width:0%' });
    this.gauge = el('div', { class: 'uc-gauge', hidden: true }, [this.gaugeFill]);

    const top = el('div', { class: 'uc-hud-top' }, [
      el('div', { class: 'uc-objective' }, [this.objectiveTitle, this.objectiveSteps]),
      this.gauge,
    ]);

    this.roster = el('div', { class: 'uc-roster' });
    this.status = el('div', { class: 'uc-status' });
    this.banner = el('div', { class: 'uc-banner', hidden: true });
    this.hint = el('div', { class: 'uc-hint', hidden: true });
    this.subtitles = el('div', { class: 'uc-subtitles' });

    this.fullscreenButton = el('button', {
      class: 'uc-icon-btn',
      type: 'button',
      title: 'Полноэкранный режим',
      'aria-label': 'Полноэкранный режим',
      text: '⛶',
    }) as HTMLButtonElement;
    this.fullscreenButton.addEventListener('click', () => {
      void toggleFullscreen().then(() => this.refreshFullscreenButton());
    });

    const settingsButton = el('button', {
      class: 'uc-icon-btn',
      type: 'button',
      title: 'Настройки',
      'aria-label': 'Настройки',
      text: '⚙',
    }) as HTMLButtonElement;
    settingsButton.addEventListener('click', () => this.onOpenSettings());

    const corner = el('div', { class: 'uc-corner' }, [settingsButton, this.fullscreenButton]);

    this.root = el('div', { class: 'uc-hud', hidden: true }, [
      top,
      el('div', {}, [this.banner]),
      el('div', {}, [this.subtitles, this.hint]),
      this.roster,
      this.status,
      corner,
    ]);
    document.body.appendChild(this.root);
    this.refreshFullscreenButton();
  }

  show(): void {
    this.root.hidden = false;
    this.refreshFullscreenButton();
  }

  hide(): void {
    this.root.hidden = true;
  }

  destroy(): void {
    this.root.remove();
  }

  private refreshFullscreenButton(): void {
    const active = isFullscreen();
    this.fullscreenButton.textContent = active ? '⛶' : '⛶';
    this.fullscreenButton.style.opacity = active ? '1' : '0.7';
    this.fullscreenButton.title = active ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим';
  }

  // ------------------------------------------------------------------ данные

  update(state: GameStateView, localSessionId: string, latency: number): void {
    this.updateObjective(state);
    this.updateGauge(state);
    this.updateRoster(state, localSessionId);
    this.updateStatus(state, latency);
    this.updateSubtitles();
  }

  private updateObjective(state: GameStateView): void {
    const title = this.objectiveTitle.firstElementChild as HTMLElement;
    const roomNumber = state.roomTotal > 0 ? `${state.roomIndex + 1}/${state.roomTotal} · ` : '';
    title.textContent = `${roomNumber}${state.roomBrief || state.roomTitle}`;

    clear(this.objectiveSteps);
    const objectives = Array.from(state.objectives ?? []) as ObjectiveStateView[];
    for (const objective of objectives) {
      const fill = el('i', { style: `width:${Math.round(Math.min(1, objective.progress) * 100)}%` });
      this.objectiveSteps.append(
        el('div', { class: `uc-step${objective.done ? ' done' : ''}` }, [
          el('span', { text: objective.done ? '✓' : '•' }),
          el('span', { text: objective.label }),
          el('span', { class: 'bar' }, [fill]),
        ]),
      );
    }

    // Подсказка про активаторы: сколько плит нужно текущему составу (GDD §6.3).
    if (state.requiredActivators > 0 && state.activeActivators < state.requiredActivators) {
      const needed = state.requiredActivators;
      if (this.hasActivatorObjective(state)) {
        this.objectiveSteps.append(
          el('div', { class: 'uc-step' }, [
            el('span', { text: '⚑' }),
            el('span', { text: `Активаторов нужно: ${state.activeActivators}/${needed}` }),
          ]),
        );
      }
    }
  }

  private hasActivatorObjective(state: GameStateView): boolean {
    return state.activeActivators > 0 || state.requiredActivators > 1;
  }

  private updateGauge(state: GameStateView): void {
    const showCatastrophe = state.phase === RoomPhase.Catastrophe && state.catastropheGauge > 0;
    const showTimer = state.timeLeft > 0;
    if (!showCatastrophe && !showTimer) {
      this.gauge.hidden = true;
      return;
    }
    this.gauge.hidden = false;
    const ratio = showCatastrophe ? state.catastropheGauge : 1 - Math.min(1, state.timeLeft / 120);
    this.gaugeFill.style.width = `${Math.round(Math.min(1, ratio) * 100)}%`;
  }

  private updateRoster(state: GameStateView, localSessionId: string): void {
    clear(this.roster);
    state.players.forEach((player) => {
      const classes = ['uc-mate'];
      if (player.state === PlayerState.Downed) classes.push('downed');
      if (!player.connected) classes.push('offline');

      const color = PLAYER_COLORS[player.colorIndex % PLAYER_COLORS.length];
      const suffix = player.sessionId === localSessionId ? ' (вы)' : '';
      const carrying = player.carrying > 0 ? ' 📦' : '';
      const downed = player.state === PlayerState.Downed ? ' лежит' : '';
      const offline = !player.connected ? ' отключился' : '';

      this.roster.append(
        el('div', { class: classes.join(' ') }, [
          el('span', { class: 'dot', style: `background:${css(color)}` }),
          el('span', { text: `${player.name}${suffix}${carrying}${downed}${offline}` }),
        ]),
      );
    });
  }

  private updateStatus(state: GameStateView, latency: number): void {
    clear(this.status);
    const quality = latency < 90 ? 'связь хорошая' : latency < 180 ? 'связь средняя' : 'связь плохая';
    this.status.append(
      el('div', { text: `${Math.round(latency)} мс · ${quality}` }),
      el('div', { text: `Состав: ${state.activePlayers}` }),
    );
    if (state.roomCode) this.status.append(el('div', { text: `Код: ${state.roomCode}` }));
    if (state.modifiers) {
      this.status.append(el('div', { text: `Вариации: ${state.modifiers.split(',').join(', ')}` }));
    }
  }

  // ---------------------------------------------------------------- сообщения

  showHint(text: string, key: string): void {
    if (!text) {
      this.hint.hidden = true;
      this.lastHintKey = '';
      return;
    }
    if (key === this.lastHintKey && !this.hint.hidden) return;
    this.lastHintKey = key;
    this.hint.textContent = text;
    this.hint.hidden = false;
    if (this.hintTimer !== null) window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => {
      this.hint.hidden = true;
      this.lastHintKey = '';
    }, 6500);
  }

  showBanner(text: string, color = '#ffc93c', durationMs = 2600): void {
    this.banner.textContent = text;
    this.banner.style.color = color;
    this.banner.hidden = false;
    if (this.bannerTimer !== null) window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => {
      this.banner.hidden = true;
    }, durationMs);
  }

  /** Субтитры звуковых событий — требование доступности (GDD §14.3). */
  pushSubtitle(text: string): void {
    if (!getSettings().subtitles) return;
    this.subtitleQueue.push({ text, until: performance.now() + 2600 });
    if (this.subtitleQueue.length > 3) this.subtitleQueue.shift();
  }

  private updateSubtitles(): void {
    const now = performance.now();
    while (this.subtitleQueue.length > 0 && this.subtitleQueue[0].until < now) this.subtitleQueue.shift();
    clear(this.subtitles);
    for (const entry of this.subtitleQueue) {
      this.subtitles.append(el('div', { text: `[ ${entry.text} ]` }));
    }
  }
}
