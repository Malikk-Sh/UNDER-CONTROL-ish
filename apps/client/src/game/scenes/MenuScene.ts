import Phaser from 'phaser';
import { RU } from '../i18n/ru';
import { AudioSystem } from '../systems/AudioSystem';

export class MenuScene extends Phaser.Scene {
  private starting = false;

  constructor() {
    super('Menu');
  }

  create(): void {
    document.body.dataset.scene = 'menu';
    this.updateLiveRegion('Главное меню. Начать смену.');
    const background = this.add.image(640, 360, 'factory-background').setDisplaySize(2_400, 720);
    background.setCrop(0, 0, 1_280, 720);
    this.add.rectangle(640, 360, 1_280, 720, 0x071017, 0.4);
    this.add.rectangle(640, 358, 850, 510, 0x0b1720, 0.9)
      .setStrokeStyle(3, 0x35525f, 0.8);
    this.add.rectangle(640, 135, 850, 18, 0xffb000, 0.95);
    this.add.text(640, 198, RU.title, {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '54px',
      color: '#f4f7fb',
      stroke: '#091117',
      strokeThickness: 10,
      letterSpacing: 3,
    }).setOrigin(0.5);
    this.add.text(640, 250, 'UNDER CONTROL-ish', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '22px',
      color: '#33e6d1',
      letterSpacing: 8,
    }).setOrigin(0.5);

    const battery = this.add.image(640, 346, 'battery').setDisplaySize(160, 99).setAngle(-4);
    this.tweens.add({ targets: battery, y: 335, angle: 4, yoyo: true, repeat: -1, duration: 1_300, ease: 'Sine.InOut' });

    const startButton = this.add.rectangle(640, 466, 390, 82, 0xffb000, 1)
      .setStrokeStyle(4, 0xffe296)
      .setInteractive({ useHandCursor: true });
    const label = this.add.text(640, 466, RU.start, {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '28px',
      color: '#111b22',
      letterSpacing: 2,
    }).setOrigin(0.5);
    startButton.on('pointerover', () => { startButton.setFillStyle(0xffcc4d); label.setScale(1.02); });
    startButton.on('pointerout', () => { startButton.setFillStyle(0xffb000); label.setScale(1); });
    startButton.on('pointerdown', () => this.startContract());

    const touch = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
    this.add.text(640, 548, touch ? RU.controlsTouch : RU.controlsDesktop, {
      fontFamily: 'Segoe UI, sans-serif',
      fontSize: '16px',
      color: '#a8bbc4',
      align: 'center',
    }).setOrigin(0.5);
    this.add.text(640, 613, '1 ИГРОК  ·  ЛОКАЛЬНЫЙ КОНТРАКТ  ·  8–15 МИН', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '14px',
      color: '#6e8994',
      letterSpacing: 2,
    }).setOrigin(0.5);

    this.input.keyboard?.once('keydown-SPACE', () => this.startContract());
    this.input.keyboard?.once('keydown-ENTER', () => this.startContract());
  }

  private startContract(): void {
    if (this.starting) return;
    this.starting = true;
    const existing = this.registry.get('audio') as AudioSystem | undefined;
    const audio = existing ?? new AudioSystem();
    this.registry.set('audio', audio);
    void audio.unlock().catch(() => undefined).finally(() => {
      this.cameras.main.fadeOut(260, 7, 16, 23);
      this.time.delayedCall(250, () => this.scene.start('FactoryRoom'));
    });
  }

  private updateLiveRegion(message: string): void {
    const status = document.querySelector<HTMLElement>('#game-status');
    if (status) status.textContent = message;
  }
}
