import type {
  RoomDefinition,
  RoomValidatorIssue,
  RoomValidatorResult,
  Vector2,
} from '@under-control/shared';

function inside(point: Vector2, room: RoomDefinition): boolean {
  return point.x >= 0 && point.y >= 0 && point.x <= room.bounds.width && point.y <= room.bounds.height;
}

export function validateRoom(room: RoomDefinition): RoomValidatorResult {
  const issues: RoomValidatorIssue[] = [];
  const add = (level: RoomValidatorIssue['level'], code: string, message: string): void => {
    issues.push({ level, code, message });
  };

  if (!inside(room.spawn, room)) add('error', 'spawn.outside', 'Spawn must be inside room bounds.');
  for (const checkpoint of room.checkpoints) {
    if (!inside(checkpoint.position, room)) {
      add('error', 'checkpoint.outside', `Checkpoint ${checkpoint.id} is outside room bounds.`);
    }
  }

  const item = room.items.find((candidate) => candidate.id === room.objective.itemId);
  if (!item) add('error', 'objective.item_missing', 'Objective item does not exist.');
  if (room.socket.id !== room.objective.socketId) {
    add('error', 'objective.socket_missing', 'Objective socket does not exist.');
  }
  if (room.socket.acceptsItemId !== room.objective.itemId) {
    add('error', 'objective.socket_mismatch', 'Socket does not accept the objective item.');
  }

  for (const keyItem of room.items.filter((candidate) => candidate.keyItem)) {
    if (!room.coolingZones.some((zone) => zone.id === keyItem.recoveryZoneId)) {
      add('error', 'recovery.zone_missing', `Key item ${keyItem.id} has no recovery zone.`);
    }
  }

  for (const hazard of room.hazards) {
    if (!hazard.telegraph.visual || !hazard.telegraph.audio) {
      add('error', 'hazard.telegraph_missing', `Hazard ${hazard.id} must have visual and audio telegraphing.`);
    }
  }

  if (!room.fallbacks.some((fallback) => fallback.minPlayers === 1)) {
    add('error', 'fallback.solo_missing', 'A solo fallback is required.');
  }

  const [minimumPlayers, maximumPlayers] = room.scaling.recommendedPlayers;
  for (const playerCount of [minimumPlayers, 2, 4, maximumPlayers]) {
    const required = Math.max(
      room.scaling.requiredActivators.min,
      Math.min(
        room.scaling.requiredActivators.max,
        Math.ceil(playerCount * room.scaling.requiredActivators.coefficient),
      ),
    );
    if (required > playerCount) {
      add('error', 'scaling.activators', `Room requires ${required} activators for ${playerCount} players.`);
    }
  }

  const allIds = [
    ...room.platforms.map(({ id }) => id),
    ...room.checkpoints.map(({ id }) => id),
    ...room.coolingZones.map(({ id }) => id),
    ...room.hazards.map(({ id }) => id),
    ...room.items.map(({ id }) => id),
    room.socket.id,
  ];
  if (new Set(allIds).size !== allIds.length) add('error', 'id.duplicate', 'Room entity IDs must be unique.');

  return {
    roomId: room.id,
    valid: !issues.some((issue) => issue.level === 'error'),
    issues,
  };
}
