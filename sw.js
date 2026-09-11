const CACHE='hesab-man-v11.3.7';
const CORE=[
  '/', '/assets/app-v11.3.7.js', '/assets/app-v11.3.7.css',
  '/assets/workbox-window.prod.es5-BBnX5xw4.js', '/manifest.webmanifest',
  '/icon-192.png','/icon-512.png','/icon-1024.png','/apple-touch-icon.png','/icon.svg'
];

function cleanHeaders(source){
  const h=new Headers(source||{});
  h.delete('content-encoding');
  h.delete('content-length');
  return h;
}

async function normalizeResponse(resp){
  if(!resp) return resp;
  // iOS Safari rejects a navigation Response returned by a service worker
  // when Response.redirected is true. Rebuilding it removes redirect history.
  const body=await resp.clone().arrayBuffer();
  return new Response(body,{
    status: resp.ok ? 200 : resp.status,
    statusText: resp.ok ? 'OK' : resp.statusText,
    headers: cleanHeaders(resp.headers)
  });
}

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    for(const url of CORE){
      try{
        const r=await fetch(url,{cache:'reload',redirect:'follow'});
        if(r && r.ok) await cache.put(url,await normalizeResponse(r));
      }catch(_){ }
    }
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys()) if(key!==CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function cachedOrNetwork(request,cacheKey){
  const cache=await caches.open(CACHE);
  const key=cacheKey || request;
  const cached=await cache.match(key);
  if(cached){
    fetch(request,{cache:'no-store',redirect:'follow'})
      .then(async r=>{ if(r&&r.ok) await cache.put(key,await normalizeResponse(r)); })
      .catch(()=>{});
    return cached;
  }
  const r=await fetch(request,{cache:'no-store',redirect:'follow'});
  const clean=await normalizeResponse(r);
  if(r&&r.ok) await cache.put(key,clean.clone());
  return clean;
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;

  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        // Always serve the normalized root shell. This avoids Safari's
        // "Response served by service worker has redirections" failure.
        return await cachedOrNetwork('/', '/');
      }catch(_){
        const cache=await caches.open(CACHE);
        const fallback=await cache.match('/');
        if(fallback) return fallback;
        return new Response('<!doctype html><meta charset="utf-8"><title>حساب من</title><p dir="rtl">اتصال برقرار نیست. دوباره تلاش کنید.</p>',{
          status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}
        });
      }
    })());
    return;
  }

  if(CORE.includes(url.pathname) || url.pathname.startsWith('/assets/')){
    event.respondWith(cachedOrNetwork(event.request,url.pathname));
    return;
  }

  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
