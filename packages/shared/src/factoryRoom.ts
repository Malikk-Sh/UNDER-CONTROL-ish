import { RoomDefinitionSchema } from './schema';

export const factoryRoom = RoomDefinitionSchema.parse({
  id: 'factory_hot_delivery_01',
  title: 'Горячая доставка',
  biome: 'factory',
  bounds: { width: 2_400, height: 720 },
  spawn: { x: 150, y: 570 },
  platforms: [
    { id: 'floor-a', x: 350, y: 680, width: 700, height: 80, kind: 'solid' },
    { id: 'conveyor-a', x: 935, y: 660, width: 470, height: 40, kind: 'conveyor', direction: 1 },
    { id: 'floor-b', x: 1_480, y: 680, width: 620, height: 80, kind: 'solid' },
    { id: 'conveyor-b', x: 1_855, y: 660, width: 180, height: 40, kind: 'conveyor', direction: -1 },
    { id: 'floor-c', x: 2_210, y: 680, width: 380, height: 80, kind: 'solid' },
    { id: 'upper-a', x: 940, y: 455, width: 390, height: 28, kind: 'platform' },
    { id: 'upper-b', x: 1_340, y: 405, width: 340, height: 28, kind: 'platform' },
    { id: 'upper-c', x: 1_690, y: 465, width: 310, height: 28, kind: 'platform' },
  ],
  checkpoints: [
    { id: 'checkpoint-start', position: { x: 150, y: 570 } },
    { id: 'checkpoint-mid', position: { x: 1_520, y: 570 } },
  ],
  coolingZones: [
    { id: 'cool-start', x: 500, y: 592, width: 150, height: 110, recoveryPoint: { x: 500, y: 575 } },
    { id: 'cool-mid', x: 1_515, y: 592, width: 160, height: 110, recoveryPoint: { x: 1_515, y: 575 } },
  ],
  hazards: [
    {
      id: 'press-main',
      type: 'press',
      x: 1_160,
      y: 465,
      width: 150,
      height: 360,
      timings: { warningMs: 1_300, activeMs: 520, recoveryMs: 1_680 },
      telegraph: { visual: true, audio: true, direction: 'down' },
    },
  ],
  items: [
    {
      id: 'battery-main',
      type: 'battery',
      keyItem: true,
      position: { x: 330, y: 600 },
      recoveryZoneId: 'cool-start',
    },
  ],
  socket: {
    id: 'socket-exit',
    x: 2_230,
    y: 565,
    width: 120,
    height: 145,
    acceptsItemId: 'battery-main',
  },
  objective: {
    type: 'delivery',
    itemId: 'battery-main',
    socketId: 'socket-exit',
    stabilizationMs: 3_000,
  },
  scaling: {
    recommendedPlayers: [1, 8],
    requiredActivators: { min: 1, max: 3, coefficient: 0.4 },
  },
  fallbacks: [
    { id: 'solo-cart-route', type: 'cart', minPlayers: 1 },
    { id: 'key-item-return', type: 'automation', minPlayers: 1 },
  ],
  art: {
    background: 'factory-background',
    palette: ['#101820', '#ffb000', '#33e6d1', '#ff3d71', '#f4f7fb'],
  },
  audio: {
    ambience: 'factory-hum',
    hazardCue: 'press-siren',
  },
});
