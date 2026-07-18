// Cachea el "app shell" para que la app siga funcionando sin cobertura
// el día del eclipse. El perfil de horizonte (Open-Meteo) necesita red y
// no se cachea aquí a propósito: está pensado para usarse de antemano.

const CACHE_NAME = 'eclipse-ar-v1';
const SHELL_FILES = [
  './',
  'index.html',
  'app.js',
  'sun.js',
  'horizon.js',
  'vendor/suncalc.js',
  'manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Solo servimos desde caché los ficheros propios del app shell (mismo
  // origen); las llamadas a Open-Meteo siempre van a red.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      }).catch(() => cached);
    })
  );
});
