/**
 * Процедурный звук.
 *
 * В проекте нет звуковых файлов: всё синтезируется через Web Audio. Это даёт
 * нулевой вес загрузки и позволяет вносить вариации (случайный pitch, разные
 * варианты) без сотни сэмплов, как того требует GDD §15.4.
 *
 * Реализовано: пулы и rate limit, случайный pitch, 2D-панорамирование,
 * отдельные шины Master/SFX/Music и разблокировка контекста после первого ввода.
 */

import { getSettings, onSettingsChanged } from '../settings.js';

export type SfxName =
  | 'jump'
  | 'land'
  | 'step'
  | 'grab'
  | 'drop'
  | 'throw'
  | 'impact'
  | 'crack'
  | 'zap'
  | 'press_warn'
  | 'press_slam'
  | 'magnet'
  | 'steam'
  | 'splash'
  | 'ping'
  | 'revive'
  | 'downed'
  | 'objective'
  | 'clear'
  | 'fail'
  | 'alarm'
  | 'ui_click'
  | 'heat';

export interface PlayOptions {
  /** Позиция источника в мире — для панорамирования и громкости. */
  x?: number;
  /** Центр экрана в мире: панорама считается относительно него. */
  listenerX?: number;
  /** Ширина слышимой зоны в пикселях. */
  range?: number;
  /** Событие собственного персонажа звучит громче (GDD §15.4). */
  own?: boolean;
  /** Множитель громкости. */
  volume?: number;
  /** Множитель высоты тона. */
  pitch?: number;
}

export type MusicLayer = 'none' | 'work' | 'alarm' | 'evac';

/** Минимальная пауза между повторами одного звука, мс. */
const RATE_LIMIT_MS: Partial<Record<SfxName, number>> = {
  step: 130,
  impact: 55,
  splash: 120,
  zap: 180,
  steam: 240,
  crack: 90,
  land: 70,
  heat: 700,
};

const DEFAULT_RATE_LIMIT = 40;

export class AudioSystem {
  private context: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private compressor!: DynamicsCompressorNode;

  private readonly lastPlayedAt = new Map<SfxName, number>();
  private noiseBuffer: AudioBuffer | null = null;

  private musicLayer: MusicLayer = 'none';
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private unsubscribe: (() => void) | null = null;

  /** Создаёт контекст. Вызывать из обработчика жеста пользователя. */
  unlock(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const context = new Ctor();
    this.context = context;

    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.ratio.value = 7;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.18;

    this.master = context.createGain();
    this.sfxBus = context.createGain();
    this.musicBus = context.createGain();

    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.master.connect(this.compressor);
    this.compressor.connect(context.destination);

    this.noiseBuffer = createNoiseBuffer(context);
    this.applyVolumes();
    this.unsubscribe = onSettingsChanged(() => this.applyVolumes());
    if (context.state === 'suspended') void context.resume();
  }

  destroy(): void {
    this.stopMusic();
    this.unsubscribe?.();
    this.unsubscribe = null;
    void this.context?.close();
    this.context = null;
  }

  get ready(): boolean {
    return this.context !== null && this.context.state === 'running';
  }

  private applyVolumes(): void {
    if (!this.context) return;
    const settings = getSettings();
    this.master.gain.value = settings.masterVolume;
    this.sfxBus.gain.value = settings.sfxVolume;
    this.musicBus.gain.value = settings.musicVolume * 0.55;
  }

  // ------------------------------------------------------------------- SFX

  play(name: SfxName, options: PlayOptions = {}): void {
    const context = this.context;
    if (!context || context.state !== 'running') return;

    const now = performance.now();
    const limit = RATE_LIMIT_MS[name] ?? DEFAULT_RATE_LIMIT;
    const last = this.lastPlayedAt.get(name) ?? -Infinity;
    if (now - last < limit) return;
    this.lastPlayedAt.set(name, now);

    const { gain, pan } = this.spatial(options);
    if (gain <= 0.002) return;
    const pitch = (options.pitch ?? 1) * (0.94 + Math.random() * 0.12);
    this.synthesize(name, gain, pan, pitch);
  }

  /** Громкость и панорама источника относительно центра экрана. */
  private spatial(options: PlayOptions): { gain: number; pan: number } {
    const base = (options.volume ?? 1) * (options.own ? 1.25 : 1);
    if (options.x === undefined || options.listenerX === undefined) {
      return { gain: base, pan: 0 };
    }
    const range = options.range ?? 900;
    const delta = options.x - options.listenerX;
    const distance = Math.abs(delta);
    const falloff = Math.max(0, 1 - distance / range);
    return { gain: base * falloff * falloff, pan: Math.max(-1, Math.min(1, delta / (range * 0.5))) };
  }

