/**
 * Событийная шина (GDD §18.2).
 *
 * UI, звук, VFX, аналитика и обучение подписываются независимо: ни один из них
 * не должен знать о существовании остальных.
 */

import type { SimEvent, SimEventType } from './sim/types.js';

type Listener<T extends SimEventType> = (event: Extract<SimEvent, { type: T }>) => void;
type AnyListener = (event: SimEvent) => void;

export class EventBus {
  private readonly listeners = new Map<string, Set<AnyListener>>();
  private readonly anyListeners = new Set<AnyListener>();

  on<T extends SimEventType>(type: T, listener: Listener<T>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as AnyListener);
    return () => set.delete(listener as AnyListener);
  }

  onAny(listener: AnyListener): () => void {
    this.anyListeners.add(listener);
    return () => this.anyListeners.delete(listener);
  }

  emit(event: SimEvent): void {
    const set = this.listeners.get(event.type);
    if (set) for (const listener of set) listener(event);
    for (const listener of this.anyListeners) listener(event);
  }

  emitAll(events: readonly SimEvent[]): void {
    for (const event of events) this.emit(event);
  }

  clear(): void {
    this.listeners.clear();
    this.anyListeners.clear();
  }
}
