// خدمة العمل: الصفحة شبكة أولاً (لا يعلق أحد على إصدار قديم)، الملفات المُجزّأة من الكاش، والصور كاش أولاً.
// لا تخزين لأي طلب كتابة أو بيانات مالية. التحديث لا يُفرض: ينتظر ضغطة «حدّث الآن».
const BUILD = new URL(location.href).searchParams.get('v') || 'dev';
const SHELL = `mawred-shell-${BUILD}`;
self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/site.webmanifest', '/logo.svg', '/icon-192.png']))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('mawred-shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname === '/version.json') return; // دائماً من الشبكة
    if (req.mode === 'navigate' || url.pathname === '/') {
      e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put('/', copy)); } return res; }).catch(() => caches.match('/')));
      return;
    }
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok && url.pathname.startsWith('/assets/')) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); } return res; })));
    return;
  }
  if (url.pathname.startsWith('/files/products/')) {
    e.respondWith(caches.open('mawred-images').then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }))));
  }
});

// إشعارات FCM الفورية: تُعرض حتى لو الموقع مسكّر، والضغط يفتح التطبيق على مرجع الإشعار
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { notification: { title: 'مورد', body: e.data ? e.data.text() : '' } }; }
  const n = d.notification || {}, data = d.data || {};
  e.waitUntil(Promise.all([
    self.registration.showNotification(n.title || 'مورد', { body: n.body || '', icon: '/icon-192.png', badge: '/icon-192.png', dir: 'rtl', lang: 'ar', tag: data.refId || undefined, data }),
    self.clients.matchAll({ type: 'window' }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'mawred:push' }))),
  ]));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const d = e.notification.data || {};
  const url = d.refKind && d.refId ? `/?open=${encodeURIComponent(d.refKind)}:${encodeURIComponent(d.refId)}` : '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => new URL(x.url).origin === location.origin);
    if (c) { c.postMessage({ type: 'mawred:open', refKind: d.refKind, refId: d.refId }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
