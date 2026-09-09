/* Service worker do Relógio de Ponto (PWA) */
const CACHE = 'ponto-v2';
const PRECACHE = [
  '/public/css/app.css',
  '/public/js/face-common.js',
  '/public/js/pwa.js',
  '/public/icons/icon-192.png',
  '/public/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;               // nunca intercepta POST (/api/punch, /login...)
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Assets estáticos e modelos faciais: cache-first (permite kiosk offline)
  if (url.pathname.startsWith('/public/')) {
    e.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return resp;
      })),
    );
    return;
  }

  // Navegação de páginas: network-first com fallback ao cache
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return resp;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/kiosk'))),
    );
  }
});
