#!/usr/bin/env tsx
/**
 * Браузерный дымовой тест.
 *
 * Открывает собранный клиент, входит в смену, «нажимает» настоящие клавиши и
 * проверяет, что персонаж действительно поехал, состояние приходит, а консоль
 * чиста. Это то, что не ловится юнит-тестами: инициализация Phaser, генерация
 * текстур, WebGL и связка предсказания с сетью.
 *
 *   npx tsx packages/tools/src/cli-browser-smoke.ts http://localhost:2567 [screenshot.png]
 */

import { existsSync } from 'node:fs';
import { chromium, type ConsoleMessage } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:2567';
const screenshotPath = process.argv[3];

/**
 * Путь к Chromium. Если в окружении уже есть предустановленный браузер, берём
 * его: версия сборки Playwright и версия браузера могут не совпадать, а
 * скачивать сотни мегабайт ради дымового теста незачем.
 */
function resolveChromium(): string | undefined {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
    '/opt/pw-browsers/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ].filter((path): path is string => typeof path === 'string' && path.length > 0);
  return candidates.find((path) => existsSync(path));
}

interface Probe {
  ready: boolean;
  sessionId: string;
  tick: number;
  players: number;
  roomId: string;
  x: number;
  y: number;
}

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: resolveChromium(),
    // Программный WebGL: в headless-окружении нет GPU, а Phaser должен
    // подниматься именно в режиме WebGL, как у настоящих игроков.
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const errors: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

  console.log(`открываем ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Меню появляется только после генерации всех текстур.
  await page.waitForSelector('.uc-overlay:not([hidden]) .uc-btn.primary', { timeout: 30_000 });
  console.log('меню загрузилось');

  await page.fill('.uc-input[type="text"]', 'Тестировщик');
  await page.click('.uc-btn.primary');

  await page.waitForSelector('.uc-hud:not([hidden])', { timeout: 20_000 });
  console.log('подключились к комнате');

  await page.waitForFunction(
    () => {
      const probe = (window as unknown as { __uc?: () => { tick: number } }).__uc?.();
      return (probe?.tick ?? 0) > 10;
    },
    { timeout: 20_000 },
  );

  const before = await readProbe(page);
  console.log(`комната ${before.roomId}, тик ${before.tick}, игроков ${before.players}`);

  // Настоящий ввод: бежим вправо и прыгаем.
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(700);
  await page.keyboard.down('Space');
  await page.waitForTimeout(180);
  await page.keyboard.up('Space');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(400);

  const after = await readProbe(page);
  const moved = after.x - before.x;
  console.log(`смещение по X: ${moved.toFixed(1)} px (${before.x.toFixed(0)} → ${after.x.toFixed(0)})`);
  console.log(`тик вырос: ${before.tick} → ${after.tick}`);

  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath });
    console.log(`скриншот: ${screenshotPath}`);
  }

  const canvas = await page.evaluate(() => {
    const node = document.querySelector('#game canvas') as HTMLCanvasElement | null;
    return node ? { width: node.width, height: node.height } : null;
  });
  console.log(`холст: ${canvas ? `${canvas.width}×${canvas.height}` : 'не найден'}`);

  await browser.close();

  const problems: string[] = [];
  if (!canvas || canvas.width < 100) problems.push('холст Phaser не создан');
  if (after.tick <= before.tick) problems.push('серверный тик не растёт');
  if (moved < 30) problems.push(`персонаж не сдвинулся (${moved.toFixed(1)} px)`);
  if (after.players < 1) problems.push('игрок отсутствует в состоянии');
  // Отсеиваем шум от отсутствия аудиоустройства в headless-окружении.
  const realErrors = errors.filter((text) => !/AudioContext|autoplay|favicon/i.test(text));
  if (realErrors.length > 0) problems.push(`ошибки в консоли: ${realErrors.slice(0, 3).join(' | ')}`);

  if (problems.length > 0) {
    console.error(`\nбраузерный тест ПРОВАЛЕН:\n - ${problems.join('\n - ')}`);
    process.exit(1);
  }
  console.log('\nбраузерный дымовой тест пройден');
}

async function readProbe(page: import('playwright').Page): Promise<Probe> {
  return page.evaluate(() => {
    const probe = (window as unknown as { __uc?: () => Probe }).__uc;
    return (
      probe?.() ?? { ready: false, sessionId: '', tick: 0, players: 0, roomId: '', x: 0, y: 0 }
    );
  });
}

main().catch((cause: unknown) => {
  console.error('браузерный тест упал:', cause);
  process.exit(1);
});
