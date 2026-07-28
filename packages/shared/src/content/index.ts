/** Реестр комнат и смен. */

import type { RoomDef, ShiftDef } from './types.js';
import { airlockRoom } from './rooms/airlock.js';
import { hotDeliveryRoom } from './rooms/hotDelivery.js';
import { wrongSwitchRoom } from './rooms/wrongSwitch.js';
import { fragileParcelRoom } from './rooms/fragileParcel.js';
import { overloadRoom } from './rooms/overload.js';

export const ROOMS: readonly RoomDef[] = [
  airlockRoom,
  hotDeliveryRoom,
  wrongSwitchRoom,
  fragileParcelRoom,
  overloadRoom,
];

export const ROOMS_BY_ID: ReadonlyMap<string, RoomDef> = new Map(ROOMS.map((room) => [room.id, room]));

export function getRoom(id: string): RoomDef {
  const room = ROOMS_BY_ID.get(id);
  if (!room) throw new Error(`Комната не найдена: ${id}`);
  return room;
}

/** Полная смена: шлюз → три рабочие зоны → финальная авария (GDD §10, §22). */
export const FULL_SHIFT: ShiftDef = {
  id: 'shift_factory',
  title: 'Сортировочный завод: посылка категории «не трясти»',
  rooms: [
    'factory_airlock',
    'factory_hot_delivery',
    'factory_wrong_switch',
    'factory_fragile_parcel',
    'factory_overload',
  ],
  minutes: [25, 40],
};

/** Быстрый контракт: обучение пропускается, комнат меньше (GDD §11). */
export const QUICK_CONTRACT: ShiftDef = {
  id: 'shift_quick',
  title: 'Быстрый контракт: горячая доставка',
  rooms: ['factory_airlock', 'factory_hot_delivery', 'factory_overload'],
  minutes: [8, 15],
};

/** Песочница: одна комната без таймеров, для проверки физики (GDD §11). */
export const SANDBOX_SHIFT: ShiftDef = {
  id: 'shift_sandbox',
  title: 'Песочница',
  rooms: ['factory_airlock'],
  minutes: [0, 0],
};

export const SHIFTS: readonly ShiftDef[] = [FULL_SHIFT, QUICK_CONTRACT, SANDBOX_SHIFT];

export const SHIFTS_BY_ID: ReadonlyMap<string, ShiftDef> = new Map(SHIFTS.map((shift) => [shift.id, shift]));

export function getShift(id: string): ShiftDef {
  return SHIFTS_BY_ID.get(id) ?? FULL_SHIFT;
}

export * from './types.js';
export * from './tiles.js';
