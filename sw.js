const CACHE='hesab-man-v11.3.6';
const CORE=[
  '/', '/index.html', '/assets/app-v11.3.6.js', '/assets/app-v11.3.6.css',
  '/assets/workbox-window.prod.es5-BBnX5xw4.js', '/manifest.webmanifest',
  '/icon-192.png','/icon-512.png','/icon-1024.png','/apple-touch-icon.png','/icon.svg'
];
self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).catch(()=>{}));
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys()) if(key!==CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
async function cacheFirst(request,fallback){
  const cache=await caches.open(CACHE);
  const cached=await cache.match(request) || (fallback ? await cache.match(fallback) : null);
  if(cached){
    // Refresh in background, but never delay the UI when the host is filtered/unreachable.
    fetch(request,{cache:'no-store'}).then(resp=>{if(resp&&resp.ok)cache.put(request,resp.clone())}).catch(()=>{});
    return cached;
  }
  try{
    const resp=await fetch(request,{cache:'no-store'});
    if(resp&&resp.ok) cache.put(request,resp.clone());
    return resp;
  }catch(err){
    if(fallback){const fb=await cache.match(fallback);if(fb)return fb;}
    throw err;
  }
}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;
  if(event.request.mode==='navigate'){
    event.respondWith(cacheFirst('/index.html','/index.html'));
    return;
  }
  if(CORE.includes(url.pathname) || url.pathname.startsWith('/assets/')){
    event.respondWith(cacheFirst(event.request));
    return;
  }
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
