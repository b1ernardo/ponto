/* Service worker do Relógio de Ponto (PWA) */
const CACHE = 'ponto-v4';
const PRECACHE = [
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

// só cacheamos "para sempre" o que não muda: modelos faciais e ícones
const CACHE_FIRST = (p) => p.startsWith('/public/models/') || p.startsWith('/public/icons/');

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;               // nunca intercepta POST (/api/punch, /login...)
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Modelos faciais / ícones: cache-first (permite kiosk offline)
  if (CACHE_FIRST(url.pathname)) {
    e.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return resp;
      })),
    );
    return;
  }

  // CSS/JS e páginas: network-first (pega a versão nova a cada deploy), cai pro cache offline
  if (url.pathname.startsWith('/public/') || request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return resp;
        })
        .catch(() => caches.match(request).then((hit) => hit
          || (request.mode === 'navigate' ? caches.match('/kiosk') : undefined))),
    );
  }
});