  private synthesize(name: SfxName, gain: number, pan: number, pitch: number): void {
    switch (name) {
      case 'jump':
        this.tone({ type: 'triangle', from: 300 * pitch, to: 620 * pitch, duration: 0.13, gain: gain * 0.4, pan });
        break;
      case 'land':
        this.noise({ duration: 0.12, gain: gain * 0.5, filter: 'lowpass', from: 900, to: 180, pan });
        this.tone({ type: 'sine', from: 130 * pitch, to: 70 * pitch, duration: 0.1, gain: gain * 0.35, pan });
        break;
      case 'step':
        this.noise({ duration: 0.05, gain: gain * 0.16, filter: 'bandpass', from: 1600, to: 900, pan });
        break;
      case 'grab':
        this.tone({ type: 'square', from: 520 * pitch, to: 760 * pitch, duration: 0.07, gain: gain * 0.22, pan });
        break;
      case 'drop':
        this.tone({ type: 'square', from: 420 * pitch, to: 260 * pitch, duration: 0.08, gain: gain * 0.2, pan });
        break;
      case 'throw':
        this.noise({ duration: 0.16, gain: gain * 0.3, filter: 'highpass', from: 400, to: 2600, pan });
        this.tone({ type: 'triangle', from: 700 * pitch, to: 240 * pitch, duration: 0.16, gain: gain * 0.25, pan });
        break;
      case 'impact':
        this.noise({ duration: 0.1, gain: gain * 0.45, filter: 'lowpass', from: 2200, to: 300, pan });
        break;
      case 'crack':
        this.noise({ duration: 0.09, gain: gain * 0.5, filter: 'bandpass', from: 2600, to: 1200, pan });
        this.tone({ type: 'square', from: 900 * pitch, to: 400 * pitch, duration: 0.07, gain: gain * 0.2, pan });
        break;
      case 'zap':
        this.tone({ type: 'sawtooth', from: 90 * pitch, to: 1500 * pitch, duration: 0.18, gain: gain * 0.32, pan });
        this.noise({ duration: 0.2, gain: gain * 0.35, filter: 'highpass', from: 1200, to: 3600, pan });
        break;
      case 'press_warn':
        this.tone({ type: 'square', from: 880, to: 880, duration: 0.07, gain: gain * 0.2, pan });
        this.tone({ type: 'square', from: 880, to: 880, duration: 0.07, gain: gain * 0.2, pan, delay: 0.16 });
        break;
      case 'press_slam':
        this.noise({ duration: 0.22, gain: gain * 0.7, filter: 'lowpass', from: 1400, to: 90, pan });
        this.tone({ type: 'sine', from: 160 * pitch, to: 44 * pitch, duration: 0.28, gain: gain * 0.5, pan });
        break;
      case 'magnet':
        this.tone({ type: 'sawtooth', from: 70, to: 200, duration: 0.5, gain: gain * 0.16, pan });
        break;
      case 'steam':
        this.noise({ duration: 0.45, gain: gain * 0.32, filter: 'highpass', from: 2400, to: 900, pan });
        break;
      case 'splash':
        this.noise({ duration: 0.24, gain: gain * 0.4, filter: 'bandpass', from: 700, to: 2400, pan });
        break;
      case 'ping':
        this.tone({ type: 'sine', from: 1180 * pitch, to: 1180 * pitch, duration: 0.28, gain: gain * 0.26, pan });
        this.tone({ type: 'sine', from: 1770 * pitch, to: 1770 * pitch, duration: 0.22, gain: gain * 0.14, pan, delay: 0.02 });
        break;
      case 'revive':
        [520, 660, 880].forEach((freq, index) => {
          this.tone({ type: 'triangle', from: freq, to: freq, duration: 0.14, gain: gain * 0.26, pan, delay: index * 0.07 });
        });
        break;
      case 'downed':
        this.tone({ type: 'sawtooth', from: 340 * pitch, to: 90 * pitch, duration: 0.4, gain: gain * 0.3, pan });
        break;
      case 'objective':
        [660, 880].forEach((freq, index) => {
          this.tone({ type: 'square', from: freq, to: freq, duration: 0.12, gain: gain * 0.22, pan, delay: index * 0.09 });
        });
        break;
      case 'clear':
        [523, 659, 784, 1046].forEach((freq, index) => {
          this.tone({ type: 'triangle', from: freq, to: freq, duration: 0.28, gain: gain * 0.28, pan, delay: index * 0.1 });
        });
        break;
      case 'fail':
        [440, 349, 262].forEach((freq, index) => {
          this.tone({ type: 'sawtooth', from: freq, to: freq * 0.94, duration: 0.32, gain: gain * 0.25, pan, delay: index * 0.14 });
        });
        break;
      case 'alarm':
        this.tone({ type: 'sawtooth', from: 620, to: 380, duration: 0.6, gain: gain * 0.2, pan });
        break;
      case 'heat':
        this.tone({ type: 'sine', from: 1400, to: 1750, duration: 0.18, gain: gain * 0.2, pan });
        break;
      case 'ui_click':
        this.tone({ type: 'square', from: 1200, to: 1500, duration: 0.05, gain: gain * 0.18, pan });
        break;
      default:
        break;
    }
  }

