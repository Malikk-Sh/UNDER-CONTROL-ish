import { z } from 'zod';

export const Vector2Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const BoundsSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

export const PlatformSchema = z.object({
  id: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
  kind: z.enum(['solid', 'platform', 'conveyor']),
  direction: z.number().min(-1).max(1).optional(),
});

export const CheckpointSchema = z.object({
  id: z.string().min(1),
  position: Vector2Schema,
});

export const CoolingZoneSchema = z.object({
  id: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
  recoveryPoint: Vector2Schema,
});

export const HazardTimingSchema = z.object({
  warningMs: z.number().positive(),
  activeMs: z.number().positive(),
  recoveryMs: z.number().positive(),
});

export const PressHazardSchema = z.object({
  id: z.string().min(1),
  type: z.literal('press'),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
  timings: HazardTimingSchema,
  telegraph: z.object({
    visual: z.boolean(),
    audio: z.boolean(),
    direction: z.enum(['down', 'up', 'left', 'right']),
  }),
});

export const BatterySchema = z.object({
  id: z.string().min(1),
  type: z.literal('battery'),
  keyItem: z.literal(true),
  position: Vector2Schema,
  recoveryZoneId: z.string().min(1),
});

export const SocketSchema = z.object({
  id: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
  acceptsItemId: z.string().min(1),
});

export const RoomDefinitionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  biome: z.literal('factory'),
  bounds: BoundsSchema,
  spawn: Vector2Schema,
  platforms: z.array(PlatformSchema).min(1),
  checkpoints: z.array(CheckpointSchema).min(1),
  coolingZones: z.array(CoolingZoneSchema).min(1),
  hazards: z.array(PressHazardSchema).min(1),
  items: z.array(BatterySchema).min(1),
  socket: SocketSchema,
  objective: z.object({
    type: z.literal('delivery'),
    itemId: z.string().min(1),
    socketId: z.string().min(1),
    stabilizationMs: z.number().positive(),
  }),
  scaling: z.object({
    recommendedPlayers: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    requiredActivators: z.object({
      min: z.number().int().positive(),
      max: z.number().int().positive(),
      coefficient: z.number().positive(),
    }),
  }),
  fallbacks: z.array(
    z.object({
      id: z.string().min(1),
      type: z.enum(['cart', 'timer_lock', 'automation']),
      minPlayers: z.number().int().positive(),
    }),
  ).min(1),
  art: z.object({
    background: z.string().min(1),
    palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(3),
  }),
  audio: z.object({
    ambience: z.string().min(1),
    hazardCue: z.string().min(1),
  }),
});

export type RoomDefinition = z.infer<typeof RoomDefinitionSchema>;
export type PressHazardDefinition = z.infer<typeof PressHazardSchema>;
export type HazardTimings = z.infer<typeof HazardTimingSchema>;
export type Vector2 = z.infer<typeof Vector2Schema>;
