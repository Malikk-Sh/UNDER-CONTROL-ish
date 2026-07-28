export const GAME_BALANCE = Object.freeze({
  simulationHz: 60,
  player: {
    moveVelocity: 6.2,
    heavyMoveVelocity: 4.15,
    jumpVelocity: -11.2,
    coyoteMs: 110,
    jumpBufferMs: 130,
    stunMs: 800,
    respawnMs: 1_700,
    interactionDistance: 118,
  },
  battery: {
    heatPerSecond: 0.042,
    coolPerSecond: 0.38,
    recoveryMs: 1_500,
    throwVelocityX: 9.5,
    throwVelocityY: -4.2,
  },
  conveyorVelocity: 1.55,
});
