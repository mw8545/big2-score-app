self.addEventListener('install', event => {
  event.waitUntil(caches.open('big2-score-cache-v1').then(cache => cache.addAll([
    '/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'
  ])))
})
self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(resp => resp || fetch(event.request)))
})
