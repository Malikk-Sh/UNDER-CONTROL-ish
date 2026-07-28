import Phaser from 'phaser';
import { RU } from '../i18n/ru';

interface ResultData {
  elapsedMs?: number;
  heat?: number;
}

export class ResultScene extends Phaser.Scene {
  private updateButton?: Phaser.GameObjects.Container;
  private readonly onUpdateReady = (): void => this.showUpdateButton();

  constructor() {
    super('Result');
  }

  create(data: ResultData): void {
    document.body.dataset.scene = 'result';
    const status = document.querySelector<HTMLElement>('#game-status');
    if (status) status.textContent = RU.success;
    const background = this.add.image(640, 360, 'factory-background').setDisplaySize(2_400, 720);
    background.setCrop(1_120, 0, 1_280, 720);
    this.add.rectangle(640, 360, 1_280, 720, 0x071017, 0.53);
    this.add.rectangle(640, 355, 820, 510, 0x0c1921, 0.94).setStrokeStyle(3, 0x33e6d1, 0.6);
    this.add.text(640, 176, RU.success, {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '43px',
      color: '#f4f7fb',
      stroke: '#071017',
      strokeThickness: 9,
      align: 'center',
    }).setOrigin(0.5);
    this.add.text(640, 232, RU.successDetail, {
      fontFamily: 'Segoe UI, sans-serif',
      fontSize: '20px',
      color: '#a9c0c9',
    }).setOrigin(0.5);

    const seconds = Math.max(0, Math.floor((data.elapsedMs ?? 0) / 1_000));
    const heat = Math.round((data.heat ?? 0) * 100);
    this.add.text(640, 315, `ВРЕМЯ  ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}     ОСТАТОЧНЫЙ НАГРЕВ  ${heat}%`, {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '18px',
      color: '#ffcf54',
      letterSpacing: 1,
    }).setOrigin(0.5);

    this.createButton(640, 415, 360, RU.retry, 0xffb000, () => this.scene.start('FactoryRoom'));
    this.createButton(640, 505, 270, RU.menu, 0x29424e, () => this.scene.start('Menu'));
    if (window.__PWA_UPDATE_READY__) this.showUpdateButton();
    window.addEventListener('pwa-update-ready', this.onUpdateReady);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('pwa-update-ready', this.onUpdateReady);
    });
    this.cameras.main.fadeIn(350, 7, 16, 23);
  }

  private createButton(x: number, y: number, width: number, label: string, color: number, action: () => void): void {
    const button = this.add.rectangle(x, y, width, 64, color, 1)
      .setStrokeStyle(3, 0xffffff, 0.45)
      .setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '20px',
      color: color === 0xffb000 ? '#101820' : '#f4f7fb',
    }).setOrigin(0.5);
    button.on('pointerdown', action);
  }

  private showUpdateButton(): void {
    if (this.updateButton || !this.scene.isActive()) return;
    const background = this.add.rectangle(1_075, 654, 280, 46, 0x17333e, 0.96)
      .setStrokeStyle(2, 0x33e6d1)
      .setInteractive({ useHandCursor: true });
    const label = this.add.text(1_075, 654, RU.update, {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '14px',
      color: '#cffff8',
    }).setOrigin(0.5);
    this.updateButton = this.add.container(0, 0, [background, label]);
    background.on('pointerdown', () => { void window.__UPDATE_PWA__?.(); });
  }
}
