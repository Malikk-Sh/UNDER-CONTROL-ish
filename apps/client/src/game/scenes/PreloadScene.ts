import Phaser from 'phaser';

const ASSETS: ReadonlyArray<readonly [string, string]> = [
  ['factory-background', '/assets/factory-background.svg'],
  ['worker-body', '/assets/worker-body.svg'],
  ['worker-helmet', '/assets/worker-helmet.svg'],
  ['worker-arm', '/assets/worker-arm.svg'],
  ['battery', '/assets/battery.svg'],
  ['cart', '/assets/cart.svg'],
  ['press-head', '/assets/press-head.svg'],
  ['cooling-station', '/assets/cooling-station.svg'],
  ['socket', '/assets/socket.svg'],
];

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    document.body.dataset.scene = 'preload';
    const barBackground = this.add.rectangle(640, 390, 420, 18, 0x263c47).setOrigin(0.5);
    const bar = this.add.rectangle(432, 390, 0, 12, 0x33e6d1).setOrigin(0, 0.5);
    this.add.text(640, 338, 'ПРОВЕРКА ТЕХНИКИ БЕЗОПАСНОСТИ', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '19px',
      color: '#dbe8ed',
      letterSpacing: 2,
    }).setOrigin(0.5);
    this.load.on('progress', (progress: number) => { bar.width = 416 * progress; });
    this.load.on('complete', () => {
      barBackground.setStrokeStyle(2, 0x33e6d1, 0.6);
    });
    for (const [key, url] of ASSETS) this.load.svg(key, url);
  }

  create(): void {
    this.scene.start('Menu');
  }
}
