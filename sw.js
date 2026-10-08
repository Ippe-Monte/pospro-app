// POSPRO service worker: network-first for the app's own files, cache as offline fallback.
// Supabase API calls and photos are never cached here (always live data).
const V='201';
const CACHE='pospro-2.1.0';
// js modules by name (same list as index.html; tools/check_release.py verifies it)
const MODS=['core','icons','ui','cropper','image','promptpay','options','auth','shell','home','pos','live','bill','money','extras','menu','tables','staff','profile','app','order'];
const FILES=['./','index.html','order.html','manifest.webmanifest','css/app.css','js/vendor/supabase-2.117.2.js','js/vendor/qrcode-generator-2.0.4.js',...MODS.map(m=>'js/'+m+'.js'),
  'icons/logo.png','icons/icon-192.png','icons/icon-512.png','icons/favicon-32.png','icons/apple-touch-icon.png']
  .map(f=>/\.(css|js)$/.test(f)?f+'?v='+V:f);
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).catch(err=>console.warn('precache',err)))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('pospro-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.match(e.request).then(m=>m||caches.match('index.html'))));
});
