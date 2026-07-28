import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { FactoryRoomScene } from './scenes/FactoryRoomScene';
import { MenuScene } from './scenes/MenuScene';
import { PreloadScene } from './scenes/PreloadScene';
import { ResultScene } from './scenes/ResultScene';

export const DESIGN_WIDTH = 1_280;
export const DESIGN_HEIGHT = 720;

export function createGame(): Phaser.Game {
  const isBrowserTest = new URLSearchParams(window.location.search).has('e2e');
  return new Phaser.Game({
    type: isBrowserTest ? Phaser.CANVAS : Phaser.WEBGL,
    parent: 'game-root',
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    backgroundColor: '#071017',
    transparent: false,
    antialias: true,
    roundPixels: false,
    render: {
      antialias: true,
      pixelArt: false,
      powerPreference: 'high-performance',
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
    },
    input: {
      activePointers: 4,
      touch: { capture: true },
    },
    physics: {
      default: 'matter',
      matter: {
        gravity: { x: 0, y: 1.35 },
        enableSleeping: false,
        debug: false,
      },
    },
    scene: [BootScene, PreloadScene, MenuScene, FactoryRoomScene, ResultScene],
  });
}
