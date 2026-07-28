#!/usr/bin/env tsx
/**
 * Сетевой дымовой тест: подключает несколько ботов к живому серверу, шлёт им
 * настоящий ввод и проверяет, что состояние приходит, тик идёт, а игроки
 * двигаются. Нужен, чтобы ловить рассинхронизацию протокола до запуска
 * браузерного клиента.
 *
 *   npx tsx packages/tools/src/cli-smoke.ts ws://localhost:2567 3
 */

import { Client, type Room } from 'colyseus.js';
import { Button, MESSAGE, TICK_RATE, encodeInput, packAngle } from '@uc/shared';

const endpoint = process.argv[2] ?? 'ws://localhost:2567';
const botCount = Number(process.argv[3] ?? 2);
const seconds = Number(process.argv[4] ?? 6);

interface Bot {
  room: Room;
  index: number;
  seq: number;
  startX: number;
}

async function main(): Promise<void> {
  const client = new Client(endpoint);
  const bots: Bot[] = [];

  for (let i = 0; i < botCount; i++) {
    const room = await client.joinOrCreate('game', {
      name: `Бот ${i + 1}`,
      code: 'SMOKE',
      shiftId: 'shift_sandbox',
    });
    bots.push({ room, index: i, seq: 0, startX: 0 });
    console.log(`бот ${i + 1} подключён: sessionId=${room.sessionId} roomId=${room.roomId}`);
  }

  const first = bots[0].room;
  let eventCount = 0;
  first.onMessage(MESSAGE.Events, (payload: { events: unknown[] }) => {
    eventCount += payload.events.length;
  });

  // Дадим состоянию доехать до клиента.
  await delay(400);
  for (const bot of bots) {
    const me = readPlayer(bot.room);
    bot.startX = me?.x ?? 0;
  }

  const ticks = seconds * TICK_RATE;
  for (let tick = 0; tick < ticks; tick++) {
    for (const bot of bots) {
      bot.seq++;
      const phase = (tick + bot.index * 40) % 180;
      const axis = phase < 90 ? 1 : -1;
      const buttons = (phase % 40 === 0 ? Button.Jump : 0) | (phase % 55 === 0 ? Button.Interact : 0);
      bot.room.send(MESSAGE.Input, encodeInput(bot.seq, axis, buttons, packAngle(0)));
    }
    await delay(1000 / TICK_RATE);
  }

  await delay(400);

  const state = first.state as unknown as { tick: number; players: Map<string, { x: number; name: string }> };
  console.log(`\nсерверный тик: ${state.tick}`);
  console.log(`игроков в состоянии: ${state.players.size}`);
  console.log(`событий симуляции получено: ${eventCount}`);

  let moved = 0;
  for (const bot of bots) {
    const me = readPlayer(bot.room);
    const delta = Math.abs((me?.x ?? 0) - bot.startX);
    console.log(`  ${me?.name ?? bot.room.sessionId}: смещение по X ${delta.toFixed(1)} px`);
    if (delta > 8) moved++;
  }

  for (const bot of bots) await bot.room.leave(true);

  const ok = state.tick > TICK_RATE && state.players.size === botCount && moved === botCount;
  console.log(ok ? '\nдымовой тест пройден' : '\nдымовой тест ПРОВАЛЕН');
  process.exit(ok ? 0 : 1);
}

function readPlayer(room: Room): { x: number; name: string } | undefined {
  const state = room.state as unknown as { players: Map<string, { x: number; name: string }> };
  return state.players?.get(room.sessionId);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((cause: unknown) => {
  console.error('дымовой тест упал:', cause);
  process.exit(1);
});
