import { factoryRoom } from '@under-control/shared';
import type { GameDebugApi, RoomDefinition } from '@under-control/shared';
import Phaser from 'phaser';
import { RU } from '../i18n/ru';
import { CameraSystem } from '../systems/CameraSystem';
import { CarrySystem } from '../systems/CarrySystem';
import { CharacterController } from '../systems/CharacterController';
import { EffectsSystem } from '../systems/EffectsSystem';
import { HazardSystem } from '../systems/HazardSystem';
import { InputSystem } from '../systems/InputSystem';
import { InteractionSystem } from '../systems/InteractionSystem';
import { ObjectiveSystem } from '../systems/ObjectiveSystem';
import { PhaserMatterAdapter } from '../systems/PhaserMatterAdapter';
import { RecoverySystem } from '../systems/RecoverySystem';
import { SimulationBus } from '../systems/SimulationBus';
import type { AudioSystem } from '../systems/AudioSystem';
import { Hud } from '../ui/Hud';

export class FactoryRoomScene extends Phaser.Scene {
  private readonly room: RoomDefinition = factoryRoom;
  private bus?: SimulationBus;
  private inputSystem?: InputSystem;
  private player?: CharacterController;
  private carry?: CarrySystem;
  private interaction?: InteractionSystem;
  private hazard?: HazardSystem;
  private recovery?: RecoverySystem;
  private objective?: ObjectiveSystem;
  private cameraSystem?: CameraSystem;
  private hud?: Hud;
  private elapsedMs = 0;
  private finished = false;

  constructor() {
    super('FactoryRoom');
  }

  create(): void {
    document.body.dataset.scene = 'factory';
    this.updateLiveRegion(`${RU.contract}. ${RU.objective}`);
    this.registry.set('room', this.room);
    this.matter.world.setBounds(0, 0, this.room.bounds.width, this.room.bounds.height, 80, true, true, true, false);
    this.createEnvironment();

    this.bus = new SimulationBus();
    const effects = new EffectsSystem(this);
    this.player = new CharacterController(this, this.room.spawn, this.bus);
    this.carry = new CarrySystem(this, this.room, this.player, this.bus, effects);
    this.interaction = new InteractionSystem(this.player, this.carry);
    this.hazard = new HazardSystem(this, this.room, this.player, this.carry, this.bus, effects);
    this.recovery = new RecoverySystem(this.room, this.player);
    this.objective = new ObjectiveSystem(
      this.room,
      this.carry,
      this.bus,
      effects,
      (elapsedMs) => this.completeContract(elapsedMs),
    );
    this.cameraSystem = new CameraSystem(this, this.room, this.player);
    this.hud = new Hud(this);
    this.inputSystem = new InputSystem(this);

    const audio = this.registry.get('audio') as AudioSystem | undefined;
    audio?.bind(this.bus);
    this.bus.on((event) => {
      if (event.type === 'player_stunned') this.cameraSystem?.shake();
      if (event.type === 'item_recovered') this.updateLiveRegion(RU.recovered);
    });

    if (new URLSearchParams(window.location.search).has('e2e')) this.installDebugApi();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdownSystems());
    this.cameras.main.fadeIn(300, 7, 16, 23);
  }

  override update(_time: number, delta: number): void {
    if (this.finished) return;
    const input = this.inputSystem;
    const player = this.player;
    const carry = this.carry;
    const hazard = this.hazard;
    const objective = this.objective;
    if (!input || !player || !carry || !hazard || !objective) return;

    const clampedDelta = Math.min(50, delta);
    this.elapsedMs += clampedDelta;
    const frame = input.nextFrame();
    player.update(frame, clampedDelta);
    this.interaction?.update(frame);
    carry.update(clampedDelta);
    hazard.update(this.elapsedMs);
    this.recovery?.update();
    objective.update(this.elapsedMs);
    this.cameraSystem?.update(player.position.x);
    this.hud?.update(this.elapsedMs, carry, hazard, objective);
  }

  private createEnvironment(): void {
    this.add.image(this.room.bounds.width / 2, this.room.bounds.height / 2, 'factory-background')
      .setDisplaySize(this.room.bounds.width, this.room.bounds.height)
      .setScrollFactor(0.94, 1)
      .setDepth(-20);

    const physics = new PhaserMatterAdapter(this);
    for (const platform of this.room.platforms) {
      const color = platform.kind === 'conveyor' ? 0x304954 : platform.kind === 'platform' ? 0x37515d : 0x1d303a;
      this.add.rectangle(platform.x, platform.y, platform.width, platform.height, color, 1)
        .setStrokeStyle(platform.kind === 'platform' ? 4 : 2, platform.kind === 'conveyor' ? 0xffb000 : 0x5c747e, 0.85)
        .setDepth(5);
      physics.createStaticBody(platform.id, { x: platform.x, y: platform.y }, { x: platform.width, y: platform.height });
      if (platform.kind === 'conveyor') this.decorateConveyor(platform.x, platform.y, platform.width, platform.direction ?? 1);
      if (platform.kind === 'platform') {
        this.add.text(platform.x, platform.y + 2, '•  •  •  •  •  •', {
          fontFamily: 'Arial Black, sans-serif',
          fontSize: '14px',
          color: '#7e949d',
        }).setOrigin(0.5).setDepth(6);
      }
    }

    this.add.image(this.room.socket.x, this.room.socket.y, 'socket')
      .setDisplaySize(this.room.socket.width, this.room.socket.height)
      .setDepth(11);
    this.add.text(this.room.socket.x, 448, 'РАЗЪЁМ 01', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '17px',
      color: '#5af4df',
      stroke: '#071017',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(12);

    this.add.text(125, 495, RU.contract, {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '25px',
      color: '#ffcf54',
      stroke: '#071017',
      strokeThickness: 7,
    }).setDepth(10);
    this.add.text(126, 529, RU.objective, {
      fontFamily: 'Segoe UI, sans-serif',
      fontSize: '17px',
      color: '#c6d5db',
      stroke: '#071017',
      strokeThickness: 5,
    }).setDepth(10);

    for (let x = 70; x < this.room.bounds.width; x += 240) {
      this.add.circle(x, 76, 5, 0x33e6d1, 0.6).setDepth(-5);
    }
  }

  private decorateConveyor(x: number, y: number, width: number, direction: number): void {
    const count = Math.max(2, Math.floor(width / 48));
    for (let index = 0; index < count; index += 1) {
      const rollerX = x - width / 2 + 24 + index * ((width - 48) / Math.max(1, count - 1));
      const roller = this.add.circle(rollerX, y, 13, 0x17272f, 1)
        .setStrokeStyle(4, 0x708791, 0.75)
        .setDepth(7);
      this.tweens.add({ targets: roller, angle: 360 * direction, duration: 1_200, repeat: -1 });
    }
  }

  private completeContract(elapsedMs: number): void {
    if (this.finished) return;
    this.finished = true;
    this.updateLiveRegion(RU.success);
    this.scene.start('Result', { elapsedMs, heat: this.carry?.heat ?? 0 });
  }

  private installDebugApi(): void {
    const api: GameDebugApi = {
      completeContract: () => this.objective?.forceComplete(this.elapsedMs),
      getRoom: () => this.room,
    };
    window.__UNDER_CONTROL_DEBUG__ = api;
  }

  private shutdownSystems(): void {
    this.inputSystem?.destroy();
    this.player?.destroy();
    this.bus?.clear();
    delete window.__UNDER_CONTROL_DEBUG__;
  }

  private updateLiveRegion(message: string): void {
    const status = document.querySelector<HTMLElement>('#game-status');
    if (status) status.textContent = message;
  }
}
