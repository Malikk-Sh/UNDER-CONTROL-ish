import type { HazardPhase } from './types';
import type { HazardTimings, Vector2 } from './schema';

export interface BatteryThermalState {
  heat: number;
  overheated: boolean;
}

export function advanceBatteryHeat(
  state: BatteryThermalState,
  deltaSeconds: number,
  heatPerSecond: number,
  coolPerSecond: number,
  cooling: boolean,
): BatteryThermalState {
  if (state.overheated) return state;
  const delta = (cooling ? -coolPerSecond : heatPerSecond) * Math.max(0, deltaSeconds);
  const heat = Math.min(1, Math.max(0, state.heat + delta));
  return { heat, overheated: heat >= 1 };
}

export interface HazardPhaseState {
  phase: HazardPhase;
  progress: number;
}

export function getHazardPhase(elapsedMs: number, timings: HazardTimings): HazardPhaseState {
  const cycle = timings.warningMs + timings.activeMs + timings.recoveryMs;
  const cursor = ((elapsedMs % cycle) + cycle) % cycle;
  if (cursor < timings.warningMs) {
    return { phase: 'warning', progress: cursor / timings.warningMs };
  }
  if (cursor < timings.warningMs + timings.activeMs) {
    return {
      phase: 'active',
      progress: (cursor - timings.warningMs) / timings.activeMs,
    };
  }
  return {
    phase: 'recovery',
    progress: (cursor - timings.warningMs - timings.activeMs) / timings.recoveryMs,
  };
}

export interface InteractionCandidate {
  id: string;
  distance: number;
  kind: 'teammate_in_danger' | 'objective' | 'carryable' | 'ordinary';
}

const INTERACTION_PRIORITY: Record<InteractionCandidate['kind'], number> = {
  teammate_in_danger: 0,
  objective: 1,
  carryable: 2,
  ordinary: 3,
};

export function selectInteractionTarget(
  candidates: readonly InteractionCandidate[],
  maxDistance: number,
): InteractionCandidate | undefined {
  return candidates
    .filter((candidate) => candidate.distance <= maxDistance)
    .sort((left, right) => {
      const priority = INTERACTION_PRIORITY[left.kind] - INTERACTION_PRIORITY[right.kind];
      return priority === 0 ? left.distance - right.distance : priority;
    })[0];
}

export function isOutsideRoom(position: Vector2, width: number, height: number, margin = 120): boolean {
  return (
    position.x < -margin ||
    position.y < -margin ||
    position.x > width + margin ||
    position.y > height + margin
  );
}

export function isBufferedJumpReady(
  nowMs: number,
  lastGroundedAtMs: number,
  jumpQueuedAtMs: number,
  coyoteMs: number,
  jumpBufferMs: number,
): boolean {
  return nowMs - lastGroundedAtMs <= coyoteMs && nowMs - jumpQueuedAtMs <= jumpBufferMs;
}
