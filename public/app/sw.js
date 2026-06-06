const CACHE_NAME = 'budgee-pwa-v1';
const getScopePath = () => {
  const scopeUrl = new URL(self.registration.scope);
  return scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
};

self.addEventListener('install', (event) => {
  const scopePath = getScopePath();
  const appShell = [
    scopePath,
    `${scopePath}manifest.json`,
    `${scopePath}favicon.ico`,
    `${scopePath}icon-192.png`,
    `${scopePath}icon-512.png`,
    `${scopePath}apple-touch-icon.png`,
  ];

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(appShell))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    const scopePath = getScopePath();
    event.respondWith(
      fetch(request).catch(
        () => caches.match(scopePath) || caches.match(`${scopePath}index.html`),
      ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (networkResponse.ok && !requestUrl.pathname.startsWith('/_expo/')) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }

        return networkResponse;
      });
    }),
  );
});
