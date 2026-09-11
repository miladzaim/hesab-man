// Hesab Man v11.4.0 Safari recovery service worker.
// Intentionally has NO fetch handler. It replaces older broken workers,
// clears their caches, then unregisters itself so Safari uses the network
// normally on subsequent navigations.
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (_) {}
    try { await self.clients.claim(); } catch (_) {}
    try { await self.registration.unregister(); } catch (_) {}
    try {
      const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
      for (const client of clients) {
        try { client.postMessage({type:'HM_SW_RECOVERY_140'}); } catch (_) {}
      }
    } catch (_) {}
  })());
});
