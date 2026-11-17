/* 尋道 service worker: precache everything listed in precache.json; serve offline. */
const PRECACHE = 'precache.json';

async function manifest() {
  const res = await fetch(PRECACHE, { cache: 'no-store' });
  return res.json();
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const m = await manifest();
    const cache = await caches.open('xundao-' + m.version);
    await cache.addAll(m.files);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    let keep = null;
    try { keep = 'xundao-' + (await manifest()).version; } catch (e) { /* offline: keep all */ }
    if (keep) {
      for (const k of await caches.keys()) if (k.startsWith('xundao-') && k !== keep) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (e) {
      if (req.mode === 'navigate') return (await caches.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