  private tone(options: {
    type: OscillatorType;
    from: number;
    to: number;
    duration: number;
    gain: number;
    pan: number;
    delay?: number;
    bus?: GainNode;
  }): void {
    const context = this.context;
    if (!context) return;
    const start = context.currentTime + (options.delay ?? 0);

    const oscillator = context.createOscillator();
    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(Math.max(20, options.from), start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), start + options.duration);

    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.gain), start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);

    const panner = context.createStereoPanner();
    panner.pan.value = options.pan;

    oscillator.connect(envelope).connect(panner).connect(options.bus ?? this.sfxBus);
    oscillator.start(start);
    oscillator.stop(start + options.duration + 0.03);
  }

  private noise(options: {
    duration: number;
    gain: number;
    filter: BiquadFilterType;
    from: number;
    to: number;
    pan: number;
    delay?: number;
    bus?: GainNode;
  }): void {
    const context = this.context;
    if (!context || !this.noiseBuffer) return;
    const start = context.currentTime + (options.delay ?? 0);

    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    const filter = context.createBiquadFilter();
    filter.type = options.filter;
    filter.frequency.setValueAtTime(options.from, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, options.to), start + options.duration);
    filter.Q.value = options.filter === 'bandpass' ? 1.4 : 0.7;

    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.gain), start + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);

    const panner = context.createStereoPanner();
    panner.pan.value = options.pan;

    source.connect(filter).connect(envelope).connect(panner).connect(options.bus ?? this.sfxBus);
    source.start(start);
    source.stop(start + options.duration + 0.03);
  }

  // ----------------------------------------------------------------- музыка

  /** Слои музыки управляют напряжением: работа → авария → эвакуация (GDD §15.3). */
  setMusicLayer(layer: MusicLayer): void {
    if (this.musicLayer === layer) return;
    this.musicLayer = layer;
    if (layer === 'none') {
      this.stopMusic();
      return;
    }
    if (this.musicTimer === null) this.startMusic();
  }

  private startMusic(): void {
    if (!this.context) return;
    this.nextNoteTime = this.context.currentTime + 0.1;
    this.step = 0;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 60);
  }

  private stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private scheduleMusic(): void {
    const context = this.context;
    if (!context || this.musicLayer === 'none') return;

    const bpm = this.musicLayer === 'evac' ? 148 : this.musicLayer === 'alarm' ? 124 : 104;
    const stepDuration = 60 / bpm / 2;
    const lookahead = context.currentTime + 0.25;

    while (this.nextNoteTime < lookahead) {
      this.scheduleStep(this.step, this.nextNoteTime, stepDuration);
      this.step = (this.step + 1) % 16;
      this.nextNoteTime += stepDuration;
    }
  }

  private scheduleStep(step: number, time: number, duration: number): void {
    const context = this.context;
    if (!context) return;
    const delay = Math.max(0, time - context.currentTime);

    // Минорная основа: она одинаково хорошо звучит и в «работе», и в «аварии».
    const bass = [110, 110, 0, 110, 0, 146.83, 0, 110, 98, 0, 98, 0, 130.81, 0, 98, 0];
    const lead = [0, 440, 0, 523.25, 0, 0, 659.25, 0, 0, 587.33, 0, 0, 523.25, 0, 440, 0];

    const bassFreq = bass[step];
    if (bassFreq > 0) {
      this.tone({
        type: 'triangle',
        from: bassFreq,
        to: bassFreq,
        duration: duration * 1.6,
        gain: 0.3,
        pan: 0,
        delay,
        bus: this.musicBus,
      });
    }

    if (step % 4 === 2) {
      this.noise({
        duration: 0.06,
        gain: this.musicLayer === 'work' ? 0.08 : 0.13,
        filter: 'highpass',
        from: 5200,
        to: 7200,
        pan: 0.15,
        delay,
        bus: this.musicBus,
      });
    }

    if (this.musicLayer !== 'work') {
      const leadFreq = lead[step];
      if (leadFreq > 0) {
        this.tone({
          type: 'square',
          from: leadFreq,
          to: leadFreq,
          duration: duration * 1.1,
          gain: this.musicLayer === 'evac' ? 0.13 : 0.09,
          pan: -0.2,
          delay,
          bus: this.musicBus,
        });
      }
    }

    // Эвакуация добавляет пульсирующую сирену поверх ритма.
    if (this.musicLayer === 'evac' && step % 8 === 0) {
      this.tone({
        type: 'sawtooth',
        from: 520,
        to: 320,
        duration: duration * 6,
        gain: 0.07,
        pan: 0.3,
        delay,
        bus: this.musicBus,
      });
    }
  }
}

function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * 0.6);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Единственный экземпляр на приложение — контекст создаётся один раз. */
export const audio = new AudioSystem();
