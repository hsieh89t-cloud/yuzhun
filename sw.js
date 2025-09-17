self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open('pwa-entry-v1').then(c=>c.addAll(['./','./index.html','./style.css','./app.js','./manifest.webmanifest'])))});
self.addEventListener('activate',e=>{clients.claim()});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin===location.origin){e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))} 
  else { e.respondWith(fetch(e.request).catch(()=>new Response(JSON.stringify({ok:false,error:'離線'}),{headers:{'Content-Type':'application/json'}}))) }
});