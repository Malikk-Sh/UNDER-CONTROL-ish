import type { SimulationEvent } from '@under-control/shared';
import type { SimulationBus } from './SimulationBus';

type ToneKind = 'jump' | 'grab' | 'throw' | 'cool' | 'warning' | 'impact' | 'recover' | 'success';

const TONES: Record<ToneKind, { frequency: number; duration: number; type: OscillatorType; gain: number }> = {
  jump: { frequency: 380, duration: 0.08, type: 'square', gain: 0.035 },
  grab: { frequency: 220, duration: 0.07, type: 'triangle', gain: 0.04 },
  throw: { frequency: 145, duration: 0.11, type: 'sawtooth', gain: 0.045 },
  cool: { frequency: 710, duration: 0.12, type: 'sine', gain: 0.028 },
  warning: { frequency: 880, duration: 0.16, type: 'square', gain: 0.035 },
  impact: { frequency: 72, duration: 0.2, type: 'sawtooth', gain: 0.065 },
  recover: { frequency: 460, duration: 0.18, type: 'triangle', gain: 0.035 },
  success: { frequency: 620, duration: 0.38, type: 'triangle', gain: 0.055 },
};

export class AudioSystem {
  private context?: AudioContext;
  private master?: GainNode;
  private ambience: { oscillator: OscillatorNode; gain: GainNode } | undefined;
  private unsubscribe?: () => void;

  async unlock(): Promise<void> {
    this.context ??= new AudioContext();
    if (this.context.state !== 'running') await this.context.resume();
    this.master ??= this.createMaster(this.context);
    this.startAmbience();
  }

  bind(bus: SimulationBus): void {
    this.unsubscribe?.();
    this.unsubscribe = bus.on((event) => this.onEvent(event));
  }

  play(kind: ToneKind): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || context.state !== 'running') return;
    const preset = TONES[kind];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = preset.type;
    oscillator.frequency.setValueAtTime(preset.frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, preset.frequency * 0.72), now + preset.duration);
    gain.gain.setValueAtTime(preset.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + preset.duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(now);
    oscillator.stop(now + preset.duration + 0.02);
  }

  destroy(): void {
    this.unsubscribe?.();
    this.ambience?.oscillator.stop();
    this.ambience = undefined;
  }

  private createMaster(context: AudioContext): GainNode {
    const master = context.createGain();
    master.gain.value = 0.75;
    master.connect(context.destination);
    return master;
  }

  private startAmbience(): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || this.ambience) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 47;
    gain.gain.value = 0.018;
    oscillator.connect(gain).connect(master);
    oscillator.start();
    this.ambience = { oscillator, gain };
  }

  private onEvent(event: SimulationEvent): void {
    switch (event.type) {
      case 'player_jumped': this.play('jump'); break;
      case 'player_stunned': this.play('impact'); break;
      case 'player_recovered': this.play('recover'); break;
      case 'item_grabbed': this.play('grab'); break;
      case 'item_thrown': this.play('throw'); break;
      case 'item_cooled': this.play('cool'); break;
      case 'item_recovered': this.play('recover'); break;
      case 'hazard_phase': if (event.phase === 'warning') this.play('warning'); break;
      case 'objective_completed': this.play('success'); break;
    }
  }
}
