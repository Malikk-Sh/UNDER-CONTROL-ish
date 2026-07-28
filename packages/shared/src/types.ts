import type { RoomDefinition, Vector2 } from './schema';

export interface InputFrame {
  sequence: number;
  tick: number;
  moveX: number;
  jump: boolean;
  interact: boolean;
  throw: boolean;
  crouch: boolean;
}

export type SimulationEvent =
  | { type: 'player_jumped'; sequence: number }
  | { type: 'player_stunned'; durationMs: number; sourceId: string }
  | { type: 'player_recovered'; checkpointId: string }
  | { type: 'item_grabbed'; itemId: string }
  | { type: 'item_thrown'; itemId: string; impulse: Vector2 }
  | { type: 'item_cooled'; itemId: string; zoneId: string }
  | { type: 'item_recovered'; itemId: string; reason: 'overheat' | 'out_of_bounds' }
  | { type: 'hazard_phase'; hazardId: string; phase: HazardPhase }
  | { type: 'objective_completed'; roomId: string; elapsedMs: number };

export type HazardPhase = 'warning' | 'active' | 'recovery';

export interface PhysicsBodyHandle {
  readonly id: number;
}

export interface PhysicsBodySnapshot {
  id: number;
  position: Vector2;
  velocity: Vector2;
  angle: number;
}

export interface PhysicsAdapter {
  createDynamicBody(id: string, position: Vector2, size: Vector2): PhysicsBodyHandle;
  createStaticBody(id: string, position: Vector2, size: Vector2): PhysicsBodyHandle;
  setPosition(body: PhysicsBodyHandle, position: Vector2): void;
  applyImpulse(body: PhysicsBodyHandle, impulse: Vector2): void;
  queryArea(center: Vector2, size: Vector2): readonly PhysicsBodyHandle[];
  step(fixedDeltaMs: number): void;
  snapshot(): readonly PhysicsBodySnapshot[];
}

export interface RoomValidatorIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
}

export interface RoomValidatorResult {
  roomId: string;
  valid: boolean;
  issues: readonly RoomValidatorIssue[];
}

export interface GameDebugApi {
  completeContract(): void;
  getRoom(): RoomDefinition;
}
