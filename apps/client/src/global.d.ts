import type { GameDebugApi } from '@under-control/shared';

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  }

  interface Window {
    __UNDER_CONTROL_DEBUG__?: GameDebugApi;
    __PWA_UPDATE_READY__?: boolean;
    __UPDATE_PWA__?: () => Promise<void>;
  }
}

export {};
