/**
 * Service worker: офлайн-оболочка приложения.
 *
 * Кешируется только статика клиента. Игровой трафик идёт по WebSocket и
 * кешироваться не может и не должен: без сервера играть всё равно не выйдет,
 * но само приложение обязано открываться с домашнего экрана мгновенно.
 */

const CACHE = 'uc-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Матчмейкинг и API всегда идут в сеть: закешированный ответ бесполезен.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/matchmake') || url.pathname === '/healthz') {
    return;
  }

  // Навигация: сеть в приоритете, кеш — запасной вариант офлайн.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // Хешированные ассеты Vite неизменны: отдаём из кеша и обновляем фоном.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    }),
  );
});
