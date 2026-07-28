import { expect, test } from '@playwright/test';

test('desktop contract reaches the result screen', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/?e2e=1');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'menu');
  await page.keyboard.press('Space');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'factory');
  const roomId = await page.evaluate(() => window.__UNDER_CONTROL_DEBUG__?.getRoom().id);
  expect(roomId).toBe('factory_hot_delivery_01');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(350);
  await page.keyboard.up('KeyD');
  await page.keyboard.press('Space');
  await page.evaluate(() => window.__UNDER_CONTROL_DEBUG__?.completeContract());
  await page.waitForTimeout(1_000);
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'result');
  await expect(page.locator('#game-status')).toContainText('НЕВЕРОЯТНО');
});

test('mobile landscape exposes touch controls and starts from a tap', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-landscape', 'Touch-only smoke test.');
  await page.goto('/?e2e=1');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'menu');
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * (466 / 720));
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'factory');
  await page.touchscreen.tap(box.x + box.width * (1_143 / 1_280), box.y + box.height * (590 / 720));
  await expect(page.locator('#portrait-warning')).toBeHidden();
});

test('production build exposes a PWA manifest and service worker', async ({ page, request }) => {
  await page.goto('/?e2e=1');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();
  const manifestResponse = await request.get(manifestHref ?? '/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json() as { display?: string; orientation?: string; name?: string };
  expect(manifest).toMatchObject({
    display: 'standalone',
    orientation: 'landscape',
    name: 'Всё под контролем!',
  });
  const hasServiceWorker = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    return true;
  });
  expect(hasServiceWorker).toBe(true);
});
