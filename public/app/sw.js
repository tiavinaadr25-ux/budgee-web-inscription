const CACHE_NAME = 'kloo-pwa-v10-web-push';
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

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch {}
  const title = typeof payload.title === 'string' ? payload.title.slice(0, 120) : 'Kloo';
  const body = typeof payload.body === 'string' ? payload.body.slice(0, 500) : 'Ouvre Kloo pour consulter tes rappels.';
  let target = '/app/';
  try { const url = new URL(payload.url || target, self.location.origin); if (url.origin === self.location.origin && (url.pathname === '/app' || url.pathname.startsWith('/app/'))) target = url.pathname + url.search; } catch {}
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: '/app/icon-192.png', badge: '/app/icon-192.png',
    tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 100) : 'kloo-reminder',
    data: { url: target }, renotify: false,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let target = new URL('/app/', self.location.origin);
  try { const url = new URL(event.notification.data?.url || '/app/', self.location.origin); if (url.origin === self.location.origin && (url.pathname === '/app' || url.pathname.startsWith('/app/'))) target = url; } catch {}
  event.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(async (clients) => {
    for (const client of clients) {
      const url = new URL(client.url);
      if (url.origin === target.origin && (url.pathname === '/app' || url.pathname.startsWith('/app/')) && 'focus' in client) return client.focus();
    }
    return self.clients.openWindow(target.href);
  }));
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
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith('/api/')) {
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
