const CACHE = 'mori-shell-v2';
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch('/');
    if (!response.ok) throw new Error('Shell unavailable');
    await cache.put('/', response.clone());
    const html = await response.text();
    const assets = new Set(['/icon-192.png','/icon-512.png','/manifest.webmanifest']);
    for (const match of html.matchAll(/(?:src|href)="([^" ]+)"/g)) {
      const url = new URL(match[1].replaceAll('&amp;','&'), self.location.origin);
      if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) assets.add(url.href);
    }
    await Promise.all([...assets].map(async asset => { try { await cache.add(asset); } catch (error) { console.error('Mori shell asset unavailable', asset, String(error)); throw error; } }));
    // The full licensed font is large. A font cache failure must not block the shell.
    try { const font = await fetch('/fonts/edukai.ttf', {cache:'reload'}); if (font.status === 200) await cache.put('/fonts/edukai.ttf',font); } catch {}
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;
  const asset = url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/fonts/');
  event.respondWith((async () => {
    if (asset) { const saved = await caches.match(event.request); if (saved) return saved; }
    try {
      const response = await fetch(event.request);
      if (response.ok && (asset || event.request.mode === 'navigate')) {
        const cache = await caches.open(CACHE);
        try { await cache.put(event.request, response.clone()); } catch {}
      }
      return response;
    } catch {
      return await caches.match(event.request) || (event.request.mode === 'navigate' ? await caches.match('/') : null) || Response.error();
    }
  })());
});
