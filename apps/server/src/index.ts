/**
 * Точка входа сервера.
 *
 * Один процесс раздаёт и статику клиента, и WebSocket игровых комнат — так
 * деплой на render.com укладывается в один web service и одну переменную PORT.
 */

import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { WebSocketTransport } from '@colyseus/ws-transport';
import { Encoder } from '@colyseus/schema';
import { Server, matchMaker } from 'colyseus';
import express from 'express';
import { ROOM, ROOMS, SHIFTS, TICK_RATE } from '@uc/shared';

import { GameRoom } from './rooms/GameRoom.js';
import { GameState, PlayerState } from './rooms/schema.js';

/**
 * Схема @colyseus/schema отслеживает изменения через сеттеры на прототипе.
 * Если транспайлер соберёт поля классов как `Object.defineProperty`
 * (`useDefineForClassFields: true`), сеттеры будут обойдены, и состояние
 * молча перестанет сериализоваться — сервер упадёт только при первом
 * подключении. Проверяем это на старте, чтобы ошибка была явной.
 */
function assertSchemaIsWired(): void {
  const probe = new GameState();
  const player = new PlayerState();
  player.sessionId = 'probe';
  probe.players.set('probe', player);
  try {
    new Encoder(probe).encodeAll();
  } catch (cause) {
    throw new Error(
      'Схема состояния не сериализуется. Почти наверняка сервер запущен с ' +
        'useDefineForClassFields: true — запускайте через `npm start` либо ' +
        'передавайте tsx флаг --tsconfig ./tsconfig.json. Исходная ошибка: ' +
        (cause as Error).message,
    );
  }
}

assertSchemaIsWired();

const here = dirname(fileURLToPath(import.meta.url));
const clientDist = resolve(here, '../../client/dist');
const port = Number(process.env.PORT ?? 2567);

const app = express();
app.use(express.json({ limit: '32kb' }));

app.get('/healthz', (_request, response) => {
  response.json({ ok: true, tickRate: TICK_RATE, rooms: ROOMS.length, uptime: process.uptime() });
});

app.get('/api/shifts', (_request, response) => {
  response.json(
    SHIFTS.map((shift) => ({
      id: shift.id,
      title: shift.title,
      rooms: shift.rooms.length,
      minutes: shift.minutes,
    })),
  );
});

/** Список публичных комнат, к которым можно быстро подключиться. */
app.get('/api/rooms', async (_request, response) => {
  try {
    const rooms = await matchMaker.query({ name: 'game', private: false, locked: false });
    response.json(
      rooms.map((room) => ({
        roomId: room.roomId,
        clients: room.clients,
        maxClients: room.maxClients,
        code: (room.metadata as { code?: string } | undefined)?.code ?? '',
        title: (room.metadata as { title?: string } | undefined)?.title ?? '',
      })),
    );
  } catch (cause) {
    response.status(500).json({ error: (cause as Error).message });
  }
});

if (existsSync(clientDist)) {
  app.use(
    express.static(clientDist, {
      // Хешированные ассеты Vite можно кешировать надолго, index.html — нет.
      setHeaders: (response, filePath) => {
        if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
          response.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.includes('/assets/')) {
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
  // SPA-fallback: всё, что не API и не файл, отдаём как index.html.
  app.get(/^(?!\/(api|healthz|matchmake)).*/, (_request, response) => {
    response.sendFile(join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (_request, response) => {
    response
      .status(200)
      .send(
        '<h1>UNDER CONTROL-ish</h1><p>Сборка клиента не найдена. Запустите <code>npm run build</code> ' +
          'или используйте <code>npm run dev</code> для разработки.</p>',
      );
  });
}

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    // Пинги нужны, чтобы мобильные клиенты не отваливались в фоне.
    pingInterval: 6000,
    pingMaxRetries: 4,
  }),
});

// Приватные комнаты подбираются по коду, публичные — по пустому коду.
gameServer.define('game', GameRoom).filterBy(['code', 'shiftId']);

gameServer
  .listen(port)
  .then(() => {
    console.log(
      `[UNDER CONTROL-ish] сервер слушает :${port} · тик ${TICK_RATE} Гц · ` +
        `лимит комнаты ${ROOM.defaultMaxPlayers} · клиент ${existsSync(clientDist) ? 'из dist' : 'не собран'}`,
    );
  })
  .catch((cause: unknown) => {
    console.error('[UNDER CONTROL-ish] не удалось запустить сервер:', cause);
    process.exit(1);
  });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[UNDER CONTROL-ish] получен ${signal}, останавливаемся`);
    gameServer.gracefullyShutdown().finally(() => process.exit(0));
  });
}
