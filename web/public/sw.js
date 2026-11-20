// خدمة العمل: هيكل التطبيق متاح بلا نت؛ الكتالوج شبكة أولاً مع نسخة احتياطية؛ لا تخزين لأي طلب كتابة أو بيانات مالية
const SHELL = 'mawred-shell-v1';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/site.webmanifest', '/logo.svg', '/icon-192.png']))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname === '/')) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); } return res; }).catch(() => caches.match('/'))));
    return;
  }
  if (url.pathname.startsWith('/files/products/')) {
    e.respondWith(caches.open('mawred-images').then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }))));
  }
});
