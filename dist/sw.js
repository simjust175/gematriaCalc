const VERSION = 'gematria-network-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method === 'GET' && requestUrl.origin === self.location.origin) {
    event.respondWith(fetch(event.request));
  }
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'version') event.source?.postMessage({ type: 'version', value: VERSION });
});