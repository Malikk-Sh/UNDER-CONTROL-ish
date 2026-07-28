import type { SimulationEvent } from '@under-control/shared';

export type SimulationListener = (event: SimulationEvent) => void;

export class SimulationBus {
  private readonly listeners = new Set<SimulationListener>();

  on(listener: SimulationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: SimulationEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  clear(): void {
    this.listeners.clear();
  }
}
