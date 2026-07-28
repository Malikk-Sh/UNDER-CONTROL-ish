import { registerSW } from 'virtual:pwa-register';
import { createGame } from './game/config';
import './style.css';

let installPrompt: BeforeInstallPromptEvent | undefined;
const installButton = document.querySelector<HTMLButtonElement>('#install-button');

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event as BeforeInstallPromptEvent;
  if (installButton) installButton.hidden = false;
});

installButton?.addEventListener('click', () => {
  if (!installPrompt) return;
  void installPrompt.prompt().then(() => installPrompt?.userChoice).then(() => {
    installPrompt = undefined;
    installButton.hidden = true;
  });
});

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.__PWA_UPDATE_READY__ = true;
    window.dispatchEvent(new CustomEvent('pwa-update-ready'));
  },
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent('pwa-offline-ready'));
  },
});

window.__UPDATE_PWA__ = async () => {
  await updateSW(true);
};

window.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('gesturestart', (event) => event.preventDefault());

createGame();
