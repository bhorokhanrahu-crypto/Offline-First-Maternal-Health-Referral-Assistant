const CACHE = 'matref-v10';
const FILES = ['./', './index.html', './style.css', './app.js', './i18n.js', './rules.js', './facilities.js', './manifest.json', './icon-192.png', './icon-512.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(FILES.map(function (file) {
      const url = new URL(file, self.registration.scope);
      const request = new Request(url.toString() + '?cache-bust=' + CACHE, { cache: 'reload' });
      return fetch(request).then(function (response) {
        if (!response.ok) throw new Error('Failed to cache app file: ' + file);
        return c.put(url.toString(), response);
      });
    }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('matref-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request).then(function (r) {
    if (r) return r;
    return fetch(e.request).catch(function (error) {
      if (e.request.mode !== 'navigate') throw error;
      return caches.match(new URL('./index.html', self.registration.scope).toString()).then(function (appShell) {
        if (appShell) return appShell;
        throw error;
      });
    });
  }));
});
