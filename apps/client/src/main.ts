/**
 * Точка входа клиента: создаёт игру, связывает меню, сеть и сцены.
 */

import Phaser from 'phaser';
import type { ResultsPayload } from '@uc/shared';
import { audio } from './audio/AudioSystem.js';
import { PALETTE } from './art/palette.js';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';
import { NetClient } from './net/NetClient.js';
import { getSettings, onSettingsChanged, updateSettings } from './settings.js';
import { HudOverlay } from './ui/HudOverlay.js';
import { MenuOverlay } from './ui/MenuOverlay.js';
import { ResultsOverlay } from './ui/ResultsOverlay.js';
import { SettingsOverlay } from './ui/SettingsOverlay.js';
import { installStyles } from './ui/dom.js';
import { installFullscreenRestorer, watchFullscreenChanges } from './ui/fullscreen.js';

installStyles();
watchFullscreenChanges();
installFullscreenRestorer();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: PALETTE.voidDark,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: true,
    powerPreference: 'high-performance',
  },
  input: {
    gamepad: true,
    activePointers: 4,
  },
  fps: { target: 60, forceSetTimeOut: false },
  // Физика Phaser не используется: вся симуляция живёт в общем пакете и
  // исполняется одинаково на клиенте и сервере.
  scene: [BootScene, GameScene],
  audio: { noAudio: true },
});

const net = new NetClient();
const hud = new HudOverlay();
const menu = new MenuOverlay();
const results = new ResultsOverlay();
const settingsPanel = new SettingsOverlay();

hud.hide();

const bootScreen = document.getElementById('boot');

game.events.once(BootScene.READY, () => {
  bootScreen?.classList.add('hidden');
  window.setTimeout(() => bootScreen?.remove(), 400);
  menu.show();
});

menu.onJoin = async (request) => {
  // Контекст Web Audio разблокируется только внутри жеста пользователя.
  audio.unlock();

  updateSettings({
    name: request.name,
    colorIndex: request.colorIndex,
    badgeIndex: request.badgeIndex,
  });

  await net.connect({
    name: request.name || 'Работник',
    colorIndex: request.colorIndex,
    badgeIndex: request.badgeIndex,
    code: request.code,
    shiftId: request.shiftId,
  });

  net.setHandlers({
    onResults: (payload: ResultsPayload) => {
      results.show(payload);
      hud.hide();
    },
    onLeave: () => returnToMenu('Соединение потеряно'),
    onError: (message) => returnToMenu(message),
  });

  menu.hide();
  hud.show();
  game.scene.start(GameScene.KEY, { net, hud });
};

hud.onOpenSettings = () => {
  settingsPanel.show();
  currentGameScene()?.setPaused(true);
};

settingsPanel.onClose = () => currentGameScene()?.setPaused(false);
settingsPanel.onLeaveRoom = () => void leaveAndReturn();

results.onRestart = () => {
  results.hide();
  void leaveAndReturn();
};
results.onExit = () => {
  results.hide();
  void leaveAndReturn();
};

onSettingsChanged(() => {
  // Раскладка сенсорных кнопок зависит от масштаба интерфейса и раскладки левши.
  game.scale.refresh();
});

function currentGameScene(): GameScene | null {
  const scene = game.scene.getScene(GameScene.KEY) as unknown as GameScene | null;
  return scene && game.scene.isActive(GameScene.KEY) ? scene : null;
}

async function leaveAndReturn(): Promise<void> {
  await net.leave().catch(() => {});
  returnToMenu('');
}

function returnToMenu(message: string): void {
  if (game.scene.isActive(GameScene.KEY)) game.scene.stop(GameScene.KEY);
  audio.setMusicLayer('none');
  hud.hide();
  results.hide();
  menu.show();
  if (message) menu.showError(message);
}

// Разблокировка звука на первом же взаимодействии — требование браузеров.
for (const eventName of ['pointerdown', 'keydown', 'touchstart'] as const) {
  window.addEventListener(eventName, () => audio.unlock(), { once: true, passive: true });
}

// PWA: офлайн-оболочка, чтобы игра открывалась с домашнего экрана.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Регистрация не критична: игра работает и без неё.
    });
  });
}

// Настройки могли прийти из localStorage — применяем громкость сразу.
void getSettings();

/**
 * Диагностический хук. Им пользуется браузерный дымовой тест и он же удобен
 * при ручной отладке в консоли: показывает, что реально приходит с сервера и
 * куда предсказание поставило локального персонажа.
 */
(window as unknown as { __uc: () => unknown }).__uc = () => {
  const state = net.state;
  const scene = currentGameScene();
  const position = scene?.localPosition ?? { x: 0, y: 0 };
  return {
    ready: Boolean(state),
    sessionId: net.sessionId,
    tick: state?.tick ?? 0,
    players: state?.players?.size ?? 0,
    roomId: state?.roomId ?? '',
    phase: state?.phase ?? 0,
    latency: net.latency,
    x: position.x,
    y: position.y,
  };
};
